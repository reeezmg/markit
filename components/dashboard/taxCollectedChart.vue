<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Tax Collected (Monthly)</h3>
      <ClientOnly>
        <VChart class="h-64" :option="chartOptions" />
      </ClientOnly>
    </div>
  </template>
  
  <script setup lang="ts">
  import { defineAsyncComponent, computed, onMounted } from 'vue'
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  import { useEChartsSetup } from '~/composables/useEChartsSetup'
  
  onMounted(() => useEChartsSetup())
  const VChart = defineAsyncComponent(() => import('vue-echarts'))
  
  const { taxByMonth } = useCompanyDashboard()
  
  const chartOptions = computed(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: taxByMonth.value.map(d => d.month)
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '₹{value}' }
    },
    series: [
      {
        name: 'Tax',
        type: 'line',
        smooth: true,
        data: taxByMonth.value.map(d => d.total),
        lineStyle: { color: '#10b981' },
        itemStyle: { color: '#10b981' }
      }
    ]
  }))
  </script>
  