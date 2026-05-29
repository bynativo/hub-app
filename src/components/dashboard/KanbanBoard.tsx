import { useState } from 'react'
import { useStore } from '../../lib/store'
import { KANBAN_GROUPS, ESTADOS, STATUS_COLOR } from '../../lib/constants'
import { ctxColor, splitTitle, clientBadge } from '../../lib/helpers'
import type { Task, Project } from '../../lib/types'

// Estado destino al soltar una tarea en una columna universal:
// primer estado del grupo que sea válido para el contexto de la tarea.
function targetStatus(context: string, groupStatuses: string[]): string {
  const ctxStates = ESTADOS[context] || ESTADOS.banco
  return groupStatuses.find(s => ctxStates.includes(s)) || groupStatuses[0]
}

function KanbanCard({ task, subs, focused, onDragStart, onFocus }: {
  task: Task
  subs: Task[]
  focused: boolean
  onDragStart: (id: number, e: React.DragEvent) => void
  onFocus: (id: number) => void
}) {
  const openDetail = useStore(s => s.openDetail)
  const clients = useStore(s => s.clients)
  const prioColor = task.priority === 'alta' ? '#dc2626' : task.priority === 'media' ? '#d97706' : '#16a34a'
  const doneSubs = subs.filter(s => s.done).length
  const parts = splitTitle(task.title)
  const clientB = clientBadge(task.client_id, clients)
  return (
    <div
      draggable
      onDragStart={e => onDragStart(task.id, e)}
      onClick={() => openDetail(task.id)}
      className="bg-bg2 border border-black/7 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-black/13 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <div className="w-[7px] h-[7px] rounded-full shrink-0 mt-1" style={{ background: ctxColor(task.context) }} />
        <div className="text-[13px] leading-snug flex-1">
          {parts.prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{parts.prefix} |</span>}{parts.name}
        </div>
        {subs.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onFocus(task.id) }}
            title={focused ? 'Limpiar filtro' : 'Ver solo esta tarea y sus subtareas'}
            className={`shrink-0 text-[11px] leading-none px-1 py-0.5 rounded cursor-pointer transition-colors ${
              focused ? 'text-claude bg-claude/10' : 'text-gray-300 hover:text-claude hover:bg-claude/7'
            }`}
          >⤢</button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap pl-[13px]">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: prioColor + '14', color: prioColor }}>
          {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Baja'}
        </span>
        {clientB && (
          <span title={clientB.name} className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
            style={{ background: clientB.color + '14', color: clientB.color }}>{clientB.sigla}</span>
        )}
        {task.due_date && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{task.due_date.slice(5).replace('-', '/')}</span>
        )}
        {subs.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">
            {doneSubs > 0 ? `${doneSubs}/${subs.length}` : `${subs.length}`} subtarea{subs.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {/* Las hijas NO se renderizan dentro del card — click en card abre el
          panel de detalle con el árbol completo. El contador arriba lo informa. */}
    </div>
  )
}

// Tarjeta de proyecto en el Kanban: agrupa, dentro de una columna, las tareas
// del proyecto que están en ese estado. Expandible, con carpeta y badge.
function ProjectKanbanCard({ project, tasks, subsOf, focusId, onDragStart, onFocus }: {
  project: Project
  tasks: Task[]
  subsOf: (parentId: number) => Task[]
  focusId: number | null
  onDragStart: (id: number, e: React.DragEvent) => void
  onFocus: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const accent = ctxColor(project.context)
  return (
    <div className="rounded-lg border border-claude/20 bg-claude/[0.04] p-1.5">
      <div onClick={() => setExpanded(e => !e)} className="flex items-center gap-1.5 px-1 py-0.5 cursor-pointer">
        <span className="text-[9px] text-gray-400">{expanded ? '▼' : '▶'}</span>
        <span className="text-[12px] leading-none">📁</span>
        <span className="text-[12px] font-medium flex-1 truncate" style={{ color: accent }}>{project.name}</span>
        <span className="text-[9px] font-mono px-1 py-px rounded bg-claude/10 text-claude shrink-0">Proyecto</span>
        <span className="text-[10px] font-mono text-gray-400 shrink-0">{tasks.length}</span>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 mt-1">
          {tasks.map(t => (
            <KanbanCard key={t.id} task={t} subs={subsOf(t.id)} focused={focusId === t.id}
              onDragStart={onDragStart} onFocus={onFocus} />
          ))}
        </div>
      )}
    </div>
  )
}

export function KanbanBoard({ items, columns }: { items?: Task[]; columns?: { key: string; label: string; statuses: string[] }[] } = {}) {
  const tasks = useStore(s => s.tasks)
  const projects = useStore(s => s.projects)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)

  // `columns` = columnas por contexto (1 estado por columna); por defecto las 4 universales.
  const cols = columns || KANBAN_GROUPS
  // Conjunto base: si recibe `items` los usa; si no, todas las activas (sin recordatorios).
  // El source puede traer subtareas (vistas por fecha) o solo top-level (vistas por contexto).
  const source = items ?? tasks.filter(t => !t.done && !t.es_recordatorio && !t.archived_at)

  // Las tarjetas son tareas top-level. Si el source trae subtareas, mostramos su padre
  // para que la subtarea quede visible anidada (aunque el padre no esté en el source).
  const parentIds = new Set<number>()
  for (const t of source) parentIds.add(t.parent_task_id ?? t.id)
  let cards = tasks.filter(t => parentIds.has(t.id) && !t.parent_task_id && !t.done && !t.archived_at)

  // Subtareas a anidar: si el source ya trae subtareas (vistas por fecha) mostramos solo esas
  // (las que caen en el rango); si no, todas las subtareas activas del padre.
  const sourceSubs = source.filter(t => t.parent_task_id)
  const hasSubsInSource = sourceSubs.length > 0
  const subsOf = (parentId: number): Task[] => hasSubsInSource
    ? sourceSubs.filter(s => s.parent_task_id === parentId)
    : tasks.filter(s => s.parent_task_id === parentId && !s.done && !s.archived_at)

  // Filtro "ver solo esta tarea y sus subtareas"
  const focusedTask = focusId != null ? tasks.find(t => t.id === focusId) : null
  if (focusId != null) cards = cards.filter(c => c.id === focusId)

  const groupKeyOf = (status: string) => cols.find(g => g.statuses.includes(status))?.key || cols[0].key

  function handleDragStart(id: number, e: React.DragEvent) {
    setDraggingId(id)
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(groupKey: string, e: React.DragEvent) {
    e.preventDefault()
    setOverCol(null)
    const raw = e.dataTransfer.getData('text/plain')
    const id = raw ? Number(raw) : draggingId
    setDraggingId(null)
    if (id == null || Number.isNaN(id)) return
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const group = cols.find(g => g.key === groupKey)!
    if (group.statuses.includes(task.status)) return // ya está en esta columna
    await updateTaskStatus(id, targetStatus(task.context, group.statuses))
  }

  const onFocus = (id: number) => setFocusId(f => f === id ? null : id)

  // Renderiza el contenido de una columna: tareas sin proyecto como cards sueltas;
  // las tareas con proyecto agrupadas bajo una tarjeta de proyecto (proyecto = tarea padre).
  function renderColumn(colItems: Task[]) {
    const seenProj = new Set<number>()
    const out: React.ReactNode[] = []
    for (const t of colItems) {
      const project = t.project_id ? projects.find(p => p.id === t.project_id) : undefined
      if (project) {
        if (seenProj.has(project.id)) continue
        seenProj.add(project.id)
        const pts = colItems.filter(x => x.project_id === project.id)
        out.push(<ProjectKanbanCard key={`p${project.id}`} project={project} tasks={pts}
          subsOf={subsOf} focusId={focusId} onDragStart={handleDragStart} onFocus={onFocus} />)
      } else {
        out.push(<KanbanCard key={t.id} task={t} subs={subsOf(t.id)} focused={focusId === t.id}
          onDragStart={handleDragStart} onFocus={onFocus} />)
      }
    }
    if (!out.length) out.push(<div key="empty" className="text-center py-6 text-gray-300 text-[11px]">—</div>)
    return out
  }

  return (
    <div>
      {focusedTask && (
        <div className="flex items-center gap-2 mb-3 bg-claude/5 border border-claude/20 rounded-lg px-3 py-2">
          <span className="text-[12px] text-claude">⤢ Viendo solo <span className="font-medium">{focusedTask.title}</span> y sus subtareas</span>
          <button onClick={() => setFocusId(null)}
            className="ml-auto text-[11px] text-gray-500 bg-bg2 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4 transition-colors">
            Limpiar filtro
          </button>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map(group => {
          const colItems = cards.filter(t => groupKeyOf(t.status) === group.key)
          const accent = STATUS_COLOR[group.statuses[0]] || '#6b7280'
          return (
            <div
              key={group.key}
              onDragOver={e => { e.preventDefault(); setOverCol(group.key) }}
              onDragLeave={() => setOverCol(c => c === group.key ? null : c)}
              onDrop={e => handleDrop(group.key, e)}
              className={`flex-1 min-w-[205px] rounded-xl border transition-colors ${
                overCol === group.key ? 'border-claude/40 bg-claude/5' : 'border-black/7 bg-bg3'
              }`}
            >
              <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-black/7">
                <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                <span className="text-[12px] font-medium">{group.label}</span>
                <span className="ml-auto font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{colItems.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 min-h-[140px]">
                {renderColumn(colItems)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
