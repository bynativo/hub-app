import { useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaudeProxy } from '../../lib/claude'
import { ctxLabel } from '../../lib/helpers'
import { WAITING_STATES } from '../../lib/constants'
import { TaskItem } from './TaskItem'
import type { Task } from '../../lib/types'

// Predicado: tarea atrasada (due_date < hoy) Y en estado de espera (WAITING_STATES).
// Útil para separar la sección "Esperando respuesta vencida" del "Atrasadas".
export function isWaitingOverdue(t: Task, today: string): boolean {
  return !!t.due_date && t.due_date < today && WAITING_STATES.includes(t.status)
}

// Wrapper para tarjetas atrasadas que están en estado de espera. Borde
// amber suave + ícono ⏳ + badge "Esperando X días" + botón directo
// "Redactar seguimiento con Claude" sin tener que abrir el detalle.
export function WaitingOverdueRow({ task, today }: { task: Task; today: string }) {
  const setView = useStore(s => s.setView)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  void setView  // reservado por si después querés acción de "marcar respondido" inline
  const daysWaiting = task.due_date
    ? Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(task.due_date + 'T00:00:00').getTime()) / 86400000))
    : 0

  async function redactar() {
    setDrafting(true); setDraft('')
    try {
      const prompt = `Redactá un mensaje breve y profesional de seguimiento para esta tarea que está en estado "${task.status}" (esperando respuesta de la contraparte).
Tarea: ${task.title}
Cliente: ${task.clients?.name || 'interno'}
Contexto: ${ctxLabel(task.context)}
Está atrasada hace ${daysWaiting} día${daysWaiting === 1 ? '' : 's'}.
Tono humano, profesional y directo, en español. Devolvé solo el cuerpo del mensaje.`
      const system = 'Sos el asistente de Felipe. Redactás mensajes de seguimiento humanos, concisos y profesionales, en español.'
      const reply = await callClaudeProxy([{ role: 'user', content: prompt }], system)
      setDraft(reply)
    } catch {
      setDraft('No se pudo generar el borrador (el proxy de Claude no respondió). Intentá de nuevo.')
    } finally {
      setDrafting(false)
    }
  }

  async function copiar() {
    if (!draft) return
    try { await navigator.clipboard.writeText(draft) } catch { /* ignore */ }
  }

  return (
    <div className="border border-warn/30 rounded-[10px] bg-warn/[0.04] p-1">
      <TaskItem task={task} />
      <div className="px-2 py-1.5 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/15 text-warn">
          ⏳ Esperando hace {daysWaiting} día{daysWaiting === 1 ? '' : 's'}
        </span>
        <button onClick={redactar} disabled={drafting}
          className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors disabled:opacity-40">
          {drafting ? 'Redactando…' : '✦ Redactar seguimiento con Claude'}
        </button>
      </div>
      {draft && (
        <div className="mx-1 mb-1 bg-bg3 border border-black/7 rounded-md p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap relative">
          <button onClick={copiar} title="Copiar al portapapeles"
            className="absolute top-1.5 right-1.5 text-[10px] text-gray-400 hover:text-claude cursor-pointer">📋</button>
          {draft}
        </div>
      )}
    </div>
  )
}
