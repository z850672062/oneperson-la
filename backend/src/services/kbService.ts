import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../prisma';
import { validationError } from '../utils/errors';
import { extractDocumentText } from './attachmentService';
import {
  listImaKnowledgeBases,
  parseImaConfig,
  readImaCredentials,
  rememberImaItem,
  searchImaKnowledge
} from './imaService';

export interface KbSearchResult {
  id: string;
  title: string;
  path: string;
  snippet: string;
  excerpt: string;
  score: number;
}

// 中文无空格分词：剔除疑问/停用字后按 2-gram 切分，英文与数字保留整词
const STOP_PATTERN =
  /[\s的了吗呢吧啊呀是在和与及或请帮我你他她它这个那个哪些什么如何怎么为什么可以能否一下一个？?！!，。、；;：:""''（）()【】\[\]《》…~]+/g;

function extractTerms(query: string): string[] {
  const cleaned = query.toLowerCase().replace(STOP_PATTERN, ' ').trim();
  if (!cleaned) {
    const fallback = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return fallback ? [fallback] : [];
  }
  const terms = new Set<string>();
  for (const word of cleaned.split(' ').filter(Boolean)) {
    if (/^[a-z0-9._-]+$/.test(word)) {
      if (word.length >= 2) terms.add(word);
      continue;
    }
    const chars = Array.from(word);
    if (chars.length === 1) {
      terms.add(word);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i += 1) {
      terms.add(chars[i] + chars[i + 1]);
    }
  }
  return [...terms];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0 && count < 50) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

// 返回 needle 中能在 haystack 内连续匹配的最长片段长度
function longestRun(haystack: string, needle: string): number {
  const total = needle.length;
  if (!total || !haystack) return 0;
  let best = 0;
  for (let start = 0; start < total; start += 1) {
    if (total - start <= best) break;
    const rest = haystack.indexOf(needle[start]);
    if (rest < 0) continue;
    let length = 1;
    while (start + length < total && haystack.includes(needle.slice(start, start + length + 1))) {
      length += 1;
    }
    if (length > best) best = length;
  }
  return best;
}

function buildSnippet(content: string, lowerContent: string, needle: string): string {
  const index = needle ? lowerContent.indexOf(needle) : -1;
  if (index < 0) {
    return content.length > 160 ? `${content.slice(0, 160)}…` : content;
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, start + 160);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

function buildExcerpt(content: string, lowerContent: string, needle: string, limit: number): string {
  const index = needle ? lowerContent.indexOf(needle) : -1;
  if (index < 0) {
    return content.length > limit ? `${content.slice(0, limit)}…` : content;
  }
  const start = Math.max(0, index - 200);
  const end = Math.min(content.length, start + limit);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

async function searchImaConnectors(query: string, userId: string): Promise<KbSearchResult[]> {
  const connectors = await prisma.kbConnector.findMany({
    where: { type: 'ima', status: 'on', userId },
    select: { id: true, name: true, credentialEnc: true, configJson: true }
  });

  const items: KbSearchResult[] = [];
  for (const connector of connectors) {
    const credentials = readImaCredentials(connector.credentialEnc);
    if (!credentials) continue;
    const config = parseImaConfig(connector.configJson);
    for (const [kbIndex, kbId] of config.knowledgeBaseIds.slice(0, 5).entries()) {
      try {
        const found = await searchImaKnowledge(credentials, kbId, query);
        const kbName = config.knowledgeBaseNames[kbId] || connector.name;
        found.slice(0, 5).forEach((item, index) => {
          const id = `ima:${kbId}:${item.mediaId}`;
          const snippet = item.snippet.replace(/<[^>]+>/g, '').trim() || item.title;
          const pathLabel = `IMA · ${kbName}`;
          rememberImaItem(id, { title: item.title, path: pathLabel, snippet });
          items.push({
            id,
            title: `[IMA] ${item.title}`,
            path: pathLabel,
            snippet: snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet,
            excerpt: snippet.slice(0, 1500),
            score: Math.max(0.5, 0.92 - kbIndex * 0.02 - index * 0.04)
          });
        });
      } catch (error) {
        console.warn(
          `[kb] IMA 检索失败 connector=${connector.id} kb=${kbId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  return items;
}

export async function searchKb(
  rawQuery: string,
  userId: string
): Promise<{ items: KbSearchResult[]; took: number }> {
  const startedAt = Date.now();
  const query = rawQuery.trim();
  if (!query) {
    return { items: [], took: Date.now() - startedAt };
  }

  const terms = extractTerms(query);
  const cleanedQuery = query.toLowerCase().replace(STOP_PATTERN, '').trim();
  const phrase = cleanedQuery;
  const [docs, imaItems] = await Promise.all([
    prisma.kbDoc.findMany({
      where: { userId },
      select: { id: true, title: true, path: true, content: true }
    }),
    searchImaConnectors(query, userId)
  ]);

  const items: KbSearchResult[] = [...imaItems];
  for (const doc of docs) {
    const lowerTitle = doc.title.toLowerCase();
    const lowerContent = doc.content.toLowerCase();

    const titleRun = cleanedQuery ? longestRun(lowerTitle, cleanedQuery) : 0;
    const contentRun = cleanedQuery ? longestRun(lowerContent, cleanedQuery) : 0;
    if (!titleRun && !contentRun) continue;

    let matchedTerms = 0;
    let firstTerm = '';
    for (const term of terms) {
      const inContent = countOccurrences(lowerContent, term);
      if (lowerTitle.includes(term) || inContent) {
        matchedTerms += 1;
        if (!firstTerm) firstTerm = term;
      }
    }
    const coverage = terms.length ? matchedTerms / terms.length : 0;
    const runBase = Math.max(2, Array.from(cleanedQuery).length);
    const score =
      Math.round(
        Math.min(
          1,
          Math.min(0.55, (titleRun / runBase) * 0.55) +
            Math.min(0.25, (contentRun / runBase) * 0.25) +
            coverage * 0.2
        ) * 100
      ) / 100;

    items.push({
      id: doc.id,
      title: doc.title,
      path: doc.path,
      snippet: buildSnippet(doc.content, lowerContent, phrase && lowerContent.includes(phrase) ? phrase : firstTerm),
      excerpt: buildExcerpt(
        doc.content,
        lowerContent,
        phrase && lowerContent.includes(phrase) ? phrase : firstTerm,
        1500
      ),
      score
    });
  }

  items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh-CN'));
  return { items, took: Date.now() - startedAt };
}

const INDEXABLE_EXTENSIONS = new Set(['md', 'pdf', 'docx']);

function isIndexableFile(fileName: string): boolean {
  return INDEXABLE_EXTENSIONS.has(path.extname(fileName).slice(1).toLowerCase());
}

function collectIndexableFiles(target: string): string[] {
  const files: string[] = [];
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return isIndexableFile(target) ? [target] : [];
  }
  if (!stat.isDirectory()) return [];

  const stack = [target];
  while (stack.length) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && isIndexableFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function reindexImaConnector(connector: { id: string; credentialEnc: string | null }) {
  const credentials = readImaCredentials(connector.credentialEnc);
  if (!credentials) {
    throw validationError('请先在「配置」中填写 IMA 的 Client ID 与 API Key');
  }

  const startedAt = Date.now();
  const knowledgeBases = await listImaKnowledgeBases(credentials);
  if (!knowledgeBases.length) {
    throw validationError('IMA 未返回可访问的知识库，请确认该账号已加入知识库');
  }

  const config = {
    knowledgeBaseIds: knowledgeBases.map((kb) => kb.id),
    knowledgeBaseNames: Object.fromEntries(knowledgeBases.map((kb) => [kb.id, kb.name]))
  };

  await prisma.kbConnector.update({
    where: { id: connector.id },
    data: {
      status: 'on',
      indexedCount: 0,
      lastIndexedAt: new Date(),
      meta: `已连接 IMA · ${knowledgeBases.length} 个知识库可用`,
      configJson: JSON.stringify(config)
    }
  });

  return {
    indexed: knowledgeBases.length,
    updated: 0,
    durationMs: Math.max(1, Date.now() - startedAt)
  };
}

export async function reindexConnector(connectorId: string, userId: string) {
  const connector = await prisma.kbConnector.findFirst({ where: { id: connectorId, userId } });
  if (!connector) return null;

  if (connector.type === 'ima') {
    return reindexImaConnector(connector);
  }

  const startedAt = Date.now();
  let indexed = 0;
  let updated = 0;

  if (connector.path && fs.existsSync(connector.path)) {
    const files = collectIndexableFiles(connector.path);
    let skipped = 0;

    for (const file of files) {
      const ext = path.extname(file).slice(1).toLowerCase();
      let content: string;
      try {
        content =
          ext === 'md'
            ? fs.readFileSync(file, 'utf8')
            : (await extractDocumentText(file, fs.readFileSync(file))).text;
      } catch (error) {
        skipped += 1;
        console.warn(
          `[kb] 跳过无法解析的文件 ${file}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }

      const title = path.parse(file).name;
      const existing = await prisma.kbDoc.findFirst({
        where: { connectorId, path: file },
        select: { id: true, title: true, content: true }
      });
      if (!existing) {
        await prisma.kbDoc.create({
          data: { connectorId, userId: connector.userId, title, path: file, content }
        });
        updated += 1;
      } else if (existing.title !== title || existing.content !== content) {
        await prisma.kbDoc.update({
          where: { id: existing.id },
          data: { title, content }
        });
        updated += 1;
      }
    }

    indexed = files.length - skipped;
    const skippedNote = skipped ? `，跳过 ${skipped} 个无法解析的文件` : '';
    await prisma.kbConnector.update({
      where: { id: connectorId },
      data: {
        status: 'on',
        indexedCount: indexed,
        lastIndexedAt: new Date(),
        meta: `已索引 ${indexed} 个文件（Markdown/PDF/Word）${skippedNote}`
      }
    });
  } else {
    // 路径不可访问时明确报错，避免显示“已连接”却索引不到任何内容
    const message = connector.path
      ? `路径不可访问：${connector.path}（请确认目录已挂载到容器内，且连接器填写的是容器内路径）`
      : '连接器未配置路径';
    await prisma.kbConnector.update({
      where: { id: connectorId },
      data: { status: 'error', lastIndexedAt: new Date(), meta: message }
    });
    throw validationError(message);
  }

  return { indexed, updated, durationMs: Math.max(1, Date.now() - startedAt) };
}
