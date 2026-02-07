import { useState, type ReactNode } from 'react'

interface ModuleCardProps {
  title: string
  points: number
  children: ReactNode
  defaultOpen?: boolean
}

export default function ModuleCard({ title, points, children, defaultOpen = false }: ModuleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="module-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="module-card-header"
      >
        <span className="module-card-title">{title}</span>
        <span className="module-card-points">Points: {points}</span>
      </button>
      {open && <div className="module-card-body">{children}</div>}
    </div>
  )
}
