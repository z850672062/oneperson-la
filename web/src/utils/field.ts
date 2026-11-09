import type { FieldType } from '../types'

export const FIELD_TYPE_NAMES: Record<FieldType, string> = {
  text: '文本',
  textarea: '多行文本',
  number: '数字',
  date: '日期',
  select: '单选',
  multi: '多选',
  file: '附件',
}

export function fieldTypeName(type: string): string {
  return FIELD_TYPE_NAMES[type as FieldType] ?? type
}

export function ensureOptions(options: string[] | null | undefined): string[] {
  return Array.isArray(options) ? options.filter((item) => String(item).trim().length > 0) : []
}
