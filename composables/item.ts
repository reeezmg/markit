export const getItem = async (purchaseOrderId: string) => {
    try {
        const res = await $fetch('/api/item', {
            method: 'POST',
            body: { purchaseOrderId }
        });
        
        return res;
    } catch (error) {
        console.error("Error fetching items:", error);
        throw error;
    }
};
