<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Top-Selling {{title}}</h3>
     <v-chart style="min-height: 300px;" :option="chartOptions" autoresize />
    </div>
  </template>
  <script setup lang="ts">
import { defineAsyncComponent, computed, onMounted } from 'vue'
import { useEChartsSetup } from '~/composables/useEChartsSetup'

onMounted(() => {
  useEChartsSetup()
})

const VChart = defineAsyncComponent({
  loader: () => import('vue-echarts'),
  suspensible: false,
  // @ts-ignore
  ssr: false // disable SSR
})

// ✅ Keep props object reactive — don't destructure
const props = defineProps<{
  topProducts: { name: string; total: number }[]
  title?: string
}>()


const chartOptions = computed(() => ({
  xAxis: {
    type: 'value',
    name: 'Units Sold',
  },
  yAxis: {
    type: 'category',
    data: props.topProducts.map((p) => p.name),
    axisLabel: {
      formatter: (value: string) =>
        value.length > 20 ? value.slice(0, 10) + '...' : value
    },
  },
  series: [
    {
      type: 'bar',
      data: props.topProducts.map((p) => p.total),
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
