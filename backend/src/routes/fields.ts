import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound } from '../utils/errors';
import { serializeField } from '../services/serializers';

export const fieldsRouter = Router();

const fieldTypes = ['text', 'textarea', 'number', 'date', 'select', 'multi', 'file'] as const;

const createSchema = z.object({
  categoryId: z.string({ required_error: 'categoryId 必填' }).min(1),
  name: z.string({ required_error: 'name 必填' }).trim().min(1, '字段名称不能为空').max(60),
  group: z.string({ required_error: 'group 必填' }).trim().min(1, '分组不能为空'),
  type: z.enum(fieldTypes, { errorMap: () => ({ message: '不支持的字段类型' }) }),
  required: z.boolean({ required_error: 'required 必填' }),
  options: z.array(z.string()).nullable().optional(),
  note: z.string().nullable().optional()
});

const patchSchema = z.object({
  name: z.string().trim().min(1, '字段名称不能为空').max(60).optional(),
  group: z.string().trim().min(1).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).nullable().optional(),
  note: z.string().nullable().optional()
});

function commonFields(categoryId: string) {
  return [
    {
      id: 'common-status',
      categoryId,
      name: '状态',
      group: '公共字段',
      type: 'select',
      required: true,
      options: ['在办', '办结'],
      note: '全分类公共字段，不可删除',
      sort: 9001,
      isCommon: true
    },
    {
      id: 'common-dueDate',
      categoryId,
      name: '截止日期',
      group: '公共字段',
      type: 'date',
      required: true,
      options: [] as string[],
      note: '全分类公共字段，用于逾期判定，不可删除',
      sort: 9002,
      isCommon: true
    }
  ];
}

fieldsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
      if (!category) throw notFound('分类不存在');
      const fields = await prisma.fieldDef.findMany({
        where: { categoryId, userId },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }]
      });
      res.status(200).json({
        items: [...fields.map(serializeField), ...commonFields(categoryId)]
      });
      return;
    }

    const fields = await prisma.fieldDef.findMany({
      where: { userId },
      orderBy: [{ categoryId: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }]
    });
    res.status(200).json({ items: fields.map(serializeField) });
  })
);

fieldsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createSchema.parse(req.body);
    const category = await prisma.category.findFirst({ where: { id: body.categoryId, userId } });
    if (!category) throw notFound('分类不存在');

    const maxSort = await prisma.fieldDef.aggregate({
      where: { categoryId: body.categoryId, userId },
      _max: { sort: true }
    });

    const field = await prisma.fieldDef.create({
      data: {
        categoryId: body.categoryId,
        userId,
        name: body.name,
        group: body.group,
        type: body.type,
        required: body.required,
        optionsJson: body.options ? JSON.stringify(body.options) : null,
        note: body.note ?? null,
        sort: (maxSort._max.sort ?? -1) + 1
      }
    });
    res.status(201).json({ field: serializeField(field) });
  })
);

fieldsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = patchSchema.parse(req.body);
    const existing = await prisma.fieldDef.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound('字段不存在');

    const field = await prisma.fieldDef.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.group !== undefined ? { group: body.group } : {}),
        ...(body.required !== undefined ? { required: body.required } : {}),
        ...(body.options !== undefined
          ? { optionsJson: body.options ? JSON.stringify(body.options) : null }
          : {}),
        ...(body.note !== undefined ? { note: body.note } : {})
      }
    });
    res.status(200).json({ field: serializeField(field) });
  })
);

fieldsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const existing = await prisma.fieldDef.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound('字段不存在');
    await prisma.fieldDef.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
