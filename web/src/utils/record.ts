import dayjs from 'dayjs'
import type { RecordItem, RecordStatus } from '../types'

export function isOverdue(
  record: Pick<RecordItem, 'status' | 'dueDate'>,
  today: string = dayjs().format('YYYY-MM-DD'),
): boolean {
  if (record.status === 'done' || !record.dueDate) return false
  return record.dueDate.slice(0, 10) < today
}

export interface RecordBadge {
  text: string
  tone: 'green' | 'amber' | 'red'
}

export function recordBadge(
  status: RecordStatus,
  dueDate: string | null,
  today?: string,
): RecordBadge {
  if (status === 'done') return { text: '办结', tone: 'green' }
  if (isOverdue({ status, dueDate }, today)) return { text: '逾期', tone: 'red' }
  return { text: '在办', tone: 'amber' }
}
