<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Recent Transactions</h3>
      <ul>
        <li
          v-for="bill in recentTransactions"
          :key="bill.id"
          class="flex justify-between border-b py-2 text-sm"
        >
          <div>
            <p class="font-medium">Bill #{{ bill.id.slice(0, 6) }}</p>
            <p class="text-xs text-gray-500">
              {{ new Date(bill.createdAt).toLocaleDateString() }}
            </p>
          </div>
          <div class="text-right">
            <p class="font-semibold text-indigo-600">₹{{ bill.grandTotal?.toFixed(2) }}</p>
            <!-- You can also show status if available -->
          </div>
        </li>
      </ul>
    </div>
  </template>
  
  <script setup lang="ts">
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  const { recentTransactions } = useCompanyDashboard()
  </script>
  