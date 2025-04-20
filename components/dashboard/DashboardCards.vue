<template>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Products" :value="productsCount">
        <template #icon><PackageIcon class="w-5 h-5 text-indigo-600" /></template>
      </KpiCard>
      <KpiCard title="Revenue" :value="formatCurrency(totalRevenue)">
        <template #icon><BanknoteIcon class="w-5 h-5 text-green-600" /></template>
      </KpiCard>
      <KpiCard title="Expenses" :value="formatCurrency(totalExpenses)">
        <template #icon><ReceiptIcon class="w-5 h-5 text-red-600" /></template>
      </KpiCard>
      <KpiCard title="Profit" :value="formatCurrency(profit)">
        <template #icon><TrendingUpIcon class="w-5 h-5 text-purple-600" /></template>
      </KpiCard>
      <div class="mt-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
    <h3 class="text-lg font-semibold mb-4">Low Stock Items</h3>

    <ul v-if="lowStockEntries.length" class="divide-y divide-gray-200 dark:divide-zinc-700">
      <li v-for="entry in lowStockEntries" :key="entry.id" class="py-2 flex justify-between">
        <span class="text-gray-700 dark:text-gray-200">{{ entry.variant?.name || 'Unknown' }}</span>
        <span class="text-red-600 font-medium">{{ entry.variant?.qty }} left</span>
      </li>
    </ul>
    
    <div v-else class="text-gray-500 dark:text-gray-400 text-sm">All items in stock</div>
  </div>
  <KpiCard title="Total Tax Collected" :value="totalTaxCollected">
        <template #icon><PercentIcon class="w-5 h-5 text-indigo-600" /></template>
      </KpiCard>
      <!-- Outstanding Summary Card -->
<div class="bg-white dark:bg-zinc-900 rounded-2xl shadow p-4">
  <h3 class="text-lg font-semibold mb-4">Customer Outstanding</h3>
  <ul class="divide-y divide-gray-200 dark:divide-zinc-700">
    <li v-for="c in outstandingCustomers.slice(0, 5)" :key="c.name" class="py-2 flex justify-between">
      <span class="text-sm">{{ c.name }}</span>
      <div class="text-right">
        <div class="text-sm font-medium">₹{{ c.total.toFixed(2) }}</div>
        <div class="text-xs text-gray-500">{{ c.count }} bill(s)</div>
      </div>
    </li>
  </ul>
</div>

    </div>

  </template>
  
  <script setup lang="ts">
  import KpiCard from '@/components/dashboard/KpiCard.vue'
  import {
    PackageIcon,
    BanknoteIcon,
    ReceiptIcon,
    TrendingUpIcon,
PercentIcon,
  } from 'lucide-vue-next'
  
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  
  const {
    productsCount,
    totalRevenue,
    totalExpenses,
    lowStockEntries,
    totalTaxCollected,
    outstandingCustomers
  } = useCompanyDashboard()
  
  const profit = computed(() => totalRevenue.value - totalExpenses.value)
  
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(val)
  </script>
  