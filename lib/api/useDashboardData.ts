import {
    useFindManyProduct,
    useFindUniqueCompany,
    useFindManyItem,
    useFindManyBill,
    useFindManyExpense,
    useFindManyEntry, 
    useFindManyVariant,
  } from '@/lib/hooks'
  import { computed } from 'vue'
  const useAuth = () => useNuxtApp().$auth;
  
export function useCompanyDashboard(startDate?: Date, endDate?: Date) {
    const companyQuery = useFindUniqueCompany({
        where: { id: useAuth().session.value?.companyId },
        select:{
          address:true
        }
      }
      )

    const productsQuery = useFindManyProduct({
        where: {
        AND: [
            { companyId: useAuth().session.value?.companyId },]}})

    const itemsQuery = useFindManyItem({
        where: {
        AND: [
            { companyId: useAuth().session.value?.companyId },]}})

    const variantsQuery = useFindManyVariant({
      where: {
      AND: [
          { companyId: useAuth().session.value?.companyId },]}})


            
    const billsQuery = useFindManyBill({
        where: {
        AND: [
            { companyId: useAuth().session.value?.companyId },
            { deleted:false },
   
          ]
          },
          include: {
            client: true,
            address: true,
            entries:{
              select: {
                rate: true,
                qty: true,
              },
            },
          },
        
        })


    const expensesQuery = useFindManyExpense({
        where: {
        AND: [
            { companyId: useAuth().session.value?.companyId },]},
            include:{
              expensecategory:true
            }
          }
          )

    const entriesQuery = useFindManyEntry({
        where: {
            bill: {
              companyId: useAuth().session.value?.companyId,
              deleted:false
            },
          },
          include: {
            variant: {
              include: {
                product: true,
              },
            },
            category: true,
            bill: true,
       
          },
        }
    )



      const company = ref(companyQuery.data.value)
      const products = ref(productsQuery.data.value)
      const items = ref(itemsQuery.data.value)
      const bills = ref(billsQuery.data.value)
      const expenses = ref(expensesQuery.data.value)
      const entries = ref(entriesQuery.data.value)
      const variants = ref(variantsQuery.data)

      watch(() => companyQuery.data.value, (newVal) => {
        console.log(newVal)
        company.value = newVal
      })
    
      watch(() => productsQuery.data.value, (newVal) => {
        products.value = newVal
      })
    
      watch(() => itemsQuery.data.value, (newVal) => {
        items.value = newVal
      })
    
      watch(() => billsQuery.data.value, (newVal) => {
        bills.value = newVal
      })
    
      watch(() => expensesQuery.data.value, (newVal) => {
        expenses.value = newVal
        console.log(newVal)
      })
    
      watch(() => entriesQuery.data.value, (newVal) => {
        entries.value = newVal
      })
      watch(() => variantsQuery.data.value, (newVal) => {
        variants.value = newVal
      })

      const refreshAll = async () => {
        await Promise.all([
          companyQuery.refetch(),
          productsQuery.refetch(),
          itemsQuery.refetch(),
          billsQuery.refetch(),
          expensesQuery.refetch(),
          entriesQuery.refetch(),
          variantsQuery.refetch()
        ])
      }

    const lowStockEntries = computed(() => {
    if (!variants.value) return []
  
    return variants.value.filter(entry =>  (entry.qty ?? 0) < 5).sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0))
    .slice(0, 6)
  })

  const recentTransactions = computed(() => {
    if (!bills.value) return []
    return [...bills.value]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6) // limit to 6 recent bills
  })
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const topProducts = computed(() => {
    if (!entries.value) return []
  
    const productMap = new Map<string, { name: string; total: number }>()
  
    for (const entry of entries.value) {
      const name = entry.variant.product?.name || 'Unknown'
      const key = name
  
      if (!productMap.has(key)) {
        productMap.set(key, { name, total: 0 })
      }
  
      productMap.get(key)!.total += entry.qty ?? 0
    }
  
    return Array.from(productMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  })
  

  const categorySales = computed(() => {
    if (!entries.value) return []

    const salesMap = new Map<string, { name: string; sales: number }>()

    for (const entry of entries.value) {
      if (entry.return) continue

      const createdAt = new Date(entry.bill?.createdAt || '')
      if (isNaN(createdAt)) continue

      // ✅ Apply date filter only if startDate/endDate are defined
      if (startDate && createdAt < startDate) continue
      if (endDate && createdAt > endDate) continue

      const name = entry.category?.name || 'Unknown'

      if (!salesMap.has(name)) {
        salesMap.set(name, { name, sales: 0 })
      }

      salesMap.get(name)!.sales += entry.value ?? 0
    }

    return [...salesMap.values()].sort((a, b) => b.sales - a.sales)
  })


  
    const productsCount = computed(() => products.value?.length ?? 0)
    const itemsCount = computed(() => items.value?.length ?? 0)

  
    const totalRevenue = computed(() =>
        bills.value?.filter((bill) => bill.paymentStatus === 'PAID').reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0) ?? 0
      )
      
      const revenueGraph = computed(() => {
        return Array.from({ length: 12 }, (_, i) => {
          const month = i + 1
          const total =
            bills.value
              ?.filter((b) => new Date(b.createdAt).getMonth() + 1 === month).filter((b) => b.paymentStatus === 'PAID')
              .reduce((sum, b) => sum + (b.grandTotal ?? 0), 0) ?? 0
          return { month: monthNames[i], total }
        })
      })
      
  
    const totalExpenses = computed(() =>
      expenses.value?.reduce((sum, e) => sum + (e.totalAmount ?? 0), 0) ?? 0
    )
  
    const revenueByCategory = computed(() => {
      if (!entries.value) return []
    
      const map = new Map<string, number>()
    
      for (const entry of entries.value) {
        const name = entry.category?.name || 'Uncategorized'
        const value = entry.value ?? 0
    
        map.set(name, (map.get(name) ?? 0) + value)
      }
    
      return Array.from(map.entries()).map(([name, total]) => ({
        name,
        value: total
      }))
    })

    const unpaidBills = computed(() =>
      bills.value?.filter((b) => b.paymentStatus !== 'PAID') ?? []
    )
    
    const totalUnpaid = computed(() =>
      unpaidBills.value.reduce((sum, b) => sum + (b.grandTotal ?? 0), 0)
    )
    
    const recentUnpaidBills = computed(() =>
      unpaidBills.value.slice(0, 5)
    )

    const totalTaxCollected = computed(() => {
      if (!entries.value) return 0
    
      return entries.value.reduce((sum, entry) => {
        const qty = entry.qty ?? 0
        const rate = entry.rate ?? 0
        const taxPercent = entry.tax ?? 0
        const taxAmount = qty * rate * (taxPercent / 100)
        return sum + taxAmount
      }, 0)
    })
    
  
    const billsOverTime = computed(() => {
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1
        const total =
          bills.value
            ?.filter((b) => new Date(b.createdAt).getMonth() + 1 === month)
            .reduce((sum, b) => sum + (b.grandTotal ?? 0), 0) ?? 0
    
        return { month: monthNames[i], total }
      })
    })

    const taxByMonth = computed(() => {
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1
    
        const total = entries.value
        ?.filter((e) => e.bill?.createdAt && new Date(e.bill.createdAt).getMonth() + 1 === month)
          .reduce((sum, e) => {
            const qty = e.qty ?? 0
            const rate = e.rate ?? 0
            const tax = e.tax ?? 0
            return sum + qty * rate * (tax / 100)
          }, 0) ?? 0
    
        return {
          month: new Date(0, i).toLocaleString('default', { month: 'short' }),
          total
        }
      })
    })

    const outstandingCustomers = computed(() => {
      if (!bills.value) return []
    
      const map = new Map<string, { name: string; total: number; count: number }>()
    
      for (const bill of bills.value) {
        if (bill.paymentStatus !== 'PENDING' ) continue
    
        const key = bill.clientId ?? 'unknown Client ID'
        const name = bill.client?.name ?? 'unknown CLient Name'
    
        if (!map.has(key)) {
          map.set(key, { name, total: 0, count: 0 })
        }
    
        const entry = map.get(key)!
        entry.total += bill.grandTotal ?? 0
        entry.count += 1
      }
    
      return Array.from(map.values()).sort((a, b) => b.total - a.total)
    })
    
    
    return {
      company:company,
      productsCount,
      itemsCount,
      totalRevenue,
      totalExpenses,
      revenueGraph,
      topProducts,
      categorySales:categorySales.value,
      lowStockEntries,
      recentTransactions,
      revenueByCategory,
      billsOverTime,
      recentUnpaidBills,
      totalUnpaid,
      totalTaxCollected,
      taxByMonth,
      outstandingCustomers,
      products: products,
    bills: bills,
    expenses: expenses,
    entries: entries,
    refreshAll
    }
  }
  