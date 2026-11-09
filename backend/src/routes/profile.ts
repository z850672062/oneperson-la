import { Router } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { serializeMemory } from '../services/serializers';

export const profileRouter = Router();

profileRouter.get(
  '/memory',
  asyncHandler(async (_req, res) => {
    const items = await prisma.memoryItem.findMany({
      orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }]
    });
    res.status(200).json({ items: items.map(serializeMemory) });
  })
);

profileRouter.delete(
  '/memory/:id',
  asyncHandler(async (req, res) => {
    await prisma.memoryItem.deleteMany({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

profileRouter.delete(
  '/memory',
  asyncHandler(async (_req, res) => {
    await prisma.memoryItem.deleteMany();
    res.status(204).end();
  })
);
