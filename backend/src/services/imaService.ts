import { decryptSecret } from '../utils/crypto';

const IMA_API_BASE = 'https://ima.qq.com/openapi/wiki/v1';

export interface ImaCredentials {
  clientId: string;
  apiKey: string;
}

export interface ImaKnowledgeBase {
  id: string;
  name: string;
}

export interface ImaSearchItem {
  mediaId: string;
  title: string;
  snippet: string;
}

export interface ImaConfig {
  knowledgeBaseIds: string[];
  knowledgeBaseNames: Record<string, string>;
}

interface ImaEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface CachedImaItem {
  title: string;
  path: string;
  snippet: string;
}

// IMA 开放接口只提供检索摘要，缓存命中后供知识库详情页展示
const snippetCache = new Map<string, CachedImaItem>();

export function rememberImaItem(key: string, item: CachedImaItem): void {
  if (snippetCache.size > 500) snippetCache.clear();
  snippetCache.set(key, item);
}

export function getImaCachedItem(key: string): CachedImaItem | undefined {
  return snippetCache.get(key);
}

/** 从加密字段中读取 IMA 凭据 */
export function readImaCredentials(encrypted: string | null): ImaCredentials | null {
  if (!encrypted) return null;
  try {
    const parsed = JSON.parse(decryptSecret(encrypted)) as Partial<ImaCredentials>;
    if (!parsed.clientId || !parsed.apiKey) return null;
    return { clientId: String(parsed.clientId), apiKey: String(parsed.apiKey) };
  } catch {
    return null;
  }
}

export function parseImaConfig(raw: string | null): ImaConfig {
  if (!raw) return { knowledgeBaseIds: [], knowledgeBaseNames: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ImaConfig>;
    return {
      knowledgeBaseIds: Array.isArray(parsed.knowledgeBaseIds)
        ? parsed.knowledgeBaseIds.map((id) => String(id)).filter(Boolean)
        : [],
      knowledgeBaseNames:
        parsed.knowledgeBaseNames && typeof parsed.knowledgeBaseNames === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.knowledgeBaseNames).map(([key, value]) => [key, String(value)])
            )
          : {}
    };
  } catch {
    return { knowledgeBaseIds: [], knowledgeBaseNames: {} };
  }
}

async function imaRequest<T>(
  apiPath: string,
  payload: Record<string, unknown>,
  credentials: ImaCredentials
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${IMA_API_BASE}/${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ima-openapi-clientid': credentials.clientId,
        'ima-openapi-apikey': credentials.apiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('IMA 接口连接失败，请检查服务器网络后重试');
  }

  if (!response.ok) {
    throw new Error(`IMA 接口返回 HTTP ${response.status}`);
  }

  const body = (await response.json()) as ImaEnvelope<T>;
  if (body.code !== 0) {
    throw new Error(body.msg ? `IMA：${body.msg}` : `IMA 接口错误（${body.code}）`);
  }
  return body.data;
}

/** 校验凭据并返回可访问的知识库列表 */
export async function listImaKnowledgeBases(credentials: ImaCredentials): Promise<ImaKnowledgeBase[]> {
  const data = await imaRequest<{ addable_knowledge_base_list?: ImaKnowledgeBase[] }>(
    'get_addable_knowledge_base_list',
    { cursor: '', limit: 50 },
    credentials
  );
  return (data.addable_knowledge_base_list ?? []).map((item) => ({
    id: String(item.id),
    name: String(item.name)
  }));
}

/** 在指定 IMA 知识库中检索 */
export async function searchImaKnowledge(
  credentials: ImaCredentials,
  knowledgeBaseId: string,
  query: string
): Promise<ImaSearchItem[]> {
  const data = await imaRequest<{
    info_list?: Array<{ media_id?: string; title?: string; highlight_content?: string }>;
  }>('search_knowledge', { query, cursor: '', knowledge_base_id: knowledgeBaseId }, credentials);

  return (data.info_list ?? [])
    .filter((item) => item.media_id)
    .map((item) => ({
      mediaId: String(item.media_id),
      title: String(item.title || '未命名条目'),
      snippet: String(item.highlight_content || '').trim()
    }));
}
