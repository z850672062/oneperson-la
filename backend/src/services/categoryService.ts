import type { Category } from '@prisma/client';
import { prisma } from '../prisma';
import { serializeCategory } from './serializers';

interface CategoryWithCounts extends Category {
  recordCount: number;
}

export async function listCategoriesWithCounts(): Promise<CategoryWithCounts[]> {
  const [categories, grouped] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] }),
    prisma.record.groupBy({ by: ['categoryId'], _count: { _all: true } })
  ]);

  const ownCount = new Map(grouped.map((item) => [item.categoryId, item._count._all]));
  return categories.map((category) => ({
    ...category,
    recordCount: ownCount.get(category.id) || 0
  }));
}

export async function countForCategory(categoryId: string): Promise<number> {
  return prisma.record.count({ where: { categoryId } });
}

export function serializeCategoryWithCount(category: Category, recordCount: number) {
  return serializeCategory(category, recordCount);
}
