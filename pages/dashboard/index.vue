
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
  