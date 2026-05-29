import type { Task } from '../../lib/types'

// Definición de un pill: valor interno + icono + label.
export type PillDef<V extends string> = { v: V; icon: string; label: string }

// ── Sets de pills ──────────────────────────────────────────────────────

// Tipo general (Mis tareas, Banco, Agencia)
export type GeneralType = 'tareas' | 'contenido' | 'influencer' | 'recordatorios' | 'recurrentes'
export const GENERAL_PILLS: readonly PillDef<GeneralType>[] = [
  { v: 'tareas', icon: '📋', label: 'Tareas' },
  { v: 'contenido', icon: '🎬', label: 'Contenido' },
  { v: 'influencer', icon: '⭐', label: 'Influencer' },
  { v: 'recordatorios', icon: '🔔', label: 'Recordatorios' },
  { v: 'recurrentes', icon: '🔄', label: 'Recurrentes' },
]

// Tipo personal (sin contenido/influencer — no aplican en personal)
export type PersonalType = 'tareas' | 'recordatorios' | 'recurrentes'
export const PERSONAL_PILLS: readonly PillDef<PersonalType>[] = [
  { v: 'tareas', icon: '📋', label: 'Tareas' },
  { v: 'recordatorios', icon: '🔔', label: 'Recordatorios' },
  { v: 'recurrentes', icon: '🔄', label: 'Recurrentes' },
]

// Tipo seguimiento (semánticamente distinto: filtra por tipo_recordatorio
// y por "tarea esperando")
export type SeguimientoType = 'seguimiento' | 'general' | 'responder_correo' | 'enviar_correo'
export const SEGUIMIENTO_PILLS: readonly PillDef<SeguimientoType>[] = [
  { v: 'seguimiento', icon: '👀', label: 'Seguimiento' },
  { v: 'general', icon: '🔔', label: 'General' },
  { v: 'responder_correo', icon: '📧', label: 'Responder correo' },
  { v: 'enviar_correo', icon: '📨', label: 'Enviar correo' },
]

// Contexto (Mis tareas + Seguimiento, vistas globales)
export type ContextFilter = 'banco' | 'agencia' | 'personal'
export const CONTEXT_PILLS: readonly PillDef<ContextFilter>[] = [
  { v: 'banco', icon: '🟢', label: 'Banco' },
  { v: 'agencia', icon: '🟣', label: 'Agencia' },
  { v: 'personal', icon: '🔵', label: 'Personal' },
]

// ── Componente genérico ────────────────────────────────────────────────

export function FilterPills<V extends string>({
  value,
  onChange,
  pills,
  allLabel = 'Todas',
}: {
  value: Set<V>
  onChange: (next: Set<V>) => void
  pills: readonly PillDef<V>[]
  allLabel?: string
}) {
  const allEmpty = value.size === 0
  function toggle(v: V) {
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
        {allLabel}
      </button>
      {pills.map(p => (
        <button key={p.v} type="button" onClick={() => toggle(p.v)} className={cls(value.has(p.v))}>
          {p.icon} {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Predicados ─────────────────────────────────────────────────────────

// Cuando hay varios filtros activos, la tarea matchea si encaja en ALGUNO (OR).
export function matchesGeneralType(t: Task, filters: Set<GeneralType>): boolean {
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

export function generalIncludesRecurrentes(filters: Set<GeneralType>): boolean {
  return !filters.size || filters.has('recurrentes')
}

export function matchesPersonalType(t: Task, filters: Set<PersonalType>): boolean {
  if (!filters.size) return true
  if (filters.has('recordatorios') && t.es_recordatorio) return true
  if (filters.has('tareas') && !t.es_recordatorio) return true
  return false
}

export function personalIncludesRecurrentes(filters: Set<PersonalType>): boolean {
  return !filters.size || filters.has('recurrentes')
}

// Para Seguimiento: tareas en estado Esperando matchean 'seguimiento'; los
// recordatorios matchean por su tipo_recordatorio.
export function matchesSeguimientoType(t: Task, filters: Set<SeguimientoType>): boolean {
  if (!filters.size) return true
  if (!t.es_recordatorio) return filters.has('seguimiento')
  const tipo = (t.tipo_recordatorio || 'general') as SeguimientoType
  return filters.has(tipo)
}

export function matchesContext(t: Task, filters: Set<ContextFilter>): boolean {
  if (!filters.size) return true
  return filters.has(t.context as ContextFilter)
}

// ── Persistencia en localStorage ──────────────────────────────────────

export function loadFilters<V extends string>(key: string): Set<V> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set<V>()
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set<V>(arr as V[])
  } catch { /* ignore */ }
  return new Set<V>()
}

export function saveFilters<V extends string>(key: string, value: Set<V>) {
  try { localStorage.setItem(key, JSON.stringify([...value])) } catch { /* ignore */ }
}
