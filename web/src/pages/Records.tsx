import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { App, Button, DatePicker, Input, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { apiErrorMessage } from '../api/client'
import { deleteRecord, listRecords, updateRecord } from '../api/records'
import { toastSuccess } from '../api/notify'
import { useCategoriesStore } from '../store/categories'
import { useRecordFilterStore } from '../store/filters'
import { categoryName, sortedCategories } from '../utils/category'
import { allSubTypes, subTypesOf } from '../utils/subType'
import { formatHours } from '../utils/format'
import { isOverdue, recordBadge } from '../utils/record'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import RecordModal from '../components/RecordModal'
import type {
  KbDocRef,
  PageResult,
  RecordItem,
  RecordPayload,
  RecordStatus,
  RecordStatusFilter,
} from '../types'

const STATUS_FILTERS: Array<{ key: RecordStatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'doing', label: '在办' },
  { key: 'done', label: '办结' },
  { key: 'overdue', label: '逾期' },
]

const STATUS_EDIT_OPTIONS: Array<{ value: RecordStatus; label: string }> = [
  { value: 'doing', label: '在办' },
  { value: 'done', label: '办结' },
  { value: 'overdue', label: '逾期' },
]

const RISK_EDIT_OPTIONS = ['高', '中', '低'].map((value) => ({ value, label: value }))

const EMPTY_PAGE: PageResult<RecordItem> = { items: [], total: 0, page: 1, pageSize: 10 }

function riskTone(risk: string): 'red' | 'amber' | 'green' {
  if (risk.includes('高')) return 'red'
  if (risk.includes('中')) return 'amber'
  return 'green'
}

export default function Records() {
  const { modal } = App.useApp()
  const categories = useCategoriesStore((state) => state.items)
  const loadCategories = useCategoriesStore((state) => state.load)
  const {
    categoryId,
    status,
    risk,
    subType,
    q,
    from,
    to,
    page,
    pageSize,
    setCategoryId,
    setStatus,
    setRisk,
    setSubType,
    setQ,
    setRange,
    setPage,
    reset,
  } = useRecordFilterStore()

  const [searchParams, setSearchParams] = useSearchParams()
  const [searchText, setSearchText] = useState(q)
  const [data, setData] = useState<PageResult<RecordItem>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RecordItem | null>(null)
  const [initialKb, setInitialKb] = useState<KbDocRef[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listRecords({
        categoryId: categoryId ?? undefined,
        status,
        risk,
        subType: subType ?? undefined,
        q,
        from: from ?? undefined,
        to: to ?? undefined,
        page,
        pageSize,
      })
      setData(result)
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [categoryId, status, risk, subType, q, from, to, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== q) setQ(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, q, setQ])

  // 支持从侧边栏 / 知识库引用进入
  useEffect(() => {
    const categoryParam = searchParams.get('categoryId')
    const isNew = searchParams.get('new') === '1'
    if (!categoryParam && !isNew) return

    if (categoryParam) setCategoryId(categoryParam)
    if (isNew) {
      const kbId = searchParams.get('kbDocId')
      const kbTitle = searchParams.get('kbTitle')
      setEditing(null)
      setInitialKb(kbId ? [{ id: kbId, title: kbTitle || kbId }] : [])
      setModalOpen(true)
    }

    const next = new URLSearchParams(searchParams)
    next.delete('categoryId')
    next.delete('new')
    next.delete('kbDocId')
    next.delete('kbTitle')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, setCategoryId])

  const openCreate = () => {
    setEditing(null)
    setInitialKb([])
    setModalOpen(true)
  }

  const openEdit = (record: RecordItem) => {
    setEditing(record)
    setInitialKb(record.kbDocs ?? [])
    setModalOpen(true)
  }

  const onSaved = () => {
    void load()
    void loadCategories(true)
  }

  const remove = (record: RecordItem) => {
    modal.confirm({
      title: '删除记录',
      content: `确认删除「${record.name}」？删除后不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRecord(record.id)
          toastSuccess('记录已删除')
          if (data.items.length === 1 && page > 1) setPage(page - 1)
          else void load()
          void loadCategories(true)
        } catch {
          /* 统一错误提示 */
        }
      },
    })
  }

  // 表格内直接修改状态 / 风险
  const quickPatch = async (record: RecordItem, patch: Partial<RecordPayload>) => {
    try {
      const updated = await updateRecord(record.id, patch)
      setData((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === record.id ? { ...item, ...updated } : item)),
      }))
    } catch {
      void load()
    }
  }

  const columns: ColumnsType<RecordItem> = useMemo(
    () => [
      {
        title: '事项',
        key: 'name',
        render: (_, record) => (
          <div>
            <div className="cell-main">{record.name}</div>
            {record.sub ? <div className="cell-sub">{record.sub}</div> : null}
          </div>
        ),
      },
      {
        title: '分类',
        dataIndex: 'categoryPath',
        key: 'category',
        render: (value: string, record) => (
          <span className="table-muted">
            {value || '—'}
            {record.subType ? ` · ${record.subType}` : ''}
          </span>
        ),
      },
      {
        title: '状态',
        key: 'status',
        width: 104,
        filterMultiple: false,
        filters: STATUS_EDIT_OPTIONS.map((option) => ({ text: option.label, value: option.value })),
        filteredValue: status === 'all' ? null : [status],
        render: (_, record) => {
          const badge = recordBadge(record.status, record.dueDate)
          return (
            <Select<RecordStatus>
              className={`cell-edit tone-${badge.tone}`}
              size="small"
              bordered={false}
              value={record.status}
              options={STATUS_EDIT_OPTIONS}
              labelRender={() => badge.text}
              popupMatchSelectWidth={false}
              aria-label={`修改「${record.name}」状态`}
              onChange={(value) => void quickPatch(record, { status: value })}
            />
          )
        },
      },
      {
        title: '风险',
        dataIndex: 'risk',
        key: 'risk',
        width: 96,
        filterMultiple: false,
        filters: RISK_EDIT_OPTIONS.map((option) => ({ text: option.label, value: option.value })),
        filteredValue: risk === 'all' ? null : [risk],
        render: (risk: string, record) => (
          <Select<string>
            className={`cell-edit tone-${riskTone(risk)}`}
            size="small"
            bordered={false}
            value={risk || '中'}
            options={RISK_EDIT_OPTIONS}
            popupMatchSelectWidth={false}
            aria-label={`修改「${record.name}」风险等级`}
            onChange={(value) => void quickPatch(record, { risk: value })}
          />
        ),
      },
      {
        title: '截止',
        dataIndex: 'dueDate',
        key: 'dueDate',
        width: 112,
        render: (dueDate: string | null, record) => (
          <span
            className="num"
            style={{ color: isOverdue(record) ? 'var(--red)' : undefined }}
            title={dueDate ?? '未设置'}
          >
            {dueDate ?? '—'}
          </span>
        ),
      },
      {
        title: '工时',
        dataIndex: 'hours',
        key: 'hours',
        width: 84,
        render: (hours: number) => <span className="num">{formatHours(hours)}h</span>,
      },
      {
        title: '知识库',
        key: 'kb',
        width: 88,
        render: (_, record) => (
          <span className="table-muted">
            {record.kbDocs?.length ? `${record.kbDocs.length} 条` : '—'}
          </span>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 116,
        render: (_, record) => (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Button type="link" size="small" danger onClick={() => remove(record)}>
              删除
            </Button>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, page, status, risk],
  )

  const scope = categoryId ? categoryName(categories, categoryId) : '全部分类'
  const statusLabel = STATUS_FILTERS.find((item) => item.key === status)?.label ?? '全部'
  const typeChips = categoryId ? subTypesOf(categoryName(categories, categoryId)) : allSubTypes()

  return (
    <main>
      <PageHeader
        title="工作记录"
        range={`${scope} · ${statusLabel}${subType ? ` · ${subType}` : ''}${risk !== 'all' ? ` · 风险${risk}` : ''}${from && to ? ` · ${from}~${to}` : ''}${q ? ` · 搜索「${q}」` : ''}`}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建记录
          </Button>
        }
      />

      <div className="page-content">
        <div className="toolbar">
          <Select
            aria-label="按分类筛选"
            style={{ width: 148 }}
            value={categoryId ?? 'all'}
            options={[
              { value: 'all', label: '全部分类' },
              ...sortedCategories(categories).map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
            onChange={(value) => setCategoryId(value === 'all' ? null : value)}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索事项 / 相对方 / 字段 / 分类"
            aria-label="搜索工作记录"
            value={searchText}
            style={{ width: 260 }}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <DatePicker.RangePicker
            value={from && to ? [dayjs(from), dayjs(to)] : null}
            allowClear
            placeholder={['起始日期', '截止日期']}
            aria-label="按创建日期区间筛选"
            style={{ width: 248 }}
            onChange={(range) =>
              setRange(
                range?.[0] ? range[0].format('YYYY-MM-DD') : null,
                range?.[1] ? range[1].format('YYYY-MM-DD') : null,
              )
            }
          />
          {typeChips.length ? (
            <div className="chips" role="group" aria-label="事项类型筛选">
              <button
                type="button"
                className={`chip${subType === null ? ' on' : ''}`}
                aria-pressed={subType === null}
                onClick={() => setSubType(null)}
              >
                全部类型
              </button>
              {typeChips.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`chip${subType === type ? ' on' : ''}`}
                  aria-pressed={subType === type}
                  onClick={() => setSubType(subType === type ? null : type)}
                >
                  {type}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              // 重置状态/风险/类型/日期/搜索，但保留当前选中的分类
              reset()
              if (categoryId) setCategoryId(categoryId)
              setSearchText('')
            }}
          >
            重置筛选
          </Button>
        </div>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <LoadError message="记录加载失败" description={error} onRetry={() => void load()} />
          </div>
        ) : null}

        <div className="card table-wrap">
          <Table<RecordItem>
            rowKey="id"
            columns={columns}
            dataSource={data.items}
            loading={loading}
            scroll={{ x: 940 }}
            onChange={(_, tableFilters) => {
              const nextStatus = (tableFilters.status?.[0] as RecordStatusFilter | undefined) ?? 'all'
              if (nextStatus !== status) setStatus(nextStatus)
              const nextRisk = (tableFilters.risk?.[0] as '高' | '中' | '低' | undefined) ?? 'all'
              if (nextRisk !== risk) setRisk(nextRisk)
            }}
            locale={{
              emptyText: (
                <EmptyState
                  title={
                    q || status !== 'all' || risk !== 'all' || subType || categoryId || from || to
                      ? '没有匹配的记录'
                      : '还没有工作记录'
                  }
                  description={
                    q || status !== 'all' || risk !== 'all' || subType || categoryId
                      ? '试试调整关键字、状态、风险、类型或分类筛选'
                      : '记录每一次合同审查、诉讼、咨询与合规工作'
                  }
                  action={
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                      新建记录
                    </Button>
                  }
                />
              ),
            }}
            pagination={{
              current: data.page || page,
              pageSize: data.pageSize || pageSize,
              total: data.total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextPageSize) => setPage(nextPage, nextPageSize),
            }}
          />
        </div>
      </div>

      <RecordModal
        open={modalOpen}
        record={editing}
        initialCategoryId={categoryId}
        initialKbDocs={initialKb}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
          setInitialKb([])
        }}
        onSaved={onSaved}
      />
    </main>
  )
}
