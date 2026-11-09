import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  range?: string
  actions?: ReactNode
  description?: string
}

export default function PageHeader({ title, range, actions, description }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-left">
        <h1 className="page-title">{title}</h1>
        {range ? <span className="page-range num">{range}</span> : null}
        {description ? <span className="page-range">{description}</span> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}
