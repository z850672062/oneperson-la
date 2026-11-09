import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { apiErrorMessage } from '../api/client'
import { deleteField, listFields } from '../api/fields'
import { toastSuccess } from '../api/notify'
import { useCategoriesStore } from '../store/categories'
import { categoryPath, childrenOf, topCategories, totalRecordCount } from '../utils/category'
import { fieldTypeName } from '../utils/field'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import FieldModal from '../components/FieldModal'
import CategoryModal from '../components/CategoryModal'
import type { FieldDef } from '../types'

interface FieldRow {
  key: string
  name: string
  group: string
  type: string
  required: boolean
  note: string
  field?: FieldDef
  locked?: boolean
}

const COMMON_ROWS: FieldRow[] = [
  {
    key: '__status',
    name: '状态',
    group: '公共字段',
    type: '单选',
    required: true,
    note: '在办 / 办结，公共字段不可删除',
    locked: true,
  },
  {
    key: '__dueDate',
    name: '截止日期',
    group: '公共字段',
    type: '日期',
    required: true,
    note: '用于逾期提醒与统计，公共字段不可删除',
    locked: true,
  },
]

export default function Fields() {
  const { modal } = App.useApp()
  const { items, loading: categoriesLoading, error: categoriesError, load } = useCategoriesStore()
  const [selectedId, setSelectedId] = useState<string>('')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldModalOpen, setFieldModalOpen] = useState(false)
  const [editingField, setEditingField] = useState<FieldDef | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!items.length) {
      setSelectedId('')
      return
    }
    if (selectedId && items.some((item) => item.id === selectedId)) return
    const first = topCategories(items)[0]
    setSelectedId(first?.id ?? items[0].id)
  }, [items, selectedId])

  const loadFields = useCallback(async () => {
    if (!selectedId) {
      setFields([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listFields(selectedId)
      setFields(result.filter((field) => !field.isCommon))
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    void loadFields()
  }, [loadFields])

  const groups = useMemo(() => Array.from(new Set(fields.map((field) => field.group))), [fields])

  const selectedCategory = items.find((item) => item.id === selectedId)
  const selectedPath = selectedCategory ? categoryPath(items, selectedCategory.id) : ''

  const rows: FieldRow[] = useMemo(
    () => [
      ...fields.map((field) => ({
        key: field.id,
        name: field.name,
        group: field.group,
        type: fieldTypeName(field.type),
        required: field.required,
        note: field.note ?? '—',
        field,
      })),
      ...COMMON_ROWS,
    ],
    [fields],
  )

  const openCreate = () => {
    setEditingField(null)
    setFieldModalOpen(true)
  }

  const onFieldSaved = () => {
    void loadFields()
    void load(true)
  }

  const removeField = (field: FieldDef) => {
    modal.confirm({
      title: '删除字段',
      content: `确认删除字段「${field.name}」？历史记录中的该字段值将不再展示。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteField(field.id)
          toastSuccess('字段已删除')
          await loadFields()
        } catch {
          /* 统一错误提示 */
        }
      },
    })
  }

  const columns: ColumnsType<FieldRow> = [
    {
      title: '字段名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <span>
          <b>{name}</b>
          {row.locked ? (
            <span className="tag tag-gold" style={{ marginLeft: 8 }}>
              公共
            </span>
          ) : null}
        </span>
      ),
    },
    { title: '分组', dataIndex: 'group', key: 'group', width: 110 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
    {
      title: '必填',
      dataIndex: 'required',
      key: 'required',
      width: 70,
      render: (required: boolean) =>
        required ? <span className="tag tag-amber">必填</span> : <span className="table-muted">选填</span>,
    },
    { title: '说明', dataIndex: 'note', key: 'note', render: (note: string) => <span className="table-muted">{note}</span> },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, row) =>
        row.locked ? (
          <span className="card-note">锁定</span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setEditingField(row.field ?? null)
                setFieldModalOpen(true)
              }}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              danger
              onClick={() => {
                if (row.field) removeField(row.field)
              }}
            >
              删除
            </Button>
          </span>
        ),
    },
  ]

  const tops = topCategories(items)

  return (
    <main>
      <PageHeader
        title="字段管理"
        range={selectedPath ? `${selectedPath} · ${fields.length} 个自定义字段` : '按分类维护字段模板'}
        actions={
          <>
            <Button icon={<SettingOutlined />} onClick={() => setCategoryModalOpen(true)}>
              分类管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!selectedId} onClick={openCreate}>
              新建字段
            </Button>
          </>
        }
      />

      <div className="page-content">
        {categoriesError ? (
          <div style={{ marginBottom: 14 }}>
            <LoadError message="分类模板加载失败" description={categoriesError} onRetry={() => void load(true)} />
          </div>
        ) : null}

        <div className="two-col">
          <div className="list-panel">
            <div className="list-panel-head">
              <span>分类模板</span>
              <Button type="link" size="small" onClick={() => setCategoryModalOpen(true)}>
                管理
              </Button>
            </div>

            {categoriesLoading && !items.length ? (
              <div className="card-note" style={{ padding: 16 }}>
                分类加载中…
              </div>
            ) : null}

            {!categoriesLoading && !tops.length ? (
              <div className="card-note" style={{ padding: 16 }}>
                暂无分类，请先新建分类模板
              </div>
            ) : null}

            {tops.map((top) => (
              <div key={top.id}>
                <button
                  type="button"
                  className={`list-item${selectedId === top.id ? ' on' : ''}`}
                  onClick={() => setSelectedId(top.id)}
                >
                  <span>{top.name}</span>
                  <span className="list-count num">{totalRecordCount(items, top)} 条</span>
                </button>
                {childrenOf(items, top.id).map((child) => (
                  <button
                    type="button"
                    key={child.id}
                    className={`list-item level-2${selectedId === child.id ? ' on' : ''}`}
                    onClick={() => setSelectedId(child.id)}
                  >
                    <span>{child.name}</span>
                    <span className="list-count num">{Number(child.recordCount) || 0} 条</span>
                  </button>
                ))}
              </div>
            ))}

            <button
              type="button"
              className="list-item add-item"
              onClick={() => setCategoryModalOpen(true)}
            >
              ＋ 新建分类模板
            </button>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{selectedCategory ? `${selectedCategory.name} · 字段模板` : '字段模板'}</div>
                <div className="card-note">状态与截止日期为锁定公共字段，其余字段决定记录弹窗的分组与校验。</div>
              </div>
              <Button type="primary" size="small" disabled={!selectedId} onClick={openCreate}>
                新建字段
              </Button>
            </div>

            {error ? (
              <div className="card-body">
                <LoadError message="字段加载失败" description={error} onRetry={() => void loadFields()} />
              </div>
            ) : null}

            {!error ? (
              <Table<FieldRow>
                rowKey="key"
                columns={columns}
                dataSource={rows}
                loading={loading}
                pagination={false}
                locale={{
                  emptyText: (
                    <EmptyState
                      compact
                      title="尚未配置自定义字段"
                      description="新增字段后，新建记录时会按分组动态渲染表单"
                      action={
                        <Button type="primary" size="small" disabled={!selectedId} onClick={openCreate}>
                          新建字段
                        </Button>
                      }
                    />
                  ),
                }}
              />
            ) : null}

            {!loading && !error && !fields.length ? (
              <div className="card-foot">当前仅有两条锁定公共字段，建议按业务补充基础信息 / 过程信息 / 结果信息字段。</div>
            ) : null}
          </div>
        </div>
      </div>

      <FieldModal
        open={fieldModalOpen}
        categoryId={selectedId}
        field={editingField}
        groups={groups}
        onClose={() => {
          setFieldModalOpen(false)
          setEditingField(null)
        }}
        onSaved={onFieldSaved}
      />

      <CategoryModal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} />
    </main>
  )
}
