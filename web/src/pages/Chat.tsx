import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Input, Modal, Select, Spin } from 'antd'
import { PaperClipOutlined, PictureOutlined, SendOutlined } from '@ant-design/icons'
import { apiErrorMessage } from '../api/client'
import {
  createSession,
  listMessages,
  listSessions,
  streamChat,
  uploadChatAttachment,
  type ChatAttachment,
  type ToolCallInfo,
  type ToolResultInfo,
} from '../api/chat'
import { listMemory, deleteMemory, clearMemory } from '../api/memory'
import { getSettings, listModels } from '../api/settings'
import { toastError, toastSuccess } from '../api/notify'
import { formatDateTime } from '../utils/format'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import MarkdownDoc from '../components/MarkdownDoc'
import LoadError from '../components/LoadError'
import type { ChatMessage, ChatSession, Citation, LlmModel, MemoryItem } from '../types'

const SUGGESTIONS = [
  '本周有哪些事项即将到期？',
  '帮我复盘一下最近的合同审查工作',
  '根据知识库起草一份催告函要点',
]

const ATTACHMENT_ACCEPT = '.docx,.xlsx,.xls,.pdf,.md,.txt,.csv'
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'
const MAX_IMAGES = 4
const MAX_IMAGE_SIZE = 15 * 1024 * 1024

/**
 * 把回复里的纯文本标注转成可点击 markdown 链接：
 * 1) 裸 URL → [url](url)（autolink）
 * 2) [网络N] → [网络N](citations[N-1].url)（联网检索来源）
 * 没有 url 的标注保持原样，避免生成坏链接。
 */
function enrichAnswer(text: string, citations?: Citation[]): string {
  if (!text) return text
  let out = text
  out = out.replace(/(?<!\()(https?:\/\/[^\s)\]>]+)(?!\))/g, (m) => `[${m}](${m})`)
  out = out.replace(/\[网络(\d+)\]/g, (_m, n: string) => {
    const idx = Number(n) - 1
    const url = citations?.[idx]?.url
    return url ? `[网络${n}](${url})` : _m
  })
  return out
}
const ALLOWED_EXTENSIONS = new Set(['docx', 'xlsx', 'xls', 'pdf', 'md', 'txt', 'csv'])
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 5

/** 本地存储键名（作用域限定在 chat 页面的按钮开关） */
const LS_KEYS = {
  kb: 'chat:toggle:kb',
  mem: 'chat:toggle:mem',
  web: 'chat:toggle:web',
  agent: 'chat:toggle:agent',
} as const

/** 从 localStorage 读取布尔值，缺失或非法时返回 fallback */
function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

/** 写入布尔值到 localStorage（仅在浏览器环境） */
function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    /* 隐私模式/配额满等场景下静默失败 */
  }
}

export default function Chat() {
  const navigate = useNavigate()
  const { modal } = App.useApp()

  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamCitations, setStreamCitations] = useState<Citation[]>([])
  const [models, setModels] = useState<LlmModel[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const [kbOn, setKbOn] = useState(() => readBool(LS_KEYS.kb, true))
  const [memOn, setMemOn] = useState(() => readBool(LS_KEYS.mem, true))
  const [webOn, setWebOn] = useState(() => readBool(LS_KEYS.web, true))
  const [agentOn, setAgentOn] = useState(() => readBool(LS_KEYS.agent, false))

  /** 任意开关变动时实时写回 localStorage */
  useEffect(() => { writeBool(LS_KEYS.kb, kbOn) }, [kbOn])
  useEffect(() => { writeBool(LS_KEYS.mem, memOn) }, [memOn])
  useEffect(() => { writeBool(LS_KEYS.web, webOn) }, [webOn])
  useEffect(() => { writeBool(LS_KEYS.agent, agentOn) }, [agentOn])
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<Array<{ name: string; dataUrl: string }>>([])
  const [streamToolCalls, setStreamToolCalls] = useState<
    Array<{ kind: 'call' | 'result' | 'error'; call: ToolCallInfo; result?: ToolResultInfo }>
  >([])

  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        const sessionList = await listSessions()
        let current = sessionList[0]
        if (!current) {
          current = await createSession()
          sessionList.unshift(current)
        }
        if (cancelled) return
        setSessions([...sessionList])
        setSessionId(current.id)
        const history = await listMessages(current.id)
        if (cancelled) return
        setMessages(history)
      } catch (initError) {
        if (!cancelled) setError(apiErrorMessage(initError))
      } finally {
        if (!cancelled) setLoading(false)
      }

      const modelList = await listModels().catch(() => [] as LlmModel[])
      const settings = await getSettings().catch(() => null)
      if (cancelled) return
      setModels(modelList)
      const preferred = settings?.defaultModel
      const matched =
        modelList.find((item) => item.id === preferred || item.model === preferred) ?? modelList[0]
      setModelId(matched?.id ?? null)

      try {
        const memories = await listMemory()
        if (!cancelled) setMemory(memories)
      } catch {
        /* 记忆加载失败不阻塞对话 */
      }
    }

    void init()
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [reloadKey])

  useEffect(() => {
    const element = bodyRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, streamText, sending])

  const refreshMemory = async () => {
    try {
      setMemory(await listMemory())
    } catch {
      /* ignore */
    }
  }

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toastError(`一次最多添加 ${MAX_ATTACHMENTS} 个附件`)
      return
    }
    setUploading(true)
    const parsed: ChatAttachment[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'doc') {
        toastError('暂不支持旧版 .doc 文件，请另存为 .docx 后上传')
        continue
      }
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        toastError(`不支持的文件类型：${file.name}`)
        continue
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toastError(`${file.name} 超过 20MB 限制`)
        continue
      }
      try {
        parsed.push(await uploadChatAttachment(file))
      } catch {
        /* 统一错误提示 */
      }
    }
    if (parsed.length) setAttachments((prev) => [...prev, ...parsed])
    setUploading(false)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, current) => current !== index))
  }

  const handleImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (images.length + files.length > MAX_IMAGES) {
      toastError(`一次最多添加 ${MAX_IMAGES} 张图片`)
      return
    }
    const parsed: Array<{ name: string; dataUrl: string }> = []
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        toastError(`${file.name} 超过 15MB 限制`)
        continue
      }
      if (!IMAGE_ACCEPT.includes(file.type)) {
        toastError(`不支持的图片类型：${file.name}`)
        continue
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      }).catch(() => '')
      if (dataUrl) parsed.push({ name: file.name, dataUrl })
    }
    if (parsed.length) setImages((prev) => [...prev, ...parsed])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, current) => current !== index))
  }

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if ((!content && !attachments.length && !images.length) || !sessionId || sending || uploading) return
    const prompt = content || '请帮我查看这张图片。'
    const outgoing = attachments

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: prompt,
      attachments: outgoing.map((attachment) => attachment.name),
      images: images.map((img) => img.name),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setAttachments([])
    setImages([])
    setSending(true)
    setError(null)
    setStreamText('')
    setStreamCitations([])
    setStreamToolCalls([])

    let full = ''
    let citations: Citation[] = []
    let finished = false
    const toolHistory: Array<{ kind: 'call' | 'result' | 'error'; call: ToolCallInfo; result?: ToolResultInfo }> = []

    try {
      await streamChat(
        sessionId,
        {
          content: prompt,
          modelId,
          useKb: kbOn,
          useMemory: memOn,
          useWeb: webOn,
          useTools: agentOn,
          attachments: outgoing.map(({ name, text: attachmentText }) => ({
            name,
            text: attachmentText,
          })),
          images: images.map((img) => ({ name: img.name, dataUrl: img.dataUrl })),
        },
        {
          onDelta: (delta) => {
            full += delta
            setStreamText(full)
          },
          onCitations: (next) => {
            citations = next
            setStreamCitations(next)
          },
          onToolCall: (info) => {
            const entry = { kind: 'call' as const, call: info }
            toolHistory.push(entry)
            setStreamToolCalls([...toolHistory])
          },
          onToolResult: (info) => {
            const entry = { kind: 'result' as const, call: info, result: info }
            toolHistory.push(entry)
            setStreamToolCalls([...toolHistory])
          },
          onToolError: (info) => {
            const entry = { kind: 'error' as const, call: info, result: info }
            toolHistory.push(entry)
            setStreamToolCalls([...toolHistory])
          },
          onDone: () => {
            finished = true
            if (full.trim()) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `local-ai-${Date.now()}`,
                  role: 'assistant',
                  content: full,
                  citations,
                  createdAt: new Date().toISOString(),
                },
              ])
            } else {
              setError('未收到模型回复，请稍后重试')
            }
            setStreamText('')
            setStreamCitations([])
            setSending(false)
            void refreshMemory()
          },
          onError: (message) => {
            finished = true
            setError(message)
            setStreamText('')
            setStreamCitations([])
            setSending(false)
          },
        },
        controller.signal,
      )
      if (!finished) {
        if (full.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `local-ai-${Date.now()}`,
              role: 'assistant',
              content: full,
              citations,
              createdAt: new Date().toISOString(),
            },
          ])
        }
        setStreamText('')
        setSending(false)
      }
    } catch (sendError) {
      const aborted = (sendError as { name?: string }).name === 'AbortError'
      if (!aborted) {
        setError(apiErrorMessage(sendError))
        setStreamText('')
      }
      setSending(false)
    }
  }

  const newSession = async () => {
    abortRef.current?.abort()
    setSending(false)
    setStreamText('')
    setStreamCitations([])
    try {
      const session = await createSession()
      setSessions((prev) => [session, ...prev])
      setSessionId(session.id)
      setMessages([])
      setError(null)
      setInput('')
      setAttachments([])
      toastSuccess('已开始新会话')
    } catch {
      /* 统一错误提示 */
    }
  }

  const removeMemoryItem = async (id: string) => {
    try {
      await deleteMemory(id)
      setMemory((prev) => prev.filter((item) => item.id !== id))
    } catch {
      /* 统一错误提示 */
    }
  }

  const clearAllMemory = () => {
    modal.confirm({
      title: '清空记忆画像',
      content: '清空后将不再依据历史偏好生成回答，确认继续？',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setMemoryLoading(true)
        try {
          await clearMemory()
          setMemory([])
          toastSuccess('记忆画像已清空')
        } catch {
          /* 统一错误提示 */
        } finally {
          setMemoryLoading(false)
        }
      },
    })
  }

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: `${model.vendor} · ${model.model}`,
  }))

  const currentModel = models.find((model) => model.id === modelId)

  return (
    <main>
      <PageHeader
        title="法务对话"
        description={currentModel ? `${currentModel.vendor} · ${currentModel.model}` : '本地模型 / 知识库问答'}
        actions={
          <>
            {sessions.length > 1 ? (
              <Select
                aria-label="切换会话"
                style={{ width: 150 }}
                value={sessionId ?? undefined}
                options={sessions.map((session) => ({
                  value: session.id,
                  label: session.title || '未命名会话',
                }))}
                onChange={(next) => {
                  setSessionId(next)
                  void listMessages(next).then(setMessages).catch(() => setMessages([]))
                }}
              />
            ) : null}
            <Button onClick={() => void newSession()}>新会话</Button>
          </>
        }
      />

      <div className="page-content">
        {error && !sessionId ? (
          <div style={{ marginBottom: 14 }}>
            <LoadError
              message="对话服务加载失败"
              description={error}
              onRetry={() => setReloadKey((value) => value + 1)}
            />
          </div>
        ) : null}

        <div className="chat-wrap">
          <div className="card chat-panel">
            <div className="chat-head">
              <Select
                className="chat-model"
                aria-label="选择模型"
                size="small"
                value={modelId ?? undefined}
                placeholder={models.length ? '默认模型' : '未配置模型'}
                options={modelOptions}
                onChange={setModelId}
                allowClear
              />
              {!models.length ? (
                <Button type="link" size="small" onClick={() => navigate('/settings')}>
                  去设置模型
                </Button>
              ) : null}
              <button
                type="button"
                className={`tchip${kbOn ? ' on' : ''}`}
                aria-pressed={kbOn}
                onClick={() => setKbOn((value) => !value)}
              >
                知识库
              </button>
              <button
                type="button"
                className={`tchip${memOn ? ' on' : ''}`}
                aria-pressed={memOn}
                onClick={() => setMemOn((value) => !value)}
              >
                记忆
              </button>
              <button
                type="button"
                className={`tchip${webOn ? ' on' : ''}`}
                aria-pressed={webOn}
                title="调用 DeepSeek 网页搜索与抓取（按成功请求计费）"
                onClick={() => setWebOn((value) => !value)}
              >
                联网
              </button>
              <button
                type="button"
                className={`tchip${agentOn ? ' on' : ''}`}
                aria-pressed={agentOn}
                title="Agent 模式：允许 AI 自主调用工具查询记录、统计汇总、检索知识库。开启后每次对话多消耗约 1200 tokens（工具 schema），可能触发多轮对话。"
                onClick={() => setAgentOn((value) => !value)}
              >
                Agent
              </button>
              <span className="card-note chat-count">
                {loading ? '连接中…' : `${messages.length} 条消息`}
              </span>
            </div>

            <div className="chat-body" ref={bodyRef}>
              {loading ? (
                <div style={{ margin: 'auto', textAlign: 'center' }}>
                  <Spin />
                  <div className="card-note" style={{ marginTop: 8 }}>
                    正在准备对话…
                  </div>
                </div>
              ) : null}

              {!loading && !messages.length && !sending ? (
                <div className="chat-empty">
                  <EmptyState
                    title="开始一次法务对话"
                    description="AI 会结合已接入的知识库与记忆画像回答，并在有依据时给出引用标签"
                  />
                </div>
              ) : null}

              {messages.map((message) => (
                <div className={`msg msg-${message.role === 'user' ? 'user' : 'ai'}`} key={message.id}>
                  <div className="bubble">
                    {message.role === 'user' ? (
                      message.content
                    ) : (
                      <MarkdownDoc content={enrichAnswer(message.content, message.citations)} />
                    )}
                    {message.attachments?.length ? (
                      <div className="msg-files">
                        {message.attachments.map((name) => (
                          <span className="msg-file" key={`${message.id}-${name}`}>
                            <PaperClipOutlined />
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {message.images?.length ? (
                      <div className="msg-files">
                        {message.images.map((name) => (
                          <span className="msg-file" key={`${message.id}-img-${name}`}>
                            <PictureOutlined />
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {message.citations?.length
                      ? message.citations.map((citation, index) =>
                          citation.url ? (
                            <a
                              className="cite cite-link"
                              key={`${message.id}-cite-${index}`}
                              href={citation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {citation.title}
                            </a>
                          ) : (
                            <span className="cite" key={`${message.id}-cite-${index}`}>
                              {citation.title}
                            </span>
                          )
                        )
                      : null}
                  </div>
                  <div className="msg-meta">
                    {message.role === 'user' ? '我' : 'AI 助手'}
                    {message.createdAt ? ` · ${formatDateTime(message.createdAt)}` : ''}
                  </div>
                </div>
              ))}

              {sending ? (
                <div className="msg msg-ai">
                  <div className="bubble">
                    {streamToolCalls.length ? (
                      <div className="tool-history">
                        {streamToolCalls.map((entry, index) =>
                          entry.kind === 'call' ? (
                            <div className="tool-pill tool-call" key={`tc-${index}`}>
                              <span className="tool-icon">🔧</span>
                              {entry.call.name}(…)
                            </div>
                          ) : entry.kind === 'error' ? (
                            <div className="tool-pill tool-error" key={`tc-${index}`}>
                              <span className="tool-icon">⚠️</span>
                              {entry.call.name}：{entry.result?.error ?? '执行失败'}
                            </div>
                          ) : (
                            <div className="tool-pill tool-result" key={`tc-${index}`}>
                              <span className="tool-icon">✓</span>
                              {entry.call.name}
                            </div>
                          )
                        )}
                      </div>
                    ) : null}
                    {streamText ? (
                      <MarkdownDoc content={enrichAnswer(streamText, streamCitations)} />
                    ) : (
                      <span className="typing" aria-label="正在生成回答">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                    {streamCitations.map((citation, index) =>
                      citation.url ? (
                        <a
                          className="cite cite-link"
                          key={`stream-cite-${index}`}
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {citation.title}
                        </a>
                      ) : (
                        <span className="cite" key={`stream-cite-${index}`}>
                          {citation.title}
                        </span>
                      )
                    )}
                  </div>
                  <div className="msg-meta">正在生成…</div>
                </div>
              ) : null}
            </div>

            {error && sessionId ? (
              <div className="chat-error">
                <Alert
                  type="error"
                  showIcon
                  closable
                  message={error}
                  onClose={() => setError(null)}
                />
              </div>
            ) : null}

            <div className="chat-compose">
              {(attachments.length || images.length || uploading) ? (
                <div className="chat-attach-list">
                  {attachments.map((attachment, index) => (
                    <span className="attach-chip" key={`${attachment.name}-${index}`}>
                      <PaperClipOutlined />
                      <span className="attach-name">{attachment.name}</span>
                      {attachment.truncated ? <span className="attach-size">已截断</span> : null}
                      <button
                        type="button"
                        aria-label={`移除附件 ${attachment.name}`}
                        onClick={() => removeAttachment(index)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {images.map((img, index) => (
                    <span className="attach-chip attach-img" key={`${img.name}-${index}`}>
                      <img src={img.dataUrl} alt={img.name} />
                      <span className="attach-name">{img.name}</span>
                      <button
                        type="button"
                        aria-label={`移除图片 ${img.name}`}
                        onClick={() => removeImage(index)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {uploading ? (
                    <span className="attach-chip">
                      <Spin size="small" />
                      解析中…
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="chat-input">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(event) => void handleFiles(event)}
                />
                <input
                  ref={imageRef}
                  type="file"
                  multiple
                  hidden
                  accept={IMAGE_ACCEPT}
                  onChange={(event) => void handleImages(event)}
                />
                <Button
                  icon={<PaperClipOutlined />}
                  aria-label="添加附件"
                  title="添加附件：docx、xlsx、xls、pdf、md、txt、csv，单个不超过 20MB"
                  disabled={!sessionId || loading || sending || uploading}
                  onClick={() => fileRef.current?.click()}
                />
                <Button
                  icon={<PictureOutlined />}
                  aria-label="添加图片"
                  title="添加图片进行视觉理解：JPEG、PNG、GIF、WebP，单张不超过 15MB，最多 4 张"
                  disabled={!sessionId || loading || sending || images.length >= MAX_IMAGES}
                  onClick={() => imageRef.current?.click()}
                />
                <Input.TextArea
                  value={input}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder="描述你的问题，Enter 发送，Shift + Enter 换行"
                  aria-label="对话输入框"
                  disabled={!sessionId || loading}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault()
                      void send()
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={sending}
                  disabled={!sessionId || uploading || (!input.trim() && !attachments.length && !images.length)}
                  onClick={() => void send()}
                >
                  发送
                </Button>
              </div>
            </div>
          </div>

          <aside aria-label="对话辅助">
            <section className="rail">
              <h2>
                记忆画像
                <button type="button" onClick={() => setMemoryOpen(true)}>
                  管理
                </button>
              </h2>
              {memory.length ? (
                <div className="tag-cloud">
                  {memory.slice(0, 8).map((item) => (
                    <span className="memory-tag" key={item.id}>
                      {item.content.length > 12 ? `${item.content.slice(0, 12)}…` : item.content}
                      <button
                        type="button"
                        aria-label={`删除记忆 ${item.content}`}
                        onClick={() => void removeMemoryItem(item.id)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="card-note">暂无记忆标签。对话中形成的稳定偏好会显示在这里。</p>
              )}
            </section>

            <section className="rail">
              <h2>建议提问</h2>
              <ul className="suggest-list">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      disabled={!sessionId || sending}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <Modal
        open={memoryOpen}
        title="记忆画像管理"
        width={520}
        onCancel={() => setMemoryOpen(false)}
        footer={[
          <Button key="clear" danger disabled={!memory.length} loading={memoryLoading} onClick={clearAllMemory}>
            清空全部
          </Button>,
          <Button key="close" onClick={() => setMemoryOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        {memory.length ? (
          memory.map((item) => (
            <div className="model-row" key={item.id}>
              <span style={{ flex: 1 }}>{item.content}</span>
              <Button type="link" size="small" danger onClick={() => void removeMemoryItem(item.id)}>
                删除
              </Button>
            </div>
          ))
        ) : (
          <EmptyState compact title="暂无记忆标签" description="对话后自动沉淀的偏好会显示在这里" />
        )}
      </Modal>
    </main>
  )
}
