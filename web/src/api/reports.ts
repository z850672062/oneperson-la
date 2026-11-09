import { api } from './client'
import { asItems } from './unwrap'
import type { Report } from '../types'

export type ReportType = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface GenerateReportInput {
  type: ReportType
  period?: string
  from?: string
  to?: string
}

export async function generateReport(payload: GenerateReportInput): Promise<Report> {
  const { data } = await api.post<{ report: Report }>('/reports/generate', payload)
  return data.report
}

export async function listReports(): Promise<Report[]> {
  const { data } = await api.get<{ items: Report[] } | Report[]>('/reports')
  return asItems(data)
}

export async function getReport(id: string): Promise<Report> {
  const { data } = await api.get<{ report: Report }>(`/reports/${id}`)
  return data.report
}

export async function exportReport(id: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/reports/${id}/export`, { responseType: 'blob' })
  return data
}
