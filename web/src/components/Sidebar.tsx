import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOutlined,
  CaretRightOutlined,
  DashboardOutlined,
  EditOutlined,
  MessageOutlined,
  SettingOutlined,
  SlidersOutlined,
} from '@ant-design/icons'
import { useCategoriesStore } from '../store/categories'
import { useRecordFilterStore } from '../store/filters'
import { sortedCategories } from '../utils/category'

interface SidebarProps {
  mobileOpen: boolean
  onNavigate: () => void
}

const NAV_ITEMS = [
  { to: '/dashboard', label: '工作汇总', icon: <DashboardOutlined /> },
  { to: '/fields', label: '字段管理', icon: <SlidersOutlined /> },
  { to: '/knowledge', label: '知识接入', icon: <BookOutlined /> },
  { to: '/chat', label: '法务对话', icon: <MessageOutlined /> },
  { to: '/settings', label: '设置中心', icon: <SettingOutlined /> },
]

export default function Sidebar({ mobileOpen, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, loading, error, load } = useCategoriesStore()
  const categoryId = useRecordFilterStore((state) => state.categoryId)
  const setCategoryId = useRecordFilterStore((state) => state.setCategoryId)
  const [treeOpen, setTreeOpen] = useState(false)

  const recordsActive = location.pathname.startsWith('/records')

  useEffect(() => {
    if (recordsActive) setTreeOpen(true)
  }, [recordsActive])

  const onRecordsClick = () => {
    setTreeOpen((open) => !open)
    if (!recordsActive) navigate('/records')
    onNavigate()
  }

  const onCategoryClick = (id: string) => {
    setCategoryId(id)
    navigate('/records')
    onNavigate()
  }

  const top = sortedCategories(items)

  return (
    <aside className={`app-sidebar${mobileOpen ? ' open' : ''}`} aria-label="主导航">
      <div className="brand">
        <div className="brand-chip" aria-hidden="true">
          法
        </div>
        <div>
          <div className="brand-name">法务工作台</div>
          <div className="brand-sub">LEGAL DESK</div>
        </div>
      </div>

      <nav className="side-nav" aria-label="功能模块">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onNavigate}
        >
          <DashboardOutlined />
          <span>工作汇总</span>
        </NavLink>

        <button
          type="button"
          className={`nav-item${recordsActive ? ' active' : ''}`}
          aria-expanded={treeOpen}
          aria-controls="record-category-tree"
          aria-current={recordsActive ? 'page' : undefined}
          onClick={onRecordsClick}
        >
          <EditOutlined />
          <span>工作记录</span>
          <CaretRightOutlined className={`nav-caret${treeOpen ? ' open' : ''}`} aria-hidden="true" />
        </button>

        {treeOpen ? (
          <div className="nav-tree" id="record-category-tree">
            {loading && !top.length ? <div className="nav-tree-note">分类加载中…</div> : null}
            {error ? (
              <div className="nav-tree-note">
                分类加载失败
                <button type="button" className="link-btn" onClick={() => void load(true)}>
                  重试
                </button>
              </div>
            ) : null}
            {!error && !loading && !top.length ? <div className="nav-tree-note">暂无分类</div> : null}
            {top.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`tree-item${categoryId === category.id ? ' on' : ''}`}
                onClick={() => onCategoryClick(category.id)}
                title={category.name}
              >
                <span className="tree-name">{category.name}</span>
                <span className="tree-count num">{Number(category.recordCount) || 0}</span>
              </button>
            ))}
          </div>
        ) : null}

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onNavigate}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">MVP v0.4 · 本地部署</div>
    </aside>
  )
}
