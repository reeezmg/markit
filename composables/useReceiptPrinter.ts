// composables/useReceiptPrinter.ts
import { ref } from 'vue';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import moment from 'moment';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

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

let encoder = new ReceiptPrinterEncoder({
  newlineBeforeCut: 8,
  columns: 48
});

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
  sl: 4,
  description: 24,
  hsn: 10,
  tax: 10,
  qty: 4,
  mrp: 10,
  value: 10,
  disc: 10,
  tvalue: 10,
  amount: 8,
  date: 8,
  note:18,
  category:14,
};

function centerText(text: string, width: number): string {
  const textStr = (text ?? " ").toString();
  if (textStr.length >= width) return textStr;
  const totalPadding = width - textStr.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return ' '.repeat(leftPadding) + textStr + ' '.repeat(rightPadding);
}

function textStart(text: string, width: number): string {
  const textStr = (text ?? " ").toString();
  if (textStr.length >= width) return textStr;
  return textStr + ' '.repeat(width - textStr.length);
}

const formatMoney = (amount: number): string => parseFloat((amount ?? " ").toString()).toFixed(2);

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

    const upiPayment = bill.paymentMethod?.toLowerCase() === 'upi'
      ? { amount: bill.grandTotal }
      : bill.paymentMethod?.toLowerCase() === 'split'
        ? bill.splitPayments?.find((p: any) => p.method.toLowerCase() === 'upi')
        : null;

    const calculatedDiscount = bill.discount < 0
      ? Math.abs(bill.discount)
      : (bill.subtotal * bill.discount) / 100;

    try {
      encoder.initialize();
      encoder
        .bold(true).
        align('center')
        .text('')
        .align('center')
        .size(2, 2)
        .text(bill.companyName)
        .newline(1)
        .bold(false).size(1, 1)
        .text(`${bill.companyAddress.name}, ${bill.companyAddress.street}`)
        .text(`${bill.companyAddress.locality}, ${bill.companyAddress.city}`)
        .text(`${bill.companyAddress.state}- ${bill.companyAddress.pincode}`)
        .newline(1).text(`GSTIN:${bill.gstin}`)
        .newline(1).rule({ style: 'single' })
        .align('left')
        .text(`Invoice: #${bill.invoiceNumber}`).newline(1)
        .text(`Date  : ${moment(bill.date).format('DD-MM-YYYY hh:mm')}`).newline(1)
        .text(`Payment Method: ${bill.paymentMethod}`).newline(1)
        .rule({ style: 'single' });

      if (bill.clientName) encoder.text(`Customer Name: ${bill.clientName}`);
      if (bill.clientPhone) encoder.text(`Customer Phone No: ${bill.clientPhone}`).rule({ style: 'single' });

      encoder.text(
        textStart("SL", COLUMN_WIDTHS.sl) +
        textStart("DESCRIPTION", COLUMN_WIDTHS.description) +
        textStart("HSN", COLUMN_WIDTHS.hsn) +
        textStart("TAX", COLUMN_WIDTHS.tax)
      );

      encoder.text(
        '    ' +
        textStart("QTY", COLUMN_WIDTHS.qty) +
        textStart("MRP", COLUMN_WIDTHS.mrp) +
        textStart("VALUE", COLUMN_WIDTHS.value) +
        textStart("DISC", COLUMN_WIDTHS.disc) +
        textStart("T.VALUE", COLUMN_WIDTHS.tvalue)
      ).rule({ style: 'single' });

      bill.entries.forEach((item: any, index: number) => {
        encoder.text(
          textStart((index + 1).toString(), COLUMN_WIDTHS.sl) +
          textStart(item.description, COLUMN_WIDTHS.description) +
          textStart(item.hsn, COLUMN_WIDTHS.hsn) +
          textStart(item.tax, COLUMN_WIDTHS.tax)
        );
        encoder.text(
          '    ' +
          textStart(item.qty, COLUMN_WIDTHS.qty) +
          textStart(formatMoney(item.mrp), COLUMN_WIDTHS.mrp) +
          textStart(formatMoney(item.value), COLUMN_WIDTHS.value) +
          textStart(`${item.discount}%`, COLUMN_WIDTHS.disc) +
          textStart(formatMoney(item.tvalue), COLUMN_WIDTHS.tvalue)
        );
      });

      encoder.rule({ style: 'single' }).bold(true).text(
        '    ' +
        textStart(bill.tqty, COLUMN_WIDTHS.qty) +
        '          ' +
        textStart(formatMoney(bill.tvalue), COLUMN_WIDTHS.value) +
        textStart(formatMoney(bill.tdiscount), COLUMN_WIDTHS.disc) +
        textStart(formatMoney(bill.ttvalue), COLUMN_WIDTHS.tvalue)
      ).bold(false).rule({ style: 'single' });

      encoder.align('center').text(centerText('DISC/ROUND OFF(+/-)', 38) + textStart(formatMoney(calculatedDiscount), 10)).newline(2);

      encoder.bold(true).align('center').size(2, 2).text(" GRAND TOTAL: " + formatMoney(bill.grandTotal))
        .bold(false).size(1, 1).newline(1);

      encoder.rule({ style: 'single' }).size(2, 2).bold(true).invert(true)
        .text(" YOUR SAVING: " + formatMoney(calculatedDiscount + bill.tdiscount))
        .bold(false).invert(false).size(1, 1).newline(1).rule({ style: 'single' }).newline(1);

      if (upiPayment) {
        const qrLink = `upi://pay?pa=${bill.upiId}&am=${upiPayment.amount}&cu=INR`;
        encoder.newline(1).text('Scan to pay via UPI').newline(2)
          .qrcode(qrLink, { model: 1, size: 8, errorlevel: 'h' }).newline(1);
      }

      encoder.align('center').text(bill.thankYouNote).newline(1)
        .text(bill.returnPolicy).text(bill.refundPolicy).newline(2)
        .text(`Customer care: +91 ${bill.phone}`).newline(8).cut();

      const data = encoder.encode();
      await sendDataInChunks(selectedDevice.value.deviceId, data);
      await BleClient.disconnect(selectedDevice.value.deviceId);
      return { success: true, message: 'Receipt printed successfully' };
    } catch (err: any) {
      return { success: false, message: 'Failed to print receipt: ' + err.message };
    }
  };

  const stringToBytes = (str: string) => new TextEncoder().encode(str + '\r\n');

  const printMobileLabel = async (items: any[]): Promise<{ success: boolean; message: string }> => {
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

      for (const item of items) {
        const { shopname = '', barcode = '', code = '', productName = '', name = '', sprice, dprice, size = '', brand = '' } = item;

        const tsplCommands = `
        SIZE 50 mm,38 mm
        GAP 1 mm,1 mm
        DIRECTION 0
        CLS

        TEXT 30,18,"3",0,1,1,"${shopname}"
        BAR 30,48,410,2

        TEXT 30,58,"2",0,1,1,"${productName}"
        TEXT 30,83,"2",0,1,1,"${name}${size ? ' - ' + size : ''}"
        TEXT 30,110,"2",0,1,1,"MRP Rs.${parseFloat(sprice).toFixed(2)}"

       ${dprice !== null && dprice !== undefined ? `BAR 30,116,230,4` : ''}
       ${dprice !== null && dprice !== undefined ? `TEXT 30,136,"2",0,1,1,"Discount Rs.${parseFloat(dprice).toFixed(2)}"` : ''}

        TEXT 30,168,"1",0,1,1,"${code}-${brand}"
        BARCODE 30,185,"128",100,0,0,3,3,"${barcode}"
        TEXT 30,292,"1",0,1,1,"${barcode}"

        PRINT 1,1`;

        try {
          const commandData = stringToBytes(tsplCommands);
          await sendDataInChunks(selectedDevice.value.deviceId, commandData);
          await new Promise(resolve => setTimeout(resolve, 300));
          successCount++;
        } catch {}
      }

      await BleClient.disconnect(selectedDevice.value.deviceId);
      return { success: successCount > 0, message: `Printed ${successCount} of ${items.length} labels` };
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
            
      encoder.initialize();

      // Company Name (centered, bold, big)
      encoder
        .align('center')
        .bold(true)
        .size(2, 2)
        .text(report.companyName)
        .newline(1)
        .bold(false)
        .size(1, 1)
        .rule({ style: 'single' });

      // Date Range
      encoder
        .align('left')
        .text(`Date: ${formatDateRange(report.dateRange)}`)
        .newline(1)
        .rule({ style: 'single' });

      // Revenue Section
      encoder
        .text(`Total Revenue: ${report.totalRevenue}`).newline(1)
        .text(`In Cash: ${report.totalRevenueInCash}`).newline(1)
        .text(`In UPI: ${report.totalRevenueInUPI}`).newline(1)
        .rule({ style: 'single' });

      // Expense Section
      encoder
        .text(`Total Expense: ${report.totalExpense}`).newline(1)
        .text(`In Cash: ${report.totalExpensesInCash}`).newline(1)
        .text(`In UPI: ${report.totalExpensesInUPI}`).newline(1)
        .rule({ style: 'single' });

      // Drawer + UPI balances
      encoder
        .text(`Amount in Drawer: ${report.amountInDrawer}`).newline(1)
        .text(`Amount in UPI: ${report.amountInUPI}`).newline(1)
        .rule({ style: 'single' });

      // Expense Details Header
      encoder
        .align('center')
        .bold(true)
        .newline(2)
        .text('EXPENSES')
        .newline(2)
        .bold(false)
        .align('left');

      // Column Headers
      encoder
        .text(
          textStart("DATE", COLUMN_WIDTHS.date) +
          textStart("CATEGORY", COLUMN_WIDTHS.category) +
          textStart("NOTE", COLUMN_WIDTHS.note) +
          textStart("AMOUNT", COLUMN_WIDTHS.amount)
        )
        .newline(1)
        .rule({ style: 'single' });

      // Expense Rows
      report.expenses.forEach((item) => {
        encoder.text(
          textStart(moment(item.createdAty).format('DD-MM'), COLUMN_WIDTHS.date) +
          textStart(item.expensecategory.name, COLUMN_WIDTHS.category) +
          textStart(item.note || "", COLUMN_WIDTHS.note) +
          textStart(item.totalAmount, COLUMN_WIDTHS.amount)
        ).newline(2);
      });

      // Footer line + spacing
      encoder.rule({ style: 'single' }).newline(6);

      const data = encoder.encode();
      await sendDataInChunks(selectedDevice.value.deviceId, data);
      await BleClient.disconnect(selectedDevice.value.deviceId);
      return { success: true, message: 'Receipt printed successfully' };
    } catch (err: any) {
      return { success: false, message: 'Failed to print receipt: ' + err.message };
    }
  };


  return {
    printMobileBill,
    printMobileLabel,
    printMobileReport
  };
}
