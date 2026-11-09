import type { Category } from '../types'

export function sortedCategories(items: Category[]): Category[] {
  return items
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function categoryName(items: Category[], id: string | null | undefined): string {
  if (!id) return ''
  return items.find((item) => item.id === id)?.name ?? id
}
