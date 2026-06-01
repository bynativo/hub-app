import { useState } from 'react'
import type { Task } from '../../lib/types'
import { TaskItem } from './TaskItem'
import { callClaudeProxy } from '../../lib/claude'
import { ctxLabel } from '../../lib/helpers'

// Card especifica para tareas en estado de espera vencido (Delegado / Pend.
// validacion / En revision cliente / Bloqueado con due_date pasado).
// Envuelve un TaskItem normal con borde amber + accion de seguimiento Claude
// inline. Diseñada para que el usuario actue sin abrir el detalle.
export function WaitingTaskCard({ task, today }: { task: Task; today: string }) {
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [copied, setCopied] = useState(false)

  const daysWaiting = task.due_date
    ? Math.max(0, Math.round(
        (new Date(today + 'T00:00:00').getTime() - new Date(task.due_date + 'T00:00:00').getTime()) / 86400000
      ))
    : 0

  async function redactar() {
    setDrafting(true)
    try {
      const system = 'Sos un asistente que redacta mensajes de seguimiento profesionales, claros y amables en español rioplatense. Tono cordial pero firme. Sin emojis. Máximo 4 lineas.'
      const prompt = `Redactá un mensaje breve para hacer seguimiento de esta tarea que está esperando respuesta desde hace ${daysWaiting} día${daysWaiting === 1 ? '' : 's'}:

Título: ${task.title}
Contexto: ${ctxLabel(task.context)}
Estado: ${task.status}
${task.notes ? `Notas: ${task.notes}\n` : ''}
Devolveme solo el mensaje, sin preámbulo ni explicación.`
      const reply = await callClaudeProxy([{ role: 'user', content: prompt }], system)
      setDraft((reply || '').trim())
    } catch (e) {
      setDraft(`Error: ${(e as Error).message}`)
    } finally {
      setDrafting(false)
    }
  }

  async function copiar() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className="border border-warn/30 rounded-[10px] bg-warn/5 p-1.5">
      <TaskItem task={task} />
      <div className="flex items-center gap-2 mt-1.5 px-1">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn">
          ⏳ Esperando {daysWaiting}d
        </span>
        <button
          onClick={redactar}
          disabled={drafting}
          className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude hover:text-white transition-colors disabled:opacity-60 disabled:cursor-wait"
          title="Generar un mensaje de seguimiento con Claude"
        >
          {drafting ? '✨ Redactando…' : '✨ Redactar seguimiento con Claude'}
        </button>
      </div>
      {draft && (
        <div className="mt-2 mx-1 mb-1 bg-bg3 border border-black/7 rounded-md p-2.5 text-[12px] leading-snug whitespace-pre-wrap">
          {draft}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-black/7">
            <button
              onClick={copiar}
              className="text-[11px] text-gray-500 hover:text-claude cursor-pointer"
            >
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
            <button
              onClick={() => setDraft('')}
              className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
