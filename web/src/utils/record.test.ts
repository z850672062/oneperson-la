import { describe, expect, it } from 'vitest'
import { isOverdue, recordBadge } from './record'

const TODAY = '2026-11-09'

describe('记录状态判定', () => {
  it('只有未办结且截止日早于今天才算逾期', () => {
    expect(isOverdue({ status: 'doing', dueDate: '2026-11-08' }, TODAY)).toBe(true)
    expect(isOverdue({ status: 'doing', dueDate: '2026-11-09' }, TODAY)).toBe(false)
    expect(isOverdue({ status: 'doing', dueDate: '2026-11-10' }, TODAY)).toBe(false)
    expect(isOverdue({ status: 'done', dueDate: '2026-11-01' }, TODAY)).toBe(false)
    expect(isOverdue({ status: 'doing', dueDate: null }, TODAY)).toBe(false)
  })

  it('列表状态徽标优先显示办结与逾期', () => {
    expect(recordBadge('done', '2026-11-01', TODAY)).toEqual({ text: '办结', tone: 'green' })
    expect(recordBadge('doing', '2026-11-01', TODAY)).toEqual({ text: '逾期', tone: 'red' })
    expect(recordBadge('doing', '2026-11-20', TODAY)).toEqual({ text: '在办', tone: 'amber' })
  })
})
