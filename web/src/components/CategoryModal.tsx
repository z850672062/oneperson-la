import { useEffect, useState } from 'react'
import { App, Button, Input, Modal, Spin } from 'antd'
import { createCategory, deleteCategory, updateCategory } from '../api/categories'
import { toastError, toastSuccess } from '../api/notify'
import { useCategoriesStore } from '../store/categories'
import { sortedCategories } from '../utils/category'
import type { Category } from '../types'

interface CategoryModalProps {
  open: boolean
  onClose: () => void
}

export default function CategoryModal({ open, onClose }: CategoryModalProps) {
  const { modal } = App.useApp()
  const { items, loading, loaded, load } = useCategoriesStore()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && !loaded) void load()
  }, [open, loaded, load])

  useEffect(() => {
    if (!open) {
      setNewName('')
      setEditingId(null)
      setEditingName('')
    }
  }, [open])

  const create = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      toastError('请输入分类名称')
      return
    }
    setBusy(true)
    try {
      await createCategory({ name: trimmed })
      toastSuccess('分类已创建')
      setNewName('')
      await load(true)
    } catch {
      /* 错误提示由请求层统一处理 */
    } finally {
      setBusy(false)
    }
  }

  const rename = async (category: Category) => {
    const trimmed = editingName.trim()
    if (!trimmed) {
      toastError('请输入分类名称')
      return
    }
    setBusy(true)
    try {
      await updateCategory(category.id, { name: trimmed })
      toastSuccess('分类已更新')
      setEditingId(null)
      setEditingName('')
      await load(true)
    } catch {
      /* 统一错误提示 */
    } finally {
      setBusy(false)
    }
  }

  const remove = (category: Category) => {
    modal.confirm({
      title: '删除分类',
      content: `确认删除「${category.name}」？分类下若仍有记录将无法删除。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCategory(category.id)
          toastSuccess('分类已删除')
          await load(true)
        } catch {
          /* 409 CATEGORY_NOT_EMPTY 由请求层提示 */
        }
      },
    })
  }

  const categories = sortedCategories(items)

  return (
    <Modal
      open={open}
      title="分类管理"
      width={620}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          完成
        </Button>
      }
    >
      <p className="card-note" style={{ margin: '8px 0 14px' }}>
        一级分类统一管理；事项类型（如商标注册、模板合同）在记录中按分类选择。删除前需先移除该分类下的记录。
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          aria-label="新建分类名称"
          placeholder="新建分类名称，如：知识产权"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onPressEnter={() => void create()}
        />
        <Button type="primary" loading={busy} onClick={() => void create()}>
          新建分类
        </Button>
      </div>

      {loading && !items.length ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : null}

      {!loading && !categories.length ? <p className="card-note">暂无分类，请先创建分类。</p> : null}

      <div className="category-list">
        {categories.map((category) => (
          <div className="category-block" key={category.id}>
            <div className="category-row">
              {editingId === category.id ? (
                <div className="category-edit-row">
                  <Input
                    aria-label={`修改 ${category.name} 的名称`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onPressEnter={() => void rename(category)}
                    autoFocus
                  />
                  <Button
                    size="small"
                    type="primary"
                    loading={busy}
                    onClick={() => void rename(category)}
                  >
                    保存
                  </Button>
                  <Button size="small" onClick={() => setEditingId(null)}>
                    取消
                  </Button>
                </div>
              ) : (
                <>
                  <span className="category-name">{category.name}</span>
                  <span className="category-count num">{Number(category.recordCount) || 0} 条</span>
                  <div className="category-actions">
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        setEditingId(category.id)
                        setEditingName(category.name)
                      }}
                    >
                      改名
                    </Button>
                    <Button size="small" type="link" danger onClick={() => remove(category)}>
                      删除
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
