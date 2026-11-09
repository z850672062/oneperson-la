import { create } from 'zustand'
import { apiErrorMessage } from '../api/client'
import { listCategories } from '../api/categories'
import type { Category } from '../types'

interface CategoriesState {
  items: Category[]
  loading: boolean
  loaded: boolean
  error: string | null
  load: (force?: boolean) => Promise<void>
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,

  async load(force = false) {
    if (get().loading) return
    if (get().loaded && !force) return
    set({ loading: true, error: null })
    try {
      const items = await listCategories()
      set({ items, loading: false, loaded: true })
    } catch (error) {
      set({ loading: false, error: apiErrorMessage(error) })
    }
  },
}))
