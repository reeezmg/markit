// composables/useReceiptPrinter.ts
import { ref } from 'vue';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import moment from 'moment';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

// Debug logger
const debugLog = ref<string[]>([]);
const DEBUG = true;

const log = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${type}] ${message}`;
  console.log(logMessage);
  debugLog.value.push(logMessage);
};

// Add error handler for BLE operations
const handleBleOperation = async (operation: () => Promise<any>, errorMessage: string) => {
  try {
    return await operation();
  } catch (error: any) {
    log(`${errorMessage}: ${error.message}`, 'error');
    throw error;
  }
};

// Chunk data for BLE transmission
const chunkSize = 512; // Adjust based on your printer's capabilities
const sendDataInChunks = async (deviceId: string, data: Uint8Array) => {
  log(`Starting data transmission. Total size: ${data.length} bytes`, 'info');
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    log(`Sending chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(data.length/chunkSize)}. Size: ${chunk.length} bytes`, 'info');
    
    await handleBleOperation(
      async () => {
        await BleClient.write(
          deviceId,
          PRINTER_SERVICES.SERVICE,
          PRINTER_SERVICES.CHARACTERISTIC,
          new DataView(chunk.buffer)
        );
        // Add a small delay between chunks to prevent overwhelming the printer
        await new Promise(resolve => setTimeout(resolve, 50));
      },
      `Failed to send chunk ${Math.floor(i/chunkSize) + 1}`
    );
  }
  log('Data transmission completed successfully', 'success');
};

let encoder = new ReceiptPrinterEncoder({
    newlineBeforeCut: 8,
    columns: 42
});

const selectedDevice = ref<any | null>(null);
if (typeof window !== 'undefined') {
 const selectedPrinter = localStorage.getItem('selectedPrinter');
  if (selectedPrinter) {
    console.log('Loaded selected printer from localStorage:', JSON.parse(selectedPrinter));
    selectedDevice.value = JSON.parse(selectedPrinter);
  } else {
    console.log('No selected printer found in localStorage.');
  }
}
const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb'
};


// Configure receipt layout
const RECEIPT_WIDTH = 42; // Characters per line 48 total
const COLUMN_WIDTHS = {
  sl: 4,
  description: 24,
  hsn: 10,
  tax: 10,
  category: 14,
  qty: 4,
  No: 4,
  date: 8,
  mrp: 10,
  value: 10,
  disc: 10,
  tvalue: 10,
  amount: 8,
  note: 18,
};

function centerText(text: string, width: number): string {
  const textStr = (text ?? " ").toString();
  const textLength = textStr.length;
  
  // If text is longer than width, return as-is
  if (textLength >= width) return textStr;
  
  // Calculate left and right padding
  const totalPadding = width - textLength;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding; // Accounts for odd widths
  
  return ' '.repeat(leftPadding) + textStr + ' '.repeat(rightPadding);
}

function textStart(text: string, width: number): string {
  const textStr = (text ?? " ").toString();
  
  // If text is longer than width, return as-is
  if (textStr.length >= width) return textStr;
  
  // Left-align text and pad remaining space on the right
  return textStr + ' '.repeat(width - textStr.length);
}

// Helper function to format money values
const formatMoney = (amount: number): string => parseFloat((amount ?? " ").toString()).toFixed(2);

export function useReceiptPrinter() {
  // Print a bill receipt
  const printMobileBill = async (bill: any): Promise<{ success: boolean; message: string; logs?: string[] }> => {
    log('Starting print job for invoice: ' + bill.invoiceNumber, 'info');
    
    // Validate printer connection
    if (!selectedDevice.value) {
      log('No printer selected', 'error');
      return { 
        success: false, 
        message: 'No printer selected. Please connect a printer first.',
        logs: debugLog.value
      };
    }

    // Validate request
    if (!bill.invoiceNumber || !bill.entries || !bill.entries.length) {
      log('Invalid bill data provided', 'error');
      return { 
        success: false, 
        message: 'Invalid bill data', 
        logs: debugLog.value 
      };
    }

    // Check printer connection status
    try {
      const connectedDevices = await BleClient.getConnectedDevices([PRINTER_SERVICES.SERVICE]);
      if (!connectedDevices.find(d => d.deviceId === selectedDevice.value.deviceId)) {
        log('Printer disconnected. Attempting to reconnect...', 'info');
        await BleClient.connect(selectedDevice.value.deviceId);
      }
    } catch (error: any) {
      log(`Failed to verify printer connection: ${error.message}`, 'error');
      return { 
        success: false, 
        message: 'Printer connection failed. Please power on the printer.',
        logs: debugLog.value
      };
    }

    const upiPayment = bill.paymentMethod?.toLowerCase() === 'upi'
      ? { amount: bill.grandTotal } // Full amount in case of normal UPI
      : bill.paymentMethod?.toLowerCase() === 'split'
        ? bill.splitPayments?.find((p: any) => p.method.toLowerCase() === 'upi')
        : null;

    const calculatedDiscount = bill.discount < 0
      ? Math.abs(bill.discount) // if negative, make positive
      : (bill.subtotal * bill.discount) / 100; // if positive, treat as %


    return new Promise(async(resolve) => {
       try {
            // Header
            encoder.initialize();
   
            encoder
                .bold(true)
                .text('')
                .align('center')
                .size(2,2)
                .text(bill.companyName)
                .newline(1)
                .bold(false)
                .size(1, 1);

            encoder
                .text(`${bill.companyAddress.name}, ${bill.companyAddress.street}`)
                .text(`${bill.companyAddress.locality}, ${bill.companyAddress.city}`)
                .text(`${bill.companyAddress.state}- ${bill.companyAddress.pincode}`)
                .newline(1)
                .text(`GSTIN:${bill.gstin}`)
                .newline(1)
                 .rule({ style: 'single' })  
                .align('left')
                .text(`Invoice: #${bill.invoiceNumber}`)
                 .newline(1)
                .text(`Date  : ${moment(bill.date).format('DD-MM-YYYY hh:mm')}`)
                 .newline(1)
                .text(`Payment Method: ${bill.paymentMethod}`)
                .newline(1)
                 .rule({ style: 'single' })  ;

            if (bill.clientName) {
                encoder.text(`Customer Name: ${bill.clientName}`);
            }

            if (bill.clientPhone) {
                encoder.text(`Customer Phone No: ${bill.clientPhone}`) .rule({ style: 'single' })  ;
            }

            // Column headers
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
            ) .rule({ style: 'single' })  ;

            // Items
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


                  encoder
                .rule({ style: 'single' })
                .bold(true)
                .text(
                '    ' +
                textStart(bill.tqty, COLUMN_WIDTHS.qty) +
                '          ' +
                textStart(formatMoney(bill.tvalue), COLUMN_WIDTHS.value) +
                textStart(formatMoney(bill.tdiscount), COLUMN_WIDTHS.disc) +
                textStart(formatMoney(bill.ttvalue), COLUMN_WIDTHS.tvalue)
                )
                .bold(false)
                .rule({ style: 'single' });

            encoder
                .align('center')
                .text(centerText('DISC/ROUND OFF(+/-)', 38) + textStart(formatMoney(calculatedDiscount),10))
                .newline(2);

            encoder
                .bold(true)
                .align('center')
                .size(2, 2)
                .text(" GRAND TOTAL: " + formatMoney(bill.grandTotal))
                .bold(false)
                .size(1, 1)
                .newline(1);

            encoder
                 .rule({ style: 'single' })  
                 .size(2, 2)
                .bold(true)
                .invert(true)
                .text(" YOUR SAVING: " + formatMoney(calculatedDiscount + bill.tdiscount))
                .bold(false)
                .invert(false)
                .size(1, 1)
                .newline(1)
                 .rule({ style: 'single' })  
                  .newline(1);

            // UPI QR
            if (upiPayment) {
                const qrLink = `upi://pay?pa=${bill.upiId}&am=${upiPayment.amount}&cu=INR`;
                encoder
                .align('center')
                .newline(1)
                .text('Scan to pay via UPI')
                .qr(qrLink, { model: 2, size: 6, ecc: 'M' }) // QR code
                .newline(1);
            }

            // Footer
            encoder
                .align('center')
                .text('Thank you for shopping!')
                .newline(1)
                .text('Returns accepted within 7 days with original receipt')
                .newline(2)
                .text('Customer care: +91 9876543210')
                .newline(8)
                .cut();

            // Encode and send to BLE printer
            const data = encoder.encode();
            await sendDataInChunks(selectedDevice.value.deviceId, data);

            resolve({ success: true, message: 'Receipt printed successfully' });
            } catch (err: any) {
            console.error('Print error:', err);
            resolve({ success: false, message: 'Failed to print receipt: ' + err.message });
            }
    });
  };

  


  const stringToBytes = (str: string) => new TextEncoder().encode(str + '\r\n');

  const printMobileLabel = async (items: any[]): Promise<{ success: boolean; message: string; logs?: string[] }> => {
    if (!selectedDevice.value) {
      return { success: false, message: 'No printer selected', logs: debugLog.value };
    }

      try {
      const connectedDevices = await BleClient.getConnectedDevices([PRINTER_SERVICES.SERVICE]);
      if (!connectedDevices.find(d => d.deviceId === selectedDevice.value.deviceId)) {
        log('Printer disconnected. Attempting to reconnect...', 'info');
        await BleClient.connect(selectedDevice.value.deviceId);
      }
    } catch (error: any) {
      log(`Failed to verify printer connection: ${error.message}`, 'error');
      return { 
        success: false, 
        message: 'Printer connection failed. Please power on the printer.',
        logs: debugLog.value
      };
    }

    try {
      log(`Processing ${items.length} labels`, 'info');
      let successCount = 0;

      for (const item of items) {
        const { shopname = '', barcode = '', code = '', productName = '', 
                name = '', sprice, dprice, size = '', brand = '' } = item;

        // if (!barcode || !productName || !name || !sprice || !shopname) {
        //   log(`Skipping item: missing required fields`, 'error');
        //   continue;
        // }

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

        ${dprice ? `BAR 30,116,230,4` : ''}
        ${dprice ? `TEXT 30,136,"2",0,1,1,"Discount Rs.${parseFloat(dprice).toFixed(2)}"` : ''}

        TEXT 30,168,"1",0,1,1,"${code}-${brand}"
        BARCODE 30,185,"128",100,0,0,3,3,"${barcode}"
        TEXT 30,292,"1",0,1,1,"${barcode}"

        PRINT 1,1`;

        try {
          log(`Printing label for: ${productName}`, 'info');
          const commandData = stringToBytes(tsplCommands);
          await sendDataInChunks(selectedDevice.value.deviceId, commandData);
          
          // Add a delay between labels to prevent printer buffer overflow
          await new Promise(resolve => setTimeout(resolve, 300));
          successCount++;
          log(`Label printed successfully for: ${productName}`, 'success');
        } catch (error: any) {
          log(`Failed to print label for ${productName}: ${error.message}`, 'error');
        }
      }

      const message = `Printed ${successCount} of ${items.length} labels`;
      return {
        success: successCount > 0,
        message,
        logs: debugLog.value
      };

    } catch (err: any) {
      log(`Print job failed: ${err.message}`, 'error');
      return {
        success: false,
        message: 'Failed to print labels: ' + err.message,
        logs: debugLog.value
      };
    }
  };

  return {
    printMobileBill,
    printMobileLabel,
    debugLog,
    clearDebugLog: () => debugLog.value = []
  };
}