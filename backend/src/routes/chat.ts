import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, validationError } from '../utils/errors';
import { serializeMessage, serializeSession } from '../services/serializers';
import {
  buildChatContext,
  buildMockAnswer,
  buildSystemPrompt,
  resolveChatModel,
  sseWrite,
  streamChatCompletion,
  streamMockAnswer,
  type ChatMessageBlock,
  type Citation
} from '../services/chatService';
import { collectWebSources, type WebSource } from '../services/webSearchService';
import { rememberFromChat } from '../services/memoryService';
import { redactSensitive } from '../utils/redact';
import { executeToolCall, TOOLS_SCHEMA } from '../services/toolsService';
import {
  buildAttachmentPrompt,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENT_TOTAL_TEXT,
  parseAttachment
} from '../services/attachmentService';
import { getSettings } from './settings';

export const chatRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 }
});

const createSessionSchema = z.object({
  model: z.string().trim().min(1).optional()
});

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  text: z.string().min(1)
});

const imageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** base64 data URL：data:image/jpeg;base64,... */
  dataUrl: z
    .string()
    .trim()
    .startsWith('data:image/', { message: '图片必须以 data:image/...;base64,... 格式传入' })
    .regex(/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/, '仅支持 JPEG、PNG、GIF、WebP 格式')
    .max(15 * 1024 * 1024, '单张图片 base64 编码后不得超过 15MB')
});

const messageSchema = z.object({
  content: z.string({ required_error: 'content 必填' }).trim().min(1, '消息不能为空'),
  useKb: z.boolean().optional().default(false),
  useMemory: z.boolean().optional().default(false),
  useWeb: z.boolean().optional().default(false),
  useTools: z.boolean().optional().default(false),
  attachments: z
    .array(attachmentSchema)
    .max(MAX_ATTACHMENT_COUNT, `单条消息最多携带 ${MAX_ATTACHMENT_COUNT} 个附件`)
    .refine(
      (items) => items.reduce((total, item) => total + item.text.length, 0) <= MAX_ATTACHMENT_TOTAL_TEXT,
      { message: '附件文本总长度超出上限，请减少附件数量或内容' }
    )
    .optional()
    .default([]),
  images: z.array(imageSchema).max(4, '单条消息最多携带 4 张图片').optional().default([])
});

async function defaultModel(userId: string): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { id: userId } });
  return setting?.defaultModel || 'deepseek-chat';
}

chatRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const items = await prisma.chatSession.findMany({
      where: { userId: req.auth!.userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });
    res.status(200).json({ items: items.map(serializeSession) });
  })
);

chatRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    const body = createSessionSchema.parse(req.body ?? {});
    const session = await prisma.chatSession.create({
      data: { userId, title: '新会话', model: body.model || (await defaultModel(userId)) }
    });
    res.status(201).json({ session: serializeSession(session) });
  })
);

chatRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId: req.auth!.userId }
    });
    if (!session) throw notFound('会话不存在');
    await prisma.chatSession.delete({ where: { id: session.id } });
    res.status(204).end();
  })
);

chatRouter.post(
  '/attachments',
  (req, res, next) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(validationError('附件大小不能超过 20MB'));
        return;
      }
      next(validationError('附件上传失败，请重试'));
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw validationError('请选择要上传的附件');
    const attachment = await parseAttachment(req.file);
    res.status(201).json({ attachment });
  })
);

chatRouter.get(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId: req.auth!.userId }
    });
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
    const userId = req.auth!.userId;
    const body = messageSchema.parse(req.body);
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId }
    });
    if (!session) throw notFound('会话不存在');

    const [setting] = await Promise.all([
      getSettings(userId).catch(() => null),
      prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'user', content: body.content }
      })
    ]);
    const maskSensitive = Boolean(setting?.maskSensitive);
    const maskLlm = Boolean(setting?.maskLlm);

    const context = await buildChatContext(body.content, body.useKb, body.useMemory, userId);
    const history = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12
    });
    history.reverse();

    // 脱敏：发往模型前替换 PII，数据库中保留原文
    const outgoingContent = maskSensitive ? redactSensitive(body.content) : body.content;
    const messages: ChatMessageBlock[] = history.map((item) => ({
      role: item.role as ChatMessageBlock['role'],
      content: maskSensitive ? redactSensitive(item.content) : item.content
    }));
    if (maskSensitive) {
      for (const doc of context.docs) doc.excerpt = redactSensitive(doc.excerpt);
      context.memory = context.memory.map((item) => redactSensitive(item));
    }

    const attachmentPrompt = buildAttachmentPrompt(body.attachments);
    const outgoingAttachmentPrompt = maskSensitive && attachmentPrompt ? redactSensitive(attachmentPrompt) : attachmentPrompt;
    if (outgoingAttachmentPrompt) {
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && typeof last.content === 'string') {
        last.content = `${outgoingAttachmentPrompt}\n\n${last.content}`;
      }
    }

    // Vision：如果带图片，把最后一个 user 消息的 content 改成 block 数组
    if (body.images?.length) {
      const last = messages[messages.length - 1];
      const prevText = last && last.role === 'user' && typeof last.content === 'string' ? last.content : outgoingContent;
      const blocks: ChatMessageBlock['content'] = [
        { type: 'text', text: prevText },
        ...body.images.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: img.dataUrl, detail: 'auto' as const }
        }))
      ];
      if (last && last.role === 'user') {
        last.content = blocks;
      } else {
        messages.push({ role: 'user', content: blocks });
      }
    }

    const resolved = await resolveChatModel(session.model, userId);

    // 联网检索：DeepSeek 提供 Search / Fetch 工具接口，需使用 DeepSeek Key
    let webSources: WebSource[] = [];
    let webError = '';
    if (body.useWeb && resolved) {
      if (resolved.vendor.toLowerCase() !== 'deepseek') {
        webError = `当前模型厂商为 ${resolved.vendor}，暂不支持 DeepSeek 联网工具，已跳过联网检索`;
      } else {
        const collected = await collectWebSources(body.content, resolved.apiKey);
        webSources = maskSensitive
          ? collected.sources.map((item) => ({ ...item, summary: redactSensitive(item.summary) }))
          : collected.sources;
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
          const systemPrompt = buildSystemPrompt(context, resolved, webSources);

          if (body.useTools) {
            // Agent 模式：工具调用多轮循环，最多 5 轮防止死循环
            const MAX_TOOL_ROUNDS = 5;
            let round = 0;
            while (round < MAX_TOOL_ROUNDS) {
              round += 1;
              const upstream = await streamChatCompletion(
                resolved,
                systemPrompt,
                messages,
                res,
                TOOLS_SCHEMA
              );

              answerText += upstream.text;

              if (!upstream.finalToolCalls.length) {
                // 模型返回纯文本，工具调用结束
                break;
              }

              // 把本轮 assistant message（带 tool_calls）追加进 messages，供后续轮次使用
              messages.push({
                role: 'assistant',
                content: upstream.text || '',
                tool_calls: upstream.finalToolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments }
                }))
              });

              // 执行每个 tool_call
              for (const call of upstream.finalToolCalls) {
                sseWrite(res, 'tool_call', { id: call.id, name: call.name, arguments: call.arguments });
                const result = await executeToolCall(call, userId);
                if (result.ok) {
                  sseWrite(res, 'tool_result', { id: call.id, name: call.name, content: result.content });
                } else {
                  sseWrite(res, 'tool_error', { id: call.id, name: call.name, error: result.error ?? '未知错误' });
                }
                // tool_result 加入 messages
                messages.push({
                  role: 'tool',
                  tool_call_id: call.id,
                  content: result.ok ? result.content : `工具执行失败：${result.error ?? '未知错误'}`
                });
              }

              // 给模型发一条说明：刚刚执行了哪些工具
              sseWrite(res, 'delta', {
                text: `\n\n> （已调用 ${upstream.finalToolCalls.map((c) => c.name).join(', ')}，正在整合结果…）\n\n`
              });
              answerText += `\n\n> （已调用 ${upstream.finalToolCalls.map((c) => c.name).join(', ')}，正在整合结果…）\n\n`;
            }
          } else {
            // 普通模式：单次对话，不传 tools schema，省 ~1200 tokens
            const upstream = await streamChatCompletion(
              resolved,
              systemPrompt,
              messages,
              res
            );
            answerText += upstream.text;
          }

          if (!answerText.trim()) {
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

      // maskLlm：对模型最终回复里的敏感信息再做一层脱敏后入库
      const finalAnswer = maskLlm ? redactSensitive(answerText) : answerText;

      const assistant = await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: finalAnswer,
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
      await rememberFromChat(userId, body.content);

      res.end();
    } catch {
      sseWrite(res, 'error', { code: 'INTERNAL_ERROR', message: '生成回复失败，请稍后重试' });
      res.end();
    }
  })
);
