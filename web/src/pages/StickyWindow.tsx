import { useEffect } from 'react'
import { Spin } from 'antd'
import StickyNotesPanel from '../components/StickyNotesPanel'
import { useAuthStore } from '../store/auth'
import { tauriInvoke } from '../utils/tauri'

/** 独立桌面便签窗口：无侧边栏，仅渲染便签本体 */
export default function StickyWindow() {
  const status = useAuthStore((state) => state.status)

  useEffect(() => {
    document.documentElement.classList.add('sticky-window-html')
    document.body.classList.add('sticky-window-body')
    return () => {
      document.documentElement.classList.remove('sticky-window-html')
      document.body.classList.remove('sticky-window-body')
    }
  }, [])

  if (status === 'idle' || status === 'checking') {
    return (
      <div className="sticky-window-state">
        <Spin size="small" />
      </div>
    )
  }

  if (status !== 'authed') {
    return (
      <div className="sticky-window-state">
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
