<!-- <script setup lang="ts">
import { defineAsyncComponent, onMounted, computed } from 'vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'
import { useEChartsSetup } from '~/composables/useEChartsSetup'

onMounted(() => {
  useEChartsSetup()
})

const VChart = defineAsyncComponent(() => import('vue-echarts'))

const { revenueGraph } = useCompanyDashboard()

const chartOptions = computed(() => ({
  title: {
    text: 'Monthly Revenue',
    left: 'center',
    textStyle: {
      fontSize: 14,
      fontWeight: 'bold'
    }
  },
  tooltip: {
    trigger: 'axis'
  },
  xAxis: {
    type: 'category',
    data: revenueGraph.value?.map((d) => d.month) || []
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: '₹{value}'
    }
  },
  series: [
    {
      name: 'Revenue',
      type: 'bar',
      data: revenueGraph.value?.map((d) => d.total) || [],
      itemStyle: {
        color: '#4f46e5',
        borderRadius: [6, 6, 0, 0]
      },
      label: {
        show: true,
        position: 'top',
        formatter: '₹{c}'
      }
    }
  ],
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  }
}))
</script>

<template>
    <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
      <h3 class="text-lg font-semibold mb-2">Revenue (Monthly)</h3>
  
      <ClientOnly>
        <div v-if="!revenueGraph?.length" class="h-64 flex items-center justify-center text-gray-400">
          No revenue data available.
        </div>
        <VChart
          v-else
          class="h-64 w-full"
          :option="chartOptions"
        />
      </ClientOnly>
    </div>
  </template>
   -->



<!--   FIXED DOCUMEN NOT FOUND ISSUE -->

<template>
  <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4">
    <h3 class="text-lg font-semibold mb-2">Revenue (Monthly)</h3>

    <div v-if="!revenueGraph?.length" class="h-64 flex items-center justify-center text-gray-400">
      No revenue data available.
    </div>
    <VChart
      v-else
      class="h-64 w-full"
      :option="chartOptions"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useCompanyDashboard } from '@/lib/api/useDashboardData'
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

const { revenueGraph } = useCompanyDashboard()

const chartOptions = computed(() => ({
  title: {
    text: 'Monthly Revenue',
    left: 'center',
    textStyle: { fontSize: 14, fontWeight: 'bold' }
  },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: revenueGraph.value?.map((d) => d.month) || []
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: '₹{value}'
    }
  },
  series: [
    {
      name: 'Revenue',
      type: 'bar',
      data: revenueGraph.value?.map((d) => d.total) || [],
      itemStyle: {
        color: '#4f46e5',
        borderRadius: [6, 6, 0, 0]
      },
      label: {
        show: true,
        position: 'top',
        formatter: '₹{c}'
      }
    }
  ],
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  }
}))
</script>
