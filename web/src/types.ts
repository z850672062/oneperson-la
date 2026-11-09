export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multi'
  | 'file'

export type RecordStatus = 'doing' | 'done'
export type RecordStatusFilter = 'all' | RecordStatus | 'overdue'

export interface User {
  id?: string
  username: string
  name?: string
  email?: string
  lastPasswordChange?: string | null
}

export interface Category {
  id: string
  name: string
  parentId: string | null
  sort: number
  recordCount: number
}

export interface FieldDef {
  id: string
  categoryId: string
  name: string
  group: string
  type: FieldType
  required: boolean
  options: string[] | null
  note: string | null
  sort: number
  isCommon: boolean
}

export interface KbDocRef {
  id: string
  title: string
}

export interface RecordItem {
  id: string
  categoryId: string
  categoryPath: string
  name: string
  sub: string
  status: RecordStatus
  risk: string
  dueDate: string | null
  hours: number
  values: Record<string, unknown>
  kbDocIds: string[]
  kbDocs: KbDocRef[]
  createdAt: string
  updatedAt: string
}

export interface RecordPayload {
  categoryId: string
  name: string
  sub: string
  status: RecordStatus
  risk: string
  dueDate: string | null
  hours: number
  values: Record<string, unknown>
  kbDocIds: string[]
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardStats {
  created: number
  done: number
  doing: number
  overdue: number
  hours: number
  doneHours: number
  rate: number
}

export interface DashboardRange {
  from: string
  to: string
  label: string
}

export interface DashboardSummary {
  range: DashboardRange
  stats: DashboardStats
  byCategory: Array<{ categoryId: string; name: string; count: number }>
  statusDist: Array<{ key: string; name: string; count: number }>
  trend: Array<{ date: string; created: number; done: number }>
}

export interface Report {
  id: string
  type: string
  title: string
  rangeFrom: string
  rangeTo: string
  markdown: string
  createdAt: string
}

export interface Connector {
  id: string
  name: string
  type: string
  status: string
  path?: string
  docCount?: number
  lastIndexedAt?: string | null
  meta?: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

export interface KbSearchItem {
  id: string
  title: string
  path: string
  snippet: string
  score: number
}

export interface KbDoc {
  id: string
  title: string
  path?: string
  snippet?: string
  content?: string
  [key: string]: unknown
}

export interface Citation {
  id?: string
  docId?: string
  title: string
}

export interface ChatSession {
  id: string
  title?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  createdAt?: string
}

export interface MemoryItem {
  id: string
  content: string
  createdAt?: string
}

export interface Settings {
  maskSensitive: boolean
  maskLlm: boolean
  defaultModel: string | null
}

export interface LlmModel {
  id: string
  vendor: string
  model: string
  isDefault?: boolean
  [key: string]: unknown
}
