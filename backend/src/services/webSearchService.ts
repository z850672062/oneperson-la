// DeepSeek 网页搜索 / 抓取工具接入
// 接口文档：https://api-docs.deepseek.com/zh-cn/guides/search/
// 说明：Search 与 Fetch 均使用 DeepSeek API Key（Bearer），按成功请求次数计费。

const TOOLS_BASE = 'https://api.deepseek.com/v1/tools';
const TIMEOUT_MS = 12000;
const MAX_FETCH_PAGES = 2;
const MAX_SEARCH_RESULTS = 5;
const MAX_SUMMARY_CHARS = 1200;
const MAX_PAGE_CHARS = 4000;

export interface WebSource {
  title: string;
  url: string;
  summary: string;
  site?: string | null;
  date?: string | null;
}

export interface WebCollectResult {
  sources: WebSource[];
  error?: string;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'）)】\]]+/gi) ?? [];
  const unique: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?。，；：！？]+$/, '');
    if (!unique.includes(cleaned)) unique.push(cleaned);
  }
  return unique;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

async function postJson(url: string, apiKey: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 160);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed?.error?.message) detail = parsed.error.message;
    } catch {
      // 保留原始文本
    }
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return JSON.parse(text) as unknown;
}

export async function searchWeb(query: string, apiKey: string): Promise<WebSource[]> {
  const payload = (await postJson(`${TOOLS_BASE}/search`, apiKey, {
    query: truncate(query, 120),
    ori_question: truncate(query, 120),
    count: MAX_SEARCH_RESULTS,
    need_content: false
  })) as { results?: unknown };

  if (!Array.isArray(payload.results)) return [];

  return payload.results
    .map((item): WebSource | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title : '';
      const url = typeof row.url === 'string' ? row.url : '';
      if (!url) return null;
      const summary =
        typeof row.summary === 'string' && row.summary
          ? row.summary
          : typeof row.snippet === 'string'
            ? row.snippet
            : '';
      return {
        title: title || url,
        url,
        summary: truncate(summary, MAX_SUMMARY_CHARS),
        site: typeof row.site_name === 'string' ? row.site_name : null,
        date: typeof row.date === 'string' ? row.date : null
      };
    })
    .filter((item): item is WebSource => item !== null);
}

export async function fetchWebPage(
  url: string,
  apiKey: string
): Promise<{ title: string; content: string }> {
  const payload = (await postJson(`${TOOLS_BASE}/fetch`, apiKey, { url })) as {
    title?: unknown;
    content?: unknown;
  };
  return {
    title: typeof payload.title === 'string' && payload.title ? payload.title : url,
    content: typeof payload.content === 'string' ? payload.content : ''
  };
}

/**
 * 根据用户消息收集联网资料：
 * 1. 消息里的 URL 先用 Fetch 抓正文（最多 2 个）；
 * 2. 其余文本用 Search 检索（最多 5 条）。
 * 任一环节失败不阻断对话，返回 error 由调用方提示。
 */
export async function collectWebSources(content: string, apiKey: string): Promise<WebCollectResult> {
  const urls = extractUrls(content).slice(0, MAX_FETCH_PAGES);
  const keyword = content.replace(/https?:\/\/[^\s<>"'）)】\]]+/gi, ' ').trim();
  const sources: WebSource[] = [];
  let error: string | undefined;

  for (const url of urls) {
    try {
      const page = await fetchWebPage(url, apiKey);
      if (!page.content.trim()) {
        error = error || `抓取 ${url} 未返回正文`;
        continue;
      }
      sources.push({
        title: page.title,
        url,
        summary: truncate(page.content, MAX_PAGE_CHARS)
      });
    } catch (fetchError) {
      error = error || `抓取 ${url} 失败：${fetchError instanceof Error ? fetchError.message : '网络错误'}`;
    }
  }

  // 纯链接消息（去掉链接后没有有效问题）不必再搜索
  if (Array.from(keyword).length >= 4) {
    try {
      const results = await searchWeb(keyword, apiKey);
      const existing = new Set(sources.map((item) => item.url));
      for (const item of results) {
        if (!existing.has(item.url)) sources.push(item);
      }
      if (!sources.length) error = error || '联网检索没有返回结果';
    } catch (searchError) {
      error = error || `联网检索失败：${searchError instanceof Error ? searchError.message : '网络错误'}`;
    }
  }

  return { sources: sources.slice(0, MAX_SEARCH_RESULTS + MAX_FETCH_PAGES), error };
}
