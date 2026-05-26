import { useState } from 'react'
import type { Task } from '../../lib/types'
import { fmtDue, ctxLabel, fmtHoras } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR, ORIGIN_LABELS } from '../../lib/constants'
import { useStore } from '../../lib/store'

function Tag({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: bg, color }}>
      {children}
    </span>
  )
}

export function TaskItem({ task, nested = false }: { task: Task; nested?: boolean }) {
  const { toggleTask, openDetail } = useStore()
  const allTasks = useStore(s => s.tasks)
  const [expanded, setExpanded] = useState(false)
  const due = fmtDue(task.due_date)
  const stColor = STATUS_COLOR[task.status || 'Inbox'] || '#6b7280'
  // Subtareas (un nivel) — colapsadas por defecto; solo se ven al expandir la padre.
  const children = nested ? [] : allTasks.filter(t => t.parent_task_id === task.id && !t.done)
  const hasChildren = children.length > 0
  const isEmail = task.task_type === 'responder_email'

  return (
    <div>
      <div
        onClick={() => hasChildren ? setExpanded(e => !e) : openDetail(task.id)}
        className={`flex items-start gap-2.5 p-3 bg-bg2 border border-black/7 rounded-[10px] cursor-pointer transition-all shadow-sm hover:border-black/13 hover:shadow-md hover:-translate-y-px ${
          task.done ? 'opacity-40' : ''
        }`}
      >
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(x => !x) }}
            className="text-[10px] text-gray-400 hover:text-claude shrink-0 mt-1 w-3 cursor-pointer"
            title={expanded ? 'Contraer subtareas' : 'Ver subtareas'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}

        <div
          onClick={(e) => { e.stopPropagation(); toggleTask(task.id) }}
          className={`w-4 h-4 rounded-[5px] border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center text-[10px] cursor-pointer transition-all ${
            task.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'
          }`}
        >
          {task.done && '✓'}
        </div>

        <div className="flex-1 min-w-0">
          <div className={`text-[13px] leading-snug font-medium ${task.done ? 'line-through text-gray-400' : ''}`}>
            {isEmail && <span className="mr-1">✉️</span>}
            {task.title}
            {hasChildren && <span className="ml-1.5 text-[10px] font-mono text-gray-400">({children.length})</span>}
          </div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded font-medium"
              style={{ background: stColor + '16', color: stColor }}
            >
              {STATUS_ICON[task.status || 'Inbox']} {task.status || 'Inbox'}
            </span>

            <Tag bg={task.context === 'banco' ? 'rgba(37,99,235,0.07)' : task.context === 'agencia' ? 'rgba(13,148,136,0.07)' : 'rgba(217,119,6,0.07)'}
                 color={task.context === 'banco' ? '#2563eb' : task.context === 'agencia' ? '#0d9488' : '#d97706'}>
              {ctxLabel(task.context)}
            </Tag>

            <Tag bg={task.priority === 'alta' ? 'rgba(220,38,38,0.07)' : task.priority === 'media' ? 'rgba(217,119,6,0.07)' : 'rgba(22,163,74,0.07)'}
                 color={task.priority === 'alta' ? '#dc2626' : task.priority === 'media' ? '#d97706' : '#16a34a'}>
              {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Baja'}
            </Tag>

            {task.origin && task.origin !== 'propia' && (
              <Tag bg="var(--color-bg4)" color="#6b6860">{ORIGIN_LABELS[task.origin] || task.origin}</Tag>
            )}

            {task.clients && (
              <Tag bg="rgba(13,148,136,0.07)" color="#0d9488">{task.clients.name}</Tag>
            )}

            {task.projects && (
              <Tag bg="rgba(124,58,237,0.07)" color="#7c3aed">📁 {task.projects.name}</Tag>
            )}

            {due && (
              <Tag bg={due.urgent ? 'rgba(220,38,38,0.07)' : 'var(--color-bg4)'}
                   color={due.urgent ? '#dc2626' : '#6b6860'}>
                {due.text}
              </Tag>
            )}

            {task.estimated_hours != null && (
              <Tag bg="rgba(124,58,237,0.07)" color="#7c3aed">⏱ {fmtHoras(task.estimated_hours)}</Tag>
            )}

            {(task.cats || []).slice(0, 2).map(c => (
              <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 border border-black/7">
                #{c}
              </span>
            ))}
          </div>
        </div>

        <div
          onClick={(e) => { e.stopPropagation(); openDetail(task.id) }}
          className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-[5px] cursor-pointer hover:bg-claude hover:text-white transition-colors shrink-0"
          title="Abrir detalle"
        >
          →
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="ml-6 mt-1 flex flex-col gap-1 border-l-2 border-claude/15 pl-2.5">
          {children.map(c => <TaskItem key={c.id} task={c} nested />)}
        </div>
      )}
    </div>
  )
}
