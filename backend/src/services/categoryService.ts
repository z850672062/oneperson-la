import type { Category } from '@prisma/client';
import { prisma } from '../prisma';
import { notFound } from '../utils/errors';
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
  const childrenOf = new Map<string, Category[]>();
  const tops: Category[] = [];

  for (const category of categories) {
    if (category.parentId) {
      const bucket = childrenOf.get(category.parentId) || [];
      bucket.push(category);
      childrenOf.set(category.parentId, bucket);
    } else {
      tops.push(category);
    }
  }

  const result: CategoryWithCounts[] = [];
  for (const top of tops.sort((a, b) => a.sort - b.sort)) {
    const children = (childrenOf.get(top.id) || []).sort((a, b) => a.sort - b.sort);
    const childCount = children.reduce((sum, child) => sum + (ownCount.get(child.id) || 0), 0);
    result.push({ ...top, recordCount: (ownCount.get(top.id) || 0) + childCount });
    for (const child of children) {
      result.push({ ...child, recordCount: ownCount.get(child.id) || 0 });
    }
  }
  return result;
}

export async function countForCategory(categoryId: string): Promise<number> {
  const children = await prisma.category.findMany({
    where: { parentId: categoryId },
    select: { id: true }
  });
  return prisma.record.count({
    where: { categoryId: { in: [categoryId, ...children.map((child) => child.id)] } }
  });
}

export function serializeCategoryWithCount(category: Category, recordCount: number) {
  return serializeCategory(category, recordCount);
}

export async function getCategoryScope(categoryId: string): Promise<string[]> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { children: { select: { id: true } } }
  });
  if (!category) throw notFound('分类不存在');
  return [category.id, ...category.children.map((child) => child.id)];
}
