import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, validationError } from '../utils/errors';
import { endOfDay, parseDateInput, startOfDay } from '../utils/date';
import { serializeRecord } from '../services/serializers';

export const recordsRouter = Router();

const recordInclude = {
  category: true,
  kbLinks: { include: { doc: true } }
} as const;

const listSchema = z.object({
  categoryId: z.string().optional(),
  status: z.enum(['all', 'doing', 'done', 'overdue']).default('all'),
  risk: z.enum(['all', '高', '中', '低']).default('all'),
  subType: z.string().trim().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const recordFields = {
  name: z.string().trim().min(1, '事项名称不能为空').max(200),
  sub: z.string().optional(),
  subType: z.string().trim().max(40).optional(),
  status: z.enum(['doing', 'done', 'overdue']).optional(),
  risk: z.string().optional(),
  hours: z.number().min(0, '工时不能为负数').optional(),
  values: z.record(z.unknown()).optional(),
  kbDocIds: z.array(z.string()).optional()
};

const createSchema = z.object({
  categoryId: z.string({ required_error: 'categoryId 必填' }).min(1),
  dueDate: z.string({ required_error: 'dueDate 必填' }).min(1, 'dueDate 不能为空'),
  ...recordFields,
  name: recordFields.name
});

const patchSchema = z.object({
  categoryId: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  ...recordFields,
  name: recordFields.name.optional()
});

function parseDate(value: string): Date {
  try {
    return parseDateInput(value);
  } catch {
    throw validationError('日期格式应为 YYYY-MM-DD');
  }
}

async function normalizeKbDocIds(
  kbDocIds: string[] | undefined,
  userId: string
): Promise<string[] | undefined> {
  if (!kbDocIds) return undefined;
  const unique = Array.from(new Set(kbDocIds));
  if (!unique.length) return [];
  const docs = await prisma.kbDoc.findMany({
    where: { id: { in: unique }, userId },
    select: { id: true }
  });
  if (docs.length !== unique.length) {
    throw validationError('存在无效的知识库文档 ID');
  }
  return unique;
}

async function findRecord(id: string, userId: string) {
  const record = await prisma.record.findFirst({ where: { id, userId }, include: recordInclude });
  if (!record) throw notFound('记录不存在');
  return record;
}

recordsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const query = listSchema.parse(req.query);
    const where: Prisma.RecordWhereInput = { userId };
    const and: Prisma.RecordWhereInput[] = [];

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.status === 'overdue') {
      // 手动标记为逾期，或未办结且已过截止日期
      and.push({
        OR: [
          { status: 'overdue' },
          { status: { notIn: ['done', 'overdue'] }, dueDate: { lt: startOfDay(new Date()) } }
        ]
      });
    } else if (query.status !== 'all') {
      where.status = query.status;
    }

    if (query.risk !== 'all') {
      where.risk = query.risk;
    }

    if (query.subType) {
      where.subType = query.subType;
    }

    const keyword = query.q?.trim();
    if (keyword) {
      // 模糊匹配：事项、相对方/背景、动态字段值、分类名称
      and.push({
        OR: [
          { name: { contains: keyword } },
          { sub: { contains: keyword } },
          { subType: { contains: keyword } },
          { valuesJson: { contains: keyword } },
          { category: { name: { contains: keyword } } }
        ]
      });
    }

    if (query.from || query.to) {
      const from = query.from ? parseDate(query.from) : undefined;
      const to = query.to ? parseDate(query.to) : undefined;
      if (from && to && from.getTime() > to.getTime()) {
        throw validationError('起始日期不能晚于结束日期');
      }
      and.push({
        createdAt: {
          ...(from ? { gte: startOfDay(from) } : {}),
          ...(to ? { lte: endOfDay(to) } : {})
        }
      });
    }

    if (and.length) where.AND = and;

    const [total, records] = await Promise.all([
      prisma.record.count({ where }),
      prisma.record.findMany({
        where,
        include: recordInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    res.status(200).json({
      items: records.map(serializeRecord),
      total,
      page: query.page,
      pageSize: query.pageSize
    });
  })
);

recordsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createSchema.parse(req.body);
    const category = await prisma.category.findFirst({ where: { id: body.categoryId, userId } });
    if (!category) throw notFound('分类不存在');

    const kbDocIds = await normalizeKbDocIds(body.kbDocIds, userId);
    const recordId = await prisma.$transaction(async (tx) => {
      const record = await tx.record.create({
        data: {
          userId,
          categoryId: body.categoryId,
          subType: body.subType ?? '',
          name: body.name,
          sub: body.sub ?? '',
          status: body.status ?? 'doing',
          risk: body.risk ?? '中',
          dueDate: parseDate(body.dueDate),
          hours: body.hours ?? 0,
          valuesJson: JSON.stringify(body.values ?? {})
        }
      });
      if (kbDocIds?.length) {
        await tx.recordKb.createMany({
          data: kbDocIds.map((docId) => ({ recordId: record.id, docId }))
        });
      }
      return record.id;
    });

    const record = await findRecord(recordId, userId);
    res.status(201).json({ record: serializeRecord(record) });
  })
);

recordsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const record = await findRecord(req.params.id, req.auth!.userId);
    res.status(200).json({ record: serializeRecord(record) });
  })
);

recordsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = patchSchema.parse(req.body);
    const existing = await prisma.record.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound('记录不存在');

    if (body.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: body.categoryId, userId } });
      if (!category) throw notFound('分类不存在');
    }

    const kbDocIds = await normalizeKbDocIds(body.kbDocIds, userId);
    const data: Prisma.RecordUncheckedUpdateInput = {};
    if (body.categoryId !== undefined) data.categoryId = body.categoryId;
    if (body.subType !== undefined) data.subType = body.subType;
    if (body.name !== undefined) data.name = body.name;
    if (body.sub !== undefined) data.sub = body.sub;
    if (body.status !== undefined) data.status = body.status;
    if (body.risk !== undefined) data.risk = body.risk;
    if (body.hours !== undefined) data.hours = body.hours;
    if (body.values !== undefined) data.valuesJson = JSON.stringify(body.values);
    if (body.dueDate !== undefined) data.dueDate = parseDate(body.dueDate);

    await prisma.$transaction(async (tx) => {
      await tx.record.update({ where: { id: existing.id }, data });
      if (kbDocIds !== undefined) {
        await tx.recordKb.deleteMany({ where: { recordId: existing.id } });
        if (kbDocIds.length) {
          await tx.recordKb.createMany({
            data: kbDocIds.map((docId) => ({ recordId: existing.id, docId }))
          });
        }
      }
    });

    const record = await findRecord(existing.id, userId);
    res.status(200).json({ record: serializeRecord(record) });
  })
);

recordsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, userId: req.auth!.userId }
    });
    if (!existing) throw notFound('记录不存在');
    await prisma.record.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
