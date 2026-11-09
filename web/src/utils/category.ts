import type { Category } from '../types'

export function topCategories(items: Category[]): Category[] {
  return items
    .filter((item) => !item.parentId)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function childrenOf(items: Category[], parentId: string): Category[] {
  return items
    .filter((item) => item.parentId === parentId)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function categoryName(items: Category[], id: string | null | undefined): string {
  if (!id) return ''
  return items.find((item) => item.id === id)?.name ?? id
}

export function categoryPath(items: Category[], id: string | null | undefined): string {
  if (!id) return '全部分类'
  const target = items.find((item) => item.id === id)
  if (!target) return id
  if (!target.parentId) return target.name
  const parent = items.find((item) => item.id === target.parentId)
  return parent ? `${parent.name} / ${target.name}` : target.name
}

export function totalRecordCount(items: Category[], category: Category): number {
  const children = childrenOf(items, category.id)
  return children.reduce((sum, child) => sum + (Number(child.recordCount) || 0), Number(category.recordCount) || 0)
}
