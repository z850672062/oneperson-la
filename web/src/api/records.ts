import { api } from './client'
import { asItems } from './unwrap'
import type { PageResult, RecordPayload, RecordStatusFilter, RecordItem } from '../types'

export interface RecordQuery {
  categoryId?: string
  status?: RecordStatusFilter
  q?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export async function listRecords(query: RecordQuery): Promise<PageResult<RecordItem>> {
  const { data } = await api.get<PageResult<RecordItem>>('/records', {
    params: {
      categoryId: query.categoryId || undefined,
      status: query.status && query.status !== 'all' ? query.status : undefined,
      q: query.q || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      page: query.page,
      pageSize: query.pageSize,
    },
  })
  return {
    ...data,
    items: asItems(data.items as RecordItem[] | { items?: RecordItem[] }),
    total: Number(data.total) || 0,
    page: Number(data.page) || query.page || 1,
    pageSize: Number(data.pageSize) || query.pageSize || 20,
  }
}

export async function createRecord(payload: RecordPayload): Promise<RecordItem> {
  const { data } = await api.post<{ record?: RecordItem } & RecordItem>('/records', payload)
  return data.record ?? data
}

export async function updateRecord(id: string, payload: RecordPayload): Promise<RecordItem> {
  const { data } = await api.patch<{ record?: RecordItem } & RecordItem>(`/records/${id}`, payload)
  return data.record ?? data
}

export async function deleteRecord(id: string): Promise<void> {
  await api.delete(`/records/${id}`)
}
