import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
} from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  LaptopOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { changePassword } from '../api/auth'
import { apiErrorMessage } from '../api/client'
import { clearMemory } from '../api/memory'
import {
  createModel,
  deleteAllData,
  deleteModel,
  exportUserData,
  getSettings,
  listModels,
  testModel,
  updateSettings,
} from '../api/settings'
import { toastError, toastSuccess } from '../api/notify'
import { useAuthStore } from '../store/auth'
import { downloadBlob, todayStamp } from '../utils/download'
import PageHeader from '../components/PageHeader'
import LoadError from '../components/LoadError'
import MarkdownDoc from '../components/MarkdownDoc'
import type { LlmModel, Settings as SettingsData } from '../types'

const POLICY_CONTENT: Record<'privacy' | 'terms' | 'third', string> = {
  privacy: `# 隐私政策

一人法务工作台为**本地部署**的单人工具，业务数据默认存储在本机或你指定的数据库中。

- 工作记录、字段模板、报表与会话内容仅用于本机功能展示与检索。
- 启用「脱敏」后，发送给模型的文本会先遮蔽身份证号、手机号、案号等敏感信息。
- 知识库接入为只读方式，不会修改原始 Markdown 文件。
- 你可以随时在「设置中心 → 数据与缓存」导出或删除全部数据。`,
  terms: `# 用户协议

- 本系统为个人效率工具，不构成法律意见，正式对外文书需由你本人复核。
- 请勿在未脱敏的情况下向第三方模型提交涉密、涉个人信息内容。
- 你需自行负责接入知识库的版权与访问权限。
- 因模型生成内容产生的风险由使用者承担，请在关键场景进行人工校验。`,
  third: `# 第三方服务清单

| 服务 | 用途 | 数据范围 |
| --- | --- | --- |
| 大模型服务商 | 对话生成、要点提炼 | 经脱敏的对话文本 |
| 知识库连接器 | 本地 Markdown 检索 | 仅本机路径与索引 |

默认不启用任何云端同步；具体模型厂商以「模型配置」中启用的为准。`,
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirm: string
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<PasswordForm>()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setError('')
    }
  }, [open, form])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      if (values.newPassword !== values.confirm) {
        setError('两次输入的新密码不一致')
        return
      }
      setSubmitting(true)
      setError('')
      await changePassword(values.currentPassword, values.newPassword)
      toastSuccess('密码已更新')
      onClose()
    } catch (submitError) {
      if (submitError && typeof submitError === 'object' && 'errorFields' in submitError) return
      setError(apiErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="修改密码"
      width={440}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          label="当前密码"
          name="currentPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '新密码至少 8 位' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirm"
          rules={[{ required: true, message: '请再次输入新密码' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

interface ModelModalProps {
  open: boolean
  onClose: () => void
  onChanged: () => void
}

const VENDOR_OPTIONS = [
  { value: 'DeepSeek', label: 'DeepSeek' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'Qwen', label: '通义千问' },
  { value: 'Claude', label: 'Claude' },
  { value: 'Ollama', label: 'Ollama（本地）' },
]

function ModelModal({ open, onClose, onChanged }: ModelModalProps) {
  const { modal } = App.useApp()
  const [models, setModels] = useState<LlmModel[]>([])
  const [vendor, setVendor] = useState('DeepSeek')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setModels(await listModels())
    } catch {
      /* 统一错误提示 */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setError('')
      void load()
    }
  }, [open])

  const addModel = async () => {
    if (!model.trim()) {
      setError('请填写模型名称')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createModel({
        vendor,
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
      })
      toastSuccess('模型已添加')
      setModel('')
      setApiKey('')
      await load()
      onChanged()
    } catch (addError) {
      setError(apiErrorMessage(addError))
    } finally {
      setBusy(false)
    }
  }

  const runTest = async (item: LlmModel) => {
    setTestingId(item.id)
    try {
      const result = await testModel(item.id)
      setTestResults((prev) => ({ ...prev, [item.id]: result }))
      if (result.ok) toastSuccess('连通性测试通过')
      else toastError(result.message || '连通性测试失败')
    } catch {
      /* 统一错误提示 */
    } finally {
      setTestingId(null)
    }
  }

  const setDefault = async (item: LlmModel) => {
    try {
      await updateSettings({ defaultModel: item.model })
      toastSuccess('已设为默认模型')
      onChanged()
    } catch {
      /* 统一错误提示 */
    }
  }

  const remove = (item: LlmModel) => {
    modal.confirm({
      title: '删除模型',
      content: `确认删除 ${item.vendor} · ${item.model}？已保存的 Key 将一并移除。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteModel(item.id)
          toastSuccess('模型已移除')
          await load()
          onChanged()
        } catch {
          /* 统一错误提示 */
        }
      },
    })
  }

  return (
    <Modal
      open={open}
      title="模型配置"
      width={620}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

      <div className="record-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="record-field">
          <label htmlFor="model-vendor">
            <b>厂商</b>
          </label>
          <Select
            id="model-vendor"
            style={{ width: '100%' }}
            value={vendor}
            options={VENDOR_OPTIONS}
            onChange={setVendor}
          />
        </div>
        <div className="record-field">
          <label htmlFor="model-name">
            <span className="req">*</span>
            <b>模型名称</b>
          </label>
          <Input
            id="model-name"
            value={model}
            placeholder="如：deepseek-chat"
            onChange={(event) => {
              setModel(event.target.value)
              setError('')
            }}
          />
        </div>
        <div className="record-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="model-key">
            <b>API Key</b>
          </label>
          <Input.Password
            id="model-key"
            value={apiKey}
            placeholder="仅提交一次，保存在后端，不回显"
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <div className="field-hint">Ollama 本地模型可留空；其他厂商需填写有效 Key。</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0 4px' }}>
        <Button type="primary" loading={busy} onClick={() => void addModel()}>
          添加模型
        </Button>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="card-head">
          <span className="card-title">已配置模型</span>
          <span className="card-note">{loading ? '加载中…' : `${models.length} 个`}</span>
        </div>
        <div className="card-body">
          {models.length ? (
            models.map((item) => (
              <div className="model-row" key={item.id}>
                <span style={{ flex: 1 }}>
                  <b>{item.vendor}</b> · {item.model}
                  {testResults[item.id] ? (
                    <span
                      className="field-hint"
                      style={{ color: testResults[item.id].ok ? 'var(--green)' : 'var(--red)' }}
                    >
                      {testResults[item.id].ok ? ' 连通正常' : ` ${testResults[item.id].message}`}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="small"
                  loading={testingId === item.id}
                  onClick={() => void runTest(item)}
                >
                  测试
                </Button>
                <Button size="small" onClick={() => void setDefault(item)}>
                  设为默认
                </Button>
                <Button size="small" danger onClick={() => remove(item)}>
                  删除
                </Button>
              </div>
            ))
          ) : (
            <p className="card-note">尚未配置模型。添加后可在法务对话中选择。</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [policy, setPolicy] = useState<'privacy' | 'terms' | 'third' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [clearing, setClearing] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setSettings(await getSettings())
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const patchSettings = async (payload: Partial<SettingsData>) => {
    const previous = settings
    setSettings((prev) => (prev ? { ...prev, ...payload } : prev))
    try {
      const next = await updateSettings(payload)
      setSettings(next)
    } catch {
      setSettings(previous)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exportUserData()
      downloadBlob(blob, `法务工作台数据导出_${todayStamp()}.json`)
      toastSuccess('数据导出已开始')
    } catch {
      /* 统一错误提示 */
    } finally {
      setExporting(false)
    }
  }

  const handleClearMemory = () => {
    modal.confirm({
      title: '清空记忆画像',
      content: '清空后 AI 将不再参考历史偏好，确认继续？',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setClearing(true)
        try {
          await clearMemory()
          toastSuccess('记忆画像已清空')
        } catch {
          /* 统一错误提示 */
        } finally {
          setClearing(false)
        }
      },
    })
  }

  const handleDeleteAll = async () => {
    if (deleteText.trim() !== '删除') {
      toastError('请输入「删除」以确认')
      return
    }
    setDeleting(true)
    try {
      await deleteAllData()
      toastSuccess('全部业务数据已删除')
      setDeleteOpen(false)
      setDeleteText('')
    } catch {
      /* 统一错误提示 */
    } finally {
      setDeleting(false)
    }
  }

  const handleLogout = () => {
    modal.confirm({
      title: '退出登录',
      content: '退出后需要重新输入账号密码，确认继续？',
      okText: '退出',
      cancelText: '取消',
      onOk: async () => {
        await logout()
        navigate('/login', { replace: true })
      },
    })
  }

  const displayName = user?.name || user?.username || '当前账号'

  return (
    <main>
      <PageHeader title="设置中心" description="账号安全、脱敏策略、模型与数据管理" />

      <div className="page-content">
        {error ? (
          <div style={{ marginBottom: 14 }}>
            <LoadError message="设置加载失败" description={error} onRetry={() => void load()} />
          </div>
        ) : null}

        {loading && !settings ? (
          <div className="card">
            <div className="card-body">
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          </div>
        ) : null}

        {settings ? (
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <span className="card-title">账号与安全</span>
                <span className="card-note">单机账号 · 15 分钟自动续期</span>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>{displayName}</b>
                  <span>{user?.email || user?.username || '本地账号'}</span>
                </div>
                <span className="tag tag-green">已登录</span>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>登录密码</b>
                  <span>建议定期更换，至少 8 位</span>
                </div>
                <Button onClick={() => setPasswordOpen(true)}>修改密码</Button>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>登录设备</b>
                  <span>查看当前浏览器与终端信息</span>
                </div>
                <Button icon={<LaptopOutlined />} onClick={() => setDevicesOpen(true)}>
                  管理设备
                </Button>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>退出登录</b>
                  <span>清除本机会话与访问令牌</span>
                </div>
                <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
                  退出
                </Button>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <span className="card-title">脱敏与模型</span>
                <span className="card-note">控制对外发送与模型调用</span>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>对外输出脱敏</b>
                  <span>遮蔽身份证号、手机号、案号等敏感信息</span>
                </div>
                <Switch
                  aria-label="对外输出脱敏"
                  checked={settings.maskSensitive}
                  onChange={(checked) => void patchSettings({ maskSensitive: checked })}
                />
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>模型调用前脱敏</b>
                  <span>发送给大模型的文本先做敏感信息替换</span>
                </div>
                <Switch
                  aria-label="模型调用前脱敏"
                  checked={settings.maskLlm}
                  onChange={(checked) => void patchSettings({ maskLlm: checked })}
                />
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>默认模型</b>
                  <span>{settings.defaultModel || '未配置，请在模型配置中添加'}</span>
                </div>
                <Button type="primary" onClick={() => setModelOpen(true)}>
                  模型配置
                </Button>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <span className="card-title">隐私与协议</span>
                <span className="card-note">本地部署 · 默认不上传云端</span>
              </div>

              {(
                [
                  ['privacy', '隐私政策', '数据存储、脱敏与删除方式'],
                  ['terms', '用户协议', '使用边界与人工复核责任'],
                  ['third', '第三方清单', '已启用的外部服务与数据范围'],
                ] as const
              ).map(([key, title, note]) => (
                <div className="set-row" key={key}>
                  <div className="set-label">
                    <b>{title}</b>
                    <span>{note}</span>
                  </div>
                  <Button icon={<SafetyCertificateOutlined />} onClick={() => setPolicy(key)}>
                    查看
                  </Button>
                </div>
              ))}
            </section>

            <section className="card">
              <div className="card-head">
                <span className="card-title">数据与缓存</span>
                <span className="card-note">导出、清空或彻底删除</span>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>导出我的数据</b>
                  <span>以 JSON 下载工作记录、字段、报表与会话</span>
                </div>
                <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void handleExport()}>
                  导出
                </Button>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b>清除记忆画像</b>
                  <span>删除 AI 对工作偏好的长期记忆</span>
                </div>
                <Button loading={clearing} onClick={handleClearMemory}>
                  清除
                </Button>
              </div>

              <div className="set-row">
                <div className="set-label">
                  <b className="danger">删除全部数据</b>
                  <span>不可恢复，需要二次输入确认</span>
                </div>
                <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
                  删除全部数据
                </Button>
              </div>
            </section>

            <p className="card-note" style={{ textAlign: 'center' }}>
              OnePerson_LA · MVP v0.4 · 本地部署
            </p>
          </div>
        ) : null}
      </div>

      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      <Modal
        open={devicesOpen}
        title="登录设备"
        width={520}
        onCancel={() => setDevicesOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDevicesOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Descriptions column={1} size="small" bordered style={{ marginTop: 8 }}>
          <Descriptions.Item label="当前设备">本机浏览器</Descriptions.Item>
          <Descriptions.Item label="操作系统">{navigator.platform || '未知'}</Descriptions.Item>
          <Descriptions.Item label="浏览器标识">{navigator.userAgent}</Descriptions.Item>
          <Descriptions.Item label="登录账号">{user?.username || '—'}</Descriptions.Item>
        </Descriptions>
        <p className="card-note" style={{ marginTop: 12 }}>
          后端未提供多设备列表接口，此处展示当前会话所在浏览器。退出登录会清除本机令牌。
        </p>
      </Modal>

      <ModelModal
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        onChanged={() => void load()}
      />

      <Modal
        open={policy !== null}
        title={
          policy === 'privacy' ? '隐私政策' : policy === 'terms' ? '用户协议' : '第三方服务清单'
        }
        width={700}
        onCancel={() => setPolicy(null)}
        footer={[
          <Button key="close" onClick={() => setPolicy(null)}>
            关闭
          </Button>,
        ]}
      >
        <div className="report-preview">
          {policy ? <MarkdownDoc content={POLICY_CONTENT[policy]} /> : null}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title="删除全部数据"
        width={480}
        onCancel={() => {
          setDeleteOpen(false)
          setDeleteText('')
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDeleteOpen(false)
              setDeleteText('')
            }}
          >
            取消
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deleting}
            disabled={deleteText.trim() !== '删除'}
            onClick={() => void handleDeleteAll()}
          >
            确认删除
          </Button>,
        ]}
      >
        <Alert
          type="error"
          showIcon
          message="此操作不可恢复"
          description="将删除全部工作记录、分类、字段、报表、会话、知识库索引与记忆画像。"
          style={{ marginBottom: 14 }}
        />
        <label htmlFor="delete-confirm" className="record-label">
          <b>请输入「删除」以确认</b>
        </label>
        <Input
          id="delete-confirm"
          value={deleteText}
          placeholder="删除"
          onChange={(event) => setDeleteText(event.target.value)}
        />
      </Modal>
    </main>
  )
}
