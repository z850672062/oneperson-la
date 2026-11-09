import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound } from '../utils/errors';
import { serializeMessage, serializeSession } from '../services/serializers';
import {
  buildChatContext,
  buildMockAnswer,
  buildSystemPrompt,
  resolveChatModel,
  sseWrite,
  streamChatCompletion,
  streamMockAnswer,
  type Citation
} from '../services/chatService';
import { collectWebSources, type WebSource } from '../services/webSearchService';
import { rememberFromChat } from '../services/memoryService';

export const chatRouter = Router();

const createSessionSchema = z.object({
  model: z.string().trim().min(1).optional()
});

const messageSchema = z.object({
  content: z.string({ required_error: 'content 必填' }).trim().min(1, '消息不能为空'),
  useKb: z.boolean().optional().default(false),
  useMemory: z.boolean().optional().default(false),
  useWeb: z.boolean().optional().default(false)
});

async function defaultModel(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { id: 'default' } });
  return setting?.defaultModel || 'deepseek-chat';
}

chatRouter.get(
  '/sessions',
  asyncHandler(async (_req, res) => {
    const items = await prisma.chatSession.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });
    res.status(200).json({ items: items.map(serializeSession) });
  })
);

chatRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const body = createSessionSchema.parse(req.body ?? {});
    const session = await prisma.chatSession.create({
      data: { title: '新会话', model: body.model || (await defaultModel()) }
    });
    res.status(201).json({ session: serializeSession(session) });
  })
);

chatRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw notFound('会话不存在');
    await prisma.chatSession.delete({ where: { id: session.id } });
    res.status(204).end();
  })
);

chatRouter.get(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw notFound('会话不存在');
    const items = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    res.status(200).json({ items: items.map(serializeMessage) });
  })
);

chatRouter.post(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const body = messageSchema.parse(req.body);
    const session = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw notFound('会话不存在');

    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: body.content }
    });

    const context = await buildChatContext(body.content, body.useKb, body.useMemory);
    const history = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12
    });
    history.reverse();
    const messages = history.map((item) => ({ role: item.role, content: item.content }));

    const resolved = await resolveChatModel(session.model);

    // 联网检索：DeepSeek 提供 Search / Fetch 工具接口，需使用 DeepSeek Key
    let webSources: WebSource[] = [];
    let webError = '';
    if (body.useWeb && resolved) {
      if (resolved.vendor.toLowerCase() !== 'deepseek') {
        webError = `当前模型厂商为 ${resolved.vendor}，暂不支持 DeepSeek 联网工具，已跳过联网检索`;
      } else {
        const collected = await collectWebSources(body.content, resolved.apiKey);
        webSources = collected.sources;
        webError = collected.error || '';
      }
    }

    const webCitations: Citation[] = webSources.map((item, index) => ({
      id: `web-${index + 1}`,
      title: `[网络] ${item.title}`,
      path: item.url,
      snippet: Array.from(item.summary).slice(0, 120).join('')
    }));
    const citations = [...context.citations, ...webCitations];

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.flushHeaders();

    let answerText = '';
    if (webError && body.useWeb) {
      const notice = `> 联网提示：${webError}\n\n`;
      sseWrite(res, 'delta', { text: notice });
      answerText += notice;
    }
    try {
      if (resolved) {
        try {
          const upstream = await streamChatCompletion(
            resolved,
            buildSystemPrompt(context, resolved, webSources),
            messages,
            res
          );
          answerText += upstream.text;
          if (!upstream.text) {
            const notice = `> 模型 ${resolved.model} 未返回内容，以下为内置示例回复。\n\n`;
            sseWrite(res, 'delta', { text: notice });
            const fallback = buildMockAnswer(body.content, { ...context, citations });
            await streamMockAnswer(res, fallback);
            answerText += notice + fallback;
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : '未知错误';
          console.error(`[chat] 模型调用失败 model=${resolved.model}: ${reason}`);
          if (!answerText) {
            const notice = `> 模型调用失败（${reason}），以下为内置示例回复。\n\n`;
            sseWrite(res, 'delta', { text: notice });
            const fallback = buildMockAnswer(body.content, { ...context, citations });
            await streamMockAnswer(res, fallback);
            answerText += notice + fallback;
          } else {
            const tail = `\n\n（上游连接中断：${reason}，以上内容已保留。）`;
            sseWrite(res, 'delta', { text: tail });
            answerText += tail;
          }
        }
      } else {
        const notice = '> 离线模式：未配置可用的模型 Key，以下为内置示例回复。\n\n';
        sseWrite(res, 'delta', { text: notice });
        answerText += notice + buildMockAnswer(body.content, { ...context, citations });
        await streamMockAnswer(res, answerText.slice(notice.length));
      }

      const assistant = await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: answerText,
          citationsJson: JSON.stringify(citations)
        }
      });

      sseWrite(res, 'citations', { items: citations });
      sseWrite(res, 'done', { messageId: assistant.id });

      const title =
        session.title === '新会话'
          ? Array.from(body.content.replace(/\s+/g, ' ').trim()).slice(0, 20).join('')
          : session.title;
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title: title || '新会话', updatedAt: new Date() }
      });
      await rememberFromChat(body.content);

      res.end();
    } catch {
      sseWrite(res, 'error', { code: 'INTERNAL_ERROR', message: '生成回复失败，请稍后重试' });
      res.end();
    }
  })
);
