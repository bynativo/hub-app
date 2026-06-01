import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxColor, ctxLabel, nextRecurringDueDate, fmtDue, todayISO } from '../../lib/helpers'
import { STATUS_COLOR, TIPO_AGENCIA } from '../../lib/constants'
import { NewProjectModal } from '../modals/NewProjectModal'
import { ReminderRow } from '../tasks/ReminderRow'
import { TaskItem } from '../tasks/TaskItem'
import type { Task, Recurrente } from '../../lib/types'

const PROJECT_STATUSES = ['activo', 'en pausa', 'cerrado']

export function ProjectsView({ context, onOpenPres }: { context?: string; onOpenPres?: (id: number) => void }) {
  const allProjects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const recurrentes = useStore(s => s.recurrentes)
  const presentations = useStore(s => s.presentations)
  const openCapture = useStore(s => s.openCapture)
  const openProjectDetail = useStore(s => s.openProjectDetail)
  const openRecurrentCreate = useStore(s => s.openRecurrentCreate)
  const openRecurrentEdit = useStore(s => s.openRecurrentEdit)
  const markRecurrentExecuted = useStore(s => s.markRecurrentExecuted)
  const loadAll = useStore(s => s.loadAll)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  // Formulario de edición del proyecto seleccionado
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

  const projects = context ? allProjects.filter(p => p.context === context) : allProjects
  const selected = projects.find(p => p.id === selectedId)
  const selectedPres = selected ? presentations.find(pr => pr.project_id === selected.id) : null
  const agClients = clients.filter(c => c.context === 'agencia')

  // En Banco renombramos "Proyectos" → "Campañas y proyectos" (incluye campañas
  // mensuales, lanzamientos, etc.) — el resto de contextos sigue diciendo "Proyectos".
  const pageTitle = context === 'banco' ? 'Campañas y proyectos' : 'Proyectos'
  const itemNoun = context === 'banco' ? 'campañas y proyectos' : 'proyectos'
  const accent = context ? ctxColor(context) : '#7c3aed'

  // Tareas top-level (no recordatorios) vinculadas al proyecto seleccionado.
  const selectedTasksOnly = selected ? tasks.filter(t => t.project_id === selected.id && !t.parent_task_id && !t.es_recordatorio) : []
  // Recordatorios vinculados directamente al proyecto (parent_task_id null, project_id = X).
  const selectedReminders = selected ? tasks.filter(t => t.project_id === selected.id && !t.parent_task_id && t.es_recordatorio && !t.done && !t.archived_at) : []
  // Recurrentes vinculadas al proyecto.
  const selectedRecurrentes = selected ? recurrentes.filter(r => r.project_id === selected.id) : []

  // Lista unificada para la vista del proyecto, ordenada por la "fecha activa" de
  // cada item (due/recordatorio/próxima ejecución). Sin fecha → al final.
  type UnifiedItem =
    | { kind: 'task'; task: Task; sortKey: string }
    | { kind: 'reminder'; task: Task; sortKey: string }
    | { kind: 'recurrent'; rec: Recurrente; date: string; sortKey: string }
  const unified: UnifiedItem[] = (() => {
    if (!selected) return []
    const arr: UnifiedItem[] = []
    for (const t of selectedTasksOnly) arr.push({ kind: 'task', task: t, sortKey: t.due_date || 'zzzz' })
    for (const r of selectedReminders) arr.push({ kind: 'reminder', task: r, sortKey: (r.recordatorio_at || 'zzzz').slice(0, 10) })
    for (const r of selectedRecurrentes) {
      const d = nextRecurringDueDate(r)
      arr.push({ kind: 'recurrent', rec: r, date: d, sortKey: d })
    }
    return arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  })()

  useEffect(() => {
    if (!selected) return
    setName(selected.name || '')
    setDescription(selected.description || '')
    setStatus(selected.status || 'activo')
    setTipoAgencia(selected.tipo_agencia || TIPO_AGENCIA[0])
    setClientId(selected.client_id)
    setDueDate(selected.due_date || '')
    setIsOngoing(!!selected.is_ongoing || !selected.due_date)
    setDirty(false)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const mark = <T,>(setter: (v: T) => void, v: T) => { setter(v); setDirty(true) }

  async function saveProject() {
    if (!selected || !name.trim()) return
    setSaving(true)
    const isAgencia = selected.context === 'agencia'
    await supabase.from('projects').update({
      name: name.trim(),
      description: description.trim() || null,
      status,
      due_date: isOngoing ? null : (dueDate || null),
      is_ongoing: isOngoing,
      client_id: isAgencia ? clientId : null,
      es_interno: isAgencia ? !clientId : false,
      tipo_agencia: isAgencia ? tipoAgencia : null,
    }).eq('id', selected.id)
    await loadAll()
    setSaving(false); setDirty(false)
  }

  async function deleteProject() {
    if (!selected) return
    setDeleting(true)
    // Las tareas vinculadas NO se borran: quedan sin proyecto asignado.
    await supabase.from('tasks').update({ project_id: null }).eq('project_id', selected.id)
    const { error } = await supabase.from('projects').delete().eq('id', selected.id)
    if (error) { alert('Error: ' + error.message); setDeleting(false); return }
    setDeleting(false); setConfirmDel(false); setSelectedId(null)
    await loadAll()
  }

  const fieldCls = 'w-full bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  function getPct(projId: number) {
    // Progreso solo cuenta tareas reales (no recordatorios) del proyecto.
    const all = tasks.filter(t => t.project_id === projId && !t.parent_task_id && !t.es_recordatorio)
    if (!all.length) return 0
    return Math.round(all.filter(t => t.done).length / all.length * 100)
  }

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>{pageTitle}</h1>
          <p className="text-gray-500 text-[13px]">{context ? ctxLabel(context) : 'Todos los contextos'} · {projects.length} {itemNoun}</p>
        </div>
        <button onClick={() => setNewOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          {context === 'banco' ? '+ Nueva campaña / proyecto' : '+ Nuevo proyecto'}
        </button>
      </div>

      <div className="grid gap-2.5">
        {projects.map(p => {
          const pct = getPct(p.id)
          const all = tasks.filter(t => t.project_id === p.id && !t.parent_task_id)
          const pend = all.filter(t => !t.done).length
          const stColor = STATUS_COLOR[p.status || ''] || '#6b7280'
          return (
            <div key={p.id} onClick={() => openProjectDetail(p.id)}
              className="bg-bg2 border border-black/7 rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-px hover:border-black/13 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <div className="text-[15px] font-medium">{p.name}</div>
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="flex-1 h-[5px] bg-bg4 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ctxColor(p.context) }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{pct}%</span>
                </div>
              </div>
              {p.description && <div className="text-[12px] text-gray-500 mb-2 leading-snug">{p.description}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize" style={{ background: stColor + '14', color: stColor }}>{p.status || 'activo'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: ctxColor(p.context) + '12', color: ctxColor(p.context) }}>{ctxLabel(p.context)}</span>
                {p.tipo_agencia && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">🏷 {p.tipo_agencia}</span>}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{all.length} tareas · {pend} pendientes</span>
                {p.clients
                  ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{p.clients.name}</span>
                  : p.es_interno && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">Interno</span>}
                {p.due_date
                  ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">Entrega: {p.due_date.slice(5).replace('-', '/')}</span>
                  : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">Ongoing</span>}
              </div>
            </div>
          )
        })}
        {!projects.length && <div className="text-center py-7 text-gray-400 text-[13px]">Sin {itemNoun} en este contexto</div>}
      </div>

      {selected && (
        <div className="mt-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden shadow-md animate-fade-in">
          <div className="p-4 border-b border-black/7 flex items-start justify-between">
            <div className="font-serif text-lg font-light" style={{ color: ctxColor(selected.context) }}>{selected.name}</div>
            <div className="flex gap-2 shrink-0">
              {selectedPres && onOpenPres && (
                <button onClick={() => onOpenPres(selectedPres.id)} className="text-xs bg-claude/7 border border-claude/20 text-claude px-3 py-1.5 rounded-lg hover:bg-claude/15 cursor-pointer">Ver presentación</button>
              )}
              <div className="relative">
                <button onClick={() => setAddMenuOpen(o => !o)}
                  className="text-xs bg-claude border-claude text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Agregar ▾</button>
                {addMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[10]" onClick={() => setAddMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-bg2 border border-black/13 rounded-lg shadow-lg py-1 z-[11] w-48">
                      <button onClick={() => { setAddMenuOpen(false); openCapture({ context: selected.context, projectId: selected.id, clientId: selected.client_id }) }}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded border-[1.5px] border-black/30 inline-block" /> Tarea
                      </button>
                      <button onClick={() => { setAddMenuOpen(false); openCapture({ context: selected.context, projectId: selected.id, clientId: selected.client_id, reminder: true }) }}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                        <span>🔔</span> Recordatorio
                      </button>
                      <button onClick={() => { setAddMenuOpen(false); openRecurrentCreate({ context: selected.context, clientId: selected.client_id, projectId: selected.id }) }}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer flex items-center gap-2">
                        <span>🔄</span> Recurrente
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-lg">✕</button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-black/7 bg-bg3 flex items-center gap-3">
            <div className="text-[11px] font-mono text-gray-400">Progreso</div>
            <div className="flex-1 h-2 bg-bg4 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${getPct(selected.id)}%`, background: ctxColor(selected.context) }} />
            </div>
            <div className="text-[13px] font-medium" style={{ color: ctxColor(selected.context) }}>{selectedTasksOnly.filter(t => t.done).length}/{selectedTasksOnly.length}</div>
          </div>

          {/* Formulario editable del proyecto */}
          <div className="p-4 flex flex-col gap-3 border-b border-black/7">
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
              {selected.context === 'agencia' && (
                <div>
                  <label className={labelCls}>Tipo de proyecto</label>
                  <select value={tipoAgencia} onChange={e => mark(setTipoAgencia, e.target.value)} className={fieldCls}>
                    {TIPO_AGENCIA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
            {selected.context === 'agencia' && (
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

            <div className="flex items-center justify-between">
              <button onClick={() => setConfirmDel(true)}
                className="text-xs text-danger bg-danger/7 border border-danger/25 px-4 py-2 rounded-lg hover:bg-danger/15 transition-colors cursor-pointer">
                🗑 Eliminar proyecto
              </button>
              <button onClick={saveProject} disabled={!dirty || !name.trim() || saving}
                className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Tareas, recordatorios y recurrentes</div>
            {unified.length ? (
              <div className="flex flex-col gap-1">
                {unified.map(it => {
                  if (it.kind === 'task') {
                    // TaskItem es recursivo → al expandir, muestra el árbol
                    // completo (subtareas, sub-subtareas y recordatorios anidados)
                    // con indent y colores por nivel.
                    return <TaskItem key={`t${it.task.id}`} task={it.task} />
                  }
                  if (it.kind === 'reminder') {
                    return <ReminderRow key={`r${it.task.id}`} reminder={it.task} />
                  }
                  // recurrent
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
        </div>
      )}

      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} defaultContext={context || 'banco'} />}

      {confirmDel && selected && (
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
