<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useEChartsSetup } from '@/composables/useEChartsSetup'
const props = defineProps<{
  entries: {
    labels: string[]
    countData: number[]
    salesData: number[]
    entryGroups:any
  }
}>()
console.log(props.entries)
const chartOptions = ref({})

onMounted(() => useEChartsSetup())

const VChart = defineAsyncComponent(() => import('vue-echarts'))
const labels = ref([])
const countData = ref([])
const salesData = ref([])

watchEffect(() => {
  if (props.entries) {
    labels.value = props.entries.labels || []
    countData.value = props.entries.countData || []
    salesData.value = props.entries.salesData || []

    chartOptions.value = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Entries', 'Sales'] },
      xAxis: { type: 'category', data: labels.value },
      yAxis: [
        {
          type: 'value',
          name: 'Entries',
          position: 'left',
          axisLine: { lineStyle: { color: '#FAC858' } },
          axisLabel: { formatter: '{value}' }
        },
        {
          type: 'value',
          name: 'Sales',
          position: 'right',
          axisLine: { lineStyle: { color: '#73C0DE' } },
          axisLabel: { formatter: '₹{value}' }
        }
      ],
      series: [
        {
          name: 'Entries',
          type: 'bar',
          yAxisIndex: 0,
          data: countData.value,
          itemStyle: { color: '#FAC858' }
        },
        {
          name: 'Sales',
          type: 'bar',
          yAxisIndex: 1,
          data: salesData.value,
          itemStyle: { color: '#73C0DE' }
        }
      ]
    }
  }
})

</script>

<template>
  <UCard class="w-full">
  <client-only>
    <div class="h-[75vh]">
      <VChart :option="chartOptions" autoresize style="height: 100%;" />
    </div>
  </client-only>
</UCard>
</template>
