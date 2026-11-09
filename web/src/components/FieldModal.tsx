import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Select } from 'antd'
import { createField, updateField } from '../api/fields'
import { toastSuccess } from '../api/notify'
import { FIELD_TYPE_NAMES, ensureOptions } from '../utils/field'
import type { FieldDef, FieldType } from '../types'

interface FieldModalProps {
  open: boolean
  categoryId: string
  field?: FieldDef | null
  groups: string[]
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_GROUPS = ['基础信息', '过程信息', '结果信息']
const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_NAMES) as FieldType[]).map((type) => ({
  value: type,
  label: FIELD_TYPE_NAMES[type],
}))

export default function FieldModal({
  open,
  categoryId,
  field,
  groups,
  onClose,
  onSaved,
}: FieldModalProps) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState(DEFAULT_GROUPS[0])
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [note, setNote] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(field?.name ?? '')
    setGroup(field?.group || DEFAULT_GROUPS[0])
    setType(field?.type ?? 'text')
    setRequired(Boolean(field?.required))
    setNote(field?.note ?? '')
    setOptionsText(ensureOptions(field?.options).join('\n'))
    setError('')
  }, [open, field])

  const groupOptions = useMemo(
    () => Array.from(new Set([...DEFAULT_GROUPS, ...groups])).map((item) => ({ value: item, label: item })),
    [groups],
  )

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写字段名称')
      return
    }
    if (!categoryId) {
      setError('请先选择分类模板')
      return
    }
    const isChoice = type === 'select' || type === 'multi'
    const options = isChoice
      ? optionsText
          .split(/[,，\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : null

    setSaving(true)
    try {
      const payload = {
        categoryId,
        name: name.trim(),
        group,
        type,
        required,
        options,
        note: note.trim() || null,
        sort: field?.sort ?? 0,
      }
      if (field) await updateField(field.id, payload)
      else await createField(payload)
      toastSuccess(field ? '字段已更新' : '字段已创建')
      onSaved()
      onClose()
    } catch {
      /* 统一错误提示 */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={field ? '编辑字段' : '新建字段'}
      width={480}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={() => void handleSave()}>
          {field ? '保存' : '创建'}
        </Button>,
      ]}
    >
      <div className="record-grid" style={{ gridTemplateColumns: '1fr', marginTop: 8 }}>
        <div className="record-field">
          <label htmlFor="field-name">
            <span className="req">*</span>
            <b>字段名称</b>
          </label>
          <Input
            id="field-name"
            value={name}
            placeholder="如：审查意见与结论"
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
          />
          {error ? <div className="field-error">{error}</div> : null}
        </div>

        <div className="record-field">
          <label htmlFor="field-group">
            <b>所属分组</b>
          </label>
          <Select
            id="field-group"
            style={{ width: '100%' }}
            value={group}
            options={groupOptions}
            onChange={setGroup}
          />
        </div>

        <div className="record-field">
          <label htmlFor="field-type">
            <b>字段类型</b>
          </label>
          <Select
            id="field-type"
            style={{ width: '100%' }}
            value={type}
            options={TYPE_OPTIONS}
            disabled={Boolean(field)}
            onChange={(next) => setType(next as FieldType)}
          />
          {field ? <div className="field-hint">已有数据 / 已存在的字段仅允许改名与追加选项，类型锁定。</div> : null}
        </div>

        {type === 'select' || type === 'multi' ? (
          <div className="record-field">
            <label htmlFor="field-options">
              <b>选项</b>
            </label>
            <Input.TextArea
              id="field-options"
              rows={3}
              value={optionsText}
              placeholder="每行一个选项，也可用逗号分隔"
              onChange={(event) => setOptionsText(event.target.value)}
            />
          </div>
        ) : null}

        <div className="record-field">
          <label htmlFor="field-required">
            <b>是否必填</b>
          </label>
          <Select
            id="field-required"
            style={{ width: '100%' }}
            value={required ? '1' : '0'}
            options={[
              { value: '0', label: '否' },
              { value: '1', label: '是' },
            ]}
            onChange={(next) => setRequired(next === '1')}
          />
        </div>

        <div className="record-field">
          <label htmlFor="field-note">
            <b>说明 / 提示</b>
          </label>
          <Input
            id="field-note"
            value={note}
            placeholder="用于记录弹窗内的辅助提示"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
