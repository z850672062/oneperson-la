import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsCoreOption } from 'echarts/core'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

export interface TrendPoint {
  date: string
  created: number
  done: number
}

interface TrendChartProps {
  data: TrendPoint[]
  height?: number
}

function buildOption(data: TrendPoint[]): EChartsCoreOption {
  return {
    animation: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    grid: { left: 8, right: 18, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22303c',
      borderWidth: 0,
      textStyle: { color: '#f3f1ec', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((item) => item.date.slice(5).replace('-', '/')),
      axisLine: { lineStyle: { color: '#d5cfc2' } },
      axisTick: { show: false },
      axisLabel: { color: '#8b8577', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#efe9dd' } },
      axisLabel: { color: '#8b8577', fontSize: 11 },
    },
    series: [
      {
        name: '新增',
        type: 'line',
        data: data.map((item) => Number(item.created) || 0),
        symbolSize: 6,
        lineStyle: { width: 2, color: '#41719c' },
        itemStyle: { color: '#41719c' },
        areaStyle: { color: 'rgba(65,113,156,0.08)' },
      },
      {
        name: '办结',
        type: 'line',
        data: data.map((item) => Number(item.done) || 0),
        symbolSize: 6,
        lineStyle: { width: 2, color: '#b98f45', type: 'dashed' },
        itemStyle: { color: '#b98f45' },
      },
    ],
  }
}

export default function TrendChart({ data, height = 240 }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = echarts.init(container)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(buildOption(data), true)
  }, [data])

  return <div ref={containerRef} className="trend-chart" style={{ height }} />
}
