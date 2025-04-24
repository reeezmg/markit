export const getItem = async (variants: any) => {
    try {
        const res = await $fetch('/api/item', {
            method: 'POST',
            body: { variants }
        });
        
        return res;
    } catch (error) {
        console.error("Error fetching items:", error);
        throw error;
    }
};
