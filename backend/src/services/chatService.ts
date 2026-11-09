import type { Response } from 'express';
import { prisma } from '../prisma';
import { env } from '../env';
import { decryptSecret } from '../utils/crypto';
import { searchKb, type KbSearchResult } from './kbService';

export interface Citation {
  id: string;
  title: string;
  path: string;
  snippet: string;
}

export interface KbDocument {
  title: string;
  path: string;
  excerpt: string;
}

export interface ChatContext {
  citations: Citation[];
  docs: KbDocument[];
  memory: string[];
}

export function sseWrite(res: Response, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildChatContext(
  content: string,
  useKb: boolean,
  useMemory: boolean
): Promise<ChatContext> {
  const [search, memories] = await Promise.all([
    useKb ? searchKb(content) : Promise.resolve({ items: [] as KbSearchResult[], took: 0 }),
    useMemory
      ? prisma.memoryItem.findMany({
          orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
          take: 6
        })
      : Promise.resolve([])
  ]);

  const citations = search.items.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    path: item.path,
    snippet: item.snippet
  }));

  const docs = search.items.slice(0, 2).map((item) => ({
    title: item.title,
    path: item.path,
    excerpt: item.excerpt
  }));

  return { citations, docs, memory: memories.map((item) => item.text) };
}

export function buildMockAnswer(content: string, context: ChatContext): string {
  const short = Array.from(content.replace(/\s+/g, ' ').trim()).slice(0, 36).join('');
  const lines: string[] = [];
  lines.push('## 结论先行', '');
  lines.push(
    `关于「${short}」，建议先锁定事实与关键期限，再按“风险隔离 → 可执行方案 → 过程留痕”的顺序推进；在信息不足时，不急于给出终局性结论。`,
    ''
  );
  lines.push('## 建议动作', '');
  lines.push('1. 梳理时间线、相对方诉求与现有证据，标注已逾期或临期节点。');
  lines.push('2. 对照合同条款与裁审口径，列出可妥协项与不可让步项，形成谈判底线。');
  lines.push('3. 输出一页纸处置方案，同步相关方并保留书面确认，避免口头承诺失焦。');
  lines.push('4. 将本次结论沉淀为知识库条目或工作记录，便于后续同类事项复用。', '');

  lines.push('## 依据与引用', '');
  if (context.citations.length) {
    context.citations.forEach((citation, index) => {
      lines.push(
        `- [${index + 1}] ${citation.title}：${Array.from(citation.snippet).slice(0, 70).join('')}`
      );
    });
  } else {
    lines.push('- 当前未启用知识库检索，或未命中相关条目；建议开启知识库后重试。');
  }
  lines.push('');

  if (context.memory.length) {
    lines.push('## 记忆画像', '');
    context.memory.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  return lines.join('\n');
}

export async function streamMockAnswer(
  res: Response,
  answer: string
): Promise<void> {
  const chars = Array.from(answer);
  const chunkSize = 18;
  for (let index = 0; index < chars.length; index += chunkSize) {
    sseWrite(res, 'delta', { text: chars.slice(index, index + chunkSize).join('') });
    await sleep(25 + Math.floor(Math.random() * 16));
  }
}

interface ResolvedModel {
  model: string;
  apiKey: string;
}

export async function resolveDeepSeekKey(sessionModel: string): Promise<ResolvedModel | null> {
  const configs = await prisma.llmModel.findMany({
    where: { vendor: 'deepseek' },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
  });
  // 兼容历史数据：会话里可能存的是模型名，也可能是模型配置 ID
  const matched =
    configs.find((config) => config.model === sessionModel || config.id === sessionModel) ||
    configs[0];

  if (matched?.apiKeyEnc) {
    try {
      return { model: matched.model, apiKey: decryptSecret(matched.apiKeyEnc) };
    } catch {
      // 密文无法解密时继续尝试环境变量
    }
  }
  if (env.llmApiKey) {
    return { model: matched?.model || sessionModel || 'deepseek-chat', apiKey: env.llmApiKey };
  }
  return null;
}

export async function streamDeepSeek(
  resolved: ResolvedModel,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  res: Response
): Promise<{ text: string; forwarded: number }> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolved.apiKey}`
    },
    body: JSON.stringify({
      model: resolved.model,
      stream: true,
      temperature: 0.4,
      messages: [{ role: 'system', content: systemPrompt }, ...history]
    })
  });

  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`DeepSeek 上游返回 ${response.status}${detail ? `：${detail}` : ''}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  let forwarded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          forwarded += 1;
          sseWrite(res, 'delta', { text: delta });
        }
      } catch {
        // 忽略无法解析的心跳/空行
      }
    }
  }

  return { text, forwarded };
}

export function buildSystemPrompt(context: ChatContext, resolved?: ResolvedModel): string {
  const now = new Date();
  const beijing = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);

  const parts = [
    '你是「一人法务工作台」的 AI 分身，服务于独立法务/律师。',
    '回答风格必须：结论先行、条目化、给出可执行动作，并在引用知识库时标注 [序号]。',
    '不要编造法条或案例；不确定时明确说明需要核实。',
    `当前北京时间：${beijing}（时区 Asia/Shanghai，服务器时间）。当用户询问当前时间、日期或星期时，直接以此为准回答，不要声称无法获取时间。`
  ];
  if (resolved) {
    parts.push(
      `你当前由 ${resolved.model} 模型提供能力。当用户询问你使用的大模型型号或计费时，如实说明底层模型名称，并说明具体价格以服务商官方计费为准。`
    );
  }
  if (context.docs.length) {
    parts.push(
      '以下是知识库检索到的资料（按相关度排序）。回答时必须优先依据这些资料组织内容，并在对应句子末尾标注 [资料序号]；资料未覆盖的部分再补充通用知识，并说明哪些内容来自资料、哪些是通用建议。'
    );
    context.docs.forEach((doc, index) => {
      parts.push(`[资料${index + 1}] ${doc.title}（${doc.path}）\n${doc.excerpt}`);
    });
  }
  if (context.memory.length) {
    parts.push('用户记忆画像（用于贴合其习惯，不要直接照抄）：');
    context.memory.forEach((item) => parts.push(`- ${item}`));
  }
  return parts.join('\n');
}
