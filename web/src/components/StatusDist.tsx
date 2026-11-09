import EmptyState from './EmptyState'

interface StatusDistItem {
  key: string
  name: string
  count: number
}

interface StatusDistProps {
  items: StatusDistItem[]
}

const COLOR_MAP: Record<string, string> = {
  doing: '#41719c',
  active: '#41719c',
  waiting: '#b9862e',
  pending: '#b9862e',
  review: '#5b6ea8',
  overdue: '#b0433a',
  done: '#3f7d5c',
}

const FALLBACK_COLORS = ['#41719c', '#b9862e', '#5b6ea8', '#b0433a', '#3f7d5c']

export default function StatusDist({ items }: StatusDistProps) {
  if (!items.length || items.every((item) => !Number(item.count))) {
    return (
      <EmptyState
        compact
        title="当前没有在办事项"
        description="本周期记录已全部办结，或尚未开始记录"
      />
    )
  }

  return (
    <div className="dist-list">
      {items.map((item, index) => (
        <div className="dist-row" key={item.key}>
          <span
            className="dist-dot"
            style={{ background: COLOR_MAP[item.key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }}
            aria-hidden="true"
          />
          <span>{item.name}</span>
          <span className="dist-num num">{Number(item.count) || 0} 项</span>
        </div>
      ))}
    </div>
  )
}
