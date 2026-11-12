import { api } from './client'
import type { RecordItem, StickyNoteItem, StickySuggestion } from '../types'

export async function listStickyNotes(archived = false): Promise<StickyNoteItem[]> {
  const { data } = await api.get<{ items: StickyNoteItem[] }>('/sticky-notes', {
    params: { archived: archived ? 'true' : undefined },
  })
  return data.items ?? []
}

export async function createStickyNote(content: string): Promise<StickyNoteItem> {
  const { data } = await api.post<{ note: StickyNoteItem }>('/sticky-notes', { content })
  return data.note
}

export async function updateStickyNote(id: string, content: string): Promise<StickyNoteItem> {
  const { data } = await api.patch<{ note: StickyNoteItem }>(`/sticky-notes/${id}`, { content })
  return data.note
}

export async function deleteStickyNote(id: string): Promise<void> {
  await api.delete(`/sticky-notes/${id}`)
}

export async function suggestStickyNote(id: string): Promise<StickySuggestion> {
  const { data } = await api.post<{ suggestion: StickySuggestion }>(`/sticky-notes/${id}/suggest`)
  return data.suggestion
}

export interface ConvertPayload {
  categoryId: string
  title?: string
  dueDate?: string | null
  risk?: string
}

export async function convertStickyNote(
  id: string,
  payload: ConvertPayload,
): Promise<{ note: StickyNoteItem; record: RecordItem }> {
  const { data } = await api.post<{ note: StickyNoteItem; record: RecordItem }>(
    `/sticky-notes/${id}/convert`,
    payload,
  )
  return data
}

export async function revertStickyNote(id: string): Promise<StickyNoteItem> {
  const { data } = await api.post<{ note: StickyNoteItem }>(`/sticky-notes/${id}/revert`)
  return data.note
}
