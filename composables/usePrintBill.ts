export const usePrint = () => {
  const printBill = async (printData: any) => {
    try {
      const data = await $fetch('/api/print-bill', {
        method: 'POST',
        body: printData,
        baseURL: 'http://localhost:3001',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return data;
    } catch (err: any) {
      console.error('🛑 Print Bill error:', err.message || err);
      throw err;
    }
  };

  const printLabel = async (labelData: any) => {
    try {
      const data = await $fetch('/api/print-label', {
        method: 'POST',
        body: labelData,
        baseURL: 'http://localhost:3001',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return data;
    } catch (err: any) {
      console.error('🛑 Print Label error:', err.message || err);
      throw err;
    }
  };

  return {
    printBill,
    printLabel,
  };
};
