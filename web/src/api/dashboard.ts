import { api } from './client'
import type { DashboardSummary } from '../types'

export type DashboardPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface DashboardQuery {
  period: DashboardPeriod
  from?: string
  to?: string
}

export async function getSummary(query: DashboardQuery): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
    params: {
      period: query.period,
      from: query.from || undefined,
      to: query.to || undefined,
    },
  })
  return data
}
