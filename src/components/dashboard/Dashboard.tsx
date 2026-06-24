import { useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaudeProxy } from '../../lib/claude'
import { todayISO, tomorrowISO, addDaysISO, fmtHoras, ctxColor, nextRecurringDueDate, thisWeekRange, nextWeekRange, nextMonthRange, isShownAsTopLevel, effectiveDate, dateOfLocal, splitTitle } from '../../lib/helpers'
import { KANBAN_GROUPS, isWaitingState } from '../../lib/constants'
import { TaskList } from '../tasks/TaskList'
import { WaitingTaskCard } from '../tasks/WaitingTaskCard'
import { KanbanBoard } from './KanbanBoard'
import { ClaudeChat } from './ClaudeChat'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import { FilterPills, GENERAL_PILLS, CONTEXT_PILLS, matchesGeneralType, generalIncludesRecurrentes, matchesContext, loadFilters, saveFilters, type GeneralType, type ContextFilter } from '../tasks/TypeFilterPills'
import type { Task, Recurrente } from '../../lib/types'

type ViewMode = 'fecha' | 'estado' | 'kanban' | 'planificacion'
const STORAGE_KEY = 'mis_tareas_view_mode'
function loadMode(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'fecha' || v === 'estado' || v === 'kanban' || v === 'planificacion') return v
  } catch { /* ignore */ }
  return 'fecha'
}

// ─── Vista de Planificación ──────────────────────────────────────────────────
type PlanBlock = { taskId: number; title: string; date: string; hours: number; reason: string }

function PlanningView() {
  const tasks = useStore(s => s.tasks)
  const calendarEvents = useStore(s => s.calendarEvents)
  const updateTask = useStore(s => s.updateTask)
  const [planning, setPlanning] = useState(false)
  const [blocks, setBlocks] = useState<PlanBlock[]>([])
  const [planned, setPlanned] = useState(false)
  const [approving, setApproving] = useState<Set<number>>(new Set())

  const today = todayISO()
  const nextWeekEnd = addDaysISO(today, 7)

  // Tareas activas con estimado, ordenadas por urgencia
  const activeTasks = tasks
    .filter(t => !t.done && !t.archived_at && !t.es_recordatorio && t.due_date)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

  // Eventos de la semana para mostrar disponibilidad
  const weekEvents = calendarEvents.filter(e => {
    const d = e.starts_at?.slice(0, 10)
    return d >= today && d <= nextWeekEnd
  })

  // Horas libres por día (8–20h menos reuniones)
  function freeHoursForDay(iso: string): number {
    const dayEvs = weekEvents.filter(e => dateOfLocal(e.starts_at) === iso && !e.all_day && e.ends_at)
    const busy = dayEvs.reduce((s, e) => s + (new Date(e.ends_at!).getTime() - new Date(e.starts_at).getTime()) / 3600000, 0)
    return Math.max(0, 12 - busy) // 12h disponibles en la jornada (8–20)
  }

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i))

  async function planWeek() {
    setPlanning(true)
    try {
      const calSummary = days.map(d => {
        const evs = weekEvents.filter(e => dateOfLocal(e.starts_at) === d)
        const evList = evs.map(e => `  ${e.starts_at.slice(11, 16)} ${e.title}`).join('\n') || '  sin reuniones'
        const free = freeHoursForDay(d)
        return `${d} (${free.toFixed(1)}h libres):\n${evList}`
      }).join('\n')

      const tasksSummary = activeTasks.slice(0, 12).map(t => {
        const { name } = splitTitle(t.title)
        return `- [id:${t.id}] "${name}" entrega:${t.due_date} est:${t.estimated_hours ? t.estimated_hours + 'h' : '?'}`
      }).join('\n')

      const prompt = `Hoy es ${today}. Creá un plan de trabajo para la semana.

Agenda:
${calSummary}

Tareas activas con fecha de entrega:
${tasksSummary}

Para cada tarea, asigná el día más adecuado para trabajarla (antes de su entrega, en un bloque libre). Priorizá las más urgentes. No asignes más horas de las disponibles por día.

Respondé SOLO JSON:
{"bloques":[{"taskId":number,"fecha":"YYYY-MM-DD","horas":number,"razon":"texto corto"}]}`

      const reply = await callClaudeProxy(
        [{ role: 'user', content: prompt }],
        'Sos un asistente de planificación. Devolvés SOLO JSON.',
      )
      const cleaned = reply.replace(/```json|```/g, '').trim()
      const obj = JSON.parse(cleaned)
      const rawBlocks: { taskId: number; fecha: string; horas: number; razon: string }[] = obj.bloques || []
      const enriched: PlanBlock[] = rawBlocks.map(b => {
        const t = tasks.find(x => x.id === b.taskId)
        const { name } = splitTitle(t?.title || '')
        return { taskId: b.taskId, title: name || `Tarea ${b.taskId}`, date: b.fecha, hours: b.horas, reason: b.razon }
      })
      setBlocks(enriched)
      setPlanned(true)
    } catch {
      alert('No se pudo generar el plan. Revisá la conexión con Claude.')
    } finally {
      setPlanning(false)
    }
  }

  async function approveBlock(b: PlanBlock) {
    setApproving(prev => new Set([...prev, b.taskId]))
    await updateTask(b.taskId, { work_date: b.date } as any)
    setApproving(prev => { const s = new Set(prev); s.delete(b.taskId); return s })
    setBlocks(prev => prev.filter(x => x.taskId !== b.taskId))
  }

  function rejectBlock(taskId: number) {
    setBlocks(prev => prev.filter(b => b.taskId !== taskId))
  }

  // Bloques groupados por día
  const byDay: Record<string, PlanBlock[]> = {}
  for (const b of blocks) {
    (byDay[b.date] ||= []).push(b)
  }
  const planDays = Object.keys(byDay).sort()

  return (
    <div className="max-w-[900px]">
      {/* Disponibilidad de la semana */}
      <div className="mb-5">
        <SectionHeader icon="📅" label="Disponibilidad esta semana" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {days.map(d => {
            const evs = weekEvents.filter(e => dateOfLocal(e.starts_at) === d)
            const free = freeHoursForDay(d)
            const isToday = d === today
            return (
              <div key={d} className={`bg-bg2 border rounded-lg p-2.5 ${isToday ? 'border-claude/30' : 'border-black/7'}`}>
                <div className={`text-[11px] font-medium capitalize mb-1 ${isToday ? 'text-claude' : 'text-gray-600'}`}>
                  {new Date(d + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}
                </div>
                <div className="text-[11px] text-gray-500 mb-1.5">
                  <span className={`font-medium ${free >= 4 ? 'text-success' : free >= 2 ? 'text-warn' : 'text-danger'}`}>{free.toFixed(1)}h</span> libres
                </div>
                {evs.slice(0, 3).map(e => (
                  <div key={e.id} className="text-[10px] text-gray-400 leading-tight truncate">
                    {e.all_day ? 'todo el día' : e.starts_at.slice(11, 16)} {e.title}
                  </div>
                ))}
                {evs.length > 3 && <div className="text-[10px] text-gray-400">+{evs.length - 3} más</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tareas activas con estimado */}
      <div className="mb-5">
        <SectionHeader icon="⏱" label="Tareas activas con estimado" />
        <div className="flex flex-col gap-1.5">
          {activeTasks.filter(t => t.estimated_hours).slice(0, 10).map(t => {
            const { prefix, name } = splitTitle(t.title)
            return (
              <div key={t.id} className="bg-bg2 border border-black/7 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400 w-[64px] shrink-0">{t.due_date?.slice(5).replace('-', '/') || '—'}</span>
                <span className="flex-1 text-[13px] truncate">
                  {prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{prefix} |</span>}
                  {name}
                </span>
                <span className="text-[11px] font-mono text-claude bg-claude/7 border border-claude/15 px-2 py-0.5 rounded-md shrink-0">⏱ {fmtHoras(t.estimated_hours!)}</span>
                {(t as any).work_date && (
                  <span className="text-[10px] font-mono text-success bg-success/7 border border-success/20 px-1.5 py-0.5 rounded shrink-0">
                    📋 {(t as any).work_date.slice(5).replace('-', '/')}
                  </span>
                )}
              </div>
            )
          })}
          {activeTasks.filter(t => !t.estimated_hours).length > 0 && (
            <div className="text-[11px] text-gray-400 pl-1 mt-1">
              {activeTasks.filter(t => !t.estimated_hours).length} tarea{activeTasks.filter(t => !t.estimated_hours).length !== 1 ? 's' : ''} sin estimado (no entran al plan).
            </div>
          )}
        </div>
      </div>

      {/* Botón planificar */}
      <div className="mb-5">
        <button onClick={planWeek} disabled={planning || activeTasks.length === 0}
          className="flex items-center gap-2 text-sm bg-claude text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium">
          {planning ? '⏳ Planificando con Claude…' : '✦ Planificar semana con Claude'}
        </button>
        {activeTasks.length === 0 && <div className="text-[11px] text-gray-400 mt-1">Sin tareas activas para planificar.</div>}
      </div>

      {/* Plan sugerido */}
      {planned && blocks.length === 0 && (
        <div className="text-[13px] text-success bg-success/7 border border-success/20 rounded-lg px-4 py-3">
          ✓ Todas las tareas del plan fueron aprobadas y tienen fecha de trabajo asignada.
        </div>
      )}

      {planDays.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Plan sugerido — aprobá, mové o rechazá cada bloque</div>
          {planDays.map(d => (
            <div key={d}>
              <div className="text-[12px] font-medium text-gray-600 mb-2 capitalize">
                {new Date(d + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="ml-2 text-[10px] font-mono text-gray-400">({freeHoursForDay(d).toFixed(1)}h libres)</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {byDay[d].map(b => (
                  <div key={b.taskId} className="bg-bg2 border border-claude/20 rounded-lg px-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{b.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{b.reason} · {fmtHoras(b.hours)}</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => approveBlock(b)}
                        disabled={approving.has(b.taskId)}
                        className="text-[11px] text-white bg-success px-3 py-1 rounded-md cursor-pointer hover:opacity-80 disabled:opacity-40">
                        {approving.has(b.taskId) ? '…' : '✓ Aprobar'}
                      </button>
                      <button
                        onClick={() => rejectBlock(b.taskId)}
                        className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-3 py-1 rounded-md cursor-pointer hover:bg-danger/10 hover:text-danger">
                        ✕ Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
  const refreshCalendar = useStore(s => s.refreshCalendar)
  const [mode, setMode] = useState<ViewMode>(loadMode)
  const [sinFechaCollapsed, setSinFechaCollapsed] = useState(true)
  const [cerradoCollapsed, setCerradoCollapsed] = useState(true)
  // Filtros persistentes por vista (clave propia en localStorage).
  const [typeFilters, setTypeFilters] = useState<Set<GeneralType>>(() => loadFilters<GeneralType>('mis_tareas_type_filters'))
  const [ctxFilters, setCtxFilters] = useState<Set<ContextFilter>>(() => loadFilters<ContextFilter>('mis_tareas_context_filters'))

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ } }, [mode])
  useEffect(() => { saveFilters('mis_tareas_type_filters', typeFilters) }, [typeFilters])
  useEffect(() => { saveFilters('mis_tareas_context_filters', ctxFilters) }, [ctxFilters])

  // Al montar el dashboard, si el calendario no se refrescó en > 5 min, dispara
  // un refresh background con un rango chico (semana actual) para que la
  // "Agenda de hoy" del header refleje cambios recientes.
  useEffect(() => {
    const last = useStore.getState().calendarLastSync
    const STALE = 5 * 60 * 1000
    if (last && Date.now() - last < STALE) return
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(); to.setDate(to.getDate() + 7); to.setHours(23, 59, 59, 999)
    refreshCalendar({ from: from.toISOString(), to: to.toISOString(), silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tareas contenedoras (agrupaciones no ejecutables): se excluyen de Mis tareas.
  // Las subtareas ejecutables siguen apareciendo con badge "↳ Parte de [padre]".
  const esContenedora = (t: Task) =>
    t.task_type === 'solicitud_influencers' ||
    t.categoria === 'campana' || t.categoria === 'proyecto' ||
    t.categoria === 'propuesta' || t.categoria === 'padre'

  const active = tasks.filter(t => !t.done && !t.archived_at
    && !esContenedora(t)
    && isShownAsTopLevel(t, tasks)
    && matchesGeneralType(t, typeFilters) && matchesContext(t, ctxFilters))
  // Base para Por estado / Kanban: misma exclusión de contenedoras.
  const allByStatus = tasks.filter(t => !t.done
    && !esContenedora(t)
    && isShownAsTopLevel(t, tasks)
    && matchesGeneralType(t, typeFilters) && matchesContext(t, ctxFilters))
  const showRecurrentes = generalIncludesRecurrentes(typeFilters)

  const today = todayISO()
  const tomorrow = tomorrowISO()
  const dayAfterTomorrow = addDaysISO(today, 2)
  // Rangos LOCALES: thisWeekRange = lun-dom de la semana actual;
  // nextWeekRange = lun-dom de la próxima semana calendaria.
  const { to: thisWeekEnd } = thisWeekRange()
  const { from: nextWeekFrom, to: nextWeekTo } = nextWeekRange()
  const { from: proxMesFrom, to: proxMesTo } = nextMonthRange()

  // Agenda de hoy (eventos de Google Calendar). Útil para enmarcar el día.
  // Comparar la fecha LOCAL del evento (no UTC) — un evento a las 21h Chile
  // (UTC-4) tiene starts_at en UTC del día siguiente; slice(0,10) lo mandaba
  // a mañana en vez de hoy.
  const todayEvents = calendarEvents.filter(e => dateOfLocal(e.starts_at) === today)
    .sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))
  const busyMin = todayEvents.filter(e => !e.all_day && e.ends_at).reduce((s, e) => s + (new Date(e.ends_at as string).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)
  const freeH = Math.max(0, Math.round((720 - busyMin) / 60 * 10) / 10)

  // ── Clasificación temporal ────────────────────────────────────────────
  // Usamos effectiveDate(t) en lugar de t.due_date directamente: para tareas
  // normales es lo mismo; para recordatorios sin due_date toma recordatorio_at,
  // lo que permite ubicarlos en su sección temporal correcta cuando entran al
  // listado (pill Recordatorios activo).
  // Atrasadas se separan en dos buckets:
  //   atrasadasDependeVos: fecha efectiva < hoy y status NO en espera
  //   esperandoVencidas:   fecha efectiva < hoy y status en WAITING_STATES del contexto
  const overdueAll = active
    .map(t => ({ t, d: effectiveDate(t) }))
    .filter(({ d }) => !!d && d < today)
    .sort((a, b) => a.d!.localeCompare(b.d!))
    .map(({ t }) => t)
  const atrasadasDependeVos = overdueAll.filter(t => !isWaitingState(t.context, t.status))
  const esperandoVencidas = overdueAll.filter(t => isWaitingState(t.context, t.status))
  const hoy = active.filter(t => effectiveDate(t) === today)
  const manana = active.filter(t => effectiveDate(t) === tomorrow)
  // "Esta semana": entre pasado mañana y el domingo de la semana actual.
  // Si hoy es viernes/sábado/domingo puede ser vacío y la sección no renderiza.
  const estaSemTasks = active.filter(t => {
    const d = effectiveDate(t); return !!d && d >= dayAfterTomorrow && d <= thisWeekEnd
  })
  // "Próxima semana": lunes-domingo de la próxima semana, estricto.
  // (Excluye a mañana cuando hoy es domingo — mañana ya tiene su seccion).
  const proxSemTasks = active.filter(t => {
    const d = effectiveDate(t); return !!d && d >= nextWeekFrom && d <= nextWeekTo && d > tomorrow
  })
  const proxMesTasks = active.filter(t => {
    const d = effectiveDate(t); return !!d && d >= proxMesFrom && d <= proxMesTo
  })
  // Tareas con fecha entre el final de "próxima semana" y el inicio de "próximo
  // mes" — gap del calendario. Las incluimos en "Próximo mes" para que no queden
  // invisibles, aunque técnicamente caen en este mes.
  const gapTasks = active.filter(t => {
    const d = effectiveDate(t); return !!d && d > nextWeekTo && d < proxMesFrom
  })
  const proxMesAll = [...gapTasks, ...proxMesTasks].sort(
    (a, b) => (effectiveDate(a) || '').localeCompare(effectiveDate(b) || '')
  )
  const sinFecha = active.filter(t => !effectiveDate(t))

  // Recurrentes próximas (solo la siguiente por definición).
  // Recurrentes solo si el filtro de tipo las incluye, y filtradas por contexto
  // si hay context filter activo.
  const recInstances = showRecurrentes
    ? recurrentes
        .filter(r => !ctxFilters.size || ctxFilters.has(r.context as ContextFilter))
        .map(r => ({ rec: r, date: nextRecurringDueDate(r) }))
    : []
  const recHoy = recInstances.filter(i => i.date === today)
  const recManana = recInstances.filter(i => i.date === tomorrow)
  const recEstaSem = recInstances.filter(i => i.date >= dayAfterTomorrow && i.date <= thisWeekEnd)
  const recProxSem = recInstances.filter(i => i.date >= nextWeekFrom && i.date <= nextWeekTo && i.date > tomorrow)
  const recProxMes = recInstances.filter(i => i.date > nextWeekTo && i.date <= proxMesTo)

  const horasHoy = hoy.reduce((s, t) => s + (t.estimated_hours || 0), 0)

  // Esta semana agrupada por día.
  const estaSemByDay: Record<string, DayItem[]> = {}
  for (const t of estaSemTasks) {
    const d = effectiveDate(t)
    if (d) (estaSemByDay[d] ||= []).push({ kind: 'task', task: t })
  }
  for (const r of recEstaSem) (estaSemByDay[r.date] ||= []).push({ kind: 'recurrent', rec: r.rec, date: r.date })
  const estaSemDays = Object.keys(estaSemByDay).sort()

  // Próxima semana agrupada por día (solo días con contenido).
  const proxSemByDay: Record<string, DayItem[]> = {}
  for (const t of proxSemTasks) {
    const d = effectiveDate(t)
    if (d) (proxSemByDay[d] ||= []).push({ kind: 'task', task: t })
  }
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
  for (const t of proxMesAll) {
    const d = effectiveDate(t)
    if (d) (proxMesByWeek[weekBucket(d)] ||= []).push({ kind: 'task', task: t })
  }
  for (const r of recProxMes) (proxMesByWeek[weekBucket(r.date)] ||= []).push({ kind: 'recurrent', rec: r.rec, date: r.date })
  const proxMesWeeks = Object.keys(proxMesByWeek).sort()

  function renderDayItems(items: DayItem[]) {
    const ts = items.filter(i => i.kind === 'task').map(i => (i as any).task as Task)
    const recs = items.filter(i => i.kind === 'recurrent') as Extract<DayItem, { kind: 'recurrent' }>[]
    return (
      <>
        {ts.length > 0 && <TaskList tasks={ts} hideChildren />}
        <RecurrentBlock items={recs.map(r => ({ rec: r.rec, date: r.date }))} />
      </>
    )
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Mis tareas</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tarea{active.length === 1 ? '' : 's'} activa{active.length === 1 ? '' : 's'}
        {atrasadasDependeVos.length ? ` · ${atrasadasDependeVos.length} atrasada${atrasadasDependeVos.length === 1 ? '' : 's'}` : ''}
        {esperandoVencidas.length ? ` · ${esperandoVencidas.length} esperando` : ''}
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

      {/* Toggle de 3 modos + filtros de tipo + filtros de contexto.
          Cada filtro persiste con su propia clave en localStorage. */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5 shrink-0">
            {([
              { v: 'fecha', l: 'Por fecha' },
              { v: 'estado', l: 'Por estado' },
              { v: 'kanban', l: 'Kanban' },
              { v: 'planificacion', l: '📊 Planificación' },
            ] as { v: ViewMode; l: string }[]).map(o => (
              <button key={o.v} onClick={() => setMode(o.v)}
                className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                  mode === o.v ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {o.l}
              </button>
            ))}
          </div>
          <FilterPills value={typeFilters} onChange={setTypeFilters} pills={GENERAL_PILLS} />
        </div>
        <FilterPills value={ctxFilters} onChange={setCtxFilters} pills={CONTEXT_PILLS} allLabel="Todos" />
      </div>

      {mode === 'planificacion' ? (
        <PlanningView />
      ) : mode === 'kanban' ? (
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
                {!collapsed && <TaskList tasks={items} hideChildren />}
              </div>
            )
          })}
          {allByStatus.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-[13px]">Sin tareas activas.</div>
          )}
        </div>
      ) : (
        <div className="max-w-[900px]">
          {/* 🔴 ATRASADAS — depende de vos (status activos, NO en espera) */}
          {atrasadasDependeVos.length > 0 && (
            <>
              <SectionHeader icon="🔴" label="Atrasadas" sub={`${atrasadasDependeVos.length} tarea${atrasadasDependeVos.length === 1 ? '' : 's'} — requieren tu acción`} color="#dc2626" />
              <TaskList tasks={atrasadasDependeVos} hideChildren />
            </>
          )}

          {/* 🟡 ESPERANDO RESPUESTA VENCIDA — depende de otro (Delegado, Pend.
              validación, En revisión cliente, Bloqueado con due_date pasado).
              Cada tarea va envuelta en WaitingTaskCard con el botón Claude. */}
          {esperandoVencidas.length > 0 && (
            <>
              <SectionHeader icon="🟡" label="Esperando respuesta vencida" sub={`${esperandoVencidas.length} tarea${esperandoVencidas.length === 1 ? '' : 's'} — hacé seguimiento`} color="#d97706" />
              <div className="flex flex-col gap-1.5">
                {esperandoVencidas.map(t => <WaitingTaskCard key={t.id} task={t} today={today} />)}
              </div>
            </>
          )}

          {/* 📌 HOY */}
          {(hoy.length > 0 || recHoy.length > 0) && (
            <>
              <SectionHeader
                icon="📌" label="Hoy"
                sub={`${hoy.length + recHoy.length} tarea${(hoy.length + recHoy.length) === 1 ? '' : 's'}${horasHoy > 0 ? ` · ${fmtHoras(horasHoy)} estimadas` : ''}`}
              />
              {hoy.length > 0 && <TaskList tasks={hoy} hideChildren />}
              <RecurrentBlock items={recHoy} />
            </>
          )}

          {/* 🌅 MAÑANA */}
          {(manana.length > 0 || recManana.length > 0) && (
            <>
              <SectionHeader icon="🌅" label="Mañana" sub={`${manana.length + recManana.length} tarea${(manana.length + recManana.length) === 1 ? '' : 's'}`} />
              {manana.length > 0 && <TaskList tasks={manana} hideChildren />}
              <RecurrentBlock items={recManana} />
            </>
          )}

          {/* 📆 ESTA SEMANA (pasado mañana hasta domingo de esta semana, agrupado por día) */}
          {estaSemDays.length > 0 && (
            <>
              <SectionHeader icon="📆" label="Esta semana" sub={`${estaSemTasks.length + recEstaSem.length} tarea${(estaSemTasks.length + recEstaSem.length) === 1 ? '' : 's'}`} />
              {estaSemDays.map(d => (
                <div key={d} className="mb-3">
                  <div className="text-[11px] font-mono text-gray-500 mb-1.5 capitalize">{dayLabel(d)}</div>
                  {renderDayItems(estaSemByDay[d])}
                </div>
              ))}
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
              {!sinFechaCollapsed && <TaskList tasks={sinFecha} hideChildren />}
            </div>
          )}

          {/* Empty state global */}
          {!atrasadasDependeVos.length && !esperandoVencidas.length && !hoy.length && !manana.length && !estaSemDays.length && !proxSemDays.length && !proxMesWeeks.length && !sinFecha.length && !recHoy.length && !recManana.length && !recEstaSem.length && !recProxSem.length && !recProxMes.length && (
            <div className="text-center py-10 text-gray-400 text-[13px]">Nada que hacer — todo al día.</div>
          )}
        </div>
      )}

      <ClaudeChat />
    </div>
  )
}
