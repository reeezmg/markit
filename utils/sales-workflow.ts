export const normalizeSalesWorkflow = (value: any) => ({
    version: 1 as const,
    includeInvoicing: typeof value?.includeInvoicing === 'boolean' ? value.includeInvoicing : false,
    includeAfterSales: typeof value?.includeAfterSales === 'boolean' ? value.includeAfterSales : false,
});
export function salesMenu(includeInvoicing: boolean) {
    return [
        ...(includeInvoicing ? [{ label: 'Quotes', to: '/erp/quotes' }] : []),
        { label: 'Billing', to: '/erp/billing' },
        { label: 'Sales', to: '/erp/sales' },
        { label: 'Credit', to: '/erp/accounts' },
        ...(includeInvoicing ? [
            { label: 'Sales order', to: '/erp/sales-orders' },
            { label: 'Recurring invoices', to: '/erp/recurring-invoices' },
            { label: 'Retainer invoices', to: '/erp/retainer-invoices' },
            { label: 'Payments received', to: '/erp/payments' },
        ] : []),
        { label: 'Settings', to: '/erp/settings' },
    ].map(link => ({ ...link, exact: link.to === '/erp/billing' }));
}
