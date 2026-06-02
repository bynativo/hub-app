import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxColor, ctxLabel, nextRecurringDueDate, fmtDue, todayISO } from '../../lib/helpers'
import { TIPO_AGENCIA } from '../../lib/constants'
import { AttachmentsZone, type AttachmentsZoneHandle } from '../tasks/AttachmentsZone'
import { TaskItem } from '../tasks/TaskItem'
import { ReminderRow } from '../tasks/ReminderRow'
import type { Task, Recurrente } from '../../lib/types'

const PROJECT_STATUSES = ['activo', 'en pausa', 'cerrado']

// Panel lateral con la info editable de un proyecto + árbol unificado de
// tareas, recordatorios y recurrentes vinculadas. Mismo patrón que TaskDetail:
// se monta global en App.tsx y se abre/cierra desde el store.
export function ProjectDetail() {
  const projects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const recurrentes = useStore(s => s.recurrentes)
  const clients = useStore(s => s.clients)
  const currentProjectId = useStore(s => s.currentProjectId)
  const closeProjectDetail = useStore(s => s.closeProjectDetail)
  const openCapture = useStore(s => s.openCapture)
  const openRecurrentCreate = useStore(s => s.openRecurrentCreate)
  const openRecurrentEdit = useStore(s => s.openRecurrentEdit)
  const markRecurrentExecuted = useStore(s => s.markRecurrentExecuted)
  const loadAll = useStore(s => s.loadAll)

  const project = projects.find(p => p.id === currentProjectId) || null

  // Formulario editable
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('activo')
  const [tipoAgencia, setTipoAgencia] = useState(TIPO_AGENCIA[0])
  const [clientId, setClientId] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [isOngoing, setIsOngoing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  useEffect(() => {
    if (!project) return
    setName(project.name || '')
    setDescription(project.description || '')
    setStatus(project.status || 'activo')
    setTipoAgencia(project.tipo_agencia || TIPO_AGENCIA[0])
    setClientId(project.client_id)
    setDueDate(project.due_date || '')
    setIsOngoing(!!project.is_ongoing || !project.due_date)
    setDirty(false)
  }, [currentProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return null
  const accent = ctxColor(project.context)
  const agClients = clients.filter(c => c.context === 'agencia')

  // Tareas top-level (no recordatorios, no archived) del proyecto.
  const projectTasksOnly = tasks.filter(t => t.project_id === project.id && !t.parent_task_id && !t.es_recordatorio && !t.archived_at)
  // Recordatorios vinculados directamente al proyecto.
  const projectReminders = tasks.filter(t => t.project_id === project.id && !t.parent_task_id && t.es_recordatorio && !t.done && !t.archived_at)
  // Recurrentes vinculadas al proyecto.
  const projectRecurrentes = recurrentes.filter(r => r.project_id === project.id)

  // Lista unificada ordenada por fecha activa.
  type UnifiedItem =
    | { kind: 'task'; task: Task; sortKey: string }
    | { kind: 'reminder'; task: Task; sortKey: string }
    | { kind: 'recurrent'; rec: Recurrente; date: string; sortKey: string }
  const unified: UnifiedItem[] = (() => {
    const arr: UnifiedItem[] = []
    for (const t of projectTasksOnly) arr.push({ kind: 'task', task: t, sortKey: t.due_date || 'zzzz' })
    for (const r of projectReminders) arr.push({ kind: 'reminder', task: r, sortKey: (r.recordatorio_at || 'zzzz').slice(0, 10) })
    for (const r of projectRecurrentes) {
      const d = nextRecurringDueDate(r)
      arr.push({ kind: 'recurrent', rec: r, date: d, sortKey: d })
    }
    return arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  })()

  // Progreso = tareas (no recordatorios) terminadas / total
  const allTasks = tasks.filter(t => t.project_id === project.id && !t.parent_task_id && !t.es_recordatorio)
  const pct = allTasks.length ? Math.round(allTasks.filter(t => t.done).length / allTasks.length * 100) : 0
  const mark = <T,>(setter: (v: T) => void, v: T) => { setter(v); setDirty(true) }

  async function save() {
    if (!project || !name.trim()) return
    setSaving(true)
    const isAgencia = project.context === 'agencia'
    await supabase.from('projects').update({
      name: name.trim(),
      description: description.trim() || null,
      status,
      due_date: isOngoing ? null : (dueDate || null),
      is_ongoing: isOngoing,
      client_id: isAgencia ? clientId : null,
      es_interno: isAgencia ? !clientId : false,
      tipo_agencia: isAgencia ? tipoAgencia : null,
    }).eq('id', project.id)
    await loadAll()
    setSaving(false); setDirty(false)
  }

  async function deleteProject() {
    if (!project) return
    setDeleting(true)
    // Las tareas vinculadas NO se borran: quedan sin proyecto asignado.
    await supabase.from('tasks').update({ project_id: null }).eq('project_id', project.id)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) { alert('Error: ' + error.message); setDeleting(false); return }
    setDeleting(false); setConfirmDel(false)
    closeProjectDetail()
    await loadAll()
  }

  const fieldCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  // Drag&drop a nivel del panel (mismo patron que TaskDetail).
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)
  const dragCounter = useRef(0)
  const [dragActive, setDragActive] = useState(false)
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types || []).includes('Files')
  }
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault(); dragCounter.current += 1; setDragActive(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setDragActive(false)
  }
  function onDragOver(e: React.DragEvent) { if (hasFiles(e)) e.preventDefault() }
  function onPanelDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault(); dragCounter.current = 0; setDragActive(false)
    if (e.dataTransfer.files?.length) attachmentsRef.current?.uploadFiles(e.dataTransfer.files)
  }

  return (
    <div
      className="fixed top-[52px] right-0 w-[540px] h-[calc(100vh-52px)] bg-bg border-l border-black/13 shadow-2xl overflow-y-auto z-[200] animate-fade-in"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onPanelDrop}
    >
      {dragActive && (
        <div className="fixed top-[52px] right-0 w-[540px] h-[calc(100vh-52px)] z-[210] pointer-events-none flex items-center justify-center p-4">
          <div className="w-full h-full border-2 border-dashed border-claude rounded-2xl bg-claude/10 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="text-[40px] mb-1">📥</div>
              <div className="text-[16px] font-medium text-claude">Soltá para adjuntar</div>
              <div className="text-[12px] text-claude/70 mt-1">Se vincula al proyecto "{project.name}"</div>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="sticky top-0 z-[1] bg-bg border-b border-black/7 px-5 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-[18px] leading-none mt-0.5">📁</span>
          <div className="min-w-0">
            <div className="font-serif text-[18px] font-light truncate" style={{ color: accent }}>{project.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: accent + '12', color: accent }}>{ctxLabel(project.context)}</span>
              {project.status && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize bg-bg4 text-gray-500">{project.status}</span>}
              {project.clients
                ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{project.clients.name}</span>
                : project.es_interno && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">Interno</span>}
              {project.is_ongoing || !project.due_date
                ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">Ongoing</span>
                : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">Entrega: {project.due_date.slice(5).replace('-', '/')}</span>}
            </div>
          </div>
        </div>
        <button onClick={closeProjectDetail} className="text-gray-400 hover:text-gray-900 cursor-pointer text-[18px] leading-none">✕</button>
      </div>

      {/* Progreso */}
      <div className="px-5 py-3 border-b border-black/7 bg-bg3 flex items-center gap-3">
        <div className="text-[11px] font-mono text-gray-400">Progreso</div>
        <div className="flex-1 h-2 bg-bg4 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <div className="text-[13px] font-medium" style={{ color: accent }}>{allTasks.filter(t => t.done).length}/{allTasks.length}</div>
      </div>

      {/* Formulario editable */}
      <div className="px-5 py-4 flex flex-col gap-3 border-b border-black/7">
        <div>
          <label className={labelCls}>Nombre</label>
          <input value={name} onChange={e => mark(setName, e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Descripción</label>
          <textarea value={description} onChange={e => mark(setDescription, e.target.value)} rows={2} className={fieldCls + ' resize-y'} placeholder="De qué trata el proyecto…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Status</label>
            <select value={status} onChange={e => mark(setStatus, e.target.value)} className={fieldCls + ' capitalize'}>
              {PROJECT_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          {project.context === 'agencia' && (
            <div>
              <label className={labelCls}>Tipo de proyecto</label>
              <select value={tipoAgencia} onChange={e => mark(setTipoAgencia, e.target.value)} className={fieldCls}>
                {TIPO_AGENCIA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
        </div>
        {project.context === 'agencia' && (
          <div>
            <label className={labelCls}>Cliente vinculado</label>
            <select value={clientId ?? ''} onChange={e => mark(setClientId, e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
              <option value="">Proyecto interno (sin cliente)</option>
              {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>Fecha de término</label>
            <button type="button" onClick={() => mark(setIsOngoing, !isOngoing)} className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <span className={`w-8 h-4 rounded-full relative transition-colors ${isOngoing ? 'bg-claude' : 'bg-bg4'}`}>
                <span className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${isOngoing ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
              Ongoing (sin fecha)
            </button>
          </div>
          {isOngoing
            ? <div className="text-[11px] text-gray-400">El proyecto queda como <span className="text-claude font-medium">Ongoing</span> (sin fecha de término).</div>
            : <input type="date" value={dueDate} onChange={e => mark(setDueDate, e.target.value)} className={fieldCls} />}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setConfirmDel(true)}
            className="text-xs text-danger bg-danger/7 border border-danger/25 px-3 py-1.5 rounded-lg hover:bg-danger/15 cursor-pointer">
            🗑 Eliminar proyecto
          </button>
          <button onClick={save} disabled={!dirty || !name.trim() || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40">
            {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>

        <AttachmentsZone ref={attachmentsRef} projectId={project.id} />
      </div>

      {/* Árbol unificado */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">
            Tareas, recordatorios y recurrentes
          </div>
          <div className="relative">
            <button onClick={() => setAddMenuOpen(o => !o)}
              className="text-[11px] bg-claude border-claude text-white px-3 py-1 rounded-md hover:bg-purple-700 cursor-pointer">+ Agregar ▾</button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-[10]" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-bg2 border border-black/13 rounded-lg shadow-lg py-1 z-[11] w-48">
                  <button onClick={() => { setAddMenuOpen(false); openCapture({ context: project.context, projectId: project.id, clientId: project.client_id }) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded border-[1.5px] border-black/30 inline-block" /> Tarea
                  </button>
                  <button onClick={() => { setAddMenuOpen(false); openCapture({ context: project.context, projectId: project.id, clientId: project.client_id, reminder: true }) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                    <span>🔔</span> Recordatorio
                  </button>
                  <button onClick={() => { setAddMenuOpen(false); openRecurrentCreate({ context: project.context, clientId: project.client_id, projectId: project.id }) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                    <span>🔄</span> Recurrente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {unified.length ? (
          <div className="flex flex-col gap-1.5">
            {unified.map(it => {
              if (it.kind === 'task') return <TaskItem key={`t${it.task.id}`} task={it.task} />
              if (it.kind === 'reminder') return <ReminderRow key={`r${it.task.id}`} reminder={it.task} />
              const r = it.rec
              const due = fmtDue(it.date)
              return (
                <div key={`rec${r.id}`} onClick={() => openRecurrentEdit(r.id)}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg border border-claude/20 bg-claude/[0.04] cursor-pointer hover:border-claude/35 hover:shadow-sm transition-all">
                  <span className="text-[15px] leading-none shrink-0">🔄</span>
                  <span className="text-[13px] flex-1">{r.title}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/10 text-claude">Recurrente</span>
                  {due && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                    style={{ background: due.urgent ? 'rgba(220,38,38,0.07)' : 'var(--color-bg4)', color: due.urgent ? '#dc2626' : '#6b6860' }}>{due.text}</span>}
                  {it.date === todayISO() && (
                    <button onClick={e => { e.stopPropagation(); markRecurrentExecuted(r.id) }}
                      className="text-[10px] text-success bg-success/10 border border-success/25 px-2 py-0.5 rounded cursor-pointer hover:bg-success hover:text-white transition-colors">
                      ✓ Hecha
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-400">Sin tareas, recordatorios ni recurrentes. Usá "+ Agregar".</div>
        )}
      </div>

      {/* Modal de confirmación eliminación */}
      {confirmDel && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmDel(false) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[420px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar proyecto</div>
            <p className="text-[13px] text-gray-500 mb-4">
              ¿Eliminar este proyecto? Las tareas vinculadas <span className="font-medium text-gray-700">no se eliminarán</span> — quedarán sin proyecto asignado.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(false)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={deleteProject} disabled={deleting} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-40">
                {deleting ? 'Eliminando…' : 'Eliminar proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
