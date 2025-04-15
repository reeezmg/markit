export const useExpense = () => {
    const expenses = ref<any[]>([
        { 
            id: '1', 
            date: new Date().toISOString().split('T')[0], 
            category: 'Rent', 
            amount: 1200, 
            status: 'Pending', 
            assignedTo: 'John Doe', 
            receipt: null 
        }
    ]);

    const addExpense = (expense: any) => {
        expenses.value.push({ ...expense, id: `${Date.now()}` });
        console.log('Added Expense:', expense);
    };

    const updateExpense = (id: string, updatedExpense: any) => {
        const index = expenses.value.findIndex((e) => e.id === id);
        if (index !== -1) {
            expenses.value[index] = { ...expenses.value[index], ...updatedExpense };
            console.log('Updated Expense:', updatedExpense);
        }
    };

    const deleteExpense = (id: string) => {
        expenses.value = expenses.value.filter((e) => e.id !== id);
        console.log('Deleted Expense ID:', id);
    };

    return {
        expenses,
        addExpense,
        updateExpense,
        deleteExpense
    };
};
