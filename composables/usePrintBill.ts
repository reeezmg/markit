import { Capacitor } from '@capacitor/core';
import { useReceiptPrinter } from '~/composables/useReceiptPrinter';
import { useWebUsbPrinter } from '~/composables/useWebUsbPrinter';
import type { PrintTemplate } from '~/utils/print-templates';
import { loadPrintTemplate } from '~/utils/load-print-template.client';
import { printSheetReceipt } from '~/utils/print-template-renderer.client';

/** Thermal jobs use assigned devices; sheet receipts use the system print dialog. */
export const usePrint = () => {
  const usb = useWebUsbPrinter();
  const bluetooth = useReceiptPrinter();
  function requirePrinter(role: 'receipt' | 'barcode') {
    if (!usb.isWebUsbSupported()) throw new Error('WebUSB printing requires Chrome or Edge. Connect your printer in Settings > Printer.');
    if (!usb.hasAssignedPrinter(role)) throw new Error(`Assign a USB ${role === 'barcode' ? 'label' : 'receipt'} printer in Settings > Printer, then retry.`);
  }
  return {
    async printBill(data: any, design?: PrintTemplate | null) {
      const selected = design === undefined ? data.printTemplate === undefined ? await loadPrintTemplate('receipt', data.companyId) : data.printTemplate : design;
      if (selected?.paperSize) return printSheetReceipt(selected, data);
      if (Capacitor.isNativePlatform()) return bluetooth.printMobileBill(data, selected);
      requirePrinter('receipt');
      return usb.printBillViaUsb(data, selected);
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
