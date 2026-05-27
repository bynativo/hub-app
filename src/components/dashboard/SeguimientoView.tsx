import { useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaudeProxy } from '../../lib/claude'
import { WAITING_STATES, CLOSING_STATES, ESTADOS, KANBAN_GROUPS, STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { ctxLabel, todayISO, addDaysISO } from '../../lib/helpers'
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
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)

  const isRem = task.es_recordatorio
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
      const reply = await callClaudeProxy(
        [{ role: 'user', content: `Redacta un mensaje breve y profesional de seguimiento para esta tarea que está en "${task.status}" (esperando respuesta).\nTarea: ${task.title}\nCliente: ${task.clients?.name || 'interno'}\nContexto: ${ctxLabel(task.context)}\nTono humano y directo, en español. Solo el mensaje.` }],
        'Eres el asistente de Felipe. Redactas mensajes de seguimiento humanos y concisos.'
      )
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
            {task.title}
          </div>
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
              {task.influencer_name
                ? `Hoy la agencia debe entregar el contenido del influencer ${task.influencer_name}`
                : 'Hoy vence la entrega de este contenido — ¿ya está listo?'}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {isRem ? (
          <>
            <button onClick={() => toggleTask(task.id)}
              className="text-[11px] text-success bg-success/7 border border-success/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-success/15 transition-colors">
              ✓ Listo
            </button>
            <button onClick={() => openFollowup(task.id)}
              className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">
              ↻ Posponer
            </button>
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

export function SeguimientoView() {
  const tasks = useStore(s => s.tasks)
  // Esperando respuesta / recordatorios (top-level) + contenido que vence hoy (cualquier nivel)
  const waiting = tasks.filter(t => !t.done && !t.archived_at && (
    (!t.parent_task_id && (t.es_recordatorio || WAITING_STATES.includes(t.status))) || isContentDueToday(t)
  ))
  // Tiempo de alarma unificado: recordatorio_at para recordatorios, followup_at para seguimientos.
  const alarmTime = (t: Task) => {
    const at = t.es_recordatorio ? t.recordatorio_at : t.followup_at
    return at ? new Date(at).getTime() : Infinity
  }
  const sorted = [...waiting].sort((a, b) => alarmTime(a) - alarmTime(b))

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#d97706' }}>Seguimiento</h1>
      <p className="text-gray-500 text-[13px] mb-5">Esperando respuesta y recordatorios · {waiting.length}</p>

      {sorted.length ? (
        <div className="flex flex-col gap-2 max-w-[760px]">
          {sorted.map(t => <FollowupCard key={t.id} task={t} />)}
        </div>
      ) : (
        <div className="text-center py-7 text-gray-400 text-[13px]">Nada esperando respuesta</div>
      )}
    </div>
  )
}
