import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { appTheme } from './theme'
import { useAuthStore } from './store/auth'
import { bindMessageApi } from './api/notify'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Records from './pages/Records'
import Fields from './pages/Fields'
import Knowledge from './pages/Knowledge'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import StickyWindow from './pages/StickyWindow'

function MessageBridge() {
  const { message } = AntdApp.useApp()
  useEffect(() => {
    bindMessageApi(message)
  }, [message])
  return null
}

function FullPageLoading() {
  return (
    <div className="full-page-loading" role="status" aria-live="polite">
      <Spin size="large" />
      <span>正在恢复会话…</span>
    </div>
  )
}

function RequireAuth() {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === 'idle' || status === 'checking') return <FullPageLoading />
  if (status !== 'authed') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }
  return <Outlet />
}

export default function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <ConfigProvider theme={appTheme} locale={zhCN}>
      <AntdApp>
        <MessageBridge />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/sticky" element={<StickyWindow />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/records" element={<Records />} />
                <Route path="/fields" element={<Fields />} />
                <Route path="/knowledge" element={<Knowledge />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
