<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Bills Over Time</h3>
      <ClientOnly>
        <VChart :option="chartOptions" class="h-64 w-full" />
      </ClientOnly>
    </div>
  </template>
  
  <script setup lang="ts">
  import { defineAsyncComponent, computed, onMounted } from 'vue'
  import { useCompanyDashboard } from '@/lib/api/useDashboardData'
  import { useEChartsSetup } from '~/composables/useEChartsSetup'
  
  onMounted(() => useEChartsSetup())
  
  const VChart = defineAsyncComponent(() => import('vue-echarts'))
  const { billsOverTime } = useCompanyDashboard()
  
  const chartOptions = computed(() => ({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: billsOverTime.value.map((d) => d.month)
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '₹{value}' }
    },
    series: [
      {
        name: 'Bills',
        type: 'line',
        data: billsOverTime.value.map((d) => d.total),
        smooth: true,
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 3 }
      }
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  }))
  </script>
  