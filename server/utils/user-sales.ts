export interface SalesEntryLike {
    billId: string
    value: any
    return?: boolean | null
    bill?: {
        discount?: any
    } | null
}

export interface NetSalesGroup<T extends SalesEntryLike> {
    count: number
    total: number
    entries: Array<{ entry: T; netValue: number }>
}

export function calculateNetSalesByKey<T extends SalesEntryLike>(
    entries: T[],
    keyOf: (entry: T) => string,
): Record<string, NetSalesGroup<T>> {
    const processed: Record<string, NetSalesGroup<T>> = {}
    const entriesByBill: Record<string, T[]> = {}

    for (const entry of entries) {
        if (!entriesByBill[entry.billId]) entriesByBill[entry.billId] = []
        entriesByBill[entry.billId].push(entry)
    }

    for (const billId of Object.keys(entriesByBill)) {
        const billEntries = entriesByBill[billId]
        const salesEntries = billEntries.filter((entry) => !entry.return)
        const salesValueTotal = salesEntries.reduce((sum, entry) => sum + Number(entry.value || 0), 0)

        let cappedBillDiscount = 0
        if (salesValueTotal > 0) {
            const rawDiscount = Number(salesEntries[0]?.bill?.discount || 0)
            const billDiscountAmount =
                rawDiscount < 0
                    ? Math.abs(rawDiscount)
                    : (salesValueTotal * rawDiscount) / 100
            cappedBillDiscount = Math.min(billDiscountAmount, salesValueTotal)
        }

        for (const entry of billEntries) {
            const key = keyOf(entry)
            if (!processed[key]) {
                processed[key] = { count: 0, total: 0, entries: [] }
            }

            const entryValue = Number(entry.value || 0)
            let netValue = 0

            if (entry.return) {
                netValue = -entryValue
            } else if (salesValueTotal > 0) {
                const discountShare = (entryValue / salesValueTotal) * cappedBillDiscount
                netValue = entryValue - discountShare
            } else {
                netValue = entryValue
            }

            processed[key].count += 1
            processed[key].total += netValue
            processed[key].entries.push({ entry, netValue: Number(netValue.toFixed(2)) })
        }
    }

    return processed
}
