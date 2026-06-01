import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { callClaudeProxy } from '../../lib/claude'
import { WAITING_STATES, CLOSING_STATES, ESTADOS, KANBAN_GROUPS, STATUS_ICON, STATUS_COLOR, isWaitingState } from '../../lib/constants'
import { ctxLabel, todayISO, addDaysISO, tomorrowISO, thisWeekRange, nextWeekRange, nextMonthRange } from '../../lib/helpers'
import { FilterPills, SEGUIMIENTO_PILLS, CONTEXT_PILLS, matchesSeguimientoType, matchesContext, loadFilters, saveFilters, type SeguimientoType, type ContextFilter } from '../tasks/TypeFilterPills'
import type { Task } from '../../lib/types'

// Contenido cuyo día de entrega es hoy (y aún no entregado/cerrado)
function isContentDueToday(t: Task): boolean {
  return t.task_type === 'contenido' && t.due_date === todayISO() && !CLOSING_STATES.includes(t.status)
}

function inProgressStatus(context: string): string {
  const grp = KANBAN_GROUPS.find(g => g.key === 'encurso')!
  const ctxStates = ESTADOS[context] || ESTADOS.banco
  return grp.statuses.find(s => ctxStates.includes(s)) || 'Trabajando'
}

function fmtFollowup(at: string | null): string {
  if (!at) return 'Sin recordatorio'
  const d = new Date(at)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000)
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (diff < 0) return `Venció · ${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${time}`
  if (diff === 0) return `Hoy ${time}`
  if (diff === 1) return `Mañana ${time}`
  return `${d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

function FollowupCard({ task }: { task: Task }) {
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const updateTask = useStore(s => s.updateTask)
  const setFollowup = useStore(s => s.setFollowup)
  const openFollowup = useStore(s => s.openFollowup)
  const openDetail = useStore(s => s.openDetail)
  const toggleTask = useStore(s => s.toggleTask)
  const allTasks = useStore(s => s.tasks)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)

  const isRem = task.es_recordatorio
  const remType = task.tipo_recordatorio || 'general'
  const isResponder = isRem && remType === 'responder_correo'
  const isEnviar = isRem && remType === 'enviar_correo'
  const isMailReminder = isResponder || isEnviar
  const isSeguimientoRem = isRem && remType === 'seguimiento'
  // Recordatorio "Solicitar perfil del influencer" creado al guardar la tarea de influencer.
  // Detectado por prefijo del correo_contexto que pone createProfileRequestReminder.
  const isProfileRequest = isEnviar && (task.correo_contexto || '').startsWith('Solicitar perfil de influencer')
  // Recordatorio "Enviar brief de influencers" creado al guardar una tarea
  // task_type='solicitud_influencers'. Detectado por prefijo del correo_contexto.
  const isBriefRequest = isEnviar && (task.correo_contexto || '').startsWith('Enviar brief de influencers')
  const parent = (isProfileRequest || isBriefRequest) && task.parent_task_id
    ? allTasks.find(t => t.id === task.parent_task_id)
    : null
  const briefPerfiles = isBriefRequest && parent
    ? allTasks.filter(t => t.parent_task_id === parent.id && t.task_type === 'influencer' && !t.archived_at)
    : []
  const isContentDue = !isRem && isContentDueToday(task) // contenido cuya entrega vence hoy
  const alarmAt = isRem ? task.recordatorio_at : task.followup_at
  const stColor = STATUS_COLOR[task.status] || '#6b7280'
  const overdue = alarmAt ? new Date(alarmAt) <= new Date() : false
  const due = (isRem && overdue) || isContentDue // destacado

  async function marcarEntregado() {
    await updateTaskStatus(task.id, 'Entregado') // cierra el rol de Felipe (se archiva)
  }
  async function posponerEntrega() {
    await updateTask(task.id, { due_date: addDaysISO(task.due_date || todayISO(), 1) })
  }

  async function redactar() {
    setDrafting(true); setDraft('')
    try {
      let prompt: string
      let system: string
      if (isBriefRequest && parent) {
        const n = parent.num_perfiles || briefPerfiles.length || 1
        const grab = parent.recording_date || 'fecha por confirmar'
        const entrega = parent.due_date || 'fecha por confirmar'
        const cliente = parent.clients?.name || (parent.context === 'agencia' ? 'agencia interna' : ctxLabel(parent.context))
        prompt = `Redacta el email de brief para la agencia de influencers solicitando ${n} perfil${n === 1 ? '' : 'es'} para la campaña "${parent.title}". Cliente: ${cliente}. Grabación / evento: ${grab}. Fecha de entrega de perfiles: ${entrega}. Pedir perfiles que encajen con el brief de la campaña, con confirmación de disponibilidad y tarifas. Tono profesional pero cercano. Devolvé asunto + cuerpo del email, y al final una tabla resumen con: #Perfil, Campaña, Grabación, Entrega.`
        system = 'Redactás briefs profesionales para agencias de influencers en español. Tono profesional pero cercano, claro y al grano. Devolvés asunto + cuerpo + una tabla resumen al final.'
      } else if (isProfileRequest && parent) {
        const inf = parent.influencer_nombre || parent.influencer_name || ''
        const handle = parent.influencer_handle || ''
        const target = [inf, handle].filter(Boolean).join(' / ') || 'el influencer'
        const grab = parent.recording_date || 'fecha por confirmar'
        prompt = `Redacta el email de solicitud del perfil del influencer ${target} para la campaña "${parent.title}". La grabación está estimada para ${grab}. Cliente: ${parent.clients?.name || 'interno'}. Tono profesional pero cercano. Devolvé asunto + cuerpo.`
        system = 'Redacta un email profesional en español para solicitar la confirmación del perfil de influencer [nombre/handle] para la campaña [título de tarea]. La grabación está estimada para [recording_date]. Incluir solicitud de confirmación de disponibilidad, tarifas si aplica, y brief de la campaña. Tono profesional pero cercano.'
      } else if (isResponder) {
        prompt = `Redactá una respuesta breve y profesional a este correo, en español, tono humano (que no se note IA). Asunto/contexto del correo:\n${task.correo_contexto || task.title}\nDevolvé solo el cuerpo de la respuesta.`
        system = 'Redactás respuestas de correo humanas y profesionales, en español.'
      } else if (isEnviar) {
        prompt = `Redactá un email profesional y conciso en español, tono humano. Contexto / a quién va dirigido:\n${task.correo_contexto || task.title}\nTarea madre: ${task.title}\nDevolvé asunto + cuerpo.`
        system = 'Redactás emails profesionales en español, humanos y al grano. Devolvés asunto y cuerpo.'
      } else {
        prompt = `Redacta un mensaje breve y profesional de seguimiento para esta tarea que está en "${task.status}" (esperando respuesta).\nTarea: ${task.title}\nCliente: ${task.clients?.name || 'interno'}\nContexto: ${ctxLabel(task.context)}\nTono humano y directo, en español. Solo el mensaje.`
        system = 'Eres el asistente de Felipe. Redactas mensajes de seguimiento humanos y concisos.'
      }
      const reply = await callClaudeProxy([{ role: 'user', content: prompt }], system)
      setDraft(reply)
    } catch {
      setDraft('No se pudo generar el borrador (el proxy de Claude no está disponible aquí).')
    } finally {
      setDrafting(false)
    }
  }

  async function marcarRespondido() {
    await updateTaskStatus(task.id, inProgressStatus(task.context))
    await setFollowup(task.id, null, 'respondido')
  }

  return (
    <div className={`bg-bg2 border rounded-xl p-3.5 shadow-sm ${
      due ? 'border-claude/40 ring-2 ring-claude/15 bg-claude/5'
        : overdue ? 'border-danger/30' : 'border-black/7'
    }`}>
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium leading-snug cursor-pointer hover:text-claude" onClick={() => openDetail(task.id)}>
            {due && <span className="text-claude mr-1 animate-pulse">●</span>}
            {isRem && <span className="mr-1">{isBriefRequest ? '🎬' : isProfileRequest ? '🤝' : isResponder ? '📧' : isEnviar ? '📨' : isSeguimientoRem ? '👀' : '🔔'}</span>}
            {task.title}
          </div>
          {isMailReminder && task.correo_contexto && (
            <div className="text-[12px] text-gray-500 mt-1 line-clamp-2">{task.correo_contexto}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: stColor + '16', color: stColor }}>
              {STATUS_ICON[task.status]} {task.status}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(task.context)}</span>
            {task.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>}
            {isContentDue ? (
              <>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/10 text-claude font-medium">📅 Entrega hoy</span>
                {task.publish_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-600/10 text-purple-600">Pub {task.publish_date.slice(5).replace('-', '/')}</span>}
              </>
            ) : (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                due ? 'bg-claude/10 text-claude font-medium' : overdue ? 'bg-danger/10 text-danger' : 'bg-bg4 text-gray-500'
              }`}>
                {due ? '🔔 ' : '⏰ '}{fmtFollowup(alarmAt)}
              </span>
            )}
          </div>
          {isContentDue && (
            <div className="text-[12px] text-claude mt-1.5">
              {(task.influencer_nombre || task.influencer_name)
                ? `Hoy la agencia debe entregar el contenido del influencer ${task.influencer_nombre || task.influencer_name}`
                : 'Hoy vence la entrega de este contenido — ¿ya está listo?'}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {isResponder ? (
          <>
            <button onClick={redactar} disabled={drafting}
              className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
              {drafting ? 'Redactando…' : '✦ Redactar respuesta con Claude'}
            </button>
            <button onClick={() => toggleTask(task.id)}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Ya respondí — cerrar
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">↻ Posponer</button>
          </>
        ) : isEnviar ? (
          <>
            <button onClick={redactar} disabled={drafting}
              className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
              {drafting ? 'Redactando…' : isBriefRequest ? '✦ Redactar brief con Claude' : isProfileRequest ? '✦ Redactar solicitud con Claude' : '✦ Redactar email con Claude'}
            </button>
            <button onClick={() => toggleTask(task.id)}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              {isBriefRequest ? '✓ Brief enviado — cerrar' : isProfileRequest ? '✓ Solicitud enviada — cerrar' : '✓ Enviado — cerrar'}
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">↻ Posponer</button>
          </>
        ) : isSeguimientoRem ? (
          <>
            <button onClick={redactar} disabled={drafting}
              className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
              {drafting ? 'Redactando…' : '✦ Redactar seguimiento con Claude'}
            </button>
            <button onClick={() => toggleTask(task.id)}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Marcar respondido
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">↻ Posponer</button>
          </>
        ) : isRem ? (
          <>
            <button onClick={() => toggleTask(task.id)}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Listo
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">↻ Posponer</button>
          </>
        ) : isContentDue ? (
          <>
            <button onClick={redactar} disabled={drafting}
              className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
              {drafting ? 'Redactando…' : '✦ Redactar seguimiento con Claude'}
            </button>
            <button onClick={marcarEntregado}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Marcar entregado
            </button>
            <button onClick={posponerEntrega}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">
              ↻ Posponer
            </button>
          </>
        ) : (
          <>
            <button onClick={redactar} disabled={drafting}
              className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
              {drafting ? 'Redactando…' : '✦ Redactar seguimiento con Claude'}
            </button>
            <button onClick={marcarRespondido}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Marcar respondido
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">
              ↻ Posponer
            </button>
          </>
        )}
      </div>

      {draft && (
        <div className="mt-3 bg-bg3 border border-black/7 rounded-lg p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
          {draft}
        </div>
      )}
    </div>
  )
}

// Fecha de la alarma como YYYY-MM-DD LOCAL.
// Prioridad: recordatorio_at (si es_recordatorio) > followup_at > due_date
// (cuando la tarea está en estado Esperando). Si no hay ninguna, null → "Sin fecha".
function alarmDateISO(t: Task): string | null {
  if (t.es_recordatorio && t.recordatorio_at) {
    const d = new Date(t.recordatorio_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (t.followup_at) {
    const d = new Date(t.followup_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (WAITING_STATES.includes(t.status) && t.due_date) return t.due_date
  return null
}

function alarmTimeMs(t: Task): number {
  if (t.es_recordatorio && t.recordatorio_at) return new Date(t.recordatorio_at).getTime()
  if (t.followup_at) return new Date(t.followup_at).getTime()
  if (WAITING_STATES.includes(t.status) && t.due_date) return new Date(`${t.due_date}T23:59:59`).getTime()
  return Infinity
}

function daysAgo(iso: string): number {
  const a = new Date(iso + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((t.getTime() - a.getTime()) / 86400000)
}

function SectionHeader({ icon, label, count, color }: { icon: string; label: string; count: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
      <span className="text-[11px] font-mono tracking-wider uppercase" style={color ? { color } : { color: '#6b7280' }}>
        {icon} {label}
      </span>
      <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{count}</span>
    </div>
  )
}

type ViewMode = 'fecha' | 'estado' | 'kanban'
const STORAGE_KEY = 'seguimiento_view_mode'
function loadMode(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'fecha' || v === 'estado' || v === 'kanban') return v
  } catch { /* ignore */ }
  return 'fecha'
}

// Columnas del Kanban por urgencia. drop ⇒ se setea la alarma (followup_at o
// recordatorio_at según es_recordatorio) al "target" de la columna. Sin target
// para Atrasado: no permitimos dropear ahí adrede.
const URGENCY_COLS: { key: 'atrasado' | 'hoy' | 'semana' | 'adelante'; label: string; color: string }[] = [
  { key: 'atrasado', label: 'Atrasado', color: '#dc2626' },
  { key: 'hoy', label: 'Hoy', color: '#d97706' },
  { key: 'semana', label: 'Esta semana', color: '#7c3aed' },
  { key: 'adelante', label: 'Más adelante', color: '#6b7280' },
]

function urgencyColumn(d: string | null, today: string, nextSunday: string): typeof URGENCY_COLS[number]['key'] | 'sinfecha' {
  if (!d) return 'sinfecha'
  if (d < today) return 'atrasado'
  if (d === today) return 'hoy'
  if (d <= nextSunday) return 'semana'
  return 'adelante'
}

export function SeguimientoView() {
  const tasks = useStore(s => s.tasks)
  const updateTask = useStore(s => s.updateTask)
  const loadAll = useStore(s => s.loadAll)
  const [mode, setMode] = useState<ViewMode>(loadMode)
  const [typeFilters, setTypeFilters] = useState<Set<SeguimientoType>>(() => loadFilters<SeguimientoType>('seguimiento_type_filters'))
  const [ctxFilters, setCtxFilters] = useState<Set<ContextFilter>>(() => loadFilters<ContextFilter>('seguimiento_context_filters'))

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ } }, [mode])
  useEffect(() => { saveFilters('seguimiento_type_filters', typeFilters) }, [typeFilters])
  useEffect(() => { saveFilters('seguimiento_context_filters', ctxFilters) }, [ctxFilters])

  // Filtro: solo top-level (no nested) — recordatorios nested viven bajo
  // su tarea padre. Para top-level: reminders OR tareas con followup_at OR
  // tareas en estado Esperando. El contenido due-today va a "Mis tareas",
  // no acá. Aplica filtros de tipo (👀/🔔/📧/📨) y contexto.
  const waiting = tasks.filter(t => !t.done && !t.archived_at && !t.parent_task_id && (
    t.es_recordatorio || !!t.followup_at || WAITING_STATES.includes(t.status)
  ) && matchesSeguimientoType(t, typeFilters) && matchesContext(t, ctxFilters))

  const today = todayISO()
  const tomorrow = tomorrowISO()
  const dayAfterTomorrow = addDaysISO(today, 2)
  // Rangos LOCALES (lun-dom) de esta semana y de la siguiente.
  const { to: thisWeekEnd } = thisWeekRange()
  const { from: nextWeekFrom, to: nextWeekTo } = nextWeekRange()
  const { from: proxMesFrom, to: proxMesTo } = nextMonthRange()
  void proxMesFrom

  const sortByAlarm = (a: Task, b: Task) => alarmTimeMs(a) - alarmTimeMs(b)

  function renderCard(t: Task) {
    const d = alarmDateISO(t)
    const overdueDays = d && d < today ? daysAgo(d) : 0
    return (
      <div key={t.id}>
        <FollowupCard task={t} />
        {overdueDays > 0 && (
          <div className="-mt-1 pl-3">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-danger/10 text-danger inline-block">
              {overdueDays} día{overdueDays === 1 ? '' : 's'} sin movimiento
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Modo "Por fecha" ────────────────────────────────────────────────
  // Vencidas se divide en dos secciones (spec split atrasadas):
  //  - esperandoVencidas: tareas en WAITING_STATES con due_date pasado.
  //    Llevan la accion principal "seguimiento con Claude" (ya provista por FollowupCard).
  //  - otrasVencidas: recordatorios y tareas con followup_at pasado.
  const esperandoVencidas: Task[] = []
  const otrasVencidas: Task[] = []
  const hoy: Task[] = []
  const manana: Task[] = []
  const estaSem: Task[] = []  // resto de la semana actual (pasado mañana → domingo)
  const proxSem: Task[] = []  // semana calendaria siguiente
  const proxMes: Task[] = []
  const sinFecha: Task[] = []
  for (const t of waiting) {
    const d = alarmDateISO(t)
    if (!d) { sinFecha.push(t); continue }
    if (d < today) {
      if (!t.es_recordatorio && isWaitingState(t.context, t.status)) esperandoVencidas.push(t)
      else otrasVencidas.push(t)
    }
    else if (d === today) hoy.push(t)
    else if (d === tomorrow) manana.push(t)
    else if (d >= dayAfterTomorrow && d <= thisWeekEnd) estaSem.push(t)
    else if (d >= nextWeekFrom && d <= nextWeekTo) proxSem.push(t)
    else if (d <= proxMesTo) proxMes.push(t)
    else sinFecha.push(t)
  }
  esperandoVencidas.sort(sortByAlarm); otrasVencidas.sort(sortByAlarm); hoy.sort(sortByAlarm); manana.sort(sortByAlarm); estaSem.sort(sortByAlarm); proxSem.sort(sortByAlarm); proxMes.sort(sortByAlarm); sinFecha.sort(sortByAlarm)

  // ── Modo "Por estado" ───────────────────────────────────────────────
  const byEstado = [
    { key: 'esperando',        label: '👀 En seguimiento',         filter: (t: Task) => !t.es_recordatorio && WAITING_STATES.includes(t.status) },
    { key: 'general',          label: '🔔 Recordatorios generales', filter: (t: Task) => t.es_recordatorio && (t.tipo_recordatorio || 'general') === 'general' },
    { key: 'seguimiento',      label: '👀 Seguimientos',            filter: (t: Task) => t.es_recordatorio && t.tipo_recordatorio === 'seguimiento' },
    { key: 'responder_correo', label: '📧 Responder correo',        filter: (t: Task) => t.es_recordatorio && t.tipo_recordatorio === 'responder_correo' },
    { key: 'enviar_correo',    label: '📨 Enviar correo',           filter: (t: Task) => t.es_recordatorio && t.tipo_recordatorio === 'enviar_correo' },
  ]

  // ── Modo "Kanban" ───────────────────────────────────────────────────
  const colMap: Record<string, Task[]> = { atrasado: [], hoy: [], semana: [], adelante: [] }
  for (const t of waiting) {
    const col = urgencyColumn(alarmDateISO(t), today, nextWeekTo)
    if (col === 'sinfecha') continue
    colMap[col].push(t)
  }
  for (const k of Object.keys(colMap)) colMap[k].sort(sortByAlarm)

  // Drag&drop. Al dropear en una columna, actualizamos la alarma:
  // - Hoy → today 09:00
  // - Esta semana → mañana 09:00 (alarma corta dentro de la semana)
  // - Más adelante → today+14 09:00
  // Atrasado no acepta drop (no tiene sentido mover algo "a atrasado" adrede).
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  async function onDrop(colKey: string) {
    setOverCol(null)
    if (!draggingId || colKey === 'atrasado') { setDraggingId(null); return }
    const t = waiting.find(x => x.id === draggingId)
    setDraggingId(null)
    if (!t) return
    const target = colKey === 'hoy'
      ? new Date(`${today}T09:00:00`).toISOString()
      : colKey === 'semana'
        ? new Date(`${tomorrow}T09:00:00`).toISOString()
        : new Date(`${addDaysISO(today, 14)}T09:00:00`).toISOString()
    if (t.es_recordatorio) {
      await supabase.from('tasks').update({ recordatorio_at: target }).eq('id', t.id)
    } else {
      await updateTask(t.id, { followup_at: target })
    }
    await loadAll()
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#d97706' }}>Seguimiento</h1>
      <p className="text-gray-500 text-[13px] mb-5">Tareas en seguimiento + recordatorios activos · {waiting.length}</p>

      {/* Toggle 3 modos + filtros de tipo (Seguimiento/General/Responder/Enviar)
          + filtros de contexto. Cada filtro persiste con su propia clave en
          localStorage. */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5 shrink-0">
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
          <FilterPills value={typeFilters} onChange={setTypeFilters} pills={SEGUIMIENTO_PILLS} allLabel="Todos" />
        </div>
        <FilterPills value={ctxFilters} onChange={setCtxFilters} pills={CONTEXT_PILLS} allLabel="Todos" />
      </div>

      {!waiting.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">Nada esperando respuesta</div>
      ) : mode === 'fecha' ? (
        <div className="max-w-[760px]">
          {esperandoVencidas.length > 0 && (<>
            <SectionHeader icon="🟡" label="Esperando respuesta vencida — hacé seguimiento" count={esperandoVencidas.length} color="#d97706" />
            <div className="flex flex-col gap-2">{esperandoVencidas.map(renderCard)}</div>
          </>)}
          {otrasVencidas.length > 0 && (<>
            <SectionHeader icon="🔴" label="Atrasadas (recordatorios y seguimientos)" count={otrasVencidas.length} color="#dc2626" />
            <div className="flex flex-col gap-2">{otrasVencidas.map(renderCard)}</div>
          </>)}
          {hoy.length > 0 && (<>
            <SectionHeader icon="📌" label="Hoy" count={hoy.length} color="#d97706" />
            <div className="flex flex-col gap-2">{hoy.map(renderCard)}</div>
          </>)}
          {manana.length > 0 && (<>
            <SectionHeader icon="🌅" label="Mañana" count={manana.length} />
            <div className="flex flex-col gap-2">{manana.map(renderCard)}</div>
          </>)}
          {estaSem.length > 0 && (<>
            <SectionHeader icon="📆" label="Esta semana" count={estaSem.length} />
            <div className="flex flex-col gap-2">{estaSem.map(renderCard)}</div>
          </>)}
          {proxSem.length > 0 && (<>
            <SectionHeader icon="📅" label="Próxima semana" count={proxSem.length} />
            <div className="flex flex-col gap-2">{proxSem.map(renderCard)}</div>
          </>)}
          {proxMes.length > 0 && (<>
            <SectionHeader icon="🗓" label="Próximo mes" count={proxMes.length} />
            <div className="flex flex-col gap-2">{proxMes.map(renderCard)}</div>
          </>)}
          {sinFecha.length > 0 && (<>
            <SectionHeader icon="📭" label="Sin fecha definida" count={sinFecha.length} />
            <div className="flex flex-col gap-2">{sinFecha.map(renderCard)}</div>
          </>)}
        </div>
      ) : mode === 'estado' ? (
        <div className="max-w-[760px]">
          {byEstado.map(grp => {
            const items = waiting.filter(grp.filter).sort(sortByAlarm)
            if (!items.length) return null
            return (
              <div key={grp.key} className="mb-5">
                <SectionHeader icon="" label={grp.label} count={items.length} />
                <div className="flex flex-col gap-2">{items.map(renderCard)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        // Kanban por urgencia
        <div className="grid grid-cols-4 gap-3">
          {URGENCY_COLS.map(col => {
            const items = colMap[col.key]
            const isAtrasado = col.key === 'atrasado'
            const dropDisabled = isAtrasado
            return (
              <div key={col.key}
                onDragOver={e => { if (!dropDisabled) { e.preventDefault(); setOverCol(col.key) } }}
                onDragLeave={() => overCol === col.key && setOverCol(null)}
                onDrop={() => onDrop(col.key)}
                className={`rounded-lg border p-2 min-h-[200px] transition-colors ${
                  overCol === col.key ? 'border-claude/40 bg-claude/5' : 'border-black/7 bg-bg3'
                } ${dropDisabled ? 'opacity-95' : ''}`}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[11px] font-mono tracking-wider uppercase" style={{ color: col.color }}>{col.label}</span>
                  <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map(t => (
                    <div key={t.id} draggable onDragStart={() => setDraggingId(t.id)} onDragEnd={() => setDraggingId(null)}
                      className="cursor-grab active:cursor-grabbing">
                      <FollowupCard task={t} />
                    </div>
                  ))}
                  {!items.length && <div className="text-[11px] text-gray-400 italic px-1">—</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
