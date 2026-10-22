import { Capacitor } from '@capacitor/core';
import { useReceiptPrinter } from '~/composables/useReceiptPrinter';
import { useWebUsbPrinter } from '~/composables/useWebUsbPrinter';
import type { PrintTemplate } from '~/utils/print-templates';

/** All app print actions use the devices assigned in Settings > Printer. */
export const usePrint = () => {
  const usb = useWebUsbPrinter();
  const bluetooth = useReceiptPrinter();
  function requirePrinter(role: 'receipt' | 'barcode') {
    if (!usb.isWebUsbSupported()) throw new Error('WebUSB printing requires Chrome or Edge. Connect your printer in Settings > Printer.');
    if (!usb.hasAssignedPrinter(role)) throw new Error(`Assign a USB ${role === 'barcode' ? 'label' : 'receipt'} printer in Settings > Printer, then retry.`);
  }
  return {
    async printBill(data: any, design?: PrintTemplate | null) {
      if (Capacitor.isNativePlatform()) return bluetooth.printMobileBill(data, design === undefined ? data.printTemplate : design);
      requirePrinter('receipt');
      return usb.printBillViaUsb(data, design === undefined ? data.printTemplate : design);
    },
    async printLabel(data: any[], size: string, design?: PrintTemplate | null) {
      if (Capacitor.isNativePlatform()) return bluetooth.printMobileLabel(data, size, design);
      requirePrinter('barcode');
      return usb.printLabelViaUsb(data, size, design);
    },
    async printReport(data: any) {
      if (Capacitor.isNativePlatform()) return bluetooth.printMobileReport(data);
      requirePrinter('receipt');
      return usb.printReportViaUsb(data);
    },
  };
};
