interface BillEntry {
    name: string;
    qty: number;
    rate: number;
    discount?: number;
    tax?: number;
    value?: number;
    size?: string;
    barcode?: string;
  }
  
  interface BillData {
    invoiceNumber: string;
    date?: string | Date;
    entries: BillEntry[];
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
    paymentMethod?: string;
  }
  
  export const usePrintBill = () => {
    const config = useRuntimeConfig();
  
    const printBill = async (bill: BillData) => {
      try {
        // Normalize the bill data
        const printData = {
          invoiceNumber: bill.invoiceNumber,
          date: bill.date ? new Date(bill.date).toISOString() : new Date().toISOString(),
          entries: bill.entries.map(entry => ({
            name: entry.name,
            qty: entry.qty,
            rate: entry.rate,
            discount: entry.discount || 0,
            tax: entry.tax || 0,
            value: entry.value || entry.qty * entry.rate,
            size: entry.size || '',
            barcode: entry.barcode || '',
          })),
          subtotal: bill.subtotal,
          discount: bill.discount,
          tax: bill.tax,
          grandTotal: bill.grandTotal,
          paymentMethod: bill.paymentMethod || 'Cash',
        };
  
        const { data, error } = await useFetch('/api/print-bill', {
          method: 'POST',
          body: printData,
          baseURL: 'http://localhost:3001',
          headers: {
            'Content-Type': 'application/json',
          },
        });
  
        if (error.value) {
          throw error.value;
        }

        return data.value;
      } catch (err: any) {
        console.error('🛑 Print error:', err.message || err);
        throw err; // Re-throw to allow calling code to handle if needed
      }
    };
  
    return {
      printBill,
    };
  };