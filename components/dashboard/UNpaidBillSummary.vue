<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-4">Unpaid Bills Summary</h3>
      <div class="text-2xl font-bold text-red-600 mb-4">₹{{ totalUnpaid.toLocaleString() }}</div>
  
      <ul v-if="recentUnpaidBills.length" class="space-y-2">
        <li v-for="bill in recentUnpaidBills" :key="bill.id" class="flex justify-between text-sm">
          <span>Bill #{{ bill.id.slice(0, 6) }}</span>
          <span class="text-red-500">₹{{ bill.grandTotal }}</span>
        </li>
      </ul>
      <p v-else class="text-gray-400 text-sm">No unpaid bills 🎉</p>
    </div>
  </template>
  
  <script setup lang="ts">
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  
  const { totalUnpaid, recentUnpaidBills } = useCompanyDashboard()
  </script>
  