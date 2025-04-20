<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Revenue by Category</h3>
      <ClientOnly>
        <VChart :option="chartOptions" class="h-64 w-full" />
      </ClientOnly>
    </div>
  </template>
  
  <script setup lang="ts">
  import { defineAsyncComponent, computed, onMounted } from 'vue'
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  import { useEChartsSetup } from '~/composables/useEChartsSetup'
  
  onMounted(() => {
    useEChartsSetup()
  })
  
  const VChart = defineAsyncComponent(() => import('vue-echarts'))
  
  const { revenueByCategory } = useCompanyDashboard()
  
  const chartOptions = computed(() => ({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: ₹{c} ({d}%)'
    },
    series: [
      {
        name: 'Revenue by Category',
        type: 'pie',
        radius: '70%',
        data: revenueByCategory.value,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }))
  </script>
  