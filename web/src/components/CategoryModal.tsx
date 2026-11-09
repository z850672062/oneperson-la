import { useEffect, useState } from 'react'
import { App, Button, Input, Modal, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { createCategory, deleteCategory, updateCategory } from '../api/categories'
import { toastError, toastSuccess } from '../api/notify'
import { useCategoriesStore } from '../store/categories'
import { childrenOf, topCategories, totalRecordCount } from '../utils/category'
import type { Category } from '../types'

interface CategoryModalProps {
  open: boolean
  onClose: () => void
}

export default function CategoryModal({ open, onClose }: CategoryModalProps) {
  const { modal } = App.useApp()
  const { items, loading, loaded, load } = useCategoriesStore()
  const [newTopName, setNewTopName] = useState('')
  const [addingParent, setAddingParent] = useState<string | null>(null)
  const [addingName, setAddingName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && !loaded) void load()
  }, [open, loaded, load])

  useEffect(() => {
    if (!open) {
      setNewTopName('')
      setAddingParent(null)
      setAddingName('')
      setEditingId(null)
      setEditingName('')
    }
  }, [open])

  const create = async (name: string, parentId: string | null) => {
    const trimmed = name.trim()
    if (!trimmed) {
      toastError('请输入分类名称')
      return
    }
    setBusy(true)
    try {
      await createCategory({ name: trimmed, parentId, sort: 0 })
      toastSuccess('分类已创建')
      setNewTopName('')
      setAddingParent(null)
      setAddingName('')
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
      content: `确认删除「${category.name}」？分类下若仍有记录或子分类将无法删除。`,
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

  const renderEditor = (category: Category) => (
    <div className="category-edit-row">
      <Input
        aria-label={`修改 ${category.name} 的名称`}
        value={editingName}
        onChange={(event) => setEditingName(event.target.value)}
        onPressEnter={() => void rename(category)}
        autoFocus
      />
      <Button size="small" type="primary" loading={busy} onClick={() => void rename(category)}>
        保存
      </Button>
      <Button size="small" onClick={() => setEditingId(null)}>
        取消
      </Button>
    </div>
  )

  const renderActions = (category: Category, isTop: boolean) => (
    <div className="category-actions">
      {isTop ? (
        <Button
          size="small"
          type="link"
          icon={<PlusOutlined />}
          onClick={() => {
            setAddingParent(category.id)
            setAddingName('')
          }}
        >
          子分类
        </Button>
      ) : null}
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
  )

  const tops = topCategories(items)

  return (
    <Modal
      open={open}
      title="分类管理"
      width={680}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          完成
        </Button>
      }
    >
      <p className="card-note" style={{ margin: '8px 0 14px' }}>
        固定两级分类；删除前需先迁移该分类下的记录。分类变更后，字段模板与记录筛选会同步更新。
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          aria-label="新建一级分类名称"
          placeholder="新建一级分类名称，如：合同审查"
          value={newTopName}
          onChange={(event) => setNewTopName(event.target.value)}
          onPressEnter={() => void create(newTopName, null)}
        />
        <Button
          type="primary"
          loading={busy}
          onClick={() => void create(newTopName, null)}
        >
          新建一级分类
        </Button>
      </div>

      {loading && !items.length ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : null}

      {!loading && !tops.length ? <p className="card-note">暂无分类，请先创建一级分类。</p> : null}

      <div className="category-list">
        {tops.map((top) => (
          <div className="category-block" key={top.id}>
            <div className="category-row">
              {editingId === top.id ? (
                renderEditor(top)
              ) : (
                <>
                  <span className="category-name">{top.name}</span>
                  <span className="category-count num">{totalRecordCount(items, top)} 条</span>
                  {renderActions(top, true)}
                </>
              )}
            </div>

            {childrenOf(items, top.id).map((child) => (
              <div className="category-row level-2" key={child.id}>
                {editingId === child.id ? (
                  renderEditor(child)
                ) : (
                  <>
                    <span className="category-name">└ {child.name}</span>
                    <span className="category-count num">{Number(child.recordCount) || 0} 条</span>
                    {renderActions(child, false)}
                  </>
                )}
              </div>
            ))}

            {addingParent === top.id ? (
              <div className="category-edit-row level-2">
                <Input
                  aria-label={`为 ${top.name} 新建子分类`}
                  placeholder="新建二级分类名称"
                  value={addingName}
                  onChange={(event) => setAddingName(event.target.value)}
                  onPressEnter={() => void create(addingName, top.id)}
                  autoFocus
                />
                <Button
                  size="small"
                  type="primary"
                  loading={busy}
                  onClick={() => void create(addingName, top.id)}
                >
                  添加
                </Button>
                <Button size="small" onClick={() => setAddingParent(null)}>
                  取消
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Modal>
  )
}
