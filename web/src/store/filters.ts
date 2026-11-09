import { create } from 'zustand'
import type { RecordStatusFilter } from '../types'

export type RiskFilter = 'all' | '高' | '中' | '低'

interface RecordFilterState {
  categoryId: string | null
  status: RecordStatusFilter
  risk: RiskFilter
  subType: string | null
  q: string
  from: string | null
  to: string | null
  page: number
  pageSize: number
  setCategoryId: (id: string | null) => void
  setStatus: (status: RecordStatusFilter) => void
  setRisk: (risk: RiskFilter) => void
  setSubType: (subType: string | null) => void
  setQ: (q: string) => void
  setRange: (from: string | null, to: string | null) => void
  setPage: (page: number, pageSize?: number) => void
  reset: () => void
}

const initial = {
  categoryId: null,
  status: 'all' as RecordStatusFilter,
  risk: 'all' as RiskFilter,
  subType: null as string | null,
  q: '',
  from: null,
  to: null,
  page: 1,
  pageSize: 10,
}

export const useRecordFilterStore = create<RecordFilterState>((set) => ({
  ...initial,

  setCategoryId: (categoryId) => set({ categoryId, subType: null, page: 1 }),
  setStatus: (status) => set({ status, page: 1 }),
  setRisk: (risk) => set({ risk, page: 1 }),
  setSubType: (subType) => set({ subType, page: 1 }),
  setQ: (q) => set({ q, page: 1 }),
  setRange: (from, to) => set({ from, to, page: 1 }),
  setPage: (page, pageSize) => set({ page, pageSize: pageSize ?? 10 }),
  reset: () => set({ ...initial }),
}))
