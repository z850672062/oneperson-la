import { Router } from 'express';
import { z } from 'zod';
import type { Setting } from '@prisma/client';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound } from '../utils/errors';
import { encryptSecret, decryptSecret } from '../utils/crypto';
import { chatCompletionsUrl } from '../utils/llmEndpoint';
import { serializeLlmModel, serializeSettings } from '../services/serializers';

export const settingsRouter = Router();
export const llmRouter = Router();

export async function getSettings(userId: string): Promise<Setting> {
  // 每用户一行设置：id 即 userId，get-or-create 由业务层保证
  return prisma.setting.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId }
  });
}

const patchSettingsSchema = z.object({
  maskSensitive: z.boolean().optional(),
  maskLlm: z.boolean().optional(),
  defaultModel: z.string().trim().min(1).optional(),
  stickyAiSuggest: z.boolean().optional()
});

settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const setting = await getSettings(req.auth!.userId);
    res.status(200).json(serializeSettings(setting));
  })
);

settingsRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = patchSettingsSchema.parse(req.body);
    await getSettings(req.auth!.userId);
    const setting = await prisma.setting.update({
      where: { id: req.auth!.userId },
      data: {
        ...(body.maskSensitive !== undefined ? { maskSensitive: body.maskSensitive } : {}),
        ...(body.maskLlm !== undefined ? { maskLlm: body.maskLlm } : {}),
        ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel } : {}),
        ...(body.stickyAiSuggest !== undefined ? { stickyAiSuggest: body.stickyAiSuggest } : {})
      }
    });
    res.status(200).json({ settings: serializeSettings(setting) });
  })
);

const createModelSchema = z.object({
  vendor: z.string({ required_error: 'vendor 必填' }).trim().min(1),
  model: z.string({ required_error: 'model 必填' }).trim().min(1),
  baseUrl: z
    .string()
    .trim()
    .url('Base URL 需为合法地址')
    .optional()
    .or(z.literal('')),
  apiKey: z.string().optional()
});

llmRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.llmModel.findMany({
      where: { userId: req.auth!.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    res.status(200).json({ items: items.map(serializeLlmModel) });
  })
);

llmRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createModelSchema.parse(req.body);
    const duplicate = await prisma.llmModel.findFirst({
      where: { userId, vendor: body.vendor, model: body.model }
    });
    if (duplicate) {
      res.status(409).json({ error: { code: 'CONFLICT', message: '该厂商与模型组合已存在' } });
      return;
    }

    const count = await prisma.llmModel.count({ where: { userId } });
    const created = await prisma.llmModel.create({
      data: {
        userId,
        vendor: body.vendor,
        model: body.model,
        baseUrl: body.baseUrl?.trim() || null,
        apiKeyEnc: body.apiKey ? encryptSecret(body.apiKey) : null,
        isDefault: count === 0
      }
    });
    res.status(201).json({ model: serializeLlmModel(created) });
  })
);

llmRouter.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const model = await prisma.llmModel.findFirst({
      where: { id: req.params.id, userId: req.auth!.userId }
    });
    if (!model) throw notFound('模型配置不存在');

    if (!model.apiKeyEnc) {
      res.status(200).json({
        ok: false,
        message: '未配置 API Key，无法发起调用；请先保存加密 Key。'
      });
      return;
    }

    let apiKey = '';
    try {
      apiKey = decryptSecret(model.apiKeyEnc);
    } catch {
      res.status(200).json({ ok: false, message: 'API Key 无法解密，请重新保存。' });
      return;
    }

    const endpoint = chatCompletionsUrl(model.baseUrl, model.vendor);

    try {
      const started = Date.now();
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model.model,
          max_tokens: 8,
          stream: false,
          messages: [{ role: 'user', content: 'ping' }]
        })
      });
      const elapsed = Date.now() - started;
      if (!upstream.ok) {
        const detail = (await upstream.text().catch(() => '')).slice(0, 200);
        res.status(200).json({
          ok: false,
          message: `上游返回 ${upstream.status}：${detail || '无响应内容'}`
        });
        return;
      }
      const payload = (await upstream.json().catch(() => ({}))) as {
        model?: string;
        choices?: unknown[];
      };
      res.status(200).json({
        ok: true,
        message: `连通正常（${payload.model || model.model}，${elapsed}ms）`
      });
    } catch (error) {
      res.status(200).json({
        ok: false,
        message: `请求上游失败：${error instanceof Error ? error.message : '网络错误'}`
      });
    }
  })
);

llmRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const model = await prisma.llmModel.findFirst({ where: { id: req.params.id, userId } });
    if (!model) throw notFound('模型配置不存在');
    await prisma.llmModel.delete({ where: { id: model.id } });

    if (model.isDefault) {
      const next = await prisma.llmModel.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
      if (next) {
        await prisma.llmModel.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    res.status(204).end();
  })
);
