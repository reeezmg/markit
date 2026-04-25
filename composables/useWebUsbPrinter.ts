import { Capacitor } from '@capacitor/core';
import { buildBillReceiptBytes, buildLabelPrintJobs } from '~/composables/printCommands';

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
  return process.client && typeof window !== 'undefined';
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

  for (const iface of configuration.interfaces) {
    for (const alternate of iface.alternates) {
      const endpoint = alternate.endpoints.find((candidate: USBEndpoint) => candidate.direction === 'out');
      if (endpoint) {
        return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alternate.alternateSetting,
          endpointNumber: endpoint.endpointNumber,
        };
      }
    }
  }

  return null;
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
    throw createErrorMessage('The USB printer does not expose a writable endpoint.');
  }

  await device.claimInterface(endpoint.interfaceNumber);
  if (endpoint.alternateSetting > 0) {
    await device.selectAlternateInterface(endpoint.interfaceNumber, endpoint.alternateSetting);
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
  const endpoint = await openPrinterDevice(device);

  try {
    for (const job of jobs) {
      const result = await device.transferOut(endpoint.endpointNumber, job);
      if (result.status !== 'ok') {
        throw createErrorMessage('USB printer rejected the print job.');
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } finally {
    await closePrinterDevice(device, endpoint.interfaceNumber);
  }
}

export function useWebUsbPrinter() {
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

  const printBillViaUsb = async (printData: any) => {
    const device = await getUsbPrinterByRole('receipt');
    const bytes = buildBillReceiptBytes(printData);
    await writeToPrinter(device, [bytes]);
    return { success: true };
  };

  const printLabelViaUsb = async (labelData: any[], printerLabelSize: string) => {
    const device = await getUsbPrinterByRole('barcode');
    const jobs = buildLabelPrintJobs(labelData, printerLabelSize);
    await writeToPrinter(device, jobs);
    return { success: true };
  };

  return {
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
  };
}
