import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { categoryNotEmpty, conflict, notFound, validationError } from '../utils/errors';
import {
  countForCategory,
  listCategoriesWithCounts,
  serializeCategoryWithCount
} from '../services/categoryService';

export const categoriesRouter = Router();

const createSchema = z.object({
  name: z.string({ required_error: 'name 必填' }).trim().min(1, '分类名称不能为空').max(40)
});

const patchSchema = z.object({
  name: z.string().trim().min(1, '分类名称不能为空').max(40).optional(),
  sort: z.number().int().optional()
});

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'ids 不能为空')
});

categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const items = await listCategoriesWithCounts(userId);
    res.status(200).json({
      items: items.map((category) => serializeCategoryWithCount(category, category.recordCount))
    });
  })
);

categoriesRouter.patch(
  '/reorder',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const { ids } = reorderSchema.parse(req.body);
    const uniqueIds = new Set(ids);
    const existing = await prisma.category.findMany({
      where: { userId },
      select: { id: true }
    });

    if (
      uniqueIds.size !== ids.length ||
      ids.length !== existing.length ||
      ids.some((id) => !existing.some((category) => category.id === id))
    ) {
      throw validationError('ids 必须包含全部不重复的分类');
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.category.updateMany({ where: { id, userId }, data: { sort: index } })
      )
    );

    const items = await listCategoriesWithCounts(userId);
    res.status(200).json({
      items: items.map((category) => serializeCategoryWithCount(category, category.recordCount))
    });
  })
);

categoriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createSchema.parse(req.body);

    const duplicate = await prisma.category.findFirst({
      where: { userId, name: body.name }
    });
    if (duplicate) throw conflict('分类名称已存在');

    const maxSort = await prisma.category.aggregate({
      where: { userId },
      _max: { sort: true }
    });

    const category = await prisma.category.create({
      data: {
        userId,
        name: body.name,
        sort: (maxSort._max.sort ?? -1) + 1
      }
    });

    res.status(201).json({ category: serializeCategoryWithCount(category, 0) });
  })
);

categoriesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = patchSchema.parse(req.body);
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, userId }
    });
    if (!existing) throw notFound('分类不存在');

    if (body.name !== undefined && body.name !== existing.name) {
      const duplicate = await prisma.category.findFirst({
        where: { userId, name: body.name, NOT: { id: existing.id } }
      });
      if (duplicate) throw conflict('分类名称已存在');
    }

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sort !== undefined ? { sort: body.sort } : {})
      }
    });
    const recordCount = await countForCategory(category.id, userId);
    res.status(200).json({ category: serializeCategoryWithCount(category, recordCount) });
  })
);

categoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, userId },
      include: { _count: { select: { records: true } } }
    });
    if (!existing) throw notFound('分类不存在');
    if (existing._count.records > 0) {
      throw categoryNotEmpty();
    }

    await prisma.category.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
