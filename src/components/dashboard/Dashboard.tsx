import { useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import { todayISO, tomorrowISO, addDaysISO, fmtHoras, ctxColor, nextRecurringDueDate, nextWeekRange, nextMonthRange } from '../../lib/helpers'
import { KANBAN_GROUPS } from '../../lib/constants'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { ClaudeChat } from './ClaudeChat'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import type { Task, Recurrente } from '../../lib/types'

type ViewMode = 'fecha' | 'estado' | 'kanban'
const STORAGE_KEY = 'mis_tareas_view_mode'
function loadMode(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'fecha' || v === 'estado' || v === 'kanban') return v
  } catch { /* ignore */ }
  return 'fecha'
}

const PRIO_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 }
function sortByPrioDate(a: Task, b: Task): number {
  const dp = (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1)
  if (dp !== 0) return dp
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

type DayItem =
  | { kind: 'task'; task: Task }
  | { kind: 'recurrent'; rec: Recurrente; date: string }

function fmtT(iso: string) { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }
function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}
function shortDate(iso: string): string { return iso.slice(5).replace('-', '/') }

function SectionHeader({ icon, label, sub, color }: { icon: string; label: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-6 first:mt-0">
      <span className="text-[11px] font-mono tracking-wider uppercase" style={color ? { color } : { color: '#6b7280' }}>{icon} {label}</span>
      {sub && <span className="font-mono text-[10px] text-gray-400">· {sub}</span>}
    </div>
  )
}

function RecurrentBlock({ items }: { items: { rec: Recurrente; date: string }[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1 mt-1">
      {items.map(i => <RecurrentInstanceCard key={i.rec.id} recurrente={i.rec} date={i.date} />)}
    </div>
  )
}

export function Dashboard() {
  const tasks = useStore(s => s.tasks)
  const calendarEvents = useStore(s => s.calendarEvents)
  const recurrentes = useStore(s => s.recurrentes)
  const [mode, setMode] = useState<ViewMode>(loadMode)
  const [sinFechaCollapsed, setSinFechaCollapsed] = useState(true)
  const [cerradoCollapsed, setCerradoCollapsed] = useState(true)

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ } }, [mode])

  // Set base de tareas activas (incluye subtareas con due_date propio para que no
  // queden invisibles; excluye recordatorios — esos viven anidados bajo su padre).
  const active = tasks.filter(t => !t.done && !t.archived_at && !t.es_recordatorio)
  // Base más amplia para los modos por estado / kanban: incluye también las
  // archivadas (status en CLOSING_STATES) para que aparezcan en la columna
  // "Cerrado". Sigue excluyendo done (checkbox) y recordatorios.
  const allByStatus = tasks.filter(t => !t.done && !t.es_recordatorio)

  const today = todayISO()
  const tomorrow = tomorrowISO()
  const dayAfterTomorrow = addDaysISO(today, 2)
  const { to: nextSunday } = nextWeekRange()
  const { from: proxMesFrom, to: proxMesTo } = nextMonthRange()

  // Agenda de hoy (eventos de Google Calendar). Útil para enmarcar el día.
  const todayEvents = calendarEvents.filter(e => (e.starts_at || '').slice(0, 10) === today)
    .sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))
  const busyMin = todayEvents.filter(e => !e.all_day && e.ends_at).reduce((s, e) => s + (new Date(e.ends_at as string).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)
  const freeH = Math.max(0, Math.round((720 - busyMin) / 60 * 10) / 10)

  // ── Clasificación temporal ────────────────────────────────────────────
  const atrasadas = active.filter(t => t.due_date && t.due_date < today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const hoy = active.filter(t => t.due_date === today)
  const manana = active.filter(t => t.due_date === tomorrow)
  const proxSemTasks = active.filter(t => t.due_date && t.due_date >= dayAfterTomorrow && t.due_date <= nextSunday)
  const proxMesTasks = active.filter(t => t.due_date && t.due_date >= proxMesFrom && t.due_date <= proxMesTo)
  // Tareas con due_date entre el final de "próxima semana" y el inicio de "próximo
  // mes" — gap del calendario. Las incluimos en "Próximo mes" para que no queden
  // invisibles, aunque técnicamente caen en este mes.
  const gapTasks = active.filter(t => t.due_date && t.due_date > nextSunday && t.due_date < proxMesFrom)
  const proxMesAll = [...gapTasks, ...proxMesTasks].sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const sinFecha = active.filter(t => !t.due_date)

  // Recurrentes próximas (solo la siguiente por definición).
  const recInstances = recurrentes.map(r => ({ rec: r, date: nextRecurringDueDate(r) }))
  const recHoy = recInstances.filter(i => i.date === today)
  const recManana = recInstances.filter(i => i.date === tomorrow)
  const recProxSem = recInstances.filter(i => i.date >= dayAfterTomorrow && i.date <= nextSunday)
  const recProxMes = recInstances.filter(i => i.date > nextSunday && i.date <= proxMesTo)

  const horasHoy = hoy.reduce((s, t) => s + (t.estimated_hours || 0), 0)

  // Próxima semana agrupada por día (solo días con contenido).
  const proxSemByDay: Record<string, DayItem[]> = {}
  for (const t of proxSemTasks) (proxSemByDay[t.due_date!] ||= []).push({ kind: 'task', task: t })
  for (const r of recProxSem) (proxSemByDay[r.date] ||= []).push({ kind: 'recurrent', rec: r.rec, date: r.date })
  const proxSemDays = Object.keys(proxSemByDay).sort()

  // Próximo mes agrupado por semana (lunes-domingo). Cada bucket muestra rango
  // y los items dentro ordenados por fecha.
  function weekBucket(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    const dow = d.getDay() // 0=dom..6=sab
    const toMon = ((dow + 6) % 7) // días hacia atrás hasta el lunes
    const mon = addDaysISO(iso, -toMon)
    return mon
  }
  const proxMesByWeek: Record<string, DayItem[]> = {}
  for (const t of proxMesAll) (proxMesByWeek[weekBucket(t.due_date!)] ||= []).push({ kind: 'task', task: t })
  for (const r of recProxMes) (proxMesByWeek[weekBucket(r.date)] ||= []).push({ kind: 'recurrent', rec: r.rec, date: r.date })
  const proxMesWeeks = Object.keys(proxMesByWeek).sort()

  function renderDayItems(items: DayItem[]) {
    const ts = items.filter(i => i.kind === 'task').map(i => (i as any).task as Task)
    const recs = items.filter(i => i.kind === 'recurrent') as Extract<DayItem, { kind: 'recurrent' }>[]
    return (
      <>
        {ts.length > 0 && <TaskList tasks={ts} />}
        <RecurrentBlock items={recs.map(r => ({ rec: r.rec, date: r.date }))} />
      </>
    )
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Mis tareas</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tarea{active.length === 1 ? '' : 's'} activa{active.length === 1 ? '' : 's'}
        {atrasadas.length ? ` · ${atrasadas.length} atrasada${atrasadas.length === 1 ? '' : 's'}` : ''}
        {hoy.length ? ` · ${hoy.length} para hoy` : ''}
      </p>

      {/* Agenda de hoy — bloque chico contextual */}
      <div className="mb-5 max-w-[900px]">
        <SectionHeader icon="📆" label="Agenda de hoy" />
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

      {/* Toggle de 3 modos. Persiste en localStorage (mis_tareas_view_mode). */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
          {([
            { v: 'fecha', l: 'Por fecha' },
            { v: 'estado', l: 'Por estado' },
            { v: 'kanban', l: 'Kanban' },
          ] as { v: ViewMode; l: string }[]).map(o => (
            <button key={o.v} onClick={() => setMode(o.v)}
              className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                mode === o.v ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard items={allByStatus} />
      ) : mode === 'estado' ? (
        <div className="max-w-[900px]">
          {KANBAN_GROUPS.map(grp => {
            const items = allByStatus
              .filter(t => grp.statuses.includes(t.status || 'Inbox'))
              .sort(sortByPrioDate)
            if (!items.length) return null
            const isCerrado = grp.key === 'cerrado'
            const collapsed = isCerrado && cerradoCollapsed
            return (
              <div key={grp.key} className="mb-5">
                <button
                  onClick={() => isCerrado && setCerradoCollapsed(c => !c)}
                  className={`flex items-center gap-2 mb-2.5 ${isCerrado ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                >
                  {isCerrado && <span className="text-[10px] text-gray-400 w-3">{collapsed ? '▶' : '▼'}</span>}
                  <span className="text-[11px] font-mono text-gray-500 tracking-wider uppercase">{grp.label}</span>
                  <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{items.length}</span>
                </button>
                {!collapsed && <TaskList tasks={items} />}
              </div>
            )
          })}
          {allByStatus.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-[13px]">Sin tareas activas.</div>
          )}
        </div>
      ) : (
        <div className="max-w-[900px]">
          {/* 🔴 ATRASADAS — TaskItem ya muestra "Vencio hace Xd" como tag rojo */}
          {atrasadas.length > 0 && (
            <>
              <SectionHeader icon="🔴" label="Atrasadas" sub={`${atrasadas.length} tarea${atrasadas.length === 1 ? '' : 's'} atrasada${atrasadas.length === 1 ? '' : 's'}`} color="#dc2626" />
              <TaskList tasks={atrasadas} />
            </>
          )}

          {/* 📌 HOY */}
          {(hoy.length > 0 || recHoy.length > 0) && (
            <>
              <SectionHeader
                icon="📌" label="Hoy"
                sub={`${hoy.length + recHoy.length} tarea${(hoy.length + recHoy.length) === 1 ? '' : 's'}${horasHoy > 0 ? ` · ${fmtHoras(horasHoy)} estimadas` : ''}`}
              />
              {hoy.length > 0 && <TaskList tasks={hoy} />}
              <RecurrentBlock items={recHoy} />
            </>
          )}

          {/* 🌅 MAÑANA */}
          {(manana.length > 0 || recManana.length > 0) && (
            <>
              <SectionHeader icon="🌅" label="Mañana" sub={`${manana.length + recManana.length} tarea${(manana.length + recManana.length) === 1 ? '' : 's'}`} />
              {manana.length > 0 && <TaskList tasks={manana} />}
              <RecurrentBlock items={recManana} />
            </>
          )}

          {/* 📅 PRÓXIMA SEMANA (agrupada por día) */}
          {proxSemDays.length > 0 && (
            <>
              <SectionHeader icon="📅" label="Próxima semana" sub={`${proxSemTasks.length + recProxSem.length} tarea${(proxSemTasks.length + recProxSem.length) === 1 ? '' : 's'}`} />
              {proxSemDays.map(d => (
                <div key={d} className="mb-3">
                  <div className="text-[11px] font-mono text-gray-500 mb-1.5 capitalize">{dayLabel(d)}</div>
                  {renderDayItems(proxSemByDay[d])}
                </div>
              ))}
            </>
          )}

          {/* 🗓 PRÓXIMO MES (agrupada por semana) */}
          {proxMesWeeks.length > 0 && (
            <>
              <SectionHeader icon="🗓" label="Próximo mes" sub={`${proxMesAll.length + recProxMes.length} tarea${(proxMesAll.length + recProxMes.length) === 1 ? '' : 's'}`} />
              {proxMesWeeks.map(weekStart => {
                const weekEnd = addDaysISO(weekStart, 6)
                return (
                  <div key={weekStart} className="mb-3">
                    <div className="text-[11px] font-mono text-gray-500 mb-1.5">
                      Semana del {shortDate(weekStart)} al {shortDate(weekEnd)}
                    </div>
                    {renderDayItems(proxMesByWeek[weekStart])}
                  </div>
                )
              })}
            </>
          )}

          {/* 📭 SIN FECHA (colapsada por defecto) */}
          {sinFecha.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setSinFechaCollapsed(c => !c)}
                className="flex items-center gap-2 mb-2.5 cursor-pointer hover:text-gray-600 transition-colors">
                <span className="text-[10px] text-gray-400 w-3">{sinFechaCollapsed ? '▶' : '▼'}</span>
                <span className="text-[11px] font-mono tracking-wider uppercase text-gray-500">📭 Sin fecha</span>
                <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{sinFecha.length}</span>
              </button>
              {!sinFechaCollapsed && <TaskList tasks={sinFecha} />}
            </div>
          )}

          {/* Empty state global */}
          {!atrasadas.length && !hoy.length && !manana.length && !proxSemDays.length && !proxMesWeeks.length && !sinFecha.length && !recHoy.length && !recManana.length && !recProxSem.length && !recProxMes.length && (
            <div className="text-center py-10 text-gray-400 text-[13px]">Nada que hacer — todo al día.</div>
          )}
        </div>
      )}

      <ClaudeChat />
    </div>
  )
}
