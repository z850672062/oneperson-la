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
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized('用户不存在');

    const [categories, fields, records, reports, memory, setting] = await Promise.all([
      listCategoriesWithCounts(userId),
      prisma.fieldDef.findMany({ where: { userId }, orderBy: [{ categoryId: 'asc' }, { sort: 'asc' }] }),
      prisma.record.findMany({
        where: { userId },
        include: {
          category: true,
          kbLinks: { include: { doc: true } }
        },
        orderBy: [{ createdAt: 'asc' }]
      }),
      prisma.report.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }] }),
      prisma.memoryItem.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }] }),
      prisma.setting.findUnique({ where: { id: userId } })
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
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const sessions = await prisma.chatSession.findMany({ where: { userId }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);
    const records = await prisma.record.findMany({ where: { userId }, select: { id: true } });
    const recordIds = records.map((r) => r.id);
    await prisma.$transaction([
      prisma.recordKb.deleteMany({ where: { recordId: { in: recordIds } } }),
      prisma.record.deleteMany({ where: { userId } }),
      prisma.fieldDef.deleteMany({ where: { userId } }),
      prisma.report.deleteMany({ where: { userId } }),
      prisma.chatMessage.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.chatSession.deleteMany({ where: { userId } }),
      prisma.memoryItem.deleteMany({ where: { userId } }),
      prisma.stickyNote.deleteMany({ where: { userId } }),
      prisma.kbDoc.deleteMany({ where: { userId } }),
      prisma.kbConnector.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } })
    ]);
    res.status(204).end();
  })
);
