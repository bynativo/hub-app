import { useState } from 'react'
import type { Task } from '../../lib/types'
import { fmtDue, ctxLabel, fmtHoras, splitTitle, pubTypeBadge, overdueLabel, clientBadge, vaAGrilla, isRRSSContent } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR, ORIGIN_LABELS, CONTENT_STAGES, CLOSING_STATES } from '../../lib/constants'
import { useStore } from '../../lib/store'
import { ReminderRow } from './ReminderRow'

// Variable a nivel de módulo para compartir el ID arrastrado entre instancias.
// Usamos módulo (no estado) para evitar re-renders en todos los TaskItem durante el drag.
let _dndDragId: number | null = null
let _dndDragContext: string | null = null

function Tag({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: bg, color }}>
      {children}
    </span>
  )
}

// Colores cíclicos para el borde de indent del árbol — un color por nivel.
// Permite distinguir visualmente la profundidad cuando hay 3+ niveles anidados.
const LEVEL_COLORS = ['#7c3aed', '#0d9488', '#2563eb', '#d97706']
function indentColor(level: number): string {
  return LEVEL_COLORS[(level) % LEVEL_COLORS.length]
}

export function TaskItem({ task, level = 0, hideChildren = false }: { task: Task; level?: number; hideChildren?: boolean }) {
  const { toggleTask, openDetail } = useStore()
  const enviarParaValidacion = useStore(s => s.enviarParaValidacion)
  const allTasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const openSubtaskConvert = useStore(s => s.openSubtaskConvert)
  const openDuplicateTask = useStore(s => s.openDuplicateTask)
  const [expanded, setExpanded] = useState(false)
  const [isDragTarget, setIsDragTarget] = useState(false)
  const [showItemMenu, setShowItemMenu] = useState(false)
  const clientB = clientBadge(task.client_id, clients)
  const due = fmtDue(task.due_date)
  const overdue = overdueLabel(task.due_date)
  const { prefix, name } = splitTitle(task.title)
  const stColor = STATUS_COLOR[task.status || 'Inbox'] || '#6b7280'
  // Subtareas reales + recordatorios vinculados — recursivo a cualquier nivel.
  // No hay short-circuit por "nested": permite jerarquía infinita.
  const linked = allTasks.filter(t => t.parent_task_id === task.id && !t.done && !t.archived_at)
  const children = linked.filter(t => !t.es_recordatorio)
  const reminders = linked.filter(t => t.es_recordatorio)
  const hasChildren = !hideChildren && (children.length > 0 || reminders.length > 0)
  const isEmail = task.task_type === 'responder_email'
  // Solicitud de influencers: tarea madre que coordina el pedido a la agencia.
  const isSolicitud = task.task_type === 'solicitud_influencers'
  // Perfil pendiente / confirmado: subtarea de "Solicitar influencers" que se
  // marca confirmada cuando ya tiene nombre + handle (los completa el usuario
  // a medida que la agencia responde).
  const isPerfil = task.task_type === 'influencer'
  const perfilConfirmado = isPerfil
    && !!task.influencer_nombre?.trim()
    && !!(task.influencer_handle || '').trim()
  // Tarea de contenido que va a la grilla RRSS (influencer colab o solo_contenido).
  const enGrilla = task.task_type === 'contenido' && vaAGrilla(task.tipo_publicacion || task.content_pub_type)
  // Cuando se renderiza como top-level (level=0) pero tiene parent_task_id,
  // significa que aparece en una sección porque su fecha difiere de la del
  // padre — mostramos un badge "parte de" indicando la madre.
  const orphanDisplayParent = level === 0 && task.parent_task_id
    ? allTasks.find(p => p.id === task.parent_task_id)
    : null

  // DnD: ¿este task puede ser drop target válido?
  function canBeDropTarget(): boolean {
    return !task.done && !!_dndDragId && _dndDragId !== task.id && _dndDragContext === task.context
  }

  return (
    <div>
      <div
        onClick={() => hasChildren ? setExpanded(e => !e) : openDetail(task.id)}
        draggable={!task.done}
        onDragStart={e => {
          _dndDragId = task.id
          _dndDragContext = task.context
          e.dataTransfer.setData('text/task-id', String(task.id))
          e.dataTransfer.effectAllowed = 'move'
          // Un pequeño delay para que el ghost image se capture antes de aplicar opacity
          setTimeout(() => {
            const el = e.currentTarget as HTMLElement
            el.style.opacity = '0.4'
          }, 0)
        }}
        onDragEnd={e => {
          _dndDragId = null
          _dndDragContext = null
          ;(e.currentTarget as HTMLElement).style.opacity = ''
          setIsDragTarget(false)
        }}
        onDragOver={e => {
          if (!canBeDropTarget()) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          if (!isDragTarget) setIsDragTarget(true)
        }}
        onDragLeave={e => {
          // Solo limpiar si el puntero salió del elemento (no de un hijo)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragTarget(false)
          }
        }}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragTarget(false)
          if (!canBeDropTarget()) return
          const dragId = _dndDragId!
          _dndDragId = null
          _dndDragContext = null
          openSubtaskConvert(dragId, task.id)
        }}
        className={`flex items-start gap-2.5 p-3 bg-bg2 rounded-[10px] cursor-pointer transition-all shadow-sm hover:-translate-y-px ${
          isDragTarget
            ? 'border-2 border-claude/50 shadow-md ring-2 ring-claude/10'
            : 'border border-black/7 hover:border-black/13 hover:shadow-md'
        } ${task.done ? 'opacity-40' : ''}`}
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

        {task.es_delegada && !task.done ? (
          <div
            onClick={(e) => { e.stopPropagation(); enviarParaValidacion(task.id) }}
            className="w-4 h-4 rounded-[5px] border-[1.5px] border-teal-300 text-teal-600 shrink-0 mt-0.5 flex items-center justify-center text-[9px] cursor-pointer transition-all hover:bg-teal-50"
            title="Enviar para validación"
          >
            ↑
          </div>
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); toggleTask(task.id) }}
            className={`w-4 h-4 rounded-[5px] border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center text-[10px] cursor-pointer transition-all ${
              task.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'
            }`}
          >
            {task.done && '✓'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className={`text-[13px] leading-snug font-medium ${task.done ? 'line-through text-gray-400' : ''}`}>
            {task.es_recurrente_instance && (
              <span
                className="mr-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded font-medium align-middle"
                style={{ background: 'rgba(37,99,235,0.10)', color: '#2563eb' }}
                title={`Generada automáticamente por recurrente`}
              >🔄</span>
            )}
            {isEmail && <span className="mr-1">✉️</span>}
            {isSolicitud && <span className="mr-1">🎬</span>}
            {isPerfil && <span className="mr-1">👤</span>}
            {prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{prefix} |</span>}
            {name}
            {children.length > 0 && <span className="ml-1.5 text-[10px] font-mono text-gray-400">({children.length})</span>}
            {reminders.length > 0 && <span className="ml-1 text-[10px]">🔔</span>}
          </div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded font-medium"
              style={{ background: stColor + '16', color: stColor }}
            >
              {STATUS_ICON[task.status || 'Inbox']} {task.status || 'Inbox'}
            </span>

            {task.es_recurrente_instance && (
              <Tag bg="rgba(37,99,235,0.08)" color="#2563eb">🔄 Recurrente</Tag>
            )}

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

            {clientB && (
              <Tag bg={clientB.color + '14'} color={clientB.color}>
                <span title={clientB.name}>{clientB.sigla}</span>
              </Tag>
            )}

            {/* El proyecto ya no se muestra como tag: las tareas con proyecto se
                agrupan bajo su tarjeta de proyecto (ver TaskList/KanbanBoard). */}

            {due && (
              <Tag bg={overdue ? 'rgba(220,38,38,0.12)' : due.urgent ? 'rgba(220,38,38,0.07)' : 'var(--color-bg4)'}
                   color={overdue || due.urgent ? '#dc2626' : '#6b6860'}>
                {task.task_type === 'contenido' ? `Entrega ${overdue || due.text}` : (overdue || due.text)}
              </Tag>
            )}

            {task.publish_date && (
              <Tag bg="rgba(124,58,237,0.07)" color="#7c3aed">📅 Pub {task.publish_date.slice(5).replace('-', '/')}</Tag>
            )}

            {isPerfil && (
              perfilConfirmado
                ? <Tag bg="rgba(22,163,74,0.10)" color="#16a34a">✓ Perfil confirmado</Tag>
                : <Tag bg="rgba(217,119,6,0.10)" color="#d97706">⏳ Perfil pendiente</Tag>
            )}

            {isSolicitud && (
              <Tag bg="rgba(124,58,237,0.10)" color="#7c3aed">🎬 Solicitud influencers</Tag>
            )}

            {task.es_campana && (
              <Tag bg="rgba(220,38,38,0.10)" color="#dc2626">🎯 Campaña</Tag>
            )}
            {task.es_campana && task.campana_fecha_inicio && (
              <Tag bg="rgba(220,38,38,0.07)" color="#dc2626">
                Evento: {task.campana_fecha_inicio.slice(5).replace('-', '/')}
                {task.campana_fecha_fin ? ` → ${task.campana_fecha_fin.slice(5).replace('-', '/')}` : ''}
              </Tag>
            )}

            {/* "📅 En grilla" — contenido (incluido influencer colab/solo_contenido)
                que va al calendario RRSS. Útil para distinguir piezas de grilla
                de las que viven solo en cuenta del influencer. */}
            {enGrilla && (
              <Tag bg="rgba(13,148,136,0.10)" color="#0d9488">📅 En grilla</Tag>
            )}

            {/* Etapa actual del flujo de contenido */}
            {task.task_type === 'contenido' && task.current_stage && (() => {
              const cs = CONTENT_STAGES.find(s => s.v === task.current_stage)
              return cs ? <Tag bg="rgba(124,58,237,0.08)" color="#7c3aed">{cs.emoji} {cs.label}</Tag> : null
            })()}

            {/* Banco RRSS/ADS: badge de aprobación requerida en feedback */}
            {task.context === 'banco' && isRRSSContent(task) && task.status === 'En seguimiento' && task.seguimiento_tipo === 'feedback' && (
              <Tag bg="rgba(220,38,38,0.10)" color="#dc2626">⚡ Aprobación Felipe</Tag>
            )}
            {/* Contenido banco no-RRSS delegado a Gonza sin aprobación necesaria */}
            {task.context === 'banco' && task.task_type === 'contenido' && !isRRSSContent(task) && task.delegated_to === 'Gonza' && !CLOSING_STATES.includes(task.status) && (
              <Tag bg="rgba(13,148,136,0.10)" color="#0d9488">Gonza gestiona</Tag>
            )}

            {/* Hija que aparece top-level por tener fecha distinta a la padre. */}
            {orphanDisplayParent && (
              <Tag bg="var(--color-bg4)" color="#6b6860">
                <span title={orphanDisplayParent.title}>↳ Parte de {splitTitle(orphanDisplayParent.title).name}</span>
              </Tag>
            )}

            {(() => {
              const pt = task.tipo_publicacion || task.content_pub_type
              const b = pubTypeBadge(pt)
              return b ? (
                <Tag bg={b.color + '14'} color={b.color}>
                  {b.label}{task.influencer_handle ? ` ${task.influencer_handle}` : ''}
                </Tag>
              ) : null
            })()}

            {task.estimated_hours != null && (
              <Tag bg="rgba(124,58,237,0.07)" color="#7c3aed">⏱ {fmtHoras(task.estimated_hours)}</Tag>
            )}

            {task.requested_at && task.created_at && task.requested_at !== task.created_at.slice(0, 10) && (
              <Tag bg="var(--color-bg4)" color="#6b6860">📨 {task.requested_at.slice(5).replace('-', '/')}</Tag>
            )}

            {(task.cats || []).slice(0, 2).map(c => (
              <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 border border-black/7">
                #{c}
              </span>
            ))}
          </div>
        </div>

        <div className="relative shrink-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowItemMenu(m => !m) }}
            className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer px-1 leading-none"
            title="Opciones"
          >⋯</button>
          {showItemMenu && (
            <>
              <div className="fixed inset-0 z-[5]" onClick={() => setShowItemMenu(false)} />
              <div className="absolute right-6 top-0 bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 z-10 w-32">
                <button
                  onClick={(e) => { e.stopPropagation(); openDuplicateTask(task.id); setShowItemMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer"
                >📋 Duplicar</button>
              </div>
            </>
          )}
          <div
            onClick={(e) => { e.stopPropagation(); openDetail(task.id) }}
            className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-[5px] cursor-pointer hover:bg-claude hover:text-white transition-colors"
            title="Abrir detalle"
          >→</div>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="ml-6 mt-1 flex flex-col gap-1 border-l-2 pl-2.5"
          style={{ borderColor: indentColor(level) + '30' }}>
          {/* Recursivo: cada hija renderiza un TaskItem con level+1, sin tope. */}
          {children.map(c => <TaskItem key={c.id} task={c} level={level + 1} />)}
          {reminders.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 uppercase tracking-wider mt-1 mb-0.5">
                <span className="h-px flex-1 bg-black/7" />Recordatorios<span className="h-px flex-1 bg-black/7" />
              </div>
              {reminders.map(r => <ReminderRow key={r.id} reminder={r} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
