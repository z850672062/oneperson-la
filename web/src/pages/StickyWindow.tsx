import { useEffect } from 'react'
import { Spin } from 'antd'
import StickyNotesPanel from '../components/StickyNotesPanel'
import { useAuthStore } from '../store/auth'
import { tauriInvoke } from '../utils/tauri'

/** 独立桌面便签窗口：无侧边栏，仅渲染便签本体 */
export default function StickyWindow() {
  const status = useAuthStore((state) => state.status)
  const refreshQuiet = useAuthStore((state) => state.refreshQuiet)

  useEffect(() => {
    document.documentElement.classList.add('sticky-window-html')
    document.body.classList.add('sticky-window-body')
    return () => {
      document.documentElement.classList.remove('sticky-window-html')
      document.body.classList.remove('sticky-window-body')
    }
  }, [])

  // 主窗口登录后，便签窗无需手动刷新：轮询静默恢复会话
  useEffect(() => {
    if (status === 'authed') return
    const timer = window.setInterval(() => void refreshQuiet(), 3000)
    return () => window.clearInterval(timer)
  }, [status, refreshQuiet])

  if (status === 'idle' || status === 'checking') {
    return (
      <div className="sticky-window-state" data-tauri-drag-region="deep">
        <Spin size="small" />
      </div>
    )
  }

  if (status !== 'authed') {
    return (
      <div className="sticky-window-state" data-tauri-drag-region="deep">
        <p>请先在主窗口登录</p>
        <button
          type="button"
          className="sticky-link"
          onClick={() => void tauriInvoke('open_main_window')}
        >
          打开主窗口
        </button>
      </div>
    )
  }

  return <StickyNotesPanel variant="window" />
}
