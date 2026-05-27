import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxColor, ctxLabel, splitTitle } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR, TIPO_AGENCIA } from '../../lib/constants'
import { NewProjectModal } from '../modals/NewProjectModal'
import { ReminderRow } from '../tasks/ReminderRow'

const PROJECT_STATUSES = ['activo', 'en pausa', 'cerrado']

export function ProjectsView({ context, onOpenPres }: { context?: string; onOpenPres?: (id: number) => void }) {
  const allProjects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const presentations = useStore(s => s.presentations)
  const openDetail = useStore(s => s.openDetail)
  const openCapture = useStore(s => s.openCapture)
  const loadAll = useStore(s => s.loadAll)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)

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
  const selectedTasks = selected ? tasks.filter(t => t.project_id === selected.id && !t.parent_task_id) : []
  const selectedPres = selected ? presentations.find(pr => pr.project_id === selected.id) : null
  const agClients = clients.filter(c => c.context === 'agencia')

  const accent = context ? ctxColor(context) : '#7c3aed'

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
    const all = tasks.filter(t => t.project_id === projId && !t.parent_task_id)
    if (!all.length) return 0
    return Math.round(all.filter(t => t.done).length / all.length * 100)
  }

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>Proyectos</h1>
          <p className="text-gray-500 text-[13px]">{context ? ctxLabel(context) : 'Todos los contextos'} · {projects.length} proyectos</p>
        </div>
        <button onClick={() => setNewOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nuevo proyecto
        </button>
      </div>

      <div className="grid gap-2.5">
        {projects.map(p => {
          const pct = getPct(p.id)
          const all = tasks.filter(t => t.project_id === p.id && !t.parent_task_id)
          const pend = all.filter(t => !t.done).length
          const stColor = STATUS_COLOR[p.status || ''] || '#6b7280'
          return (
            <div key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              className={`bg-bg2 border rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all shadow-sm ${
                selectedId === p.id ? 'border-claude/20 shadow-md' : 'border-black/7 hover:border-black/13'
              }`}>
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
        {!projects.length && <div className="text-center py-7 text-gray-400 text-[13px]">Sin proyectos en este contexto</div>}
      </div>

      {selected && (
        <div className="mt-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden shadow-md animate-fade-in">
          <div className="p-4 border-b border-black/7 flex items-start justify-between">
            <div className="font-serif text-lg font-light" style={{ color: ctxColor(selected.context) }}>{selected.name}</div>
            <div className="flex gap-2 shrink-0">
              {selectedPres && onOpenPres && (
                <button onClick={() => onOpenPres(selectedPres.id)} className="text-xs bg-claude/7 border border-claude/20 text-claude px-3 py-1.5 rounded-lg hover:bg-claude/15 cursor-pointer">Ver presentación</button>
              )}
              <button onClick={() => openCapture({ context: selected.context, projectId: selected.id, clientId: selected.client_id })}
                className="text-xs bg-claude border-claude text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Nueva tarea</button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-lg">✕</button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-black/7 bg-bg3 flex items-center gap-3">
            <div className="text-[11px] font-mono text-gray-400">Progreso</div>
            <div className="flex-1 h-2 bg-bg4 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${getPct(selected.id)}%`, background: ctxColor(selected.context) }} />
            </div>
            <div className="text-[13px] font-medium" style={{ color: ctxColor(selected.context) }}>{selectedTasks.filter(t => t.done).length}/{selectedTasks.length}</div>
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
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Tareas del proyecto</div>
            {selectedTasks.length ? (
              <div className="flex flex-col gap-1">
                {selectedTasks.map(t => {
                  const stColor = STATUS_COLOR[t.status] || '#6b7280'
                  const taskReminders = tasks.filter(r => r.parent_task_id === t.id && r.es_recordatorio && !r.done && !r.archived_at)
                  return (
                    <div key={t.id}>
                      <div onClick={() => openDetail(t.id)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border border-black/7 cursor-pointer hover:border-black/13 hover:shadow-sm transition-all ${t.done ? 'opacity-40' : ''}`}>
                        <div className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 flex items-center justify-center text-[9px] ${t.done ? 'bg-success border-success text-white' : 'border-black/13'}`}>{t.done && '✓'}</div>
                        <span className={`text-[13px] flex-1 ${t.done ? 'line-through text-gray-400' : ''}`}>
                          {(() => { const p = splitTitle(t.title); return <>{p.prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{p.prefix} |</span>}{p.name}</> })()}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: stColor + '16', color: stColor }}>{STATUS_ICON[t.status]} {t.status}</span>
                      </div>
                      {taskReminders.length > 0 && (
                        <div className="ml-6 mt-1 flex flex-col gap-1 border-l-2 border-claude/15 pl-2.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            <span className="h-px flex-1 bg-black/7" />Recordatorios<span className="h-px flex-1 bg-black/7" />
                          </div>
                          {taskReminders.map(r => <ReminderRow key={r.id} reminder={r} />)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin tareas vinculadas. Usá "+ Nueva tarea".</div>
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
