<template>
  <div>
    <ClientOnly>
      <VChart
        ref="chartRef"
        :option="chartOptions"
        class="w-full"
        style="height: 300px"
        autoresize
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
  title?: string
  revenueByCategory: { name: string; value: number }[]
}>()

console.log(props.revenueByCategory)
const chartRef = ref()

watch(
  () => props.revenueByCategory,
  (newData) => {
    if (chartRef.value) {
      chartRef.value.setOption({
        series: [{ data: newData }]
      })
    }
  },
  { deep: true }
)

const chartOptions = computed(() => ({
  title: props.title
    ? {
        text: props.title,
        left: 'center',
        top: '5%',
        textStyle: {
          fontSize: 14,
          fontWeight: '600'
        }
      }
    : undefined,

  tooltip: {
    trigger: 'item',
    formatter: '{b}: ₹{c} ({d}%)'
  },

  series: [
    {
      name: props.title || 'Revenue by Category',
      type: 'pie',
      radius: '80%',
      top: '15%', // push chart down so title doesn’t overlap
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
