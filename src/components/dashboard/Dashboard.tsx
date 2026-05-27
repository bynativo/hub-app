import { useState } from 'react'
import { useStore } from '../../lib/store'
import { getGreeting, todayISO, tomorrowISO, fmtHoras, ctxColor } from '../../lib/helpers'
import { WAITING_STATES } from '../../lib/constants'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { ClaudeChat } from './ClaudeChat'

function SectionHeader({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
      <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">{icon} {label}</span>
      {count > 0 && <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{count}</span>}
    </div>
  )
}

function fmtT(iso: string) { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }

export function Dashboard() {
  const tasks = useStore(s => s.tasks)
  const calendarEvents = useStore(s => s.calendarEvents)
  const [mode, setMode] = useState<'list' | 'kanban'>('list')

  const active = tasks.filter(t => !t.done && !t.parent_task_id && !t.archived_at)
  // Vistas por fecha: incluyen subtareas, que tienen su propio due_date. Comparamos
  // contra la fecha LOCAL del usuario (todayISO/tomorrowISO), no UTC.
  const dated = tasks.filter(t => !t.done && !t.archived_at && !t.es_recordatorio)
  const today = todayISO()
  const tomorrow = tomorrowISO()

  const todayEvents = calendarEvents.filter(e => (e.starts_at || '').slice(0, 10) === today)
    .sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))
  const busyMin = todayEvents.filter(e => !e.all_day && e.ends_at).reduce((s, e) => s + (new Date(e.ends_at as string).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)
  const freeH = Math.max(0, Math.round((720 - busyMin) / 60 * 10) / 10)

  const hoy = dated.filter(t => t.due_date === today)
  const manana = dated.filter(t => t.due_date === tomorrow)
  const seguimiento = active.filter(t => t.es_recordatorio || WAITING_STATES.includes(t.status))
  const horasHoy = hoy.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)

  // El resto de las tareas activas (ni hoy, ni mañana, ni en seguimiento) para que
  // ninguna quede invisible en la vista Lista — misma fuente que el Kanban.
  const segIds = new Set(seguimiento.map(t => t.id))
  const proximamente = active
    .filter(t => !t.es_recordatorio && !segIds.has(t.id) && t.due_date !== today && t.due_date !== tomorrow)
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1   // con fecha futura primero
      if (b.due_date) return 1
      return 0                    // sin fecha al final
    })

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">{getGreeting()}</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tareas activas
        {hoy.length ? ` · ${hoy.length} para hoy` : ''}
        {seguimiento.length ? ` · ${seguimiento.length} en seguimiento` : ''}
      </p>

      {/* Agenda de hoy */}
      <div className="mb-5 max-w-[900px]">
        <SectionHeader icon="📆" label="Agenda de hoy" count={todayEvents.length} />
        {todayEvents.length ? (
          <div className="flex flex-col gap-1">
            {todayEvents.map(e => (
              <div key={e.id} className="flex items-center gap-2.5 text-[13px] bg-bg2 border border-black/7 rounded-lg px-3 py-2">
                <span className="font-mono text-[11px] text-gray-400 w-[92px] shrink-0">{e.all_day ? 'todo el día' : `${fmtT(e.starts_at)}${e.ends_at ? '–' + fmtT(e.ends_at) : ''}`}</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.context ? ctxColor(e.context) : '#7c3aed' }} />
                <span className="flex-1 leading-snug">{e.title}</span>
              </div>
            ))}
            <div className="text-[11px] text-gray-400 pl-1 mt-0.5">~{freeH}h libres entre reuniones (8–20h)</div>
          </div>
        ) : (
          <div className="text-[12px] text-gray-400 italic pl-1">Sin reuniones hoy · día libre para enfocarte.</div>
        )}
      </div>

      {/* Toggle Lista / Kanban */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
          {(['list', 'kanban'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                mode === m ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {m === 'list' ? 'Lista' : 'Kanban'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard />
      ) : (
        <div className="max-w-[900px]">
          <SectionHeader icon="📌" label="Hoy" count={hoy.length} />
          <TaskList tasks={hoy} emptyText="Nada vence hoy" />
          {hoy.length > 0 && (
            <div className="flex justify-end mt-1.5 pr-1">
              <span className="font-mono text-[11px] text-gray-400">
                Total estimado del día: <span className="text-claude font-medium">{fmtHoras(horasHoy)}</span>
              </span>
            </div>
          )}

          <SectionHeader icon="🌅" label="Mañana" count={manana.length} />
          <TaskList tasks={manana} emptyText="Nada para mañana" compactEmpty />

          <SectionHeader icon="⏳" label="Seguimiento" count={seguimiento.length} />
          <TaskList tasks={seguimiento} emptyText="Nada esperando respuesta" />

          {proximamente.length > 0 && (
            <>
              <SectionHeader icon="📅" label="Próximamente" count={proximamente.length} />
              <TaskList tasks={proximamente} />
            </>
          )}
        </div>
      )}

      <ClaudeChat />
    </div>
  )
}
