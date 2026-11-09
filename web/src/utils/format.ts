import dayjs from 'dayjs'
import type { DashboardRange } from '../types'

export function cnDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10).replace(/-/g, '.')
}

export function formatRange(range: DashboardRange | null | undefined): string {
  if (!range) return ''
  return `${range.label} ${cnDate(range.from)} — ${cnDate(range.to)}`
}

export function formatHours(value: number | null | undefined): string {
  return (Number(value) || 0).toFixed(1)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('MM-DD') : value
}

export function formatPercent(value: number | null | undefined): string {
  const num = Number(value) || 0
  return `${Math.round(num)}%`
}
