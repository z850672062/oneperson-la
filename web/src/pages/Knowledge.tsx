import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Input, Modal, Spin } from 'antd'
import {
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { apiErrorMessage } from '../api/client'
import {
  connectConnector,
  getKbDoc,
  listConnectors,
  reindexConnector,
  searchKb,
} from '../api/kb'
import { toastInfo, toastSuccess } from '../api/notify'
import { formatDateTime } from '../utils/format'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import ConnectorModal from '../components/ConnectorModal'
import MarkdownDoc from '../components/MarkdownDoc'
import type { Connector, KbDoc, KbSearchItem } from '../types'

function isConnected(connector: Connector): boolean {
  return ['connected', 'on', 'active', 'ready', 'ok', 'true', '1'].includes(
    String(connector.status ?? '').toLowerCase(),
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlight(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'))
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark className="search-hit" key={index}>
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

export default function Knowledge() {
  const navigate = useNavigate()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reindexingId, setReindexingId] = useState<string | null>(null)
  const [reindexingAll, setReindexingAll] = useState(false)
  const [connectorModalOpen, setConnectorModalOpen] = useState(false)
  const [editingConnector, setEditingConnector] = useState<Connector | null>(null)

  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [results, setResults] = useState<KbSearchItem[]>([])
  const [took, setTook] = useState(0)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [docOpen, setDocOpen] = useState(false)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const [doc, setDoc] = useState<KbDoc | null>(null)

  const loadConnectors = async () => {
    setLoading(true)
    setError(null)
    try {
      setConnectors(await listConnectors())
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConnectors()
  }, [])

  const connect = async (connector: Connector) => {
    try {
      await connectConnector(connector.id)
      toastSuccess(`${connector.name} 已连接`)
      await loadConnectors()
    } catch {
      /* 统一错误提示 */
    }
  }

  const reindex = async (connector: Connector) => {
    setReindexingId(connector.id)
    try {
      const result = await reindexConnector(connector.id)
      toastSuccess(
        `${connector.name} 索引完成：新增 ${result.indexed} · 更新 ${result.updated} · 耗时 ${result.durationMs}ms`,
      )
      await loadConnectors()
    } catch {
      /* 统一错误提示 */
    } finally {
      setReindexingId(null)
    }
  }

  const reindexAll = async () => {
    const targets = connectors.filter(isConnected)
    if (!targets.length) {
      toastInfo('暂无已连接的连接器，请先尝试连接')
      return
    }
    setReindexingAll(true)
    try {
      const results = await Promise.allSettled(targets.map((connector) => reindexConnector(connector.id)))
      const totals = results.reduce(
        (acc, item) => {
          if (item.status === 'fulfilled') {
            acc.indexed += Number(item.value.indexed) || 0
            acc.updated += Number(item.value.updated) || 0
          }
          return acc
        },
        { indexed: 0, updated: 0 },
      )
      toastSuccess(`重新索引完成：新增 ${totals.indexed} · 更新 ${totals.updated}`)
      await loadConnectors()
    } finally {
      setReindexingAll(false)
    }
  }

  const runSearch = async () => {
    const keyword = query.trim()
    if (!keyword) {
      setSearchError('请输入检索关键字')
      return
    }
    setSearching(true)
    setSearchError(null)
    setActiveQuery(keyword)
    try {
      const result = await searchKb(keyword)
      setResults(result.items)
      setTook(result.took)
      setSearched(true)
    } catch (searchFailure) {
      setSearchError(apiErrorMessage(searchFailure))
      setResults([])
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  const openDoc = async (id: string) => {
    setDocOpen(true)
    setDoc(null)
    setDocError(null)
    setDocLoading(true)
    try {
      setDoc(await getKbDoc(id))
    } catch (loadError) {
      setDocError(apiErrorMessage(loadError))
    } finally {
      setDocLoading(false)
    }
  }

  const quoteToRecord = (item: KbSearchItem) => {
    navigate(
      `/records?new=1&kbDocId=${encodeURIComponent(item.id)}&kbTitle=${encodeURIComponent(item.title)}`,
    )
  }

  return (
    <main>
      <PageHeader
        title="知识接入"
        description="只读接入本地知识库，用于检索与对话引用"
        actions={
          <>
            <Button
              icon={<ReloadOutlined />}
              loading={reindexingAll}
              onClick={() => void reindexAll()}
            >
              重新索引
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingConnector(null)
                setConnectorModalOpen(true)
              }}
            >
              添加连接器
            </Button>
          </>
        }
      />

      <div className="page-content">
        {error ? (
          <div style={{ marginBottom: 14 }}>
            <LoadError message="连接器加载失败" description={error} onRetry={() => void loadConnectors()} />
          </div>
        ) : null}

        {loading && !connectors.length ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ textAlign: 'center', padding: 36 }}>
              <Spin />
              <div className="card-note" style={{ marginTop: 10 }}>
                正在加载连接器…
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !connectors.length && !error ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <EmptyState
              title="还没有接入知识库"
              description="可接入 Obsidian 本地库或任意 Markdown 文件夹，索引后即可检索与引用"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingConnector(null)
                    setConnectorModalOpen(true)
                  }}
                >
                  添加连接器
                </Button>
              }
            />
          </div>
        ) : null}

        {connectors.length ? (
          <div className="conn-grid">
            {connectors.map((connector) => {
              const connected = isConnected(connector)
              const meta: string[] = []
              if (connector.type === 'ima') {
                if (connector.meta) meta.push(String(connector.meta))
                if (connector.lastIndexedAt)
                  meta.push(`上次验证 ${formatDateTime(String(connector.lastIndexedAt))}`)
                if (!meta.length) meta.push('尚未配置 IMA 凭据')
              } else {
                if (connector.path) meta.push(String(connector.path))
                if (typeof connector.docCount === 'number') meta.push(`${connector.docCount} 个文档`)
                else if (typeof connector.indexed === 'number') meta.push(`${connector.indexed} 个文档`)
                if (connector.lastIndexedAt)
                  meta.push(`上次索引 ${formatDateTime(String(connector.lastIndexedAt))}`)
                if (!meta.length && connector.meta) meta.push(String(connector.meta))
                if (!meta.length) meta.push('尚未配置路径')
              }

              return (
                <article className="conn-card" key={connector.id}>
                  <div className="conn-top">
                    <span className="conn-name">
                      <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} aria-hidden="true" />
                      {connector.name}
                    </span>
                    <span className={`tag ${connected ? 'tag-green' : 'tag-line'}`}>
                      {connected ? '已连接' : '未连接'}
                    </span>
                  </div>
                  <div className="conn-meta">{connector.type}</div>
                  {meta.map((line) => (
                    <div className="conn-meta" key={line}>
                      {line}
                    </div>
                  ))}
                  <div className="conn-actions">
                    {connected ? (
                      <Button
                        size="small"
                        icon={<SyncOutlined />}
                        loading={reindexingId === connector.id}
                        onClick={() => void reindex(connector)}
                      >
                        索引
                      </Button>
                    ) : (
                      <Button size="small" type="primary" onClick={() => void connect(connector)}>
                        尝试连接
                      </Button>
                    )}
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingConnector(connector)
                        setConnectorModalOpen(true)
                      }}
                    >
                      配置
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        <div className="card">
          <div className="card-head">
            <span className="card-title">知识库检索</span>
            <span className="card-note">
              {searched ? `命中 ${results.length} 条 · 用时 ${took}ms` : '回车即可检索全部已连接知识库'}
            </span>
          </div>

          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, maxWidth: 560 }}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="输入关键字，如：竞业限制、合同解除"
                aria-label="检索知识库"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onPressEnter={() => void runSearch()}
              />
              <Button type="primary" loading={searching} onClick={() => void runSearch()}>
                检索
              </Button>
            </div>

            {searchError ? (
              <Alert
                type="error"
                showIcon
                message={searchError}
                style={{ marginTop: 12 }}
              />
            ) : null}
          </div>

          {searching ? (
            <div style={{ padding: 30, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : results.length ? (
            <div>
              {results.map((item) => (
                <article className="kb-item" key={item.id}>
                  <div className="kb-title">{highlight(item.title, activeQuery)}</div>
                  <div className="kb-path">{highlight(item.path, activeQuery)}</div>
                  <p className="kb-snip">{highlight(item.snippet, activeQuery)}</p>
                  <div className="kb-actions">
                    <Button
                      size="small"
                      type="primary"
                      icon={<LinkOutlined />}
                      onClick={() => quoteToRecord(item)}
                    >
                      引用到记录
                    </Button>
                    <Button size="small" onClick={() => void openDoc(item.id)}>
                      打开原文
                    </Button>
                    <span className="card-note" style={{ alignSelf: 'center' }}>
                      相关度 {(Number(item.score) || 0).toFixed(2)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title={searched ? '没有命中条目' : '输入关键字开始检索'}
              description={
                searched
                  ? '尝试更短的关键词，或确认连接器已完成索引'
                  : '检索结果可直接引用到工作记录，或打开原文查看'
              }
            />
          )}
        </div>
      </div>

      <ConnectorModal
        open={connectorModalOpen}
        connector={editingConnector}
        onClose={() => {
          setConnectorModalOpen(false)
          setEditingConnector(null)
        }}
        onSaved={() => void loadConnectors()}
      />

      <Modal
        open={docOpen}
        title={doc?.title ?? '原文预览'}
        width={720}
        onCancel={() => setDocOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDocOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        {docLoading ? (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : null}
        {docError ? <Alert type="error" showIcon message="原文加载失败" description={docError} /> : null}
        {doc ? (
          <div className="doc-modal">
            {doc.path ? <p className="card-note">{doc.path}</p> : null}
            <MarkdownDoc content={String(doc.content ?? doc.snippet ?? '')} />
            {!doc.content && !doc.snippet ? <p className="card-note">暂无预览内容</p> : null}
          </div>
        ) : null}
      </Modal>
    </main>
  )
}
