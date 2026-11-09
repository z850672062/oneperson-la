import { api } from './client'
import { asItems } from './unwrap'
import type { FieldDef, FieldType } from '../types'

function normalizeOptions(options: FieldDef['options'] | string | null | undefined): string[] | null {
  if (!options) return null
  if (Array.isArray(options)) return options.map(String)
  return String(options)
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeField(field: FieldDef): FieldDef {
  return {
    ...field,
    required: Boolean(field.required),
    isCommon: Boolean(field.isCommon),
    options: normalizeOptions(field.options),
    note: field.note ?? null,
    sort: Number(field.sort) || 0,
  }
}

export async function listFields(categoryId: string): Promise<FieldDef[]> {
  const { data } = await api.get<{ items: FieldDef[] } | FieldDef[]>('/fields', {
    params: { categoryId },
  })
  return asItems(data).map(normalizeField)
}

export interface FieldInput {
  categoryId: string
  name: string
  group: string
  type: FieldType
  required: boolean
  options?: string[] | null
  note?: string | null
  sort?: number
}

export async function createField(payload: FieldInput): Promise<FieldDef> {
  const { data } = await api.post<{ field?: FieldDef } & FieldDef>('/fields', payload)
  return normalizeField(data.field ?? data)
}

export async function updateField(id: string, payload: Partial<FieldInput>): Promise<FieldDef> {
  const { data } = await api.patch<{ field?: FieldDef } & FieldDef>(`/fields/${id}`, payload)
  return normalizeField(data.field ?? data)
}

export async function deleteField(id: string): Promise<void> {
  await api.delete(`/fields/${id}`)
}
