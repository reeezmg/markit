import type { Ref, ComputedRef } from 'vue'
import type { 
  Product, 
  Bill, 
  Expense, 
  Entry,
  Address,
  Client
} from '@zenstackhq/runtime/models'

// Extended Bill type with relations
export interface BillWithRelations extends Bill {
  client?: Client
  address?: Address
  entries?: EntryWithRelations[]
}

// Extended Entry type with relations
export interface EntryWithRelations extends Entry {
  variant?: {
    id: string
    name: string
    // Add other variant properties as needed
  }
  category?: {
    id: string
    name: string
    // Add other category properties as needed
  }
  bill?: BillWithRelations
}

// Main dashboard interface
export interface DashboardComposable {
  // Data properties
  products: Ref<Product[] | undefined>
  bills: Ref<BillWithRelations[] | undefined>
  expenses: Ref<Expense[] | undefined>
  entries: Ref<Entry[] | undefined>
  
  // Computed properties
  productsCount: ComputedRef<number>
  itemsCount: ComputedRef<number>
  totalRevenue: ComputedRef<number>
  totalExpenses: ComputedRef<number>
  revenueGraph: ComputedRef<Array<{ month: string; total: number }>>
  topProducts: ComputedRef<Array<{ name: string; total: number }>>
  lowStockEntries: ComputedRef<Entry[]>
  recentTransactions: ComputedRef<BillWithRelations[]>
  revenueByCategory: ComputedRef<Array<{ name: string; value: number }>>
  billsOverTime: ComputedRef<Array<{ month: string; total: number }>>
  recentUnpaidBills: ComputedRef<BillWithRelations[]>
  totalUnpaid: ComputedRef<number>
  totalTaxCollected: ComputedRef<number>
  taxByMonth: ComputedRef<Array<{ month: string; total: number }>>
  outstandingCustomers: ComputedRef<Array<{ name: string; total: number; count: number }>>
  
  // Refresh method
  refreshAll: () => Promise<void>
  
  // Utility functions (remove these if not needed in composable)
  // formatCurrency?: (val: number) => string
  // formatAddress?: (address?: Address) => string
}

// For PDF generation
export interface KpiItem {
  KPI: string
  Value: string | number
}

export interface PdfReportMeta {
  companyName: string
  logoUrl?: string
  dateRange: string
  reportTitle?: string
  generatedAt?: string
}