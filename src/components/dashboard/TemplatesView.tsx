import { useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxColor, ctxLabel, addDaysISO, todayISO, taskPrefix, buildTitle } from '../../lib/helpers'
import type { Template, TemplateTask } from '../../lib/types'

// Convierte una plantilla en un proyecto real: crea el proyecto + 1 tarea por
// template_task con due_date = fechaClave + day_offset. Si una tarea es
// recordatorio (is_reminder), se inserta con es_recordatorio=true y
// recordatorio_at = due_date 9:00 local. La jerarquía parent_id de la plantilla
// se respeta (procesamos top-level primero y mapeamos templateTaskId → newTaskId).
async function instantiateTemplate(opts: {
  template: Template
  tasks: TemplateTask[]
  projectName: string
  context: string
  clientId: number | null
  fechaClaveISO: string
  clientSigla?: string | null
  clientFullName?: string | null
}): Promise<{ projectId: number; tasksCreated: number }> {
  const isAgencia = opts.context === 'agencia'
  // 1) Crear proyecto padre.
  const { data: proj, error: projErr } = await supabase.from('projects').insert({
    name: opts.projectName.trim(),
    context: opts.context,
    client_id: isAgencia ? opts.clientId : null,
    es_interno: isAgencia ? !opts.clientId : false,
    type: 'proyecto',
    status: 'activo',
    is_ongoing: false,
    due_date: opts.fechaClaveISO,
    description: opts.template.description,
  }).select('id').single()
  if (projErr || !proj) throw new Error(projErr?.message || 'No se pudo crear el proyecto')
  const projectId = proj.id as number

  // 2) Crear tareas. Ordenamos: primero las top-level, después por niveles.
  const byParent = new Map<number | null, TemplateTask[]>()
  for (const tt of opts.tasks) {
    const key = tt.parent_id ?? null
    const arr = byParent.get(key)
    if (arr) arr.push(tt)
    else byParent.set(key, [tt])
  }
  // Map: templateTask.id → tasks.id (para que las hijas referencien al padre real)
  const idMap = new Map<number, number>()
  const prefix = taskPrefix(opts.context, opts.clientFullName ? { sigla: opts.clientSigla, name: opts.clientFullName } : null)
  let count = 0

  async function insertLevel(parentTtId: number | null) {
    const children = (byParent.get(parentTtId) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    for (const tt of children) {
      const dueDate = addDaysISO(opts.fechaClaveISO, tt.day_offset ?? 0)
      const isRem = !!tt.is_reminder
      const parentRealId = tt.parent_id != null ? (idMap.get(tt.parent_id) ?? null) : null
      const { data: inserted, error } = await supabase.from('tasks').insert({
        title: buildTitle(prefix, tt.title),
        context: opts.context,
        client_id: isAgencia ? opts.clientId : null,
        project_id: projectId,
        parent_task_id: parentRealId,
        task_type: tt.task_type || 'independiente',
        priority: tt.priority || 'media',
        origin: 'propia',
        status: isRem ? 'Recordatorio' : 'Inbox',
        due_date: isRem ? null : dueDate,
        estimated_hours: tt.estimated_hours ?? 1,
        notes: tt.notes || null,
        requested_at: todayISO(),
        es_recordatorio: isRem,
        recordatorio_at: isRem ? new Date(`${dueDate}T09:00:00`).toISOString() : null,
        tipo_recordatorio: isRem ? (tt.reminder_type || 'general') : null,
        done: false,
        cats: [], plan: [], meeting_agenda: [],
      }).select('id').single()
      if (error || !inserted) throw new Error(error?.message || 'No se pudo crear una tarea de la plantilla')
      idMap.set(tt.id, inserted.id as number)
      count++
      // Recursión por si hay hijas (las plantillas seed son flat, pero el modelo lo soporta).
      await insertLevel(tt.id)
    }
  }
  await insertLevel(null)
  return { projectId, tasksCreated: count }
}

// Modal de "Usar plantilla": pide nombre, contexto, cliente y fecha clave.
function UseTemplateModal({ template, tasks, onClose }: { template: Template; tasks: TemplateTask[]; onClose: () => void }) {
  const clients = useStore(s => s.clients)
  const loadAll = useStore(s => s.loadAll)
  const showToast = useStore(s => s.showToast)
  const [name, setName] = useState(template.name)
  const [context, setContext] = useState(template.context)
  const [clientId, setClientId] = useState<number | null>(null)
  const [fechaClave, setFechaClave] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const agClients = clients.filter(c => c.context === 'agencia')
  const selectedClient = clientId ? clients.find(c => c.id === clientId) : null

  async function go() {
    if (!name.trim() || !fechaClave) return
    setSaving(true)
    try {
      const { tasksCreated } = await instantiateTemplate({
        template, tasks,
        projectName: name.trim(),
        context,
        clientId: context === 'agencia' ? clientId : null,
        fechaClaveISO: fechaClave,
        clientSigla: selectedClient?.sigla,
        clientFullName: selectedClient?.name,
      })
      await loadAll()
      showToast(`✓ ${context === 'banco' ? 'Campaña' : 'Proyecto'} "${name.trim()}" creado con ${tasksCreated} tareas`, { durationMs: 3500 })
      onClose()
    } catch (e: any) {
      alert('Error: ' + (e?.message || 'no se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  const fld = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2'
  const lbl = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[480px] max-w-[94vw] shadow-lg">
        <div className="font-serif text-lg font-light mb-1">Usar plantilla</div>
        <p className="text-[12px] text-gray-500 mb-4">Vas a crear un proyecto a partir de <span className="font-medium text-gray-700">{template.name}</span> ({tasks.length} tareas).</p>
        <div className="flex flex-col gap-3">
          <div><label className={lbl}>Nombre del proyecto / campaña *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={fld} autoFocus /></div>
          <div className={`grid ${context === 'agencia' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div><label className={lbl}>Contexto</label>
              <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }} className={fld + ' cursor-pointer'}>
                <option value="banco">Banco Falabella</option>
                <option value="agencia">Agencia</option>
                <option value="personal">Personal</option>
              </select></div>
            {context === 'agencia' && (
              <div><label className={lbl}>Cliente (opcional)</label>
                <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)} className={fld + ' cursor-pointer'}>
                  <option value="">Agencia interna</option>
                  {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            )}
          </div>
          <div><label className={lbl}>Fecha clave (D-0)</label>
            <input type="date" value={fechaClave} onChange={e => setFechaClave(e.target.value)} className={fld} />
            <div className="text-[10px] text-gray-400 mt-1">Cada tarea tendrá due_date = esta fecha + su offset (D-30, D-7, D+0, etc.).</div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
          <button onClick={go} disabled={!name.trim() || !fechaClave || saving}
            className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Editor de plantilla: lado izquierdo nombre/contexto/descripción, lado
// derecho lista de tareas editables (sin drag&drop por ahora — orden con ▲▼).
function TemplateEditor({ template, tasks, onClose }: { template: Template | null; tasks: TemplateTask[]; onClose: () => void }) {
  const loadAll = useStore(s => s.loadAll)
  const isNew = !template
  const [name, setName] = useState(template?.name || '')
  const [context, setContext] = useState(template?.context || 'banco')
  const [description, setDescription] = useState(template?.description || '')
  const [items, setItems] = useState<Partial<TemplateTask>[]>(
    tasks.length ? tasks.map(t => ({ ...t })) : []
  )
  const [saving, setSaving] = useState(false)

  function addRow() {
    setItems(prev => [...prev, {
      title: '', task_type: 'independiente', priority: 'media',
      estimated_hours: 1, day_offset: 0, is_reminder: false, position: (prev[prev.length - 1]?.position || 0) + 10,
    }])
  }
  function update(idx: number, patch: Partial<TemplateTask>) {
    setItems(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))
  }
  function remove(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    setItems(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((it, i) => ({ ...it, position: (i + 1) * 10 }))
    })
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      let tplId = template?.id
      if (isNew) {
        const { data, error } = await supabase.from('templates').insert({
          name: name.trim(), context, description: description.trim() || null,
        }).select('id').single()
        if (error || !data) throw new Error(error?.message || 'No se pudo crear')
        tplId = data.id
      } else {
        await supabase.from('templates').update({
          name: name.trim(), context, description: description.trim() || null, updated_at: new Date().toISOString(),
        }).eq('id', template!.id)
        // Para simplificar: borramos y re-insertamos las tareas (no perdemos datos
        // porque template_tasks no se referencia desde otra tabla).
        await supabase.from('template_tasks').delete().eq('template_id', template!.id)
      }
      if (items.length && tplId) {
        const rows = items.filter(it => it.title?.trim()).map((it, i) => ({
          template_id: tplId,
          title: (it.title || '').trim(),
          task_type: it.task_type || 'independiente',
          priority: it.priority || 'media',
          estimated_hours: it.estimated_hours ?? 1,
          day_offset: it.day_offset ?? 0,
          is_reminder: !!it.is_reminder,
          reminder_type: it.is_reminder ? (it.reminder_type || 'general') : null,
          is_recurring: !!it.is_recurring,
          notes: it.notes || null,
          position: (i + 1) * 10,
        }))
        if (rows.length) await supabase.from('template_tasks').insert(rows)
      }
      await loadAll()
      onClose()
    } catch (e: any) {
      alert('Error: ' + (e?.message || 'no se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  const fld = 'w-full bg-bg3 border border-black/7 rounded-md px-2 py-1 text-[12px] outline-none focus:border-claude/20'
  const lbl = 'text-[10px] font-mono text-gray-400 tracking-wider uppercase block mb-0.5'

  return (
    <div className="fixed inset-0 z-[320] flex items-start justify-center pt-8 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl w-[920px] max-w-[96vw] mb-10 shadow-lg overflow-hidden flex">
        <div className="w-[260px] shrink-0 border-r border-black/7 p-5 flex flex-col gap-3">
          <div className="font-serif text-lg font-light mb-1">{isNew ? 'Nueva plantilla' : 'Editar plantilla'}</div>
          <div><label className={lbl}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={fld + ' text-[13px]'} autoFocus /></div>
          <div><label className={lbl}>Contexto</label>
            <select value={context} onChange={e => setContext(e.target.value)} className={fld + ' text-[13px] cursor-pointer'}>
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select></div>
          <div><label className={lbl}>Descripción</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className={fld + ' text-[13px] resize-y'} /></div>
          <div className="mt-auto flex gap-2">
            <button onClick={onClose} className="flex-1 text-xs bg-bg3 border border-black/7 text-gray-500 px-3 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
            <button onClick={save} disabled={!name.trim() || saving}
              className="flex-1 text-xs bg-claude text-white px-3 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <div className="flex-1 p-5 flex flex-col gap-2 min-h-[480px] max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Estructura de tareas ({items.length})</div>
            <button onClick={addRow} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md hover:bg-claude/15 cursor-pointer">+ Agregar fila</button>
          </div>
          {items.map((it, i) => (
            <div key={i} className={`border rounded-md p-2.5 flex flex-col gap-2 ${it.is_reminder ? 'border-claude/20 bg-claude/[0.04]' : 'border-black/7 bg-bg3'}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 w-7 text-center">{it.day_offset != null && it.day_offset >= 0 ? `D+${it.day_offset}` : `D${it.day_offset}`}</span>
                <input value={it.title || ''} onChange={e => update(i, { title: e.target.value })} placeholder="Título" className={fld + ' flex-1 text-[13px]'} />
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[12px] text-gray-400 hover:text-claude disabled:opacity-30 cursor-pointer px-1">▲</button>
                <button onClick={() => move(i, +1)} disabled={i === items.length - 1} className="text-[12px] text-gray-400 hover:text-claude disabled:opacity-30 cursor-pointer px-1">▼</button>
                <button onClick={() => remove(i)} className="text-[11px] text-danger hover:text-white hover:bg-danger px-1.5 py-0.5 rounded cursor-pointer">×</button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div><label className={lbl}>Tipo</label>
                  <select value={it.task_type || 'independiente'} onChange={e => update(i, { task_type: e.target.value })} className={fld + ' cursor-pointer'}>
                    <option value="independiente">Independiente</option>
                    <option value="contenido">Contenido</option>
                    <option value="solicitud_influencers">Solicitar influencers</option>
                    <option value="influencer">Perfil influencer</option>
                  </select></div>
                <div><label className={lbl}>Prioridad</label>
                  <select value={it.priority || 'media'} onChange={e => update(i, { priority: e.target.value })} className={fld + ' cursor-pointer'}>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select></div>
                <div><label className={lbl}>Estimado (h)</label>
                  <input type="number" step="0.5" min="0" value={it.estimated_hours ?? 1} onChange={e => update(i, { estimated_hours: Number(e.target.value) || 0 })} className={fld} /></div>
                <div><label className={lbl}>Day offset</label>
                  <input type="number" value={it.day_offset ?? 0} onChange={e => update(i, { day_offset: parseInt(e.target.value, 10) || 0 })} className={fld} /></div>
                <div className="flex items-end gap-1">
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input type="checkbox" checked={!!it.is_reminder} onChange={e => update(i, { is_reminder: e.target.checked, reminder_type: e.target.checked ? (it.reminder_type || 'general') : null })} />
                    🔔
                  </label>
                  {it.is_reminder && (
                    <select value={it.reminder_type || 'general'} onChange={e => update(i, { reminder_type: e.target.value })} className={fld + ' cursor-pointer text-[11px]'}>
                      <option value="general">General</option>
                      <option value="seguimiento">Seguimiento</option>
                      <option value="responder_correo">Responder</option>
                      <option value="enviar_correo">Enviar</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-center py-7 text-gray-400 text-[13px]">Sin tareas — usá "+ Agregar fila"</div>}
        </div>
      </div>
    </div>
  )
}

export function TemplatesView() {
  const templates = useStore(s => s.templates)
  const templateTasks = useStore(s => s.templateTasks)
  const loadAll = useStore(s => s.loadAll)
  const showToast = useStore(s => s.showToast)
  const [usingTemplate, setUsingTemplate] = useState<Template | null>(null)
  const [editing, setEditing] = useState<Template | null | undefined>(undefined) // null=new, Template=edit, undefined=closed
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState<Template | null>(null)

  const tasksOf = (id: number) => templateTasks.filter(t => t.template_id === id)

  // Agrupar por contexto
  const grouped: Record<string, Template[]> = { banco: [], agencia: [], personal: [] }
  for (const t of templates) (grouped[t.context] ||= []).push(t)

  async function duplicate(tpl: Template) {
    const { data, error } = await supabase.from('templates').insert({
      name: tpl.name + ' (copia)', context: tpl.context, description: tpl.description,
    }).select('id').single()
    if (error || !data) { alert('Error duplicando: ' + error?.message); return }
    const newId = data.id
    const original = tasksOf(tpl.id)
    if (original.length) {
      await supabase.from('template_tasks').insert(original.map(t => ({
        template_id: newId, parent_id: null, title: t.title, task_type: t.task_type, priority: t.priority,
        estimated_hours: t.estimated_hours, day_offset: t.day_offset, is_reminder: t.is_reminder,
        reminder_type: t.reminder_type, is_recurring: t.is_recurring, notes: t.notes, position: t.position,
      })))
    }
    await loadAll()
    showToast(`✓ Plantilla "${tpl.name}" duplicada`, { durationMs: 2500 })
  }

  async function deletePlantilla() {
    if (!confirmDel) return
    await supabase.from('template_tasks').delete().eq('template_id', confirmDel.id)
    await supabase.from('templates').delete().eq('id', confirmDel.id)
    setConfirmDel(null)
    await loadAll()
  }

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5">Plantillas</h1>
          <p className="text-gray-500 text-[13px]">{templates.length} plantilla{templates.length === 1 ? '' : 's'} · usá una para crear un proyecto con tareas pre-armadas.</p>
        </div>
        <button onClick={() => setEditing(null)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nueva plantilla
        </button>
      </div>

      {(['banco', 'agencia', 'personal'] as const).map(ctx => {
        const list = grouped[ctx] || []
        if (!list.length) return null
        const accent = ctxColor(ctx)
        return (
          <div key={ctx} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
              <span className="text-[11px] font-mono tracking-wider uppercase" style={{ color: accent }}>{ctxLabel(ctx)}</span>
              <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{list.length}</span>
            </div>
            <div className="grid gap-2 max-w-[820px]">
              {list.map(tpl => {
                const n = tasksOf(tpl.id).length
                return (
                  <div key={tpl.id} className="relative bg-bg2 border border-black/7 rounded-xl p-4 shadow-sm hover:border-black/13 hover:shadow-md transition-all">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium leading-snug">{tpl.name}</div>
                        {tpl.description && <div className="text-[12px] text-gray-500 mt-1 leading-snug">{tpl.description}</div>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: accent + '12', color: accent }}>{ctxLabel(ctx)}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{n} tarea{n === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setUsingTemplate(tpl)}
                          className="text-[11px] bg-claude text-white px-3 py-1 rounded-md hover:bg-purple-700 cursor-pointer font-medium">
                          Usar plantilla
                        </button>
                        <button onClick={() => setMenuFor(menuFor === tpl.id ? null : tpl.id)}
                          className="text-[14px] text-gray-400 hover:text-gray-900 cursor-pointer px-1.5 leading-none">⋯</button>
                      </div>
                    </div>
                    {menuFor === tpl.id && (
                      <>
                        <div className="fixed inset-0 z-[5]" onClick={() => setMenuFor(null)} />
                        <div className="absolute right-2 top-12 z-[6] bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 w-44">
                          <button onClick={() => { setEditing(tpl); setMenuFor(null) }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">✎ Editar</button>
                          <button onClick={() => { duplicate(tpl); setMenuFor(null) }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">⎘ Duplicar</button>
                          <div className="my-0.5 mx-2 border-t border-black/7" />
                          <button onClick={() => { setConfirmDel(tpl); setMenuFor(null) }} className="w-full text-left px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10 cursor-pointer">🗑 Eliminar</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {!templates.length && (
        <div className="text-center py-10 text-gray-400 text-[13px]">Sin plantillas — creá una con "+ Nueva plantilla"</div>
      )}

      {usingTemplate && (
        <UseTemplateModal template={usingTemplate} tasks={tasksOf(usingTemplate.id)} onClose={() => setUsingTemplate(null)} />
      )}

      {editing !== undefined && (
        <TemplateEditor
          template={editing}
          tasks={editing ? tasksOf(editing.id) : []}
          onClose={() => setEditing(undefined)}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[420px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar plantilla</div>
            <p className="text-[13px] text-gray-500 mb-4">¿Eliminar la plantilla "<span className="font-medium text-gray-700">{confirmDel.name}</span>" y todas sus tareas? Los proyectos ya creados desde ella no se afectan.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={deletePlantilla} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
