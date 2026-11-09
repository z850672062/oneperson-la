import { api } from './client'
import { asItems } from './unwrap'
import type { Category } from '../types'

export async function listCategories(): Promise<Category[]> {
  const { data } = await api.get<{ items: Category[] } | Category[]>('/categories')
  return asItems(data)
}

export interface CategoryInput {
  name: string
  parentId?: string | null
  sort?: number
}

export async function createCategory(payload: CategoryInput): Promise<Category> {
  const { data } = await api.post<{ category?: Category } & Category>('/categories', payload)
  return data.category ?? data
}

export async function updateCategory(id: string, payload: Partial<CategoryInput>): Promise<Category> {
  const { data } = await api.patch<{ category?: Category } & Category>(`/categories/${id}`, payload)
  return data.category ?? data
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`)
}
