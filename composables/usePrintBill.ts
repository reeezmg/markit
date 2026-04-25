import { Capacitor } from '@capacitor/core';
import { useReceiptPrinter } from '~/composables/useReceiptPrinter';
import { useWebUsbPrinter } from '~/composables/useWebUsbPrinter';

const LOCAL_PRINT_SERVER = 'http://localhost:3001';
const LOCAL_PRINT_TIMEOUT = 1500;

function normalizeError(err: any, fallbackMessage: string): Error {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err);
  return new Error(err?.message || fallbackMessage);
}

export const usePrint = () => {
  const { printMobileBill, printMobileLabel, printMobileReport } = useReceiptPrinter();
  const {
    isWebUsbSupported,
    hasAssignedPrinter,
    printBillViaUsb,
    printLabelViaUsb,
  } = useWebUsbPrinter();

  const printViaLocalServer = async (path: string, body: any) =>
    $fetch(path, {
      method: 'POST',
      body,
      baseURL: LOCAL_PRINT_SERVER,
      timeout: LOCAL_PRINT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  const printBill = async (printData: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await printMobileBill(printData);
        if (!res.success) {
          throw new Error(res.message);
        }
      } else {
        if (isWebUsbSupported() && hasAssignedPrinter('receipt')) {
          try {
            return await printBillViaUsb(printData);
          } catch (usbError) {
            console.warn('WebUSB receipt print failed, falling back to localhost:3001', usbError);
          }
        }

        return await printViaLocalServer('/api/print-bill', printData);
      }
    } catch (err: any) {
      const error = normalizeError(err, 'Failed to print bill.');
      console.error('Print Bill error:', error.message);
      throw error;
    }
  };

  const printReport = async (printData: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await printMobileReport(printData);
        if (!res.success) {
          throw new Error(res.message);
        }
      } else {
        return await printViaLocalServer('/api/print-report', printData);
      }
    } catch (err: any) {
      const error = normalizeError(err, 'Failed to print report.');
      console.error('Print Report error:', error.message);
      throw error;
    }
  };

  const printLabel = async (labelData: any, printerLabelSize: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await printMobileLabel(labelData, printerLabelSize);
        if (!res.success) {
          throw new Error(res.message);
        }
      } else {
        if (isWebUsbSupported() && hasAssignedPrinter('barcode')) {
          try {
            return await printLabelViaUsb(labelData, printerLabelSize);
          } catch (usbError) {
            console.warn('WebUSB barcode print failed, falling back to localhost:3001', usbError);
          }
        }

        return await printViaLocalServer('/api/print-label', labelData);
      }
    } catch (err: any) {
      const error = normalizeError(err, 'Failed to print labels.');
      console.error('Print Label error:', error.message);
      throw error;
    }
  };

  return {
    printBill,
    printLabel,
    printReport,
  };
};
