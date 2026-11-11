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
  },
  // ---------- 写操作工具 ----------
  {
    type: 'function',
    function: {
      name: 'create_record',
      description: '新建一条工作记录并写入数据库。用户说"帮我加一条"、"记一下这个合同"、"创建一个待办"时调用。成功后返回新记录的 ID。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '事项标题（必填）' },
          category: { type: 'string', description: '分类名称，如"合同审查"、"劳动人事"、"争议解决"等；若不存在会提示可选分类' },
          sub: { type: 'string', description: '可选：事项副标题/简述' },
          subType: { type: 'string', description: '可选：子类型标签，如"劳动合同"、"买卖合同"' },
          risk: { type: 'string', enum: ['高', '中', '低'], description: '风险等级，默认"中"' },
          status: { type: 'string', enum: ['doing', 'done', 'pending', 'blocked'], description: '状态：doing=进行中 done=已完成 pending=待开始 blocked=阻塞；默认 doing' },
          dueDate: { type: 'string', description: '可选：截止日期 YYYY-MM-DD' },
          hours: { type: 'number', description: '可选：预估工时（小时）' }
        },
        required: ['name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_record',
      description: '更新某条工作记录的字段（状态/风险/截止日/标题等）。用户说"把那条标记完成"、"这个截止日改到下月"、"把风险调低"时调用。必须提供 recordId（可先 search_records 查到 ID）。',
      parameters: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: '记录 ID（必填，可从 search_records/list_upcoming 结果里拿到）' },
          name: { type: 'string', description: '新标题' },
          sub: { type: 'string', description: '新副标题/简述' },
          status: { type: 'string', enum: ['doing', 'done', 'pending', 'blocked'], description: '新状态' },
          risk: { type: 'string', enum: ['高', '中', '低'], description: '新风险等级' },
          dueDate: { type: 'string', description: '新截止日期 YYYY-MM-DD；传空字符串表示清除截止日' },
          hours: { type: 'number', description: '新工时（小时）' }
        },
        required: ['recordId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_record',
      description: '删除一条工作记录（不可恢复！）。用户说"删掉这条"、"移除那个事项"时调用。删除前建议先用 get_record 确认内容。',
      parameters: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: '要删除的记录 ID（必填）' },
          confirm: { type: 'boolean', description: '必须显式传 true 才执行删除，防止误操作' }
        },
        required: ['recordId', 'confirm'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_record',
      description: '按 ID 精确查询一条工作记录的完整字段详情。用户要查看/编辑某条具体记录前可先确认内容。',
      parameters: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: '记录 ID（必填）' }
        },
        required: ['recordId'],
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
    return `- [${r.id}][${r.category?.name ?? '未分类'}][风险:${r.risk ?? '-'}] ${r.name}${extra}${dl ? `（截止 ${dl}）` : ''}`;
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
    return `- [${r.id}][${dl}] ${r.name}（${r.category?.name ?? '未分类'}，风险 ${r.risk ?? '-'}）`;
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
    return `- [${r.id}][${updated}][${r.category?.name ?? '未分类'}] ${r.name}`;
  });
  return { ok: true, content: lines.join('\n') || '暂无工作记录。' };
}

// ---------- 写操作执行器 ----------

async function executeGetRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const recordId = typeof args.recordId === 'string' ? args.recordId.trim() : '';
  if (!recordId) return { ok: false, content: '', error: 'recordId 必填' };
  const r = await prisma.record.findUnique({ where: { id: recordId }, include: { category: true } });
  if (!r) return { ok: true, content: `未找到 ID 为 ${recordId} 的记录。` };
  const dl = r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '无';
  let values = '';
  try {
    const v = JSON.parse(r.valuesJson);
    values = Object.keys(v).length ? `\n  动态字段：${JSON.stringify(v)}` : '';
  } catch { /* ignore */ }
  return {
    ok: true,
    content: [
      `ID: ${r.id}`,
      `标题: ${r.name}`,
      `副标题: ${r.sub || '(空)'}`,
      `子类型: ${r.subType || '(空)'}`,
      `分类: ${r.category?.name ?? '未分类'}`,
      `状态: ${r.status}`,
      `风险: ${r.risk ?? '-'}`,
      `截止日: ${dl}`,
      `工时: ${r.hours}h`,
      `创建: ${new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`,
      `更新: ${new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
      values
    ].join('\n')
  };
}

async function executeCreateRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { ok: false, content: '', error: 'name 必填' };

  // 解析分类：给定名字 → 查 ID；不存在则提示可选列表
  let categoryId = '';
  if (typeof args.category === 'string' && args.category.trim()) {
    const catName = args.category.trim();
    const cat = await prisma.category.findFirst({ where: { name: catName } });
    if (!cat) {
      const all = await prisma.category.findMany({ select: { name: true } });
      const list = all.map((c) => c.name).join('、') || '(暂无分类，请先在系统里创建分类)';
      return {
        ok: false,
        content: '',
        error: `分类「${catName}」不存在。可选分类：${list}`
      };
    }
    categoryId = cat.id;
  } else {
    // 没给分类就用第一个存在的分类，或创建一个默认的
    const first = await prisma.category.findFirst({ orderBy: { sort: 'asc' } });
    if (first) {
      categoryId = first.id;
    } else {
      const created = await prisma.category.create({ data: { name: '未分类' } });
      categoryId = created.id;
    }
  }

  const risk = ['高', '中', '低'].includes(String(args.risk ?? '')) ? String(args.risk) : '中';
  const validStatus = ['doing', 'done', 'pending', 'blocked'];
  const status = validStatus.includes(String(args.status ?? '')) ? String(args.status) : 'doing';

  const dueDate = typeof args.dueDate === 'string' && args.dueDate.trim()
    ? new Date(args.dueDate + 'T00:00:00.000')
    : null;
  if (dueDate && isNaN(dueDate.getTime())) {
    return { ok: false, content: '', error: `dueDate 格式无效，请用 YYYY-MM-DD，收到：${args.dueDate}` };
  }

  const record = await prisma.record.create({
    data: {
      categoryId,
      name,
      sub: typeof args.sub === 'string' ? args.sub.trim() : '',
      subType: typeof args.subType === 'string' ? args.subType.trim() : '',
      status,
      risk,
      dueDate,
      hours: typeof args.hours === 'number' ? args.hours : 0,
      valuesJson: '{}'
    },
    include: { category: true }
  });

  const dl = record.dueDate ? new Date(record.dueDate).toISOString().slice(0, 10) : '无';
  return {
    ok: true,
    content: [
      `✅ 已创建工作记录：`,
      `ID: ${record.id}`,
      `标题: ${record.name}`,
      `分类: ${record.category?.name ?? '未分类'}`,
      `状态: ${record.status} | 风险: ${record.risk} | 截止: ${dl}`
    ].join('\n')
  };
}

async function executeUpdateRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const recordId = typeof args.recordId === 'string' ? args.recordId.trim() : '';
  if (!recordId) return { ok: false, content: '', error: 'recordId 必填' };

  const existing = await prisma.record.findUnique({ where: { id: recordId }, include: { category: true } });
  if (!existing) return { ok: false, content: '', error: `未找到 ID 为 ${recordId} 的记录` };

  const data: Record<string, unknown> = {};
  if (typeof args.name === 'string') data.name = args.name.trim();
  if (typeof args.sub === 'string') data.sub = args.sub.trim();

  if (args.status !== undefined) {
    const valid = ['doing', 'done', 'pending', 'blocked'];
    if (!valid.includes(String(args.status))) {
      return { ok: false, content: '', error: `status 必须是 ${valid.join('/')}，收到：${args.status}` };
    }
    data.status = args.status;
  }

  if (args.risk !== undefined) {
    const valid = ['高', '中', '低'];
    if (!valid.includes(String(args.risk))) {
      return { ok: false, content: '', error: `risk 必须是 高/中/低，收到：${args.risk}` };
    }
    data.risk = args.risk;
  }

  if ('dueDate' in args) {
    const raw = args.dueDate;
    if (typeof raw === 'string') {
      if (raw.trim() === '') {
        data.dueDate = null; // 空字符串 → 清除
      } else {
        const parsed = new Date(raw + 'T00:00:00.000');
        if (isNaN(parsed.getTime())) {
          return { ok: false, content: '', error: `dueDate 格式无效，收到：${raw}` };
        }
        data.dueDate = parsed;
      }
    }
  }

  if (typeof args.hours === 'number') data.hours = args.hours;

  if (!Object.keys(data).length) {
    return { ok: true, content: '未提供任何可更新的字段，记录未变动。' };
  }

  const updated = await prisma.record.update({
    where: { id: recordId },
    data,
    include: { category: true }
  });

  const changed = Object.keys(data).join(', ');
  return {
    ok: true,
    content: [
      `✅ 已更新记录 ${recordId}`,
      `变更字段: ${changed}`,
      `当前状态: ${updated.status} | 风险: ${updated.risk} | 标题: ${updated.name}`
    ].join('\n')
  };
}

async function executeDeleteRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const recordId = typeof args.recordId === 'string' ? args.recordId.trim() : '';
  const confirm = Boolean(args.confirm);
  if (!recordId) return { ok: false, content: '', error: 'recordId 必填' };
  if (!confirm) {
    return {
      ok: false,
      content: '',
      error: '删除是不可逆操作，必须显式传 confirm: true 才执行。请在确认用户确实要删除后再调用。'
    };
  }

  const existing = await prisma.record.findUnique({ where: { id: recordId }, include: { category: true } });
  if (!existing) return { ok: true, content: `记录 ${recordId} 不存在（可能已被删除）。` };

  const label = `${existing.name}（${existing.category?.name ?? '未分类'}）`;
  await prisma.record.delete({ where: { id: recordId } });
  return { ok: true, content: `🗑️ 已删除记录：${label}（${recordId}）` };
}

const REGISTRY: Record<string, (args: Record<string, unknown>) => Promise<ToolCallResult>> = {
  // 只读工具
  search_records: executeSearchRecords,
  list_upcoming: executeListUpcoming,
  kb_search: executeKbSearch,
  generate_summary: executeGenerateSummary,
  list_categories: executeListCategories,
  list_recent_records: executeListRecentRecords,
  get_record: executeGetRecord,
  // 写操作工具
  create_record: executeCreateRecord,
  update_record: executeUpdateRecord,
  delete_record: executeDeleteRecord
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
