import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, validationError } from '../utils/errors';
import { reindexConnector, searchKb } from '../services/kbService';
import { serializeConnector, serializeDoc } from '../services/serializers';
import { encryptSecret } from '../utils/crypto';
import {
  getImaCachedItem,
  listImaKnowledgeBases,
  readImaCredentials
} from '../services/imaService';

export const kbRouter = Router();

const createSchema = z.object({
  name: z.string({ required_error: 'name 必填' }).trim().min(1, '连接器名称不能为空'),
  type: z.enum(['obsidian', 'ima']),
  path: z.string().optional().default(''),
  clientId: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(500).optional()
});

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(['obsidian', 'ima']).optional(),
  path: z.string().optional(),
  status: z.enum(['on', 'off']).optional(),
  meta: z.string().optional(),
  clientId: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(500).optional()
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
    if (body.type === 'ima' && (!body.clientId || !body.apiKey)) {
      throw validationError('IMA 连接器需要填写 Client ID 与 API Key');
    }
    if (body.type !== 'ima' && !body.path.trim()) {
      throw validationError('请填写知识库路径');
    }
    const connector = await prisma.kbConnector.create({
      data: {
        name: body.name,
        type: body.type,
        path: body.type === 'ima' ? '' : body.path,
        status: 'off',
        meta:
          body.type === 'obsidian'
            ? '本地 Markdown 只读接入，待索引'
            : '凭据已保存，请点击「尝试连接」验证',
        credentialEnc:
          body.type === 'ima' && body.clientId && body.apiKey
            ? encryptSecret(JSON.stringify({ clientId: body.clientId, apiKey: body.apiKey }))
            : null
      }
    });
    res.status(201).json({ connector: serializeConnector(connector) });
  })
);

kbRouter.patch(
  '/connectors/:id',
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const existing = await getConnector(req.params.id);
    const hasCredentials = Boolean(body.clientId && body.apiKey);
    if ((body.clientId && !body.apiKey) || (!body.clientId && body.apiKey)) {
      throw validationError('Client ID 与 API Key 需要同时填写');
    }
    const connector = await prisma.kbConnector.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.path !== undefined ? { path: body.path } : {}),
        ...(body.status !== undefined && !hasCredentials ? { status: body.status } : {}),
        ...(body.meta !== undefined ? { meta: body.meta } : {}),
        ...(hasCredentials
          ? {
              credentialEnc: encryptSecret(
                JSON.stringify({ clientId: body.clientId, apiKey: body.apiKey })
              ),
              status: 'off',
              meta: '凭据已保存，请点击「尝试连接」验证',
              configJson: null
            }
          : {}),
        ...(existing.type === 'ima' && body.path === '' ? { path: '' } : {})
      }
    });
    res.status(200).json({ connector: serializeConnector(connector) });
  })
);

kbRouter.post(
  '/connectors/:id/connect',
  asyncHandler(async (req, res) => {
    const existing = await getConnector(req.params.id);
    if (existing.type === 'ima') {
      const credentials = readImaCredentials(existing.credentialEnc);
      if (!credentials) throw validationError('请先配置 IMA 的 Client ID 与 API Key');
      try {
        const knowledgeBases = await listImaKnowledgeBases(credentials);
        if (!knowledgeBases.length) {
          throw validationError('IMA 未返回可访问的知识库，请确认该账号已加入知识库');
        }
        const config = {
          knowledgeBaseIds: knowledgeBases.map((kb) => kb.id),
          knowledgeBaseNames: Object.fromEntries(knowledgeBases.map((kb) => [kb.id, kb.name]))
        };
        const connector = await prisma.kbConnector.update({
          where: { id: req.params.id },
          data: {
            status: 'on',
            indexedCount: 0,
            lastIndexedAt: new Date(),
            meta: `已连接 IMA · ${knowledgeBases.length} 个知识库可用`,
            configJson: JSON.stringify(config)
          }
        });
        res.status(200).json({ connector: serializeConnector(connector) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'IMA 连接失败';
        await prisma.kbConnector.update({
          where: { id: req.params.id },
          data: { status: 'error', meta: message.slice(0, 500) }
        });
        throw error;
      }
    }

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
    if (req.params.id.startsWith('ima:')) {
      const cached = getImaCachedItem(req.params.id);
      if (!cached) throw notFound('IMA 条目摘要已过期，请重新检索');
      const now = new Date().toISOString();
      res.status(200).json({
        doc: {
          id: req.params.id,
          connectorId: null,
          title: cached.title,
          path: cached.path,
          content: `${cached.snippet}\n\n> 以上内容来自 IMA 知识库检索摘要，完整原文请在 IMA 客户端查看。`,
          createdAt: now,
          updatedAt: now
        }
      });
      return;
    }
    const doc = await prisma.kbDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound('文档不存在');
    res.status(200).json({ doc: serializeDoc(doc) });
  })
);
