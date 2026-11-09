import { api } from './client'
import { asItems } from './unwrap'
import type { LlmModel, Settings } from '../types'

export async function getSettings(): Promise<Settings> {
  const { data } = await api.get<Settings>('/settings')
  return data
}

export async function updateSettings(payload: Partial<Settings>): Promise<Settings> {
  const { data } = await api.patch<{ settings?: Settings } & Settings>('/settings', payload)
  return data.settings ?? data
}

export async function listModels(): Promise<LlmModel[]> {
  const { data } = await api.get<{ items: LlmModel[] } | LlmModel[]>('/llm/models')
  return asItems(data)
}

export interface ModelInput {
  vendor: string
  model: string
  baseUrl?: string
  apiKey?: string
}

export async function createModel(payload: ModelInput): Promise<LlmModel> {
  const { data } = await api.post<{ model?: LlmModel } & LlmModel>('/llm/models', payload)
  return data.model ?? data
}

export async function testModel(id: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await api.post<{ ok: boolean; message: string }>(`/llm/models/${id}/test`)
  return data
}

export async function deleteModel(id: string): Promise<void> {
  await api.delete(`/llm/models/${id}`)
}

export async function exportUserData(): Promise<Blob> {
  const { data } = await api.get<Blob>('/user/export', { responseType: 'blob' })
  return data
}

export async function deleteAllData(): Promise<void> {
  await api.delete('/user/data')
}
