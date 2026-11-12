export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multi'
  | 'file'

export type RecordStatus = 'doing' | 'done' | 'overdue'
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
  subType: string
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
  subType: string
  name: string
  sub: string
  status: RecordStatus
  risk: string
  dueDate: string | null
  hours: number
  values: Record<string, unknown>
  kbDocIds: string[]
}

export interface StickyNoteItem {
  id: string
  content: string
  done: boolean
  categoryId: string | null
  recordId: string | null
  doneAt: string | null
  createdAt: string
}

export interface StickySuggestion {
  categoryId: string | null
  categoryName: string | null
  title: string
  dueDate: string | null
  risk: string
  degraded: boolean
  reason: string
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
  hasCredential?: boolean
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
  /** 网络来源为 http(s) URL；Obsidian 为本地绝对路径（容器内）；IMA 暂缺 */
  url?: string
  /** 来源类型 */
  source?: 'web' | 'obsidian' | 'ima' | 'unknown'
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
  /** 本地消息附带的附件名称（仅当次发送展示） */
  attachments?: string[]
  /** 本地消息附带的图片名称（仅当次发送展示） */
  images?: string[]
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
  /** 便签勾选完成时是否调用 AI 归类；关闭则人工填写 */
  stickyAiSuggest: boolean
}

export interface LlmModel {
  id: string
  vendor: string
  model: string
  baseUrl?: string | null
  isDefault?: boolean
  [key: string]: unknown
}
