import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MenuOutlined } from '@ant-design/icons'
import Sidebar from './Sidebar'
import { useCategoriesStore } from '../store/categories'

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const load = useCategoriesStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen ? (
        <div className="sidebar-scrim" aria-hidden="true" onClick={() => setMobileOpen(false)} />
      ) : null}
      <div className="app-main">
        <div className="mobile-topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label="打开导航"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <MenuOutlined />
          </button>
          <span className="mobile-title">法务工作台</span>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
