import { MissingLabelBarcodeError } from '~/utils/label-barcode';
import { Capacitor } from '@capacitor/core';
import { buildBillReceiptBytes, buildLabelPrintJobs, buildReportReceiptBytes } from '~/composables/printCommands';
import { loadPrintTemplate } from '~/utils/load-print-template.client';
import { loadLabelVariables } from '~/utils/load-label-variables.client';
import { renderPrintTemplate, templatePrintBytes } from '~/utils/print-template-renderer.client';
import type { PrintTemplate } from '~/utils/print-templates';

export type LabelPrinterLanguage = 'tspl' | 'cpcl';
const LABEL_LANGUAGE_KEY = 'markit-label-printer-language';

export type WebUsbPrinterRole = 'receipt' | 'barcode';

type SavedWebUsbPrinter = {
  id: string;
  vendorId: number;
  productId: number;
  serialNumber: string | null;
  manufacturerName: string;
  productName: string;
};

type WebUsbRoleAssignments = Record<WebUsbPrinterRole, string | null>;

const SAVED_USB_PRINTERS_KEY = 'savedWebUsbPrinters';
const USB_PRINTER_ROLES_KEY = 'webUsbPrinterRoles';

function isClientSide(): boolean {
  return typeof window !== 'undefined';
}

function createErrorMessage(message: string): Error {
  return new Error(message);
}

function toSavedWebUsbPrinter(device: USBDevice): SavedWebUsbPrinter {
  const serialNumber = device.serialNumber || null;
  const manufacturerName = device.manufacturerName || '';
  const productName = device.productName || 'USB Printer';
  const id = serialNumber
    ? `serial:${serialNumber}`
    : `usb:${device.vendorId}:${device.productId}:${productName}`;

  return {
    id,
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber,
    manufacturerName,
    productName,
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (!isClientSide()) return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!isClientSide()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function getOutEndpoint(device: USBDevice) {
  const configuration = device.configuration;
  if (!configuration) return null;

  const candidates: { interfaceNumber: number; alternateSetting: number; endpointNumber: number; priority: number }[] = [];
  for (const iface of configuration.interfaces) {
    for (const alternate of iface.alternates) {
      // A composite device may also expose serial/status endpoints. Print data
      // belongs on a bulk endpoint, preferably on the USB printer interface.
      const endpoint = alternate.endpoints.find((candidate: USBEndpoint) => candidate.direction === 'out' && candidate.type === 'bulk');
      if (endpoint) {
        candidates.push({
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alternate.alternateSetting,
          endpointNumber: endpoint.endpointNumber,
          priority: alternate.interfaceClass === 7 ? 0 : alternate.interfaceClass === 255 ? 1 : 2,
        });
      }
    }
  }

  return candidates.sort((a, b) => a.priority - b.priority)[0] || null;
}

async function openPrinterDevice(device: USBDevice) {
  if (!device.opened) {
    await device.open();
  }

  if (!device.configuration) {
    const configurationValue = device.configurations?.[0]?.configurationValue || 1;
    await device.selectConfiguration(configurationValue);
  }

  const endpoint = getOutEndpoint(device);
  if (!endpoint) {
    throw createErrorMessage('The USB printer does not expose a writable bulk endpoint.');
  }

  await device.claimInterface(endpoint.interfaceNumber);
  try {
    // Setting zero must also be selected if a previous session used another alternate.
    await device.selectAlternateInterface(endpoint.interfaceNumber, endpoint.alternateSetting);
  } catch (error) {
    await closePrinterDevice(device, endpoint.interfaceNumber);
    throw error;
  }

  return endpoint;
}

async function closePrinterDevice(device: USBDevice, interfaceNumber?: number) {
  try {
    if (device.opened && interfaceNumber !== undefined) {
      await device.releaseInterface(interfaceNumber);
    }
  } catch {}

  try {
    if (device.opened) {
      await device.close();
    }
  } catch {}
}

async function writeToPrinter(device: USBDevice, jobs: Uint8Array[]) {
  let endpoint: Awaited<ReturnType<typeof openPrinterDevice>> | undefined;
  let bytesWritten = 0;
  try {
    endpoint = await openPrinterDevice(device);
    for (const job of jobs) {
      for (let offset = 0; offset < job.length; offset += 4096) {
        const chunk = job.slice(offset, offset + 4096);
        try {
          const result = await device.transferOut(endpoint.endpointNumber, chunk);
          if (result.status !== 'ok' || result.bytesWritten !== chunk.length) {
            throw createErrorMessage(`USB transfer status: ${result.status}; wrote ${result.bytesWritten} of ${chunk.length} bytes.`);
          }
          bytesWritten += result.bytesWritten;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${device.productName || 'USB printer'} transfer failed on interface ${endpoint.interfaceNumber}, endpoint ${endpoint.endpointNumber} after ${bytesWritten} confirmed bytes. ` +
            'Some data may already have reached the printer. Check paper, cover and error lights, close other printing apps/tabs, then power-cycle and reconnect the printer in Settings > Printer. ' +
            `USB detail: ${detail}`,
            { cause: error },
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } finally {
    await closePrinterDevice(device, endpoint?.interfaceNumber);
  }
}

export function useWebUsbPrinter() {
  const toast = useToast();
  const initiatePrint = async (role: WebUsbPrinterRole) => {
    if (!isSupported() || !hasAssignedPrinter(role)) throw new Error('Connect and assign your printer in Settings > Printer.');
    toast.add({ title: 'Print initiated', icon: 'i-heroicons-printer', description: 'Preparing your print job. Please wait.' });
    // Let the UI display feedback before canvas preparation starts.
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  const getLabelPrinterLanguage = (): LabelPrinterLanguage => readJson<LabelPrinterLanguage>(LABEL_LANGUAGE_KEY, 'tspl') === 'cpcl' ? 'cpcl' : 'tspl';
  const setLabelPrinterLanguage = (language: LabelPrinterLanguage) => {
    if (!['tspl', 'cpcl'].includes(language)) throw new Error('Unsupported label printer language');
    writeJson(LABEL_LANGUAGE_KEY, language);
  };
  const isSupported = () =>
    isClientSide() &&
    !Capacitor.isNativePlatform() &&
    typeof navigator !== 'undefined' &&
    'usb' in navigator;

  const getSavedWebUsbPrinters = (): SavedWebUsbPrinter[] =>
    readJson<SavedWebUsbPrinter[]>(SAVED_USB_PRINTERS_KEY, []);

  const saveWebUsbPrinters = (printers: SavedWebUsbPrinter[]) => {
    writeJson(SAVED_USB_PRINTERS_KEY, printers);
  };

  const getWebUsbPrinterRoles = (): WebUsbRoleAssignments =>
    readJson<WebUsbRoleAssignments>(USB_PRINTER_ROLES_KEY, {
      receipt: null,
      barcode: null,
    });

  const saveWebUsbPrinterRoles = (roles: WebUsbRoleAssignments) => {
    writeJson(USB_PRINTER_ROLES_KEY, roles);
  };

  const getAssignedWebUsbPrinter = (role: WebUsbPrinterRole): SavedWebUsbPrinter | null => {
    const roles = getWebUsbPrinterRoles();
    const printerId = roles[role];
    if (!printerId) return null;
    return getSavedWebUsbPrinters().find((printer) => printer.id === printerId) || null;
  };

  const hasAssignedPrinter = (role: WebUsbPrinterRole): boolean => Boolean(getAssignedWebUsbPrinter(role));

  const assignWebUsbPrinterRole = (printerId: string, role: WebUsbPrinterRole) => {
    const roles = getWebUsbPrinterRoles();
    roles[role] = printerId;
    saveWebUsbPrinterRoles(roles);
  };

  const clearWebUsbPrinterRole = (role: WebUsbPrinterRole) => {
    const roles = getWebUsbPrinterRoles();
    roles[role] = null;
    saveWebUsbPrinterRoles(roles);
  };

  const removeSavedWebUsbPrinter = (printerId: string) => {
    const printers = getSavedWebUsbPrinters().filter((printer) => printer.id !== printerId);
    saveWebUsbPrinters(printers);

    const roles = getWebUsbPrinterRoles();
    for (const role of Object.keys(roles) as WebUsbPrinterRole[]) {
      if (roles[role] === printerId) {
        roles[role] = null;
      }
    }
    saveWebUsbPrinterRoles(roles);
  };

  const connectUsbPrinter = async (): Promise<SavedWebUsbPrinter> => {
    if (!isSupported()) {
      throw createErrorMessage('WebUSB is not supported in this browser.');
    }

    const device = await navigator.usb.requestDevice({
      filters: [],
    });

    const printer = toSavedWebUsbPrinter(device);
    const printers = getSavedWebUsbPrinters();
    if (!printers.find((savedPrinter) => savedPrinter.id === printer.id)) {
      printers.push(printer);
      saveWebUsbPrinters(printers);
    }

    return printer;
  };

  const findGrantedDevice = async (savedPrinter: SavedWebUsbPrinter): Promise<USBDevice | null> => {
    if (!isSupported()) return null;

    const devices = await navigator.usb.getDevices();
    return (
      devices.find((device: USBDevice) =>
        savedPrinter.serialNumber
          ? device.serialNumber === savedPrinter.serialNumber
          : device.vendorId === savedPrinter.vendorId &&
            device.productId === savedPrinter.productId &&
            (device.productName || 'USB Printer') === savedPrinter.productName,
      ) || null
    );
  };

  const getUsbPrinterByRole = async (role: WebUsbPrinterRole): Promise<USBDevice> => {
    if (!isSupported()) {
      throw createErrorMessage('WebUSB is not supported in this browser.');
    }

    const savedPrinter = getAssignedWebUsbPrinter(role);
    if (!savedPrinter) {
      throw createErrorMessage(`No WebUSB ${role} printer is configured.`);
    }

    const device = await findGrantedDevice(savedPrinter);
    if (!device) {
      throw createErrorMessage(
        `The configured ${role} USB printer is not currently available. Reconnect it from printer settings.`,
      );
    }

    return device;
  };

  const printBillViaUsb = async (printData: any, design?: PrintTemplate | null) => {
    await initiatePrint('receipt');
    const [bytes, device] = await Promise.all([
      prepareReceiptPrint(printData, design), getUsbPrinterByRole('receipt'),
    ]);
    await writeToPrinter(device, [bytes]);
    return { success: true };
  };

  const printLabelViaUsb = async (labelData: any[], printerLabelSize: string, design?: PrintTemplate | null, testLanguage?: LabelPrinterLanguage) => {
    await initiatePrint('barcode');
    const [jobs, device] = await Promise.all([
      prepareLabelPrint(labelData, printerLabelSize, testLanguage ?? getLabelPrinterLanguage(), design),
      getUsbPrinterByRole('barcode'),
    ]);
    // Never retry/fallback once transmission starts: the printer may have printed part of the job.
    await writeToPrinter(device, jobs);
    return { success: true };
  };

  const printReportViaUsb = async (reportData: any) => {
    await initiatePrint('receipt');
    const device = await getUsbPrinterByRole('receipt');
    const bytes = buildReportReceiptBytes(reportData);
    await writeToPrinter(device, [bytes]);
    return { success: true };
  };

  return {
    getLabelPrinterLanguage,
    setLabelPrinterLanguage,
    isWebUsbSupported: isSupported,
    getSavedWebUsbPrinters,
    getWebUsbPrinterRoles,
    getAssignedWebUsbPrinter,
    hasAssignedPrinter,
    connectUsbPrinter,
    assignWebUsbPrinterRole,
    clearWebUsbPrinterRole,
    removeSavedWebUsbPrinter,
    getUsbPrinterByRole,
    printBillViaUsb,
    printLabelViaUsb,
    printReportViaUsb,
  };
}

export async function prepareReceiptPrint(printData: any, design?: PrintTemplate | null) {
    const template = design === undefined ? await loadPrintTemplate('receipt', printData.companyId) : design;
    let bytes: Uint8Array;
    try {
      bytes = template ? templatePrintBytes(await renderPrintTemplate(template, printData), template) : buildBillReceiptBytes(printData);
    } catch (error) {
      if (design !== undefined) throw error; // An editor test must expose design errors.
      console.warn('Receipt rendering failed; using the built-in receipt.', error);
      bytes = buildBillReceiptBytes(printData);
    }
    return bytes;
}

export async function prepareLabelPrint(labelData: any[], printerLabelSize: string, language: LabelPrinterLanguage, design?: PrintTemplate | null) {
    const template = design === undefined ? await loadPrintTemplate('label', labelData[0]?.companyId) : design;
    if (language === 'cpcl' && !template) throw new Error('Choose and save a default label design in Settings > Printer before printing with CPCL.');
    if (template) labelData = await loadLabelVariables(labelData, template);
    let jobs: Uint8Array[];
    try {
      if (template) {
        // Scope reuse to this job: changed prices/designs must never reuse old pixels.
        const renderedCopies = new Map<string, Promise<Uint8Array>>();
        jobs = await Promise.all(labelData.map(item => {
          // Non-JSON caller data is still renderable, but cannot safely share a cache key.
          let key: string | undefined;
          try { key = JSON.stringify(item); } catch { /* Render independently. */ }
          let bytes = key === undefined ? undefined : renderedCopies.get(key);
          if (!bytes) {
            bytes = renderPrintTemplate(template, item).then(rendered => templatePrintBytes(rendered, template, language));
            if (key !== undefined) renderedCopies.set(key, bytes);
          }
          return bytes;
        }));
      } else jobs = buildLabelPrintJobs(labelData, printerLabelSize);
    } catch (error) {
      if (error instanceof MissingLabelBarcodeError || language === 'cpcl' || design !== undefined) throw error;
      console.warn('Label rendering failed; using the built-in TSPL label.', error);
      jobs = buildLabelPrintJobs(labelData, printerLabelSize);
    }
    return jobs;
}
