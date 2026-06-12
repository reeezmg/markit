// composables/useReceiptPrinter.ts
import { ref } from 'vue';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import moment from 'moment';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { buildBillReceiptBytes, buildLabelPrintJobs, buildReportReceiptBytes } from '~/composables/printCommands';

// BLE chunked data sender
const chunkSize = 512;
const sendDataInChunks = async (deviceId: string, data: Uint8Array) => {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await BleClient.write(
      deviceId,
      PRINTER_SERVICES.SERVICE,
      PRINTER_SERVICES.CHARACTERISTIC,
      new DataView(chunk.buffer)
    );
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

const formatDateRange = (dateRange: string): string => {
  if (!dateRange) return '';

  // If it's a single date (no "to" present)
  if (!dateRange.includes('to')) {
    return moment(dateRange).format('DD-MM-YYYY');
  }

  // If it's a range like "2025-09-01T00:00:00Z to 2025-09-13T00:00:00Z"
  const [start, end] = dateRange.split(' to ').map(d => d.trim());
  const formattedStart = moment(start).format('DD-MM-YYYY');
  const formattedEnd = moment(end).format('DD-MM-YYYY');
  return `${formattedStart} to ${formattedEnd}`;
};

const selectedDevice = ref<any | null>(null);
if (Capacitor.isNativePlatform()) {
  const selectedPrinter = localStorage.getItem('selectedPrinter');
  if (!selectedPrinter) {
    selectedDevice.value = null;
  } else {
    selectedDevice.value = JSON.parse(selectedPrinter);
  }
}

const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb'
};

const COLUMN_WIDTHS = {
  amount: 8,
  date: 8,
  note: 18,
  category: 14,
};

function textStart(text: string, width: number): string {
  const textStr = (text ?? " ").toString();
  if (textStr.length >= width) return textStr;
  return textStr + ' '.repeat(width - textStr.length);
}

export function useReceiptPrinter() {
  const printMobileBill = async (bill: any): Promise<{ success: boolean; message: string }> => {
    if (!selectedDevice.value) {
      return { success: false, message: 'No printer selected. Please connect a printer first.' };
    }

    if (!bill.invoiceNumber || !bill.entries || !bill.entries.length) {
      return { success: false, message: 'Invalid bill data' };
    }

    try {
      await BleClient.connect(selectedDevice.value.deviceId);
    } catch {
      return { success: false, message: 'Printer connection failed. Please power on the printer.' };
    }

    try {
      const data = buildBillReceiptBytes(bill);
      await sendDataInChunks(selectedDevice.value.deviceId, data);
      await BleClient.disconnect(selectedDevice.value.deviceId);
      return { success: true, message: 'Receipt printed successfully' };
    } catch (err: any) {
      return { success: false, message: 'Failed to print receipt: ' + err.message };
    }
  };

  const printMobileLabel = async (
      items: any[],
      printerLabelSize: string
    ): Promise<{ success: boolean; message: string }> => {

      if (!selectedDevice.value) {
        return { success: false, message: 'No printer selected' };
      }

      try {
        await BleClient.connect(selectedDevice.value.deviceId);
      } catch {
        return { success: false, message: 'Printer connection failed. Please power on the printer.' };
      }

      try {
        let successCount = 0;
        const jobs = buildLabelPrintJobs(items, printerLabelSize);

        for (const commandData of jobs) {
          try {
            await sendDataInChunks(selectedDevice.value.deviceId, commandData);
            await new Promise(r => setTimeout(r, 300));
            successCount++;
          } catch {}
        }

        await BleClient.disconnect(selectedDevice.value.deviceId);

        return {
          success: successCount > 0,
          message: `Printed ${successCount} of ${items.length} labels`
        };

      } catch (err: any) {
        return { success: false, message: 'Failed to print labels: ' + err.message };
      }
    };


  const printMobileReport = async (report: any): Promise<{ success: boolean; message: string }> => {
    if (!selectedDevice.value) {
      return { success: false, message: 'No printer selected. Please connect a printer first.' };
    }


    try {
      await BleClient.connect(selectedDevice.value.deviceId);
    } catch {
      return { success: false, message: 'Printer connection failed. Please power on the printer.' };
    }

    try {
      const data = buildReportReceiptBytes(report);
      await sendDataInChunks(selectedDevice.value.deviceId, data);
      await BleClient.disconnect(selectedDevice.value.deviceId);
      return { success: true, message: 'Report printed successfully' };
    } catch (err: any) {
      return { success: false, message: 'Failed to print report: ' + err.message };
    }
  };


  return {
    printMobileBill,
    printMobileLabel,
    printMobileReport
  };
}
