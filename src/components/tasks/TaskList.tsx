import { useState } from 'react'
import type { Task, Project } from '../../lib/types'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel } from '../../lib/helpers'
import { TaskItem } from './TaskItem'

// Un proyecto se muestra como tarjeta padre expandible (igual que una tarea padre),
// con ícono de carpeta y badge "Proyecto". Sus tareas vinculadas se anidan al expandir.
function ProjectCard({ project, tasks }: { project: Project; tasks: Task[] }) {
  const openCapture = useStore(s => s.openCapture)
  const [expanded, setExpanded] = useState(false)
  const done = tasks.filter(t => t.done).length
  const accent = ctxColor(project.context)
  return (
    <div>
      <div
        onClick={() => setExpanded(e => !e)}
        className="flex items-start gap-2.5 p-3 bg-bg2 border border-black/7 rounded-[10px] cursor-pointer transition-all shadow-sm hover:border-black/13 hover:shadow-md"
      >
        <button onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
          className="text-[10px] text-gray-400 hover:text-claude shrink-0 mt-1 w-3 cursor-pointer"
          title={expanded ? 'Contraer proyecto' : 'Ver tareas del proyecto'}>
          {expanded ? '▼' : '▶'}
        </button>
        <span className="text-[14px] leading-none mt-0.5 shrink-0">📁</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] leading-snug font-medium">
            {project.name}
            <span className="ml-1.5 text-[10px] font-mono text-gray-400">({tasks.length})</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-medium bg-claude/7 text-claude">📁 Proyecto</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: accent + '12', color: accent }}>{ctxLabel(project.context)}</span>
            {project.status && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize bg-bg4 text-gray-500">{project.status}</span>}
            {project.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{project.clients.name}</span>}
            {project.is_ongoing || !project.due_date
              ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">Ongoing</span>
              : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">{project.due_date.slice(5).replace('-', '/')}</span>}
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">✓ {done}/{tasks.length}</span>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); openCapture({ context: project.context, projectId: project.id, clientId: project.client_id }) }}
          className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-[5px] cursor-pointer hover:bg-claude hover:text-white transition-colors shrink-0"
          title="Agregar tarea al proyecto">+
        </button>
      </div>

      {expanded && (
        <div className="ml-6 mt-1 flex flex-col gap-1 border-l-2 border-claude/20 pl-2.5">
          {tasks.map(t => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}

export function TaskList({ tasks, emptyText = 'Sin tareas', compactEmpty = false }: { tasks: Task[]; emptyText?: string; compactEmpty?: boolean }) {
  const projects = useStore(s => s.projects)
  if (!tasks.length) {
    if (compactEmpty) {
      return <div className="text-gray-300 text-[12px] italic pl-1 pb-1">{emptyText}</div>
    }
    return <div className="text-center py-7 text-gray-400 text-[13px]">{emptyText}</div>
  }
  // Las tareas con proyecto se agrupan bajo una tarjeta de proyecto (una sola por
  // proyecto, en su primera aparición); el resto se renderiza normal.
  const seen = new Set<number>()
  return (
    <div className="flex flex-col gap-1">
      {tasks.map(t => {
        if (!t.project_id) return <TaskItem key={t.id} task={t} />
        const project = projects.find(p => p.id === t.project_id)
        if (!project) return <TaskItem key={t.id} task={t} />
        if (seen.has(t.project_id)) return null
        seen.add(t.project_id)
        const pts = tasks.filter(x => x.project_id === t.project_id)
        return <ProjectCard key={`p${t.project_id}`} project={project} tasks={pts} />
      })}
    </div>
  )
}
