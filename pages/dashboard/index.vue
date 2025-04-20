<!-- <template>
    <div class="p-6">
      <h1 class="text-2xl font-bold mb-4">Admin Dashboard</h1>
  
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard color="primary">
          <p class="text-lg font-semibold">Total Products</p>
          <p class="text-3xl">{{ totalProducts }}</p>
        </UCard>
  
        <UCard color="green">
          <p class="text-lg font-semibold">Total Bills</p>
          <p class="text-3xl">{{ totalBills }}</p>
        </UCard>
  
        <UCard color="blue">
          <p class="text-lg font-semibold">Total Accounts</p>
          <p class="text-3xl">{{ totalAccounts }}</p>
        </UCard>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref } from 'vue'
//   import { useClient } from '@zenstackhq/runtime'
//   import { useNuxtApp } from '#app'
  
  const totalProducts = ref(0)
  const totalBills = ref(0)
  const totalAccounts = ref(0)
  

  

  
    totalProducts.value = 10
    totalBills.value = 10
    totalAccounts.value = 10
  
  </script>
   -->

   <template>
    <UDashboardPanelContent>
      <div class="space-y-6 p-6">
    <DashboardCards />
    <ClientOnly>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RevenueEChart />
          <CategoryRevenuePie />
        </div>

        <!-- Row: Top Products and Unpaid Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TopProducts />
          
          <billsOverTime />
        </div>
        <taxCollectedChart />

        <!-- Full width -->
    </ClientOnly>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

      <UNpaidBillSummary />
      <RecentBill />
    </div>
  </div>
  </UDashboardPanelContent>
  </template>
  
  <script setup lang="ts">
  import DashboardCards from '@/components/dashboard/DashboardCards.vue'
  import RevenueEChart from '@/components/dashboard/RevenueEChart.vue'
    import TopProducts from '@/components/dashboard/TopProducts.vue'
    import RecentBill from '@/components/dashboard/RecentBill.vue'
    import CategoryRevenuePie from '@/components/dashboard/CategoryRevenuePie.vue'
    import UNpaidBillSummary from '@/components/dashboard/UNpaidBillSummary.vue'
    import billsOverTime from '@/components/dashboard/billsOverTimeChart.vue'
    import taxCollectedChart from '@/components/dashboard/taxCollectedChart.vue'


  </script>
  