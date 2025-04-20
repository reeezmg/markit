// // composables/useEChartsSetup.ts
// import { use } from 'echarts/core'
// import {
//   GridComponent,
//   TooltipComponent,
//   TitleComponent,
//   LegendComponent,
// } from 'echarts/components'
// import { BarChart, LineChart, PieChart } from 'echarts/charts'
// import { CanvasRenderer } from 'echarts/renderers'

// let initialized = false

// export function useEChartsSetup() {
//   if (initialized) return
//   use([
//     CanvasRenderer,
//     BarChart,
//     LineChart,
//     PieChart,
//     GridComponent,
//     TooltipComponent,
//     TitleComponent,
//     LegendComponent
//   ])
//   initialized = true
// }

import { use } from 'echarts/core'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

let initialized = false

export function useEChartsSetup() {
  if (!process.client || initialized) return  // 💥 prevent server-side execution

  use([
    CanvasRenderer,
    BarChart,
    LineChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    TitleComponent,
    LegendComponent,
  ])
  initialized = true
}

