import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { unauthorized } from '../utils/errors';
import { listCategoriesWithCounts } from '../services/categoryService';
import {
  serializeCategory,
  serializeField,
  serializeMemory,
  serializeRecord,
  serializeReport,
  serializeSettings,
  serializeUser
} from '../services/serializers';
import { toDateOnly } from '../utils/date';

export const userRouter = Router();

userRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw unauthorized('用户不存在');

    const [categories, fields, records, reports, memory, setting] = await Promise.all([
      listCategoriesWithCounts(),
      prisma.fieldDef.findMany({ orderBy: [{ categoryId: 'asc' }, { sort: 'asc' }] }),
      prisma.record.findMany({
        include: {
          category: true,
          kbLinks: { include: { doc: true } }
        },
        orderBy: [{ createdAt: 'asc' }]
      }),
      prisma.report.findMany({ orderBy: [{ createdAt: 'asc' }] }),
      prisma.memoryItem.findMany({ orderBy: [{ createdAt: 'asc' }] }),
      prisma.setting.findUnique({ where: { id: 'default' } })
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: serializeUser(user),
      categories: categories.map((category) => serializeCategory(category, category.recordCount)),
      fields: fields.map(serializeField),
      records: records.map(serializeRecord),
      reports: reports.map(serializeReport),
      memory: memory.map(serializeMemory),
      settings: setting ? serializeSettings(setting) : null
    };

    const filename = `oneperson-la-export-${toDateOnly(new Date())}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(payload, null, 2));
  })
);

userRouter.delete(
  '/data',
  asyncHandler(async (_req, res) => {
    await prisma.$transaction([
      prisma.recordKb.deleteMany(),
      prisma.record.deleteMany(),
      prisma.fieldDef.deleteMany(),
      prisma.report.deleteMany(),
      prisma.chatMessage.deleteMany(),
      prisma.chatSession.deleteMany(),
      prisma.memoryItem.deleteMany(),
      prisma.kbDoc.deleteMany(),
      prisma.kbConnector.deleteMany(),
      prisma.category.deleteMany()
    ]);
    res.status(204).end();
  })
);
