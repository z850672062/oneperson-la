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
  { value: 'ima', label: '腾讯 IMA 知识库' },
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
  const [clientId, setClientId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(connector?.type ?? 'obsidian')
    setName(connector?.name ?? '')
    setPath(connector?.path ?? '')
    setClientId('')
    setApiKey('')
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
    const hasStoredCredential = Boolean(connector?.hasCredential)
    if (type === 'ima') {
      if (!editing && (!clientId.trim() || !apiKey.trim())) {
        setError('请填写 IMA 的 Client ID 与 API Key')
        return
      }
      if (editing && !hasStoredCredential && (!clientId.trim() || !apiKey.trim())) {
        setError('请填写 IMA 的 Client ID 与 API Key')
        return
      }
      if ((clientId.trim() && !apiKey.trim()) || (!clientId.trim() && apiKey.trim())) {
        setError('Client ID 与 API Key 需要同时填写')
        return
      }
    }
    setSaving(true)
    try {
      if (editing && connector) {
        await updateConnector(connector.id, {
          name: name.trim(),
          ...(type !== 'ima' ? { path: path.trim() } : {}),
          ...(clientId.trim() && apiKey.trim()
            ? { clientId: clientId.trim(), apiKey: apiKey.trim() }
            : {}),
        })
        toastSuccess(
          clientId.trim() && apiKey.trim()
            ? '凭据已保存，请点击「尝试连接」验证'
            : '连接器配置已保存',
        )
      } else {
        await createConnector({
          type,
          name: name.trim(),
          path: type === 'ima' ? '' : path.trim(),
          ...(type === 'ima'
            ? { clientId: clientId.trim(), apiKey: apiKey.trim() }
            : {}),
        })
        toastSuccess(
          type === 'ima'
            ? 'IMA 连接器已添加，请点击「尝试连接」验证'
            : '连接器已添加，请完成连接与索引',
        )
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

        {type === 'ima' ? (
          <>
            <div className="record-field">
              <label htmlFor="conn-client-id">
                <b>Client ID</b>
              </label>
              <Input
                id="conn-client-id"
                value={clientId}
                autoComplete="off"
                placeholder={
                  editing && connector?.hasCredential ? '已保存，留空则保持不变' : 'IMA 开放接口 Client ID'
                }
                onChange={(event) => {
                  setClientId(event.target.value)
                  setError('')
                }}
              />
            </div>
            <div className="record-field">
              <label htmlFor="conn-api-key">
                <b>API Key</b>
              </label>
              <Input.Password
                id="conn-api-key"
                value={apiKey}
                autoComplete="new-password"
                placeholder={
                  editing && connector?.hasCredential ? '已保存，留空则保持不变' : 'IMA 开放接口 API Key'
                }
                onChange={(event) => {
                  setApiKey(event.target.value)
                  setError('')
                }}
              />
              <div className="field-hint">
                凭据加密存储；保存后点击「尝试连接」自动获取可访问的知识库。
              </div>
            </div>
          </>
        ) : (
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
        )}

        {error ? <div className="field-error">{error}</div> : null}

        <p className="card-note">
          {type === 'ima'
            ? '腾讯 IMA 通过开放接口只读检索知识库，对话与检索结果会标注「IMA」来源。'
            : '本地知识库只读接入，支持 Markdown 增量索引。'}
        </p>
      </div>
    </Modal>
  )
}
