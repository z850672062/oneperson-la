import { create } from 'zustand'
import type { RecordStatusFilter } from '../types'

interface RecordFilterState {
  categoryId: string | null
  status: RecordStatusFilter
  q: string
  page: number
  pageSize: number
  setCategoryId: (id: string | null) => void
  setStatus: (status: RecordStatusFilter) => void
  setQ: (q: string) => void
  setPage: (page: number, pageSize?: number) => void
  reset: () => void
}

const initial = {
  categoryId: null,
  status: 'all' as RecordStatusFilter,
  q: '',
  page: 1,
  pageSize: 10,
}

export const useRecordFilterStore = create<RecordFilterState>((set) => ({
  ...initial,

  setCategoryId: (categoryId) => set({ categoryId, page: 1 }),
  setStatus: (status) => set({ status, page: 1 }),
  setQ: (q) => set({ q, page: 1 }),
  setPage: (page, pageSize) => set({ page, pageSize: pageSize ?? 10 }),
  reset: () => set({ ...initial }),
}))
