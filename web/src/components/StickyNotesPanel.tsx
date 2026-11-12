import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, DatePicker, Empty, Input, Modal, Popconfirm, Select, Spin } from 'antd'
import { CloseOutlined, DeleteOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { toastError, toastSuccess } from '../api/notify'
import { apiErrorMessage } from '../api/client'
import {
  convertStickyNote,
  createStickyNote,
  deleteStickyNote,
  listStickyNotes,
  revertStickyNote,
  suggestStickyNote,
} from '../api/stickyNotes'
import { useCategoriesStore } from '../store/categories'
import type { StickyNoteItem, StickySuggestion } from '../types'

const OPEN_KEY = 'sticky:open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function persistOpen(value: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, value ? 'true' : 'false')
  } catch {
    /* 隐私模式下忽略 */
  }
}

interface ConfirmForm {
  title: string
  categoryId?: string
  dueDate: string | null
  risk: string
}

interface ConfirmState {
  note: StickyNoteItem
  loading: boolean
  suggestion: StickySuggestion | null
}

export default function StickyNotesPanel() {
  const [open, setOpen] = useState(readOpen)
  const [items, setItems] = useState<StickyNoteItem[]>([])
  const [archived, setArchived] = useState<StickyNoteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [form, setForm] = useState<ConfirmForm>({ title: '', dueDate: null, risk: '中' })
  const [converting, setConverting] = useState(false)

  const categories = useCategoriesStore((state) => state.items)
  const loadCategories = useCategoriesStore((state) => state.load)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [pending, done] = await Promise.all([listStickyNotes(false), listStickyNotes(true)])
      setItems(pending)
      setArchived(done)
    } catch {
      /* 错误已由拦截器提示 */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    persistOpen(open)
    if (open) void reload()
  }, [open, reload])

  useEffect(() => {
    if (open) void loadCategories()
  }, [open, loadCategories])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmState) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, confirmState])

  async function handleAdd() {
    const content = draft.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      const note = await createStickyNote(content)
      setItems((prev) => [note, ...prev])
      setDraft('')
    } catch (error) {
      toastError(apiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteStickyNote(id)
      setItems((prev) => prev.filter((note) => note.id !== id))
    } catch (error) {
      toastError(apiErrorMessage(error))
    }
  }

  async function handleCheck(note: StickyNoteItem) {
    setConfirmState({ note, loading: true, suggestion: null })
    setForm({
      title: note.content,
      categoryId: categories[0]?.id,
      dueDate: null,
      risk: '中',
    })
    try {
      const suggestion = await suggestStickyNote(note.id)
      setForm({
        title: suggestion.title || note.content,
        categoryId: suggestion.categoryId ?? categories[0]?.id,
        dueDate: suggestion.dueDate,
        risk: suggestion.risk || '中',
      })
      setConfirmState({ note, loading: false, suggestion })
    } catch {
      // AI 不可用时降级为手工填写
      setConfirmState({
        note,
        loading: false,
        suggestion: {
          categoryId: categories[0]?.id ?? null,
          categoryName: categories[0]?.name ?? null,
          title: note.content,
          dueDate: null,
          risk: '中',
          degraded: true,
          reason: 'AI 建议不可用，请手动确认分类后保存',
        },
      })
    }
  }

  async function handleConvert() {
    if (!confirmState) return
    const categoryId = form.categoryId
    if (!categoryId) {
      toastError('请选择分类')
      return
    }
    const title = form.title.trim()
    if (!title) {
      toastError('事项名称不能为空')
      return
    }
    setConverting(true)
    try {
      await convertStickyNote(confirmState.note.id, {
        categoryId,
        title,
        dueDate: form.dueDate,
        risk: form.risk,
      })
      toastSuccess('已记入工作记录')
      setConfirmState(null)
      await reload()
    } catch (error) {
      toastError(apiErrorMessage(error))
    } finally {
      setConverting(false)
    }
  }

  async function handleRevert(note: StickyNoteItem) {
    try {
      await revertStickyNote(note.id)
      toastSuccess('已撤销归档')
      await reload()
    } catch (error) {
      toastError(apiErrorMessage(error))
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="sticky-tab"
        aria-label="打开便签"
        onClick={() => setOpen(true)}
      >
        <PushpinOutlined />
        <span>便签</span>
      </button>
    )
  }

  return (
    <>
      <aside className="sticky-panel" aria-label="便签">
        <header className="sticky-head">
          <span className="sticky-title">
            <PushpinOutlined /> 便签
          </span>
          <button
            type="button"
            className="sticky-icon-btn"
            aria-label="收起便签"
            onClick={() => setOpen(false)}
          >
            <CloseOutlined />
          </button>
        </header>

        <div className="sticky-input">
          <Input
            size="small"
            placeholder="记一条，回车保存"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={() => void handleAdd()}
            suffix={
              <Button
                type="text"
                size="small"
                aria-label="新增便签"
                loading={saving}
                disabled={!draft.trim()}
                icon={<PlusOutlined />}
                onClick={() => void handleAdd()}
              />
            }
          />
        </div>

        <div className="sticky-list">
          {loading && !items.length ? (
            <div className="sticky-loading">
              <Spin size="small" />
            </div>
          ) : items.length ? (
            items.map((note) => (
              <div className="sticky-row" key={note.id}>
                <Checkbox
                  checked={false}
                  onChange={() => void handleCheck(note)}
                  aria-label={`完成：${note.content}`}
                />
                <span className="sticky-text" title={note.content}>
                  {note.content}
                </span>
                <Popconfirm
                  title="删除这条便签？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => void handleDelete(note.id)}
                >
                  <button type="button" className="sticky-icon-btn" aria-label="删除便签">
                    <DeleteOutlined />
                  </button>
                </Popconfirm>
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有便签"
              style={{ margin: '24px 0' }}
            />
          )}
        </div>

        <footer className="sticky-foot">
          <button
            type="button"
            className="sticky-archive-toggle"
            onClick={() => setShowArchived((prev) => !prev)}
          >
            已归档（{archived.length}）
          </button>
          {showArchived ? (
            <div className="sticky-archive-list">
              {archived.length ? (
                archived.map((note) => (
                  <div className="sticky-archive-row" key={note.id}>
                    <span className="sticky-text" title={note.content}>
                      {note.content}
                    </span>
                    <button
                      type="button"
                      className="sticky-link"
                      onClick={() => void handleRevert(note)}
                    >
                      撤销
                    </button>
                  </div>
                ))
              ) : (
                <span className="sticky-empty-hint">暂无归档</span>
              )}
            </div>
          ) : null}
        </footer>
      </aside>

      <Modal
        open={Boolean(confirmState)}
        title="记入工作记录"
        okText="确认"
        cancelText="取消"
        confirmLoading={converting}
        onOk={() => void handleConvert()}
        onCancel={() => setConfirmState(null)}
        destroyOnClose
      >
        {confirmState?.loading ? (
          <div className="sticky-modal-loading">
            <Spin size="small" /> <span>AI 正在归类…</span>
          </div>
        ) : (
          <div className="sticky-form">
            {confirmState?.suggestion?.reason ? (
              <p className="sticky-hint">{confirmState.suggestion.reason}</p>
            ) : null}
            <label className="sticky-field">
              <span>事项名称</span>
              <Input
                value={form.title}
                maxLength={200}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="sticky-field">
              <span>分类</span>
              <Select
                value={form.categoryId}
                placeholder="请选择分类"
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                onChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              />
            </label>
            <label className="sticky-field">
              <span>截止日期</span>
              <DatePicker
                value={form.dueDate ? dayjs(form.dueDate) : null}
                style={{ width: '100%' }}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, dueDate: value ? value.format('YYYY-MM-DD') : null }))
                }
              />
            </label>
            <label className="sticky-field">
              <span>风险</span>
              <Select
                value={form.risk}
                options={[
                  { value: '高', label: '高' },
                  { value: '中', label: '中' },
                  { value: '低', label: '低' },
                ]}
                onChange={(value) => setForm((prev) => ({ ...prev, risk: value }))}
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  )
}
