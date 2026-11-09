import { useEffect, useState } from 'react'
import { Button, Input, Modal, Select } from 'antd'
import { createConnector, updateConnector } from '../api/kb'
import { apiErrorMessage } from '../api/client'
import { toastSuccess } from '../api/notify'
import type { Connector } from '../types'

interface ConnectorModalProps {
  open: boolean
  connector?: Connector | null
  onClose: () => void
  onSaved: () => void
}

const TYPE_OPTIONS = [
  { value: 'obsidian', label: 'Obsidian 本地库' },
  { value: 'folder', label: '本地文件夹（Markdown）' },
  { value: 'ima', label: '腾讯 IMA（P1）' },
]

export default function ConnectorModal({
  open,
  connector,
  onClose,
  onSaved,
}: ConnectorModalProps) {
  const editing = Boolean(connector)
  const [type, setType] = useState('obsidian')
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(connector?.type ?? 'obsidian')
    setName(connector?.name ?? '')
    setPath(connector?.path ?? '')
    setError('')
  }, [open, connector])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写显示名称')
      return
    }
    if (type !== 'ima' && !path.trim()) {
      setError('请填写知识库路径')
      return
    }
    setSaving(true)
    try {
      if (editing && connector) {
        await updateConnector(connector.id, { name: name.trim(), path: path.trim() })
        toastSuccess('连接器配置已保存')
      } else {
        await createConnector({ type, name: name.trim(), path: path.trim() })
        toastSuccess('连接器已添加，请完成连接与索引')
      }
      onSaved()
      onClose()
    } catch (saveError) {
      setError(apiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? '连接器配置' : '添加连接器'}
      width={480}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={() => void handleSave()}>
          {editing ? '保存' : '添加'}
        </Button>,
      ]}
    >
      <div className="record-grid" style={{ gridTemplateColumns: '1fr', marginTop: 8 }}>
        <div className="record-field">
          <label htmlFor="conn-type">
            <b>连接器类型</b>
          </label>
          <Select
            id="conn-type"
            style={{ width: '100%' }}
            value={type}
            options={TYPE_OPTIONS}
            disabled={editing}
            onChange={setType}
          />
        </div>

        <div className="record-field">
          <label htmlFor="conn-name">
            <span className="req">*</span>
            <b>显示名称</b>
          </label>
          <Input
            id="conn-name"
            value={name}
            placeholder="如：工作笔记库"
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
          />
        </div>

        <div className="record-field">
          <label htmlFor="conn-path">
            <b>路径 / 接口地址</b>
          </label>
          <Input
            id="conn-path"
            value={path}
            placeholder="D:\Notes\Legal"
            onChange={(event) => {
              setPath(event.target.value)
              setError('')
            }}
          />
          <div className="field-hint">只读接入不修改原库；索引保存在本地数据库。</div>
        </div>

        {error ? <div className="field-error">{error}</div> : null}

        <p className="card-note">
          腾讯 IMA 依赖其开放接口，P1 阶段提供导出导入降级方案。
        </p>
      </div>
    </Modal>
  )
}
