import { api } from './client'
import { asItems } from './unwrap'
import type { Connector, KbDoc, KbSearchItem } from '../types'

export async function listConnectors(): Promise<Connector[]> {
  const { data } = await api.get<{ items: Connector[] } | Connector[]>('/kb/connectors')
  return asItems(data)
}

export interface ConnectorInput {
  name: string
  type: string
  path?: string
  [key: string]: unknown
}

export async function createConnector(payload: ConnectorInput): Promise<Connector> {
  const { data } = await api.post<{ connector?: Connector } & Connector>('/kb/connectors', payload)
  return data.connector ?? data
}

export async function updateConnector(
  id: string,
  payload: Partial<ConnectorInput>,
): Promise<Connector> {
  const { data } = await api.patch<{ connector?: Connector } & Connector>(`/kb/connectors/${id}`, payload)
  return data.connector ?? data
}

export async function connectConnector(id: string): Promise<Connector> {
  const { data } = await api.post<{ connector?: Connector } & Connector>(`/kb/connectors/${id}/connect`)
  return data.connector ?? data
}

export interface ReindexResult {
  indexed: number
  updated: number
  durationMs: number
}

export async function reindexConnector(id: string): Promise<ReindexResult> {
  const { data } = await api.post<ReindexResult>(`/kb/connectors/${id}/reindex`)
  return data
}

export interface KbSearchResult {
  items: KbSearchItem[]
  took: number
}

export async function searchKb(q: string): Promise<KbSearchResult> {
  const { data } = await api.get<{ items: KbSearchItem[]; took: number }>('/kb/search', {
    params: { q },
  })
  return { items: asItems(data.items as KbSearchItem[] | { items?: KbSearchItem[] }), took: Number(data.took) || 0 }
}

export async function getKbDoc(id: string): Promise<KbDoc> {
  const { data } = await api.get<{ doc?: KbDoc } & KbDoc>(`/kb/docs/${id}`)
  return data.doc ?? data
}
