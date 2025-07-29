<template>
  <div class="bg-white h-full dark:bg-zinc-900 rounded-2xl shadow-md p-4">
    <h3 class="text-lg font-semibold mb-2">Revenue by Category</h3>
    <ClientOnly>
      <VChart 
        ref="chartRef"
        :option="chartOptions" 
        class="h-full w-full" 
        manual-update
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, computed, onMounted, ref, watch } from 'vue'
import { useEChartsSetup } from '~/composables/useEChartsSetup'

onMounted(() => {
  useEChartsSetup()
})

const VChart = defineAsyncComponent(() => import('vue-echarts'))

const props = defineProps<{
  revenueByCategory: { name: string; value: number }[]
}>()

const chartRef = ref()

watch(() => props.revenueByCategory, (newData) => {
  if (chartRef.value) {
    chartRef.value.setOption({
      series: [{
        data: newData
      }]
    })
  }
}, { deep: true })

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
      data: props.revenueByCategory,
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