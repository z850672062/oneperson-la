import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { serializeMemory } from '../services/serializers';

export const profileRouter = Router();

profileRouter.get(
  '/memory',
  asyncHandler(async (req, res) => {
    const items = await prisma.memoryItem.findMany({
      where: { userId: req.auth!.userId },
      orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }]
    });
    res.status(200).json({ items: items.map(serializeMemory) });
  })
);

profileRouter.delete(
  '/memory/:id',
  asyncHandler(async (req, res) => {
    await prisma.memoryItem.deleteMany({
      where: { id: req.params.id, userId: req.auth!.userId }
    });
    res.status(204).end();
  })
);

profileRouter.delete(
  '/memory',
  asyncHandler(async (req, res) => {
    await prisma.memoryItem.deleteMany({ where: { userId: req.auth!.userId } });
    res.status(204).end();
  })
);
