import { Capacitor } from '@capacitor/core';
import {useReceiptPrinter} from '~/composables/useReceiptPrinter';
export const usePrint = () => {
  const { printMobileBill,printMobileLabel, printMobileReport } = useReceiptPrinter();

  const printBill = async (printData: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // ✅ Call your native print plugin here
       const res = await printMobileBill(printData);
       if(!res.success){
        throw res.message
       }
      } else {
        // ✅ Call your backend API when not on native
        const data = await $fetch('/api/print-bill', {
          method: 'POST',
          body: printData,
          baseURL: 'http://localhost:3001',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        return data;
      }
    } catch (err: any) {
      console.error('🛑 Print Bill error:', err.message || err);
      throw err;
    }
  };

  const printReport = async (printData: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await printMobileReport(printData)
       if(!res.success){
        throw res.message
       }
      }else{
      const data = await $fetch('/api/print-report', {
        method: 'POST',
        body: printData,
        baseURL: 'http://localhost:3001',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return data;
    }
    } catch (err: any) {
      console.error('🛑 Print Report error:', err.message || err);
      throw err;
    }
  };

  const printLabel = async (labelData: any, printerLabelSize: any) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await printMobileLabel(labelData, printerLabelSize)
       if(!res.success){
        throw res.message
       }
      }else{
      const data = await $fetch('/api/print-label', {
        method: 'POST',
        body: labelData,
        baseURL: 'http://localhost:3001',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return data;
    }
    } catch (err: any) {
      console.error('🛑 Print Label error:', err.message || err);
      throw err;
    }
  };

  return {
    printBill,
    printLabel,
    printReport,
  };
};
