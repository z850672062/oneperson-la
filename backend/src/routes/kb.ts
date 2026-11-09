import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound } from '../utils/errors';
import { reindexConnector, searchKb } from '../services/kbService';
import { serializeConnector, serializeDoc } from '../services/serializers';

export const kbRouter = Router();

const createSchema = z.object({
  name: z.string({ required_error: 'name 必填' }).trim().min(1, '连接器名称不能为空'),
  type: z.enum(['obsidian', 'ima']),
  path: z.string({ required_error: 'path 必填' })
});

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(['obsidian', 'ima']).optional(),
  path: z.string().optional(),
  status: z.enum(['on', 'off']).optional(),
  meta: z.string().optional()
});

async function getConnector(id: string) {
  const connector = await prisma.kbConnector.findUnique({ where: { id } });
  if (!connector) throw notFound('连接器不存在');
  return connector;
}

kbRouter.get(
  '/connectors',
  asyncHandler(async (_req, res) => {
    const items = await prisma.kbConnector.findMany({ orderBy: [{ createdAt: 'asc' }] });
    res.status(200).json({ items: items.map(serializeConnector) });
  })
);

kbRouter.post(
  '/connectors',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const connector = await prisma.kbConnector.create({
      data: {
        name: body.name,
        type: body.type,
        path: body.path,
        status: 'off',
        meta: body.type === 'obsidian' ? '本地 Markdown 只读接入，待索引' : 'P1 · 依赖其开放接口'
      }
    });
    res.status(201).json({ connector: serializeConnector(connector) });
  })
);

kbRouter.patch(
  '/connectors/:id',
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    await getConnector(req.params.id);
    const connector = await prisma.kbConnector.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.path !== undefined ? { path: body.path } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.meta !== undefined ? { meta: body.meta } : {})
      }
    });
    res.status(200).json({ connector: serializeConnector(connector) });
  })
);

kbRouter.post(
  '/connectors/:id/connect',
  asyncHandler(async (req, res) => {
    await getConnector(req.params.id);
    const connector = await prisma.kbConnector.update({
      where: { id: req.params.id },
      data: { status: 'on' }
    });
    res.status(200).json({ connector: serializeConnector(connector) });
  })
);

kbRouter.post(
  '/connectors/:id/reindex',
  asyncHandler(async (req, res) => {
    const result = await reindexConnector(req.params.id);
    if (!result) throw notFound('连接器不存在');
    res.status(200).json(result);
  })
);

kbRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const result = await searchKb(q);
    res.status(200).json({
      items: result.items.map(({ excerpt: _excerpt, ...rest }) => rest),
      took: result.took
    });
  })
);

kbRouter.get(
  '/docs/:id',
  asyncHandler(async (req, res) => {
    const doc = await prisma.kbDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound('文档不存在');
    res.status(200).json({ doc: serializeDoc(doc) });
  })
);
