import { api, getAccessToken, refreshAccessToken } from './client'
import { asItems } from './unwrap'
import type { ChatMessage, ChatSession, Citation } from '../types'

interface RawMessage {
  id?: string
  role?: string
  content?: unknown
  text?: unknown
  citations?: unknown
  createdAt?: string
}

export function normalizeCitations(raw: unknown): Citation[] {
  let source: unknown[] = []
  if (Array.isArray(raw)) source = raw
  else if (raw && typeof raw === 'object' && Array.isArray((raw as { citations?: unknown[] }).citations)) {
    source = (raw as { citations: unknown[] }).citations
  }
  const result: Citation[] = []
  source.forEach((item, index) => {
    if (typeof item === 'string') {
      result.push({ title: item })
      return
    }
    if (!item || typeof item !== 'object') return
    const obj = item as Record<string, unknown>
    const title = obj.title ?? obj.name ?? obj.label
    if (title == null) return
    result.push({
      id: obj.id != null ? String(obj.id) : String(index),
      docId: obj.docId != null ? String(obj.docId) : obj.id != null ? String(obj.id) : undefined,
      title: String(title),
    })
  })
  return result
}

function normalizeMessage(raw: RawMessage, index: number): ChatMessage {
  return {
    id: raw.id ?? `msg-${index}`,
    role: raw.role === 'user' ? 'user' : 'assistant',
    content: String(raw.content ?? raw.text ?? ''),
    citations: normalizeCitations(raw.citations),
    createdAt: raw.createdAt,
  }
}

export async function listSessions(): Promise<ChatSession[]> {
  const { data } = await api.get<{ items: ChatSession[] } | ChatSession[]>('/chat/sessions')
  return asItems(data)
}

export async function createSession(): Promise<ChatSession> {
  const { data } = await api.post<ChatSession | { session: ChatSession }>('/chat/sessions')
  return 'session' in data ? data.session : data
}

export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/chat/sessions/${id}`)
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await api.get<{ items: RawMessage[] } | RawMessage[]>(
    `/chat/sessions/${sessionId}/messages`,
  )
  return asItems(data).map(normalizeMessage)
}

export interface ChatAttachment {
  name: string
  kind: string
  size: number
  text: string
  truncated: boolean
}

export interface ChatSendPayload {
  content: string
  modelId?: string | null
  useKb: boolean
  useMemory: boolean
  useWeb?: boolean
  attachments?: Array<{ name: string; text: string }>
}

export async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ attachment: ChatAttachment }>('/chat/attachments', form)
  return data.attachment
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  onCitations: (citations: Citation[]) => void
  onDone: () => void
  onError: (message: string) => void
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function textFrom(data: unknown): string {
  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') return ''
  const obj = data as Record<string, unknown>
  for (const key of ['text', 'delta', 'content', 'message']) {
    if (typeof obj[key] === 'string') return obj[key] as string
  }
  return ''
}

function parseEventBlock(block: string): { event: string; data: string } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }
  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n') }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } }
    if (data?.error?.message) return data.error.message
  } catch {
    /* ignore */
  }
  if (response.status === 401) return '登录已失效，请重新登录'
  return `对话请求失败（${response.status}）`
}

/** POST SSE：使用 fetch + ReadableStream 逐字读取 */
export async function streamChat(
  sessionId: string,
  payload: ChatSendPayload,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const url = `/api/chat/sessions/${sessionId}/messages`
  const body = JSON.stringify(payload)

  const send = async (): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body,
      signal,
    })

  if (!getAccessToken()) await refreshAccessToken()
  let response = await send()
  if (response.status === 401) {
    const token = await refreshAccessToken()
    if (token) response = await send()
  }

  if (!response.ok) {
    throw new Error(await errorMessage(response))
  }
  if (!response.body) {
    throw new Error('服务端未返回流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let failed = false

  const handleBlock = (block: string): void => {
    const parsed = parseEventBlock(block)
    if (!parsed) return
    const data = parseJson(parsed.data)

    if (parsed.event === 'delta' || parsed.event === 'message') {
      if (data && typeof data === 'object' && (data as { type?: string }).type === 'error') {
        failed = true
        handlers.onError(textFrom(data) || '对话服务返回错误')
        return
      }
      const text = textFrom(data)
      if (text) handlers.onDelta(text)
      return
    }
    if (parsed.event === 'citations') {
      handlers.onCitations(normalizeCitations(data))
      return
    }
    if (parsed.event === 'error') {
      failed = true
      handlers.onError(textFrom(data) || '对话服务返回错误')
      return
    }
    if (parsed.event === 'done') return

    const fallback = textFrom(data)
    if (fallback) handlers.onDelta(fallback)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        handleBlock(block)
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer = buffer.replace(/\r\n/g, '\n').trim()
    if (buffer) handleBlock(buffer)
  } finally {
    reader.releaseLock()
  }

  if (!failed) handlers.onDone()
}
