import type { Task } from '../../lib/types'

// Filtros de tipo de tarea — multi-select, combinables. Vacío = "Todas" (sin filtro).
export type TypeFilter = 'tareas' | 'contenido' | 'influencer' | 'recordatorios' | 'recurrentes'

const PILLS: { v: TypeFilter; icon: string; label: string }[] = [
  { v: 'tareas', icon: '📋', label: 'Tareas' },
  { v: 'contenido', icon: '🎬', label: 'Contenido' },
  { v: 'influencer', icon: '⭐', label: 'Influencer' },
  { v: 'recordatorios', icon: '🔔', label: 'Recordatorios' },
  { v: 'recurrentes', icon: '🔄', label: 'Recurrentes' },
]

export function TypeFilterPills({ value, onChange, hideRecurrentes = false }: {
  value: Set<TypeFilter>
  onChange: (next: Set<TypeFilter>) => void
  hideRecurrentes?: boolean
}) {
  const visiblePills = hideRecurrentes ? PILLS.filter(p => p.v !== 'recurrentes') : PILLS
  const allEmpty = value.size === 0

  function toggle(v: TypeFilter) {
    const next = new Set(value)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  const cls = (active: boolean) => `text-[11px] px-2.5 py-1 rounded-md border cursor-pointer transition-all whitespace-nowrap ${
    active
      ? 'border-claude/30 bg-claude/10 text-claude font-medium'
      : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
  }`

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button type="button" onClick={() => onChange(new Set())} className={cls(allEmpty)}>
        Todas
      </button>
      {visiblePills.map(p => (
        <button key={p.v} type="button" onClick={() => toggle(p.v)} className={cls(value.has(p.v))}>
          {p.icon} {p.label}
        </button>
      ))}
    </div>
  )
}

// Predicado para tareas reales (no recurrentes — esas se filtran aparte).
// Cuando hay varios filtros activos, la tarea matchea si encaja en ALGUNO.
export function matchesTypeFilter(t: Task, filters: Set<TypeFilter>): boolean {
  if (!filters.size) return true
  if (filters.has('recordatorios') && t.es_recordatorio) return true
  if (filters.has('influencer') && (t.es_influencer || t.task_type === 'solicitud_influencers' || t.task_type === 'influencer')) return true
  if (filters.has('contenido') && t.task_type === 'contenido' && !t.es_influencer) return true
  if (filters.has('tareas')
    && !t.es_recordatorio
    && t.task_type !== 'contenido'
    && !t.es_influencer
    && t.task_type !== 'solicitud_influencers'
    && t.task_type !== 'influencer'
  ) return true
  return false
}

// Para recurrentes: se incluyen si no hay filtros activos o si 'recurrentes' está activo.
export function includesRecurrentes(filters: Set<TypeFilter>): boolean {
  return !filters.size || filters.has('recurrentes')
}
