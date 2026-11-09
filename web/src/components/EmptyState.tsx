import { InboxOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export default function EmptyState({ title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`} role="status">
      <span className="empty-icon" aria-hidden="true">
        <InboxOutlined />
      </span>
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}
