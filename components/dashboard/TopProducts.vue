<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Top-Selling Products</h3>
      <v-chart class="h-64" :option="chartOptions" autoresize />
    </div>
  </template>
  
  <script setup lang="ts">
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  import { defineAsyncComponent, onMounted, computed } from 'vue'
import { useEChartsSetup } from '~/composables/useEChartsSetup'

onMounted(() => {
  useEChartsSetup()
})

const VChart = defineAsyncComponent({
  loader: () => import('vue-echarts'),
  suspensible: false,
  // @ts-ignore
  ssr: false // 🔥 explicitly turn off SSR
})
  

  
  const { topProducts } = useCompanyDashboard()
  
  const chartOptions = computed(() => ({
    xAxis: {
      type: 'value',
      name: 'Units Sold',
    },
    yAxis: {
      type: 'category',
      data: topProducts.value.map((p) => p.name),
      axisLabel: {
        formatter: (value: string) => value.length > 20 ? value.slice(0, 10) + '...' : value
      },
    },
    series: [
      {
        type: 'bar',
        data: topProducts.value.map((p) => p.total),
        itemStyle: {
          color: '#16a34a',
          borderRadius: [0, 8, 8, 0],
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      formatter: ({ name, value }: any) => `${name}<br/>Sold: ${value}`,
    },
  }))
  </script>
  