<template>
    <Bar :data="chartData" :options="chartOptions" />
  </template>
  
  <script setup lang="ts">
  import { Bar } from 'vue-chartjs'
  import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js'
  import { useCompanyDashboard } from '~/lib/api/useDashboardData'
  
  ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)
  
  const { revenueGraph } = useCompanyDashboard()
  
  const chartData = computed(() => ({
    labels: revenueGraph.value.map((d) => d.month),
    datasets: [
      {
        label: 'Monthly Revenue',
        data: revenueGraph.value.map((d) => d.total),
        backgroundColor: '#4f46e5',
      },
    ],
  }))
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
  }
  </script>
  
  <style scoped>
  canvas {
    height: 300px;
  }
  </style>
  