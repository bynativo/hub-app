import { useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaudeProxy } from '../../lib/claude'
import { WAITING_STATES, ESTADOS, KANBAN_GROUPS, STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { ctxLabel } from '../../lib/helpers'
import type { Task } from '../../lib/types'

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
  const setFollowup = useStore(s => s.setFollowup)
  const openFollowup = useStore(s => s.openFollowup)
  const openDetail = useStore(s => s.openDetail)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)

  const stColor = STATUS_COLOR[task.status] || '#6b7280'
  const overdue = task.followup_at ? new Date(task.followup_at) <= new Date() : false

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
    <div className={`bg-bg2 border rounded-xl p-3.5 shadow-sm ${overdue ? 'border-danger/30' : 'border-black/7'}`}>
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium leading-snug cursor-pointer hover:text-claude" onClick={() => openDetail(task.id)}>
            {task.title}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: stColor + '16', color: stColor }}>
              {STATUS_ICON[task.status]} {task.status}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(task.context)}</span>
            {task.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${overdue ? 'bg-danger/10 text-danger' : 'bg-bg4 text-gray-500'}`}>
              ⏰ {fmtFollowup(task.followup_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
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
  const waiting = tasks.filter(t => !t.done && WAITING_STATES.includes(t.status))
  // Ordenar: con alarma vencida primero, luego por followup_at, luego sin recordatorio
  const sorted = [...waiting].sort((a, b) => {
    const av = a.followup_at ? new Date(a.followup_at).getTime() : Infinity
    const bv = b.followup_at ? new Date(b.followup_at).getTime() : Infinity
    return av - bv
  })

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#d97706' }}>Seguimiento</h1>
      <p className="text-gray-500 text-[13px] mb-5">Todo lo que está esperando respuesta · {waiting.length} tareas</p>

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
