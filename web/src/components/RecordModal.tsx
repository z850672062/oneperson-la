import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { createRecord, updateRecord } from '../api/records'
import { listFields } from '../api/fields'
import { searchKb } from '../api/kb'
import { apiErrorMessage } from '../api/client'
import { toastError, toastSuccess } from '../api/notify'
import { useCategoriesStore } from '../store/categories'
import { childrenOf, categoryPath, topCategories } from '../utils/category'
import { ensureOptions, fieldTypeName } from '../utils/field'
import type {
  FieldDef,
  KbDocRef,
  KbSearchItem,
  RecordItem,
  RecordPayload,
  RecordStatus,
} from '../types'
import EmptyState from './EmptyState'
import LoadError from './LoadError'

interface RecordModalProps {
  open: boolean
  record?: RecordItem | null
  initialCategoryId?: string | null
  initialKbDocs?: KbDocRef[]
  onClose: () => void
  onSaved: () => void
}

type FormValues = Record<string, unknown>
type FormErrors = Record<string, string>

const RISK_OPTIONS = ['高', '中', '低'].map((value) => ({ value, label: value }))
const STATUS_OPTIONS = [
  { value: 'doing', label: '在办' },
  { value: 'done', label: '办结' },
]

function resolveSelection(
  categoryId: string | null | undefined,
  categories: ReturnType<typeof useCategoriesStore.getState>['items'],
): { topId: string; leafId: string } {
  const tops = topCategories(categories)
  const target = categoryId ? categories.find((item) => item.id === categoryId) : undefined
  if (target) {
    if (target.parentId) return { topId: target.parentId, leafId: target.id }
    const children = childrenOf(categories, target.id)
    return { topId: target.id, leafId: children[0]?.id ?? target.id }
  }
  const first = tops[0]
  if (!first) return { topId: '', leafId: '' }
  return { topId: first.id, leafId: childrenOf(categories, first.id)[0]?.id ?? first.id }
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

export default function RecordModal({
  open,
  record,
  initialCategoryId,
  initialKbDocs,
  onClose,
  onSaved,
}: RecordModalProps) {
  const navigate = useNavigate()
  const categories = useCategoriesStore((state) => state.items)
  const loadCategories = useCategoriesStore((state) => state.load)

  const [topId, setTopId] = useState('')
  const [leafId, setLeafId] = useState('')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [values, setValues] = useState<FormValues>({})
  const [name, setName] = useState('')
  const [sub, setSub] = useState('')
  const [risk, setRisk] = useState('中')
  const [status, setStatus] = useState<RecordStatus>('doing')
  const [dueDate, setDueDate] = useState<Dayjs | null>(null)
  const [hours, setHours] = useState<number | null>(1)
  const [kbDocs, setKbDocs] = useState<KbDocRef[]>([])
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState<'draft' | 'submitted' | null>(null)

  const [kbOpen, setKbOpen] = useState(false)
  const [kbQuery, setKbQuery] = useState('')
  const [kbResults, setKbResults] = useState<KbSearchItem[]>([])
  const [kbLoading, setKbLoading] = useState(false)
  const [kbError, setKbError] = useState<string | null>(null)
  const [kbSelection, setKbSelection] = useState<KbDocRef[]>([])

  const pendingInit = useRef(false)

  useEffect(() => {
    if (open) {
      pendingInit.current = true
      void loadCategories()
    }
  }, [open, loadCategories])

  useEffect(() => {
    if (!open || !pendingInit.current || !categories.length) return
    pendingInit.current = false
    const selection = resolveSelection(record?.categoryId ?? initialCategoryId, categories)
    const nextLeaf = record?.categoryId ?? selection.leafId
    setTopId(selection.topId)
    setLeafId(nextLeaf)
    setValues(record?.values ? { ...record.values } : {})
    setName(record?.name ?? '')
    setSub(record?.sub ?? '')
    setRisk(record?.risk || '中')
    setStatus(record?.status ?? 'doing')
    setDueDate(record?.dueDate ? dayjs(record.dueDate) : null)
    setHours(record?.hours != null ? Number(record.hours) : 1)
    setKbDocs(record?.kbDocs ?? initialKbDocs ?? [])
    setErrors({})
    setKbOpen(false)
    setKbQuery('')
    setKbResults([])
    setKbError(null)
  }, [open, categories, record, initialCategoryId, initialKbDocs])

  useEffect(() => {
    if (!open || !leafId) return
    let cancelled = false
    setFieldsLoading(true)
    setFieldsError(null)
    const load = async () => {
      try {
        let items = await listFields(leafId)
        if (!items.length && topId && topId !== leafId) {
          items = await listFields(topId)
        }
        if (!cancelled) setFields(items.filter((field) => !field.isCommon))
      } catch (error) {
        if (!cancelled) setFieldsError(apiErrorMessage(error))
      } finally {
        if (!cancelled) setFieldsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, leafId, topId])

  const tops = topCategories(categories)
  const leaves = topId ? childrenOf(categories, topId) : []

  const groups = useMemo(() => {
    const map = new Map<string, FieldDef[]>()
    fields.forEach((field) => {
      const key = field.group || '基础信息'
      const list = map.get(key) ?? []
      list.push(field)
      map.set(key, list)
    })
    return Array.from(map.entries())
  }, [fields])

  const setFieldValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const onTopChange = (nextTop: string) => {
    const children = childrenOf(categories, nextTop)
    setTopId(nextTop)
    setLeafId(children[0]?.id ?? nextTop)
    setErrors({})
  }

  const openKbPicker = () => {
    setKbSelection(kbDocs)
    setKbQuery('')
    setKbResults([])
    setKbError(null)
    setKbOpen(true)
  }

  const runKbSearch = async () => {
    const query = kbQuery.trim()
    if (!query) {
      setKbError('请输入检索关键字')
      return
    }
    setKbLoading(true)
    setKbError(null)
    try {
      const result = await searchKb(query)
      setKbResults(result.items)
    } catch (error) {
      setKbError(apiErrorMessage(error))
    } finally {
      setKbLoading(false)
    }
  }

  const toggleKb = (doc: KbSearchItem) => {
    setKbSelection((prev) =>
      prev.some((item) => item.id === doc.id)
        ? prev.filter((item) => item.id !== doc.id)
        : [...prev, { id: doc.id, title: doc.title }],
    )
  }

  const handleSave = async (mode: 'draft' | 'submitted') => {
    const nextErrors: FormErrors = {}
    if (!name.trim()) nextErrors.__name = '请填写事项名称'
    if (mode === 'submitted') {
      if (!dueDate) nextErrors.__due = '请选择截止日期'
      fields.forEach((field) => {
        if (field.required && isEmptyValue(values[field.id])) {
          nextErrors[field.id] = '该字段为必填项'
        }
      })
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      toastError('请先补全必填项')
      return
    }
    if (!leafId) {
      toastError('请选择工作分类')
      return
    }

    const payload: RecordPayload = {
      categoryId: leafId,
      name: name.trim(),
      sub: sub.trim(),
      status,
      risk,
      dueDate: dueDate ? dueDate.format('YYYY-MM-DD') : null,
      hours: Number(hours) || 0,
      values,
      kbDocIds: kbDocs.map((doc) => doc.id),
    }

    setSaving(mode)
    try {
      if (record) await updateRecord(record.id, payload)
      else await createRecord(payload)
      toastSuccess(mode === 'draft' ? '已存为草稿' : record ? '记录已更新' : '记录已保存')
      onSaved()
      onClose()
    } catch {
      /* 错误提示由请求层统一处理 */
    } finally {
      setSaving(null)
    }
  }

  const renderField = (field: FieldDef) => {
    const id = `rec-field-${field.id}`
    const value = values[field.id]
    const invalid = Boolean(errors[field.id])
    const describedBy = invalid ? `${id}-error` : undefined

    switch (field.type) {
      case 'textarea':
        return (
          <Input.TextArea
            id={id}
            rows={3}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.note ?? ''}
            aria-required={field.required}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => setFieldValue(field.id, event.target.value)}
          />
        )
      case 'number':
        return (
          <InputNumber
            id={id}
            style={{ width: '100%' }}
            step={0.5}
            value={typeof value === 'number' ? value : null}
            aria-required={field.required}
            aria-invalid={invalid}
            onChange={(next) => setFieldValue(field.id, next)}
          />
        )
      case 'date':
        return (
          <DatePicker
            id={id}
            style={{ width: '100%' }}
            value={value ? dayjs(String(value)) : null}
            aria-required={field.required}
            aria-invalid={invalid}
            onChange={(next) => setFieldValue(field.id, next ? next.format('YYYY-MM-DD') : '')}
          />
        )
      case 'select': {
        const options = ensureOptions(field.options).map((option) => ({ value: option, label: option }))
        return (
          <Select
            id={id}
            allowClear
            value={typeof value === 'string' && value ? value : undefined}
            placeholder={options.length ? '请选择' : '未配置选项'}
            disabled={!options.length}
            options={options}
            aria-required={field.required}
            aria-invalid={invalid}
            onChange={(next) => setFieldValue(field.id, next ?? '')}
          />
        )
      }
      case 'multi': {
        const options = ensureOptions(field.options).map((option) => ({ value: option, label: option }))
        return (
          <Select
            id={id}
            mode="multiple"
            allowClear
            value={Array.isArray(value) ? value.map(String) : []}
            placeholder={options.length ? '可多选' : '未配置选项'}
            disabled={!options.length}
            options={options}
            aria-required={field.required}
            aria-invalid={invalid}
            onChange={(next) => setFieldValue(field.id, next)}
          />
        )
      }
      case 'file':
        return (
          <Input
            id={id}
            value={typeof value === 'string' ? value : ''}
            placeholder="填写附件名称或链接"
            aria-required={field.required}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => setFieldValue(field.id, event.target.value)}
          />
        )
      default:
        return (
          <Input
            id={id}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.note ?? ''}
            aria-required={field.required}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => setFieldValue(field.id, event.target.value)}
          />
        )
    }
  }

  const selectedPath = leafId ? categoryPath(categories, leafId) : ''

  return (
    <>
      <Modal
        open={open}
        title={record ? '编辑记录' : '新建记录'}
        width={780}
        className="record-modal"
        onCancel={onClose}
        maskClosable={false}
        footer={[
          <Button key="draft" onClick={() => void handleSave('draft')} loading={saving === 'draft'}>
            存为草稿
          </Button>,
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => void handleSave('submitted')}
            loading={saving === 'submitted'}
          >
            确定
          </Button>,
        ]}
      >
        {!categories.length ? (
          <Alert
            type="warning"
            showIcon
            message="暂无可用分类"
            description="请先在「字段管理」中创建一级 / 二级分类模板，再录入工作记录。"
            action={
              <Button
                size="small"
                onClick={() => {
                  onClose()
                  navigate('/fields')
                }}
              >
                前往字段管理
              </Button>
            }
          />
        ) : null}

        <section className="record-group">
          <div className="record-group-title">基础信息</div>
          <div className="record-grid">
            <div className="record-field">
              <label htmlFor="rec-category-top">
                <span className="req">*</span>
                <b>工作分类</b>
              </label>
              <Select
                id="rec-category-top"
                style={{ width: '100%' }}
                value={topId || undefined}
                options={tops.map((category) => ({ value: category.id, label: category.name }))}
                onChange={onTopChange}
                placeholder="选择一级分类"
              />
              {leaves.length ? (
                <Select
                  id="rec-category-leaf"
                  style={{ width: '100%', marginTop: 8 }}
                  value={leafId || undefined}
                  options={[
                    { value: topId, label: '（整个一级分类）' },
                    ...leaves.map((category) => ({ value: category.id, label: category.name })),
                  ]}
                  onChange={(next) => {
                    setLeafId(next)
                    setErrors({})
                  }}
                  placeholder="选择二级分类"
                />
              ) : null}
              <div className="field-hint">当前分类：{selectedPath || '—'}</div>
            </div>

            <div className="record-field">
              <label htmlFor="rec-name">
                <span className="req">*</span>
                <b>事项名称</b>
              </label>
              <Input
                id="rec-name"
                value={name}
                placeholder="一句话概括本次工作"
                aria-invalid={Boolean(errors.__name)}
                aria-describedby={errors.__name ? 'rec-name-error' : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setErrors((prev) => {
                    if (!prev.__name) return prev
                    const next = { ...prev }
                    delete next.__name
                    return next
                  })
                }}
              />
              {errors.__name ? (
                <div className="field-error" id="rec-name-error">
                  {errors.__name}
                </div>
              ) : null}
            </div>

            <div className="record-field">
              <label htmlFor="rec-risk">
                <b>风险等级</b>
              </label>
              <Select
                id="rec-risk"
                style={{ width: '100%' }}
                value={risk}
                options={RISK_OPTIONS}
                onChange={setRisk}
              />
            </div>

            <div className="record-field">
              <label htmlFor="rec-sub">
                <b>相对方 / 背景</b>
              </label>
              <Input
                id="rec-sub"
                value={sub}
                placeholder="相对方名称、案号或背景摘要"
                onChange={(event) => setSub(event.target.value)}
              />
            </div>
          </div>
        </section>

        {fieldsLoading ? (
          <div className="record-group" style={{ textAlign: 'center', padding: '20px 0' }}>
            <Spin />
            <div className="card-note" style={{ marginTop: 8 }}>
              正在加载字段模板…
            </div>
          </div>
        ) : null}
        {fieldsError ? <LoadError message="字段模板加载失败" description={fieldsError} /> : null}

        {!fieldsLoading && !fieldsError
          ? groups.map(([group, list]) => (
              <section className="record-group" key={group}>
                <div className="record-group-title">{group}</div>
                <div className="record-grid">
                  {list.map((field) => (
                    <div
                      className={`record-field${
                        field.type === 'textarea' || field.type === 'file' ? ' wide' : ''
                      }`}
                      key={field.id}
                    >
                      <label htmlFor={`rec-field-${field.id}`}>
                        {field.required ? <span className="req">*</span> : null}
                        <b>{field.name}</b>
                        <span className="field-hint" style={{ marginLeft: 6 }}>
                          {fieldTypeName(field.type)}
                        </span>
                      </label>
                      {renderField(field)}
                      {field.note ? <div className="field-hint">{field.note}</div> : null}
                      {errors[field.id] ? (
                        <div className="field-error" id={`rec-field-${field.id}-error`}>
                          {errors[field.id]}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))
          : null}

        <section className="record-group">
          <div className="record-group-title">公共字段</div>
          <div className="record-grid">
            <div className="record-field">
              <label htmlFor="rec-status">
                <span className="req">*</span>
                <b>状态</b>
              </label>
              <Select
                id="rec-status"
                style={{ width: '100%' }}
                value={status}
                options={STATUS_OPTIONS}
                onChange={(next) => setStatus(next as RecordStatus)}
              />
            </div>
            <div className="record-field">
              <label htmlFor="rec-due">
                <span className="req">*</span>
                <b>截止日期</b>
              </label>
              <DatePicker
                id="rec-due"
                style={{ width: '100%' }}
                value={dueDate}
                format="YYYY-MM-DD"
                aria-invalid={Boolean(errors.__due)}
                aria-describedby={errors.__due ? 'rec-due-error' : undefined}
                onChange={(next) => {
                  setDueDate(next)
                  setErrors((prev) => {
                    if (!prev.__due) return prev
                    const nextErrors = { ...prev }
                    delete nextErrors.__due
                    return nextErrors
                  })
                }}
              />
              {errors.__due ? (
                <div className="field-error" id="rec-due-error">
                  {errors.__due}
                </div>
              ) : null}
            </div>
            <div className="record-field">
              <label htmlFor="rec-hours">
                <b>耗时（小时）</b>
              </label>
              <InputNumber
                id="rec-hours"
                style={{ width: '100%' }}
                min={0}
                step={0.5}
                precision={1}
                value={hours}
                onChange={setHours}
              />
            </div>
          </div>
        </section>

        <section className="record-group">
          <div className="record-group-title">知识库关联</div>
          <div className="kb-chips">
            {kbDocs.map((doc) => (
              <button
                type="button"
                className="chip on"
                key={doc.id}
                onClick={() => setKbDocs((prev) => prev.filter((item) => item.id !== doc.id))}
              >
                {doc.title.length > 16 ? `${doc.title.slice(0, 16)}…` : doc.title} ✕
              </button>
            ))}
            <button type="button" className="chip" onClick={openKbPicker}>
              ＋ 检索添加
            </button>
          </div>
        </section>
      </Modal>

      <Modal
        open={kbOpen}
        title="从知识库选择条目"
        width={560}
        onCancel={() => setKbOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setKbOpen(false)}>
            返回
          </Button>,
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              setKbDocs(kbSelection)
              setKbOpen(false)
            }}
          >
            加入关联
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
          <Input
            value={kbQuery}
            placeholder="输入关键字过滤，如：竞业限制"
            aria-label="检索知识库条目"
            onChange={(event) => setKbQuery(event.target.value)}
            onPressEnter={() => void runKbSearch()}
          />
          <Button icon={<SearchOutlined />} onClick={() => void runKbSearch()} loading={kbLoading}>
            检索
          </Button>
        </div>

        {kbSelection.length ? (
          <div className="kb-chips" style={{ marginBottom: 10 }}>
            {kbSelection.map((doc) => (
              <button
                type="button"
                className="chip on"
                key={doc.id}
                onClick={() => setKbSelection((prev) => prev.filter((item) => item.id !== doc.id))}
              >
                {doc.title.length > 14 ? `${doc.title.slice(0, 14)}…` : doc.title} ✕
              </button>
            ))}
          </div>
        ) : null}

        {kbError ? <Alert type="error" showIcon message={kbError} style={{ marginBottom: 10 }} /> : null}

        {kbLoading ? (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : kbResults.length ? (
          <div className="kb-pick-list">
            {kbResults.map((doc) => (
              <label className="kb-pick-row" key={doc.id}>
                <Checkbox
                  checked={kbSelection.some((item) => item.id === doc.id)}
                  onChange={() => toggleKb(doc)}
                />
                <span>
                  <span className="kb-title">{doc.title}</span>
                  <span className="kb-path">{doc.path}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="尚未检索"
            description="输入关键字后回车，从已连接的知识库中查找可引用的条目"
          />
        )}
      </Modal>
    </>
  )
}
