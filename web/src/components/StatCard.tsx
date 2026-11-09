import type { ReactNode } from 'react'

export type StatTone = 'blue' | 'green' | 'amber' | 'red' | 'indigo'

interface StatCardProps {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  hintTone?: 'ok' | 'bad'
  tone?: StatTone
}

export default function StatCard({ label, value, unit, hint, hintTone, tone = 'blue' }: StatCardProps) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-num num">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {hint ? <div className={`stat-sub${hintTone ? ` ${hintTone}` : ''}`}>{hint}</div> : null}
    </div>
  )
}
