import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { buildReportReceiptBytes } from '~/composables/printCommands';
import { prepareReceiptPrint, prepareLabelPrint, useWebUsbPrinter } from '~/composables/useWebUsbPrinter';
import type { PrintTemplate } from '~/utils/print-templates';

export const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb',
};
export type BluetoothPrinter = { deviceId: string; name: string };
export function selectedBluetoothPrinter(): BluetoothPrinter | null {
  if (typeof localStorage === 'undefined') return null;
  try { const p = JSON.parse(localStorage.getItem('selectedPrinter') || 'null'); return p?.deviceId ? p : null; }
  catch { return null; }
}
let printing = false;
export function useReceiptPrinter() {
  const toast = useToast();
  const { getLabelPrinterLanguage } = useWebUsbPrinter();
  async function print(prepare: () => Promise<Uint8Array[]>) {
    if (!Capacitor.isNativePlatform()) throw new Error('Bluetooth printing is available in the mobile app.');
    const device = selectedBluetoothPrinter();
    if (!device) throw new Error('Select a Bluetooth printer in Settings > Printer.');
    if (printing) throw new Error('A Bluetooth print is already in progress.');
    printing = true;
    let connected = false;
    try {
      toast.add({ title: 'Print initiated', icon: 'i-heroicons-printer', description: 'Preparing your print job. Please wait.' });
      await new Promise(resolve => setTimeout(resolve, 0));
      const jobs = await prepare();
      await BleClient.initialize();
      await BleClient.connect(device.deviceId);
      connected = true;
      for (const job of jobs) {
        for (let offset = 0; offset < job.length; offset += 512) {
          const chunk = job.slice(offset, offset + 512);
          await BleClient.write(device.deviceId, PRINTER_SERVICES.SERVICE, PRINTER_SERVICES.CHARACTERISTIC, new DataView(chunk.buffer));
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { success: true, message: 'Print sent to Bluetooth printer.' };
    } finally {
      try { if (connected) await BleClient.disconnect(device.deviceId); }
      finally { printing = false; }
    }
  }
  return {
    printMobileBill: (data: any, design?: PrintTemplate | null) => print(async () => [await prepareReceiptPrint(data, design)]),
    printMobileLabel: (data: any[], size: string, design?: PrintTemplate | null) => print(() => prepareLabelPrint(data, size, getLabelPrinterLanguage(), design)),
    printMobileReport: (data: any) => print(async () => [buildReportReceiptBytes(data)]),
  };
}
