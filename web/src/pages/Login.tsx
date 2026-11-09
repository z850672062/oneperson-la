import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/auth'
import { apiErrorMessage } from '../api/client'

interface LoginForm {
  username: string
  password: string
}

export default function Login() {
  const status = useAuthStore((state) => state.status)
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from || '/dashboard'

  if (status === 'authed') {
    return <Navigate to={from} replace />
  }

  const handleFinish = async (values: LoginForm) => {
    setSubmitting(true)
    setError('')
    try {
      await login(values.username.trim(), values.password)
      navigate(from, { replace: true })
    } catch (loginError) {
      setError(apiErrorMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-chip" aria-hidden="true">
            法
          </div>
          <div>
            <h1 className="login-title" id="login-title">
              法务工作台
            </h1>
            <div className="login-sub">ONEPERSON · LEGAL DESK</div>
          </div>
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            message="登录失败"
            description={error}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Form<LoginForm>
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void handleFinish(values)}
          disabled={submitting}
        >
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              size="large"
              autoComplete="username"
              prefix={<UserOutlined />}
              placeholder="请输入账号"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <p className="login-hint">单机本地部署，账号由部署时初始化。登录状态保持 15 分钟并自动续期。</p>
      </section>
    </main>
  )
}
