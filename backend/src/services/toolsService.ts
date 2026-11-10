/**
 * Tool Calls：定义 function schema + 执行层
 * 暴露两个导出：
 *   TOOLS_SCHEMA       : 传给 LLM 的 tools 数组
 *   executeToolCall    : 模型返回 tool_call 后，根据 name 执行对应后端逻辑
 */

import { prisma } from '../prisma';
import { searchKb } from './kbService';

interface ToolCallInput {
  id: string;
  name: string;
  arguments: string; // JSON string
}

interface ToolCallResult {
  ok: boolean;
  content: string; // 返回给模型的 tool_result 文本
  error?: string;
}

/** DeepSeek 支持的 tools 是严格 JSON Schema；我们先上 6 个最常用的 */
export const TOOLS_SCHEMA: unknown[] = [
  {
    type: 'function',
    function: {
      name: 'search_records',
      description: '按关键字、分类、时间区间、风险等级检索工作记录。用户问"最近做了哪些合同"、"上周的法务工作"、"本周到期事项"时调用。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '在标题/内容/相对方中模糊匹配的关键字' },
          category: { type: 'string', description: '分类名称（如"合同审查"、"劳动人事"、"争议解决"）' },
          risk: { type: 'string', enum: ['高', '中', '低'], description: '风险等级筛选' },
          fromDate: { type: 'string', description: '起始日期 YYYY-MM-DD' },
          toDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          limit: { type: 'integer', description: '返回条数上限，默认 10，最大 30' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_upcoming',
      description: '列出未来 N 天内到期的工作记录（按 deadline 排序）。用户问"下周有什么要办"、"本月到期"、"临期事项"时调用。',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: '查看未来多少天，默认 7，最大 30' },
          category: { type: 'string', description: '可选：限定分类' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kb_search',
      description: '在 Obsidian / IMA 知识库中按关键字检索，返回最相关的文档片段。用户问"关于竞业限制怎么规定"、"我们库里有没有劳动合同模板"时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键字，建议 2-10 个词' },
          topK: { type: 'integer', description: '返回条数，默认 3，最大 8' }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_summary',
      description: '生成指定时间区间内的工作汇总统计（条数、分类分布、风险分布、到期事项）。用户问"本月工作汇总"、"上周做了什么"、"2026 Q3 复盘"时调用。',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month', 'quarter'], description: '区间快捷方式，与 fromDate/toDate 二选一' },
          fromDate: { type: 'string', description: '自定义起始日期 YYYY-MM-DD' },
          toDate: { type: 'string', description: '自定义结束日期 YYYY-MM-DD' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: '列出所有工作记录分类及其数量。用户问"有哪些分类"、"都做过什么类型的工作"时调用。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_recent_records',
      description: '列出最近创建/修改的工作记录（默认 10 条）。用户问"我最近的工作"、"最后几条"、"最新动态"时调用。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: '返回条数，默认 10，最大 30' }
        },
        additionalProperties: false
      }
    }
  }
];

async function executeSearchRecords(args: Record<string, unknown>): Promise<ToolCallResult> {
  const where: Record<string, unknown> = {};
  if (typeof args.category === 'string' && args.category.trim()) {
    const cat = await prisma.category.findFirst({ where: { name: args.category } });
    if (cat) where.categoryId = cat.id;
  }
  if (typeof args.risk === 'string') where.risk = args.risk;
  if (typeof args.fromDate === 'string') {
    where.updatedAt = { ...(where.updatedAt as Record<string, unknown> ?? {}), gte: new Date(args.fromDate) };
  }
  if (typeof args.toDate === 'string') {
    const end = new Date(args.toDate);
    end.setHours(23, 59, 59, 999);
    where.updatedAt = { ...(where.updatedAt as Record<string, unknown> ?? {}), lte: end };
  }
  const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30);
  const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
  const allItems = await prisma.record.findMany({
    where,
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' as never } }, { updatedAt: 'desc' }],
    take: keyword ? 200 : limit,
    include: { category: true }
  });
  let items = allItems;
  if (keyword) {
    items = allItems.filter((r) => {
      const hay = JSON.stringify({
        name: r.name,
        sub: r.sub,
        subType: r.subType,
        valuesJson: r.valuesJson,
        category: r.category?.name
      }).toLowerCase();
      return hay.includes(keyword.toLowerCase());
    }).slice(0, limit);
  }
  if (!items.length) return { ok: true, content: '未找到匹配的工作记录。' };
  const lines = items.map((r) => {
    const dl = r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '';
    const extra = parseValuesExcerpt(r.valuesJson);
    return `- [${r.category?.name ?? '未分类'}][风险:${r.risk ?? '-'}] ${r.name}${extra}${dl ? `（截止 ${dl}）` : ''}`;
  });
  return { ok: true, content: `共 ${items.length} 条：\n${lines.join('\n')}` };
}

function parseValuesExcerpt(valuesJson: string): string {
  try {
    const v = JSON.parse(valuesJson);
    const keep: string[] = [];
    if (v) {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && val.trim()) keep.push(`${k}: ${val.trim()}`);
      }
    }
    return keep.length ? `（${keep.slice(0, 2).join('，')}）` : '';
  } catch {
    return '';
  }
}

async function executeListUpcoming(args: Record<string, unknown>): Promise<ToolCallResult> {
  const days = Math.min(Math.max(Number(args.days ?? 7), 1), 30);
  const now = new Date();
  const future = new Date(now.getTime() + days * 86400000);
  const where: Record<string, unknown> = { dueDate: { gte: now, lte: future } };
  if (typeof args.category === 'string' && args.category.trim()) {
    const cat = await prisma.category.findFirst({ where: { name: args.category } });
    if (cat) where.categoryId = cat.id;
  }
  const items = await prisma.record.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    take: 50,
    include: { category: true }
  });
  if (!items.length) return { ok: true, content: `未来 ${days} 天内没有到期事项。` };
  const lines = items.map((r) => {
    const dl = r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '';
    return `- [${dl}] ${r.name}（${r.category?.name ?? '未分类'}，风险 ${r.risk ?? '-'}）`;
  });
  return { ok: true, content: `未来 ${days} 天共 ${items.length} 条到期：\n${lines.join('\n')}` };
}

async function executeKbSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { ok: false, content: '', error: 'query 必填' };
  const topK = Math.min(Math.max(Number(args.topK ?? 3), 1), 8);
  const result = await searchKb(query);
  const items = result.items.slice(0, topK);
  if (!items.length) return { ok: true, content: `知识库未命中关于「${query}」的条目。` };
  const lines = items.map((item, i) => {
    return `${i + 1}. ${item.title}（${item.path}）\n   ${item.snippet}`;
  });
  return { ok: true, content: `知识库命中 ${items.length} 条关于「${query}」：\n${lines.join('\n\n')}` };
}

async function executeGenerateSummary(args: Record<string, unknown>): Promise<ToolCallResult> {
  let from: Date;
  let to: Date;
  const period = typeof args.period === 'string' ? args.period : '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === 'today') {
    from = today;
    to = new Date(today.getTime() + 86400000 - 1);
  } else if (period === 'week') {
    const day = today.getDay() || 7;
    from = new Date(today.getTime() - (day - 1) * 86400000);
    to = new Date(from.getTime() + 7 * 86400000 - 1);
  } else if (period === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'quarter') {
    const q = Math.floor(today.getMonth() / 3);
    from = new Date(today.getFullYear(), q * 3, 1);
    to = new Date(today.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
  } else if (typeof args.fromDate === 'string' && typeof args.toDate === 'string') {
    from = new Date(args.fromDate);
    to = new Date(args.toDate + 'T23:59:59.999');
  } else {
    return { ok: false, content: '', error: 'period 或 fromDate+toDate 至少提供一种' };
  }

  const items = await prisma.record.findMany({
    where: { updatedAt: { gte: from, lte: to } },
    orderBy: { updatedAt: 'asc' },
    include: { category: true }
  });
  if (!items.length) {
    return {
      ok: true,
      content: `${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)} 期间没有工作记录。`
    };
  }
  const byCategory: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  for (const r of items) {
    const cat = r.category?.name ?? '未分类';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    const risk = r.risk ?? '-';
    byRisk[risk] = (byRisk[risk] ?? 0) + 1;
  }
  const upcomingDeadlines = items.filter((r) => r.dueDate && new Date(r.dueDate) >= new Date()).length;
  const lines: string[] = [];
  lines.push(`${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)} 汇总：共 ${items.length} 条，${upcomingDeadlines} 条有未到期截止日`);
  lines.push('分类分布：', ...Object.entries(byCategory).map(([k, v]) => `- ${k}: ${v}`));
  lines.push('风险分布：', ...Object.entries(byRisk).map(([k, v]) => `- ${k}: ${v}`));
  return { ok: true, content: lines.join('\n') };
}

async function executeListCategories(): Promise<ToolCallResult> {
  const cats = await prisma.category.findMany({ include: { _count: { select: { records: true } } } });
  const result = cats.map((c) => `${c.name}: ${c._count.records}`);
  result.sort((a, b) => {
    const na = a.split(': ')[1];
    const nb = b.split(': ')[1];
    return Number(nb) - Number(na);
  });
  return { ok: true, content: result.join('\n') || '暂无分类。' };
}

async function executeListRecentRecords(args: Record<string, unknown>): Promise<ToolCallResult> {
  const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30);
  const items = await prisma.record.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { category: true }
  });
  const lines = items.map((r) => {
    const updated = new Date(r.updatedAt).toISOString().slice(0, 10);
    return `- [${updated}][${r.category?.name ?? '未分类'}] ${r.name}`;
  });
  return { ok: true, content: lines.join('\n') || '暂无工作记录。' };
}

const REGISTRY: Record<string, (args: Record<string, unknown>) => Promise<ToolCallResult>> = {
  search_records: executeSearchRecords,
  list_upcoming: executeListUpcoming,
  kb_search: executeKbSearch,
  generate_summary: executeGenerateSummary,
  list_categories: executeListCategories,
  list_recent_records: executeListRecentRecords
};

export async function executeToolCall(call: ToolCallInput): Promise<ToolCallResult> {
  const handler = REGISTRY[call.name];
  if (!handler) {
    return { ok: false, content: '', error: `未知工具 ${call.name}` };
  }
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.arguments || '{}');
  } catch (e) {
    return {
      ok: false,
      content: '',
      error: `工具参数 JSON 解析失败：${e instanceof Error ? e.message : e}`
    };
  }
  try {
    return await handler(args);
  } catch (e) {
    return {
      ok: false,
      content: '',
      error: `工具执行失败：${e instanceof Error ? e.message : e}`
    };
  }
}
