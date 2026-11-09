import { api } from './client'
import { asItems } from './unwrap'
import type { MemoryItem } from '../types'

function normalizeMemory(raw: unknown, index: number): MemoryItem {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    id: obj.id != null ? String(obj.id) : `memory-${index}`,
    content: String(obj.content ?? obj.text ?? obj.value ?? obj.tag ?? obj.label ?? ''),
    createdAt: obj.createdAt != null ? String(obj.createdAt) : undefined,
  }
}

export async function listMemory(): Promise<MemoryItem[]> {
  const { data } = await api.get<{ items: unknown[] } | unknown[]>('/profile/memory')
  return asItems(data)
    .map(normalizeMemory)
    .filter((item) => item.content.trim().length > 0)
}

export async function deleteMemory(id: string): Promise<void> {
  await api.delete(`/profile/memory/${id}`)
}

export async function clearMemory(): Promise<void> {
  await api.delete('/profile/memory')
}
