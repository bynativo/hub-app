import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaudeProxy } from '../../lib/claude'
import { ESTADOS, STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { ctxLabel } from '../../lib/helpers'
import type { Checklist, Task } from '../../lib/types'
/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = 'info' | 'subtareas' | 'checklist' | 'chat' | 'email' | 'slide'
interface Msg { role: 'user' | 'assistant'; content: string }

function parseAction(text: string): { json: any; clean: string } | null {
  const fence = /```(?:crear|json)?\s*([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && (obj.subtareas || obj.title || obj.titulo)) return { json: obj, clean: text.replace(m[0], '').trim() }
    } catch { /* sigue */ }
  }
  return null
}

function SubtaskRow({ sub }: { sub: Task }) {
  const updateTask = useStore(s => s.updateTask)
  const toggleTask = useStore(s => s.toggleTask)
  const openDetail = useStore(s => s.openDetail)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(sub.title)
  const [status, setStatus] = useState(sub.status)
  const [due, setDue] = useState(sub.due_date || '')
  const [hours, setHours] = useState(sub.estimated_hours != null ? String(sub.estimated_hours) : '')
  const [notes, setNotes] = useState(sub.notes || '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const states = ESTADOS[sub.context] || ESTADOS.banco
  const mark = <T,>(setter: (v: T) => void, v: T) => { setter(v); setDirty(true) }

  async function save() {
    setSaving(true)
    await updateTask(sub.id, {
      title: title.trim() || sub.title, status, due_date: due || null,
      estimated_hours: hours ? Number(hours) : null, notes: notes.trim() || null,
    })
    setSaving(false); setDirty(false)
  }

  const subField = 'w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'
  const subLabel = 'text-[10px] font-mono text-gray-400 uppercase block mb-1'

  return (
    <div className="rounded-lg border border-black/7 bg-bg2">
      <div className="flex items-center gap-2 p-2.5">
        <div onClick={() => toggleTask(sub.id)}
          className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[9px] ${sub.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'}`}>
          {sub.done && '✓'}
        </div>
        <span onClick={() => setOpen(o => !o)} className={`text-[13px] flex-1 cursor-pointer hover:text-claude ${sub.done ? 'line-through text-gray-400' : ''}`}>{sub.title}</span>
        {sub.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{sub.due_date.slice(5).replace('-', '/')}</span>}
        {sub.estimated_hours != null && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{sub.estimated_hours}h</span>}
        <span className="text-[10px]" style={{ color: STATUS_COLOR[sub.status] }}>{STATUS_ICON[sub.status]}</span>
        <button onClick={() => setOpen(o => !o)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-[11px] w-4">{open ? '▾' : '▸'}</button>
        <button onClick={() => openDetail(sub.id)} title="Abrir como tarea" className="text-gray-400 hover:text-claude cursor-pointer text-[11px]">↗</button>
      </div>

      {open && (
        <div className="border-t border-black/7 p-3 flex flex-col gap-2 bg-bg3">
          <div>
            <label className={subLabel}>Título</label>
            <input value={title} onChange={e => mark(setTitle, e.target.value)} className={subField} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={subLabel}>Estado</label>
              <select value={status} onChange={e => mark(setStatus, e.target.value)} className={subField + ' cursor-pointer'}>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={subLabel}>Fecha</label>
              <input type="date" value={due} onChange={e => mark(setDue, e.target.value)} className={subField} />
            </div>
            <div>
              <label className={subLabel}>Horas est.</label>
              <input type="number" min="0" step="0.5" value={hours} onChange={e => mark(setHours, e.target.value)} className={subField} placeholder="1" />
            </div>
          </div>
          <div>
            <label className={subLabel}>Descripción</label>
            <textarea value={notes} onChange={e => mark(setNotes, e.target.value)} rows={2} className={subField + ' resize-y'} placeholder="Detalles de la subtarea…" />
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={!dirty || saving}
              className="text-[11px] bg-claude text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TaskDetail() {
  const tasks = useStore(s => s.tasks)
  const contacts = useStore(s => s.contacts)
  const currentTaskId = useStore(s => s.currentTaskId)
  const closeDetail = useStore(s => s.closeDetail)
  const openDetail = useStore(s => s.openDetail)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const updateTask = useStore(s => s.updateTask)
  const loadAll = useStore(s => s.loadAll)

  const task = tasks.find(t => t.id === currentTaskId)
  const [tab, setTab] = useState<Tab>('info')
  const [checklists, setChecklists] = useState<Checklist[]>([])

  // Info edits
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('media')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [delegatedTo, setDelegatedTo] = useState('')
  const [origin, setOrigin] = useState('propia')
  const [dirty, setDirty] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)

  // Subtask add
  const [addingSub, setAddingSub] = useState(false)
  const [subTitle, setSubTitle] = useState('')
  const [subDate, setSubDate] = useState('')

  // Chat
  const [messages, setMessages] = useState<Msg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Email
  const [emailLoading, setEmailLoading] = useState(false)

  const subtasks = task ? tasks.filter(t => t.parent_task_id === task.id) : []

  useEffect(() => {
    if (!task) return
    setTab('info')
    setTitle(task.title); setPriority(task.priority); setDueDate(task.due_date || '')
    setNotes(task.notes || ''); setDelegatedTo(task.delegated_to || ''); setOrigin(task.origin || 'propia')
    setDirty(false)
    setMessages([{ role: 'assistant', content: `Estoy al tanto de "${task.title}" (${ctxLabel(task.context)}). ¿En qué te ayudo? Puedo crear subtareas con fechas distribuidas hasta su entrega.` }])
    supabase.from('checklists').select('*').eq('task_id', task.id).order('position').then(({ data }) => setChecklists(data || []))
  }, [currentTaskId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  if (!task) return null

  const ctxStates = ESTADOS[task.context] || ESTADOS.banco
  const isContent = task.task_type === 'contenido'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: '📋 Info' },
    { id: 'subtareas', label: `✓ Subtareas${subtasks.length ? ` (${subtasks.length})` : ''}` },
    { id: 'checklist', label: '☑ Checklist' },
    { id: 'chat', label: '💬 Chat' },
    { id: 'email', label: '📩 Email' },
    ...(isContent ? [{ id: 'slide' as Tab, label: '🎬 Slide' }] : []),
  ]

  function setInfo<T>(setter: (v: T) => void, v: T) { setter(v); setDirty(true) }

  async function saveInfo() {
    if (!task) return
    setSavingInfo(true)
    await updateTask(task.id, {
      title: title.trim() || task.title, priority, due_date: dueDate || null,
      notes: notes.trim() || null, delegated_to: delegatedTo || null, origin,
    })
    setSavingInfo(false); setDirty(false)
  }

  // ---- Subtareas ----
  async function addSubtask() {
    if (!task || !subTitle.trim()) return
    await supabase.from('tasks').insert({
      title: subTitle.trim(), context: task.context, client_id: task.client_id,
      parent_task_id: task.id, project_id: task.project_id,
      priority: 'media', origin: 'propia', status: 'Inbox', done: false,
      due_date: subDate || null, task_type: 'independiente', cats: [], plan: [], meeting_agenda: [],
    })
    setSubTitle(''); setSubDate(''); setAddingSub(false)
    await loadAll()
  }

  // ---- Checklist ----
  async function addChecklistItem() {
    if (!task) return
    const { data } = await supabase.from('checklists').insert({ task_id: task.id, title: '', position: checklists.length }).select().single()
    if (data) setChecklists(prev => [...prev, data])
  }
  async function updateChecklistItem(id: number, patch: Partial<Checklist>) {
    await supabase.from('checklists').update(patch).eq('id', id)
    setChecklists(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  async function deleteChecklistItem(id: number) {
    await supabase.from('checklists').delete().eq('id', id)
    setChecklists(prev => prev.filter(c => c.id !== id))
  }

  // ---- Chat ----
  function buildChatSystem() {
    if (!task) return ''
    const subs = subtasks.length ? subtasks.map(s => `- ${s.done ? '✓' : '○'} ${s.title}${s.due_date ? ` (${s.due_date})` : ''}`).join('\n') : '(ninguna)'
    return `Eres el asistente de trabajo de Felipe para esta tarea. Sé directo, práctico y conciso. Español.

TAREA: ${task.title}
Contexto: ${ctxLabel(task.context)} | Prioridad: ${task.priority} | Estado: ${task.status}
Fecha límite: ${task.due_date || 'sin fecha'}
Cliente: ${task.clients?.name || 'ninguno'}
Notas: ${task.notes || 'ninguna'}

SUBTAREAS ACTUALES:
${subs}

Cuando el usuario pida crear subtareas, generalas con fechas tentativas distribuidas hasta la fecha límite de la tarea (${task.due_date || 'sin fecha, usá fechas razonables'}). Emití un bloque al final exactamente así:
\`\`\`crear
{"subtareas":[{"title":"...","due_date":"YYYY-MM-DD"}]}
\`\`\`
No incluyas el bloque si solo estás conversando. No crees subtareas que no aporten valor real.`
  }

  async function sendChat() {
    if (!chatInput.trim() || !task || chatLoading) return
    const history: Msg[] = [...messages, { role: 'user', content: chatInput }]
    setMessages(history); setChatInput(''); setChatLoading(true)
    try {
      const reply = await callClaudeProxy(history.slice(-12), buildChatSystem())
      const action = parseAction(reply)
      if (action) {
        setMessages(prev => [...prev, { role: 'assistant', content: action.clean || 'Creando subtareas…' }])
        const subs = action.json.subtareas || [action.json]
        const rows = subs.filter((s: any) => s.title || s.titulo).map((s: any) => ({
          title: s.title || s.titulo, context: task.context, client_id: task.client_id,
          parent_task_id: task.id, project_id: task.project_id, priority: 'media', origin: 'propia',
          status: 'Inbox', done: false, due_date: s.due_date || null, task_type: 'independiente',
          cats: [], plan: [], meeting_agenda: [],
        }))
        if (rows.length) await supabase.from('tasks').insert(rows)
        await loadAll()
        setMessages(prev => [...prev, { role: 'assistant', content: `✓ ${rows.length} subtarea(s) creada(s).` }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión con Claude.' }])
    } finally {
      setChatLoading(false)
    }
  }

  // ---- Email ----
  async function generateEmail() {
    if (!task) return
    setEmailLoading(true)
    try {
      const reply = await callClaudeProxy(
        [{ role: 'user', content: `Redacta un email profesional sobre esta tarea.\nTarea: ${task.title}\nCliente: ${task.clients?.name || 'interno'}\nNotas: ${task.notes || 'ninguna'}\nDevuelve SOLO JSON: {"asunto":"...","cuerpo":"..."}` }],
        'Redactas emails humanos y profesionales, en español. Que no se note IA.'
      )
      const parsed = JSON.parse(reply.replace(/```json|```/g, '').trim())
      await updateTask(task.id, { draft_subject: parsed.asunto || null, draft_body: parsed.cuerpo || null, draft_needs_review: false } as any)
    } catch {
      alert('No se pudo generar el email (proxy de Claude no disponible aquí).')
    } finally {
      setEmailLoading(false)
    }
  }

  const fieldCls = 'w-full bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="fixed top-[52px] right-0 bottom-0 w-[540px] bg-bg border-l border-black/13 z-50 flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-black/7 flex items-start gap-2.5 shrink-0 bg-bg2">
        <div className="flex-1 min-w-0">
          {task.parent_task_id && (
            <button onClick={() => openDetail(task.parent_task_id!)} className="text-[11px] text-claude hover:underline mb-1 cursor-pointer">↑ ver tarea padre</button>
          )}
          <div className="font-serif text-[17px] font-light mb-1.5 leading-snug">{task.title}</div>
          <div className="flex gap-1 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: (STATUS_COLOR[task.status] || '#6b7280') + '16', color: STATUS_COLOR[task.status] }}>
              {STATUS_ICON[task.status]} {task.status}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(task.context)}</span>
            {task.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>}
          </div>
        </div>
        <button onClick={closeDetail} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/7 bg-bg2 shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-all cursor-pointer ${
              tab === t.id ? 'text-claude border-claude' : 'text-gray-400 border-transparent hover:text-gray-500'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* INFO */}
        {tab === 'info' && (
          <div className="animate-fade-in flex flex-col gap-3">
            <div>
              <label className={labelCls}>Título</label>
              <input value={title} onChange={e => setInfo(setTitle, e.target.value)} className={fieldCls} />
            </div>

            <div>
              <label className={labelCls}>Estado</label>
              <div className="flex gap-1.5 flex-wrap">
                {ctxStates.map(s => (
                  <button key={s} onClick={() => updateTaskStatus(task.id, s)}
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                      s === task.status ? 'font-semibold' : 'bg-bg2 border-black/7 text-gray-500 hover:border-black/13'
                    }`}
                    style={s === task.status ? { color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s], background: STATUS_COLOR[s] + '16' } : {}}>
                    {STATUS_ICON[s]} {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Prioridad</label>
                <select value={priority} onChange={e => setInfo(setPriority, e.target.value)} className={fieldCls}>
                  <option value="alta">🔴 Alta</option>
                  <option value="media">🟡 Media</option>
                  <option value="baja">🟢 Baja</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Fecha de entrega</label>
                <input type="date" value={dueDate} onChange={e => setInfo(setDueDate, e.target.value)} className={fieldCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Delegado a</label>
                <select value={delegatedTo} onChange={e => setInfo(setDelegatedTo, e.target.value)} className={fieldCls}>
                  <option value="">Nadie</option>
                  {contacts.map(c => <option key={c.id} value={c.name}>{c.name}{c.role ? ` · ${c.role}` : ''}</option>)}
                  {delegatedTo && !contacts.some(c => c.name === delegatedTo) && <option value={delegatedTo}>{delegatedTo}</option>}
                </select>
              </div>
              <div>
                <label className={labelCls}>Origen</label>
                <select value={origin} onChange={e => setInfo(setOrigin, e.target.value)} className={fieldCls}>
                  <option value="propia">💡 Propia</option>
                  <option value="gmail-agencia">📧 Email</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="reunion">🤝 Reunión</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Descripción</label>
              <textarea value={notes} onChange={e => setInfo(setNotes, e.target.value)} rows={4} className={fieldCls + ' resize-y'} placeholder="Detalles, quién pide, contexto…" />
            </div>

            <div className="flex justify-end">
              <button onClick={saveInfo} disabled={!dirty || savingInfo}
                className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {savingInfo ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </div>
          </div>
        )}

        {/* SUBTAREAS */}
        {tab === 'subtareas' && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Subtareas vinculadas</div>
              <button onClick={() => setAddingSub(v => !v)} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15">+ Nueva subtarea</button>
            </div>

            {addingSub && (
              <div className="bg-bg3 border border-black/7 rounded-lg p-3 mb-2 flex flex-col gap-2">
                <input value={subTitle} onChange={e => setSubTitle(e.target.value)} autoFocus placeholder="Título de la subtarea"
                  className="bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" />
                <div className="flex gap-2">
                  <input type="date" value={subDate} onChange={e => setSubDate(e.target.value)}
                    className="flex-1 bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" />
                  <button onClick={addSubtask} disabled={!subTitle.trim()} className="text-[11px] bg-claude text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-40">Crear</button>
                </div>
              </div>
            )}

            {subtasks.length ? (
              <div className="flex flex-col gap-1.5">
                {subtasks.map(s => <SubtaskRow key={s.id} sub={s} />)}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin subtareas. Agregá una o pedíselas a Claude en el chat.</div>
            )}
          </div>
        )}

        {/* CHECKLIST */}
        {tab === 'checklist' && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Checklist rápido</div>
              <button onClick={addChecklistItem} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15">+ Agregar item</button>
            </div>
            {checklists.length ? (
              <div className="flex flex-col gap-1">
                {checklists.map(c => (
                  <div key={c.id} className="flex items-center gap-2 py-1.5 group">
                    <div onClick={() => updateChecklistItem(c.id, { done: !c.done })}
                      className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[9px] ${c.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'}`}>
                      {c.done && '✓'}
                    </div>
                    <input defaultValue={c.title} onBlur={e => updateChecklistItem(c.id, { title: e.target.value })}
                      placeholder="Escribí el item…"
                      className={`flex-1 bg-transparent text-[13px] outline-none border-b border-transparent focus:border-black/13 ${c.done ? 'line-through text-gray-400' : ''}`} />
                    <button onClick={() => deleteChecklistItem(c.id)} className="text-gray-300 hover:text-danger text-xs opacity-0 group-hover:opacity-100 cursor-pointer">✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin items. Agregá recordatorios rápidos de verificación.</div>
            )}
          </div>
        )}

        {/* CHAT */}
        {tab === 'chat' && (
          <div className="animate-fade-in flex flex-col h-full">
            <div className="flex-1 min-h-[200px] overflow-y-auto flex flex-col gap-2 mb-3">
              {messages.map((m, i) => (
                <div key={i} className={`max-w-[90%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                  <div className={`px-3 py-2 rounded-[10px] text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-claude text-white rounded-br-sm'
                      : m.content.startsWith('✓') ? 'bg-success/10 border border-success/30 text-success rounded-bl-sm'
                      : 'bg-bg3 border border-black/7 rounded-bl-sm'
                  }`}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-1 px-3 py-2 bg-bg3 border border-black/7 rounded-[10px] w-fit self-start">
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t border-black/7 pt-3 flex gap-2">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                rows={2} disabled={chatLoading} placeholder="Pedile un plan, subtareas, etc."
                className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20" />
              <button onClick={sendChat} disabled={chatLoading} className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] self-end hover:bg-purple-700 cursor-pointer disabled:opacity-40">Enviar</button>
            </div>
          </div>
        )}

        {/* EMAIL */}
        {tab === 'email' && (
          <div className="animate-fade-in">
            <button onClick={generateEmail} disabled={emailLoading}
              className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 cursor-pointer disabled:opacity-40 font-medium mb-4">
              {emailLoading ? 'Redactando…' : '✦ Generar borrador con Claude'}
            </button>
            {task.draft_body ? (
              <div>
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-mono text-gray-400 w-12 uppercase">Asunto</span>
                    <span className="text-[13px] font-medium">{task.draft_subject || '—'}</span>
                  </div>
                </div>
                <div className="bg-bg2 border border-black/7 rounded-[10px] p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap">{task.draft_body}</div>
              </div>
            ) : (
              <div className="text-center py-7 text-gray-400 text-[13px]">Sin borrador. Generá uno con Claude.</div>
            )}
          </div>
        )}

        {/* SLIDE */}
        {tab === 'slide' && (
          <div className="animate-fade-in">
            {task.slide_idea || task.slide_number ? (
              <div className="bg-bg2 border border-black/7 rounded-[10px] p-3.5">
                <div className="font-medium text-gray-900 mb-1">{task.slide_idea || 'Slide vinculada'}</div>
                <div className="text-xs text-gray-400">Slide #{task.slide_number ?? '—'} · {task.content_format || 'formato sin definir'}</div>
              </div>
            ) : (
              <div className="text-center py-7 text-gray-400 text-[13px]">Tarea de contenido. El editor completo de slide se gestiona en Presentaciones.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
