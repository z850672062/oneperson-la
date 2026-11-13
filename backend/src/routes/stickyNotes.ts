import { Router } from 'express';
import { z } from 'zod';
import type { StickyNote } from '@prisma/client';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, validationError } from '../utils/errors';
import { parseDateInput, toDateOnly } from '../utils/date';
import { resolveChatModel } from '../services/chatService';
import { chatCompletionsUrl } from '../utils/llmEndpoint';
import { serializeRecord } from '../services/serializers';

export const stickyNotesRouter = Router();

const RISKS = ['高', '中', '低'] as const;

function serializeNote(note: StickyNote) {
  return {
    id: note.id,
    content: note.content,
    done: note.done,
    categoryId: note.categoryId,
    recordId: note.recordId,
    doneAt: note.doneAt ? note.doneAt.toISOString() : null,
    createdAt: note.createdAt.toISOString()
  };
}

async function findNote(id: string, userId: string): Promise<StickyNote> {
  const note = await prisma.stickyNote.findFirst({ where: { id, userId } });
  if (!note) throw notFound('便签不存在');
  return note;
}

const createSchema = z.object({
  content: z.string().trim().min(1, '便签内容不能为空').max(500, '便签内容不能超过 500 字')
});

const patchSchema = z.object({
  content: z.string().trim().min(1, '便签内容不能为空').max(500, '便签内容不能超过 500 字')
});

const convertSchema = z.object({
  categoryId: z.string().min(1, '请选择分类'),
  title: z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().nullish(),
  risk: z.enum(RISKS).optional()
});

/** 将 "2026-11-20" 解析为本地日期；空值返回 null，非法格式抛 422 */
function parseDueDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw validationError('截止日期格式应为 YYYY-MM-DD');
  }
  try {
    return parseDateInput(trimmed);
  } catch {
    throw validationError('截止日期格式应为 YYYY-MM-DD');
  }
}

interface LlmSuggestion {
  title?: string;
  categoryId?: string;
  categoryName?: string;
  dueDate?: string | null;
  risk?: string;
}

/** 剥离模型可能输出的 Markdown 代码围栏，取出 JSON 主体 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** 调用默认模型做一次非流式补全；任何失败都返回 null，由调用方降级 */
async function callLlmJson(
  system: string,
  user: string,
  userId: string
): Promise<LlmSuggestion | null> {
  const resolved = await resolveChatModel('', userId);
  if (!resolved) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(chatCompletionsUrl(resolved.baseUrl, resolved.vendor), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`
      },
      body: JSON.stringify({
        model: resolved.model,
        stream: false,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(extractJson(content)) as LlmSuggestion;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 列出便签：默认只返回未归档，archived=true 时返回已归档
stickyNotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const archived = String(req.query.archived ?? '') === 'true';
    const items = await prisma.stickyNote.findMany({
      where: { userId, ...(archived ? { done: true } : { done: false }) },
      orderBy: archived ? [{ doneAt: 'desc' }] : [{ createdAt: 'desc' }],
      take: 200
    });
    res.json({ items: items.map(serializeNote) });
  })
);

// 新建便签
stickyNotesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createSchema.parse(req.body);
    const note = await prisma.stickyNote.create({ data: { userId, content: body.content } });
    res.status(201).json({ note: serializeNote(note) });
  })
);

// 修改便签内容
stickyNotesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = patchSchema.parse(req.body);
    await findNote(req.params.id, userId);
    const note = await prisma.stickyNote.update({
      where: { id: req.params.id },
      data: { content: body.content }
    });
    res.json({ note: serializeNote(note) });
  })
);

// 删除便签（仅删除便签本身，不触碰已生成的工作记录）
stickyNotesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    await findNote(req.params.id, userId);
    await prisma.stickyNote.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

// 勾选后请求 AI 建议归类（失败时降级为「无建议」，不阻塞用户手选）
stickyNotesRouter.post(
  '/:id/suggest',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const note = await findNote(req.params.id, userId);
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }]
    });

    if (!categories.length) {
      res.json({
        suggestion: {
          categoryId: null,
          categoryName: null,
          title: note.content.slice(0, 200),
          dueDate: null,
          risk: '中',
          degraded: true,
          reason: '系统中还没有分类，请先在「分类」中创建'
        }
      });
      return;
    }

    const today = toDateOnly(new Date());
    const categoryList = categories.map((c) => `- ${c.name}（id: ${c.id}）`).join('\n');
    const system = [
      '你是法务工作台的归类助手。请把用户记录的一句话便签，映射为一条工作记录。',
      `今天是 ${today}（Asia/Shanghai）。相对日期（如「下周五」「月底」）请换算成具体日期。`,
      '只输出 JSON，不要任何解释。字段：',
      '{"title": "事项标题（不超过 40 字，去掉口语化前缀）",',
      ' "categoryId": "必须从下表中选一个 id",',
      ' "dueDate": "YYYY-MM-DD，无法确定时为 null",',
      ' "risk": "高|中|低"}',
      '可选分类（只能选其一）：',
      categoryList
    ].join('\n');

    const raw = await callLlmJson(system, note.content, userId);

    const fallbackCategory =
      categories.find((c) => c.name === raw?.categoryName) ??
      categories.find((c) => c.id === raw?.categoryId) ??
      categories[0];

    const rawCategoryValid = categories.some((c) => c.id === raw?.categoryId);
    const dueDate =
      typeof raw?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate.trim())
        ? raw.dueDate.trim()
        : null;
    const risk = RISKS.includes((raw?.risk ?? '') as (typeof RISKS)[number]) ? raw!.risk! : '中';
    const title =
      typeof raw?.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 200)
        : note.content.slice(0, 200);

    res.json({
      suggestion: {
        categoryId: rawCategoryValid ? raw!.categoryId! : fallbackCategory.id,
        categoryName: rawCategoryValid
          ? categories.find((c) => c.id === raw!.categoryId)!.name
          : fallbackCategory.name,
        title,
        dueDate,
        risk,
        degraded: raw === null,
        reason: raw === null ? 'AI 归类不可用，已按默认分类预填，请手动确认' : ''
      }
    });
  })
);

// 确认后转为工作记录，并归档便签
stickyNotesRouter.post(
  '/:id/convert',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = convertSchema.parse(req.body);
    const note = await findNote(req.params.id, userId);
    if (note.done) throw validationError('该便签已归档，请先撤销再操作');

    const category = await prisma.category.findFirst({ where: { id: body.categoryId, userId } });
    if (!category) throw validationError('分类不存在，请重新选择');

    const title = (body.title ?? note.content).trim().slice(0, 200);
    if (!title) throw validationError('事项名称不能为空');

    const record = await prisma.record.create({
      data: {
        userId: note.userId,
        categoryId: category.id,
        name: title,
        sub: '',
        subType: '',
        status: 'doing',
        risk: body.risk ?? '中',
        dueDate: parseDueDate(body.dueDate),
        hours: 0,
        valuesJson: '{}'
      },
      include: { category: true, kbLinks: { include: { doc: true } } }
    });

    const updated = await prisma.stickyNote.update({
      where: { id: note.id },
      data: {
        done: true,
        doneAt: new Date(),
        recordId: record.id,
        categoryId: category.id
      }
    });

    res.status(201).json({
      note: serializeNote(updated),
      record: serializeRecord(record)
    });
  })
);

// 撤销归档：恢复便签未完成状态，并删除刚才生成的工作记录
stickyNotesRouter.post(
  '/:id/revert',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const note = await findNote(req.params.id, userId);
    if (!note.done) throw validationError('该便签尚未归档，无需撤销');

    if (note.recordId) {
      // 仅删除由该便签生成的记录；若已被手动删除则忽略
      await prisma.record.deleteMany({ where: { id: note.recordId, userId } });
    }

    const updated = await prisma.stickyNote.update({
      where: { id: note.id },
      data: { done: false, doneAt: null, recordId: null, categoryId: null }
    });

    res.json({ note: serializeNote(updated) });
  })
);
