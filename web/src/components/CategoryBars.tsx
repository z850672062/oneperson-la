import EmptyState from './EmptyState'

interface CategoryBarItem {
  categoryId: string
  name: string
  count: number
}

interface CategoryBarsProps {
  items: CategoryBarItem[]
}

export default function CategoryBars({ items }: CategoryBarsProps) {
  if (!items.length) {
    return (
      <EmptyState
        compact
        title="本周期暂无分类数据"
        description="新增工作记录后，这里会按分类展示工作量"
      />
    )
  }

  const max = Math.max(1, ...items.map((item) => Number(item.count) || 0))

  return (
    <div className="bar-list">
      {items.map((item) => {
        const count = Number(item.count) || 0
        const percent = Math.round((count / max) * 100)
        return (
          <div className="bar-row" key={item.categoryId}>
            <span className="bar-label" title={item.name}>
              {item.name}
            </span>
            <div
              className="bar-track"
              role="img"
              aria-label={`${item.name} ${count} 项`}
            >
              <div className="bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="bar-num num">{count}</span>
          </div>
        )
      })}
    </div>
  )
}
