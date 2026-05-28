import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaudeProxy } from '../../lib/claude'
import { ESTADOS, STATUS_ICON, STATUS_COLOR, PUB_TYPES, FORMATOS } from '../../lib/constants'
import { ctxLabel, fmtHoras, taskPrefix, buildTitle, stripPrefix, splitTitle, deliveryWarning, recordingWarning } from '../../lib/helpers'
import { NewPresentationModal } from '../modals/NewPresentationModal'
import { CaptureModal } from '../modals/CaptureModal'
import { TaskAttachments } from './TaskAttachments'
import type { Checklist, Task } from '../../lib/types'
/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = 'info' | 'subtareas' | 'checklist' | 'chat' | 'email' | 'slide'
interface Msg { role: 'user' | 'assistant'; content: string }

// ISO timestamptz → valor para <input type="datetime-local"> en hora local
function toLocalDT(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const PROXY_URL = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/claude-proxy'

function parseAction(text: string): { json: any; clean: string } | null {
  const fence = /```(?:crear|accion|json)?\s*([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && (obj.subtareas || obj.title || obj.titulo || obj.due_date || obj.priority || obj.prioridad || obj.context_readme)) {
        return { json: obj, clean: text.replace(m[0], '').trim() }
      }
    } catch { /* sigue */ }
  }
  return null
}

function SubtaskRow({ sub }: { sub: Task }) {
  const updateTask = useStore(s => s.updateTask)
  const toggleTask = useStore(s => s.toggleTask)
  const openDetail = useStore(s => s.openDetail)
  const clients = useStore(s => s.clients)
  const subPrefix = taskPrefix(sub.context, clients.find(c => c.id === sub.client_id) || null)
  const subParts = splitTitle(sub.title)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(stripPrefix(sub.title))
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
      title: buildTitle(subPrefix, title.trim() || stripPrefix(sub.title)), status, due_date: due || null,
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
        <span onClick={() => setOpen(o => !o)} className={`text-[13px] flex-1 cursor-pointer hover:text-claude ${sub.done ? 'line-through text-gray-400' : ''}`}>
          {subParts.prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{subParts.prefix} |</span>}{subParts.name}
        </span>
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
  const presentations = useStore(s => s.presentations)
  const projects = useStore(s => s.projects)
  const clients = useStore(s => s.clients)
  const setView = useStore(s => s.setView)
  const currentTaskId = useStore(s => s.currentTaskId)
  const closeDetail = useStore(s => s.closeDetail)
  const openDetail = useStore(s => s.openDetail)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const updateTask = useStore(s => s.updateTask)
  const loadAll = useStore(s => s.loadAll)

  const task = tasks.find(t => t.id === currentTaskId)
  const [tab, setTab] = useState<Tab>('info')
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [newPresOpen, setNewPresOpen] = useState(false)
  const [assignPresId, setAssignPresId] = useState<number | ''>('')

  // Info edits
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('media')
  const [dueDate, setDueDate] = useState('')
  const [publishDate, setPublishDate] = useState('')
  const [recordingDate, setRecordingDate] = useState('')
  const [recordatorioAt, setRecordatorioAt] = useState('')
  const [isInfluencer, setIsInfluencer] = useState(false)
  const [pubType, setPubType] = useState('propia')
  const [infName, setInfName] = useState('')
  const [infHandle, setInfHandle] = useState('')
  const [infAgency, setInfAgency] = useState('')
  const [contentFormat, setContentFormat] = useState('')
  const [notes, setNotes] = useState('')
  const [delegatedTo, setDelegatedTo] = useState('')
  const [origin, setOrigin] = useState('propia')
  const [estHours, setEstHours] = useState<number | null>(null)
  const [contextReadme, setContextReadme] = useState('')
  const [showContext, setShowContext] = useState(false)
  const [suggestedHours, setSuggestedHours] = useState<number | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)

  // Subtask add: usa el CaptureModal completo con parent_task_id precargado
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Chat
  const [messages, setMessages] = useState<Msg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<any | null>(null)
  const [chatImages, setChatImages] = useState<{ media_type: string; data: string; url: string }[]>([])
  const [chatRecording, setChatRecording] = useState(false)
  const chatRecRef = useRef<any>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Email
  const [emailLoading, setEmailLoading] = useState(false)

  const subtasks = task ? tasks.filter(t => t.parent_task_id === task.id) : []

  useEffect(() => {
    if (!task) return
    setTab(task.task_type === 'responder_email' ? 'email' : 'info')
    setTitle(stripPrefix(task.title)); setPriority(task.priority); setDueDate(task.due_date || ''); setPublishDate(task.publish_date || ''); setRecordingDate(task.recording_date || '')
    setIsInfluencer(!!task.es_influencer)
    setPubType(task.tipo_publicacion || task.content_pub_type || 'propia')
    setInfName(task.influencer_nombre || task.influencer_name || '')
    setInfHandle(task.influencer_handle || '')
    setInfAgency(task.influencer_agencia || task.influencer_agency || '')
    setContentFormat(task.content_format || '')
    setRecordatorioAt(toLocalDT(task.recordatorio_at))
    setNotes(task.notes || ''); setDelegatedTo(task.delegated_to || ''); setOrigin(task.origin || 'propia')
    setEstHours(task.estimated_hours)
    setContextReadme(task.context_readme || ''); setShowContext(false)
    setSuggestedHours(null)
    setDirty(false)
    setMessages([{ role: 'assistant', content: `Estoy al tanto de "${task.title}" (${ctxLabel(task.context)}). Pegá texto, una captura o dictá: puedo actualizar fecha, prioridad, el contexto o crear subtareas (con tu aprobación).` }])
    setPendingAction(null); setChatImages([])
    supabase.from('checklists').select('*').eq('task_id', task.id).order('position').then(({ data }) => setChecklists(data || []))
    setAssignPresId('')
  }, [currentTaskId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  if (!task) return null

  const ctxStates = ESTADOS[task.context] || ESTADOS.banco
  const titlePrefix = taskPrefix(task.context, clients.find(c => c.id === task.client_id) || null)
  const headerTitle = splitTitle(task.title)
  const isContent = task.task_type === 'contenido'
  const pubWarn = isContent ? deliveryWarning(dueDate || null, publishDate || null) : null
  const recWarn = isContent ? recordingWarning(recordingDate || null, dueDate || null) : null
  const isEmailReply = task.task_type === 'responder_email'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: '📋 Info' },
    ...(isEmailReply ? [] : [{ id: 'subtareas' as Tab, label: `✓ Subtareas${subtasks.length ? ` (${subtasks.length})` : ''}` }]),
    { id: 'checklist', label: '☑ Checklist' },
    { id: 'chat', label: '💬 Chat' },
    { id: 'email', label: isEmailReply ? '✉️ Responder' : '📩 Email' },
    ...(isContent ? [{ id: 'slide' as Tab, label: '🎬 Slide' }] : []),
  ]

  function setInfo<T>(setter: (v: T) => void, v: T) { setter(v); setDirty(true) }

  async function saveInfo() {
    if (!task) return
    setSavingInfo(true)
    await updateTask(task.id, {
      title: buildTitle(titlePrefix, title.trim() || stripPrefix(task.title)), priority, due_date: dueDate || null,
      publish_date: isContent ? (publishDate || null) : null,
      recording_date: isContent ? (recordingDate || null) : null,
      es_influencer: isContent ? isInfluencer : null,
      tipo_publicacion: isContent ? (isInfluencer ? pubType : 'propia') : null,
      influencer_nombre: (isContent && isInfluencer) ? (infName.trim() || null) : null,
      influencer_handle: (isContent && isInfluencer) ? (infHandle.trim() || null) : null,
      influencer_agencia: (isContent && isInfluencer) ? (infAgency.trim() || null) : null,
      content_format: isContent ? (contentFormat || null) : null,
      ...(task.es_recordatorio ? { recordatorio_at: recordatorioAt ? new Date(recordatorioAt).toISOString() : null } : {}),
      notes: notes.trim() || null, delegated_to: delegatedTo || null, origin,
      estimated_hours: estHours,
    })
    setSavingInfo(false); setDirty(false)
  }

  async function suggestEstimate() {
    if (!task) return
    setSuggesting(true)
    try {
      const similar = tasks.filter(t => t.context === task.context && t.id !== task.id && t.estimated_hours != null)
      const avg = similar.length ? similar.reduce((s, t) => s + (t.estimated_hours || 0), 0) / similar.length : null
      const prompt = `Estimá cuántas horas de trabajo lleva esta tarea. Respondé SOLO un número de esta lista: 0.5, 1, 1.5, 2, 3, 4, 6, 8.
Tarea: ${title}
Contexto: ${ctxLabel(task.context)}
Descripción: ${notes || '(sin descripción)'}
${contextReadme ? `Contexto: ${contextReadme}` : ''}
${avg ? `Referencia: el promedio de tareas similares de este contexto es ${avg.toFixed(1)}h.` : ''}`
      const reply = await callClaudeProxy([{ role: 'user', content: prompt }], 'Sos un estimador de esfuerzo. Devolvés SOLO un número de horas, sin texto.')
      const m = reply.match(/[0-9]+(?:\.[0-9]+)?/)
      if (m) {
        const allowed = [0.5, 1, 1.5, 2, 3, 4, 6, 8]
        const n = parseFloat(m[0])
        setSuggestedHours(allowed.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a, allowed[0]))
      }
    } catch {
      alert('No se pudo sugerir el estimado (proxy de Claude).')
    } finally {
      setSuggesting(false)
    }
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
${task.context_readme ? `\nCONTEXTO ACUMULADO DE LA TAREA:\n${task.context_readme}\n` : ''}
SUBTAREAS ACTUALES:
${subs}

Cuando el usuario te dé información nueva (texto o imagen), podés PROPONER cambios a la tarea. Si hay algo para cambiar, emití al final UN bloque exactamente así:
\`\`\`accion
{"due_date":"YYYY-MM-DD o null","priority":"alta|media|baja o null","context_readme":"contexto COMPLETO actualizado (lo previo + lo nuevo) o null","subtareas":[{"title":"...","due_date":"YYYY-MM-DD o null"}]}
\`\`\`
Reglas del bloque:
- Incluí SOLO lo que cambia; lo demás omitilo o null. No inventes subtareas sin valor.
- Para context_readme devolvé el texto COMPLETO actualizado (no solo lo nuevo).
- Los cambios NO se aplican hasta que el usuario los apruebe; vos solo proponés.
- Si solo estás conversando, NO incluyas el bloque.`
  }

  async function addChatImages(files: FileList | null) {
    if (!files) return
    const arr = await Promise.all(Array.from(files).map(f => new Promise<{ media_type: string; data: string; url: string }>(res => {
      const rd = new FileReader()
      rd.onload = () => { const r = rd.result as string; res({ media_type: f.type || 'image/png', data: r.split(',')[1] || '', url: r }) }
      rd.readAsDataURL(f)
    })))
    setChatImages(prev => [...prev, ...arr])
  }

  function chatStartRec() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Tu navegador no soporta dictado por voz.'); return }
    const r = new SR(); r.lang = 'es-CL'; r.continuous = true; r.interimResults = true
    const base = chatInput
    r.onresult = (e: any) => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setChatInput((base ? base + ' ' : '') + s) }
    r.onend = () => setChatRecording(false)
    r.start(); chatRecRef.current = r; setChatRecording(true)
  }
  function chatStopRec() { chatRecRef.current?.stop(); setChatRecording(false) }

  async function applyAction(a: any) {
    if (!task) return
    const patch: Record<string, any> = {}
    if (a.due_date && a.due_date !== 'null') patch.due_date = a.due_date
    const prio = a.priority || a.prioridad
    if (prio && ['alta', 'media', 'baja'].includes(prio)) patch.priority = prio
    if (a.context_readme && a.context_readme !== 'null') patch.context_readme = a.context_readme
    if (Object.keys(patch).length) await updateTask(task.id, patch)
    const subs = (a.subtareas || []).filter((s: any) => s.title || s.titulo)
    if (subs.length) {
      await supabase.from('tasks').insert(subs.map((s: any) => ({
        title: buildTitle(titlePrefix, s.title || s.titulo), context: task.context, client_id: task.client_id,
        parent_task_id: task.id, project_id: task.project_id, priority: 'media', origin: 'propia',
        status: 'Inbox', done: false, due_date: s.due_date || null, task_type: 'independiente',
        cats: [], plan: [], meeting_agenda: [],
      })))
    }
    await loadAll()
    if (patch.context_readme) setContextReadme(patch.context_readme)
    setPendingAction(null)
    setMessages(prev => [...prev, { role: 'assistant', content: '✓ Cambios aplicados.' }])
  }

  async function sendChat() {
    if ((!chatInput.trim() && !chatImages.length) || !task || chatLoading) return
    const userText = chatInput.trim() || '(ver imágenes adjuntas)'
    const history: Msg[] = [...messages, { role: 'user', content: userText }]
    setMessages(history); setChatInput(''); setChatLoading(true)
    const imgs = chatImages; setChatImages([])
    try {
      let reply: string
      if (imgs.length) {
        const apiMessages = history.slice(-12).map((m, idx, arr) => (idx === arr.length - 1)
          ? { role: m.role, content: [{ type: 'text', text: m.content }, ...imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }))] }
          : { role: m.role, content: m.content })
        const res = await fetch(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: apiMessages, system: buildChatSystem() }) })
        const data = await res.json()
        reply = data.text || data.reply || data.content?.[0]?.text || ''
      } else {
        reply = await callClaudeProxy(history.slice(-12), buildChatSystem())
      }
      const action = parseAction(reply)
      if (action) {
        if (action.clean) setMessages(prev => [...prev, { role: 'assistant', content: action.clean }])
        setPendingAction(action.json)
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
        [{ role: 'user', content: `Redactá ${isEmailReply ? 'la RESPUESTA a este email' : 'un email'}, profesional y humano, en español.\nTarea: ${task.title}\nCliente: ${task.clients?.name || 'interno'}\n${contextReadme ? `Contexto: ${contextReadme}\n` : ''}Email recibido / hilo:\n${notes || '(no pegado)'}\nDevolvé SOLO JSON: {"asunto":"...","cuerpo":"..."}` }],
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

  // Vincula la tarea de contenido a la presentación (tasks.presentation_id). Aparece
  // en la presentación como entrada de contenido; el slide de producción se crea desde ahí.
  async function assignToPresentation(presId: number) {
    if (!task) return
    await updateTask(task.id, { presentation_id: presId })
    await loadAll()
  }

  async function deleteTask() {
    if (!task) return
    setDeleting(true)
    await supabase.from('tasks').delete().eq('id', task.id) // CASCADE: subtareas, checklists, threads, attachments
    setDeleting(false); setConfirmDel(false)
    closeDetail()
    await loadAll()
  }

  // Cambiar el contexto de la tarea: separación estricta. Limpia tarea padre y
  // proyecto si quedan de otro contexto, y propaga el contexto a las subtareas
  // (que siempre heredan el del padre, requisito del trigger de la DB).
  async function changeContext(newCtx: string) {
    if (!task || newCtx === task.context) return
    const patch: Partial<Task> = { context: newCtx }
    const parent = tasks.find(t => t.id === task.parent_task_id)
    if (task.parent_task_id && (!parent || parent.context !== newCtx)) patch.parent_task_id = null
    const proj = projects.find(p => p.id === task.project_id)
    if (task.project_id && (!proj || proj.context !== newCtx)) patch.project_id = null
    if (newCtx !== 'agencia' && task.client_id) patch.client_id = null
    // Recalcular el prefijo de nomenclatura según el nuevo contexto/cliente
    const prefixClient = newCtx === 'agencia' && patch.client_id !== null ? (clients.find(c => c.id === task.client_id) || null) : null
    patch.title = buildTitle(taskPrefix(newCtx, prefixClient), stripPrefix(task.title))
    await updateTask(task.id, patch)
    for (const c of tasks.filter(t => t.parent_task_id === task.id)) {
      const cp = projects.find(pr => pr.id === c.project_id)
      const childPatch: Record<string, any> = { context: newCtx }
      if (c.project_id && (!cp || cp.context !== newCtx)) childPatch.project_id = null
      await supabase.from('tasks').update(childPatch).eq('id', c.id)
    }
    await loadAll()
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
          <div className="font-serif text-[17px] font-light mb-1.5 leading-snug">
            {headerTitle.prefix && <span className="font-mono text-[13px] text-claude/70 mr-1">{headerTitle.prefix} |</span>}
            {headerTitle.name}
          </div>
          <div className="flex gap-1 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: (STATUS_COLOR[task.status] || '#6b7280') + '16', color: STATUS_COLOR[task.status] }}>
              {STATUS_ICON[task.status]} {task.status}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(task.context)}</span>
            {task.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>}
          </div>
        </div>
        <div className="relative flex items-center gap-1 shrink-0">
          <button onClick={() => setShowMenu(m => !m)} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer px-1 leading-none" title="Opciones">⋯</button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-7 bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 z-10 w-44">
                <button onClick={() => { setShowMenu(false); setConfirmDel(true) }}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10 cursor-pointer">🗑 Eliminar tarea</button>
              </div>
            </>
          )}
          <button onClick={closeDetail} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer">✕</button>
        </div>
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
              <div className="flex items-stretch">
                {titlePrefix && (
                  <span className="shrink-0 inline-flex items-center px-3 rounded-l-lg border border-r-0 border-black/7 bg-bg4 text-claude font-mono text-[13px] font-medium">{titlePrefix} |</span>
                )}
                <input value={title} onChange={e => setInfo(setTitle, e.target.value)} className={fieldCls + (titlePrefix ? ' rounded-l-none' : '')} />
              </div>
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
                <label className={labelCls}>Fecha de entrega{isContent ? ' (a CM)' : ''}</label>
                <input type="date" value={dueDate} onChange={e => setInfo(setDueDate, e.target.value)} className={fieldCls} />
              </div>
            </div>

            {task.es_recordatorio && (
              <div>
                <label className={labelCls}>🔔 Fecha y hora del recordatorio</label>
                <input type="datetime-local" value={recordatorioAt} onChange={e => setInfo(setRecordatorioAt, e.target.value)} className={fieldCls} />
              </div>
            )}

            {isContent && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Fecha de grabación 🎬</label>
                  <input type="date" value={recordingDate} onChange={e => setInfo(setRecordingDate, e.target.value)} className={fieldCls} />
                  <div className="text-[10px] text-gray-400 mt-1">Opcional. Cuándo se filma — debe ser ≥24h antes de la entrega.</div>
                </div>
                <div>
                  <label className={labelCls}>Fecha de publicación</label>
                  <input type="date" value={publishDate} onChange={e => setInfo(setPublishDate, e.target.value)} className={fieldCls} />
                  <div className="text-[10px] text-gray-400 mt-1">La define el CM. No cierra tu parte — vos cerrás al entregar.</div>
                </div>
                {recWarn && (
                  <div className="col-span-2 text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5">
                    ⚠ La grabación debe ser al menos 24h antes de la entrega. Grabación máxima sugerida: <span className="font-medium">{recWarn}</span>.
                  </div>
                )}
                {pubWarn && (
                  <div className="col-span-2 text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5">
                    ⚠ La entrega debe ser al menos 24h antes de la publicación. Entrega mínima sugerida: <span className="font-medium">{pubWarn}</span>.
                  </div>
                )}
              </div>
            )}

            {isContent && (
              <div className="border border-black/7 rounded-lg p-3 flex flex-col gap-2.5">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Influencer / tipo de publicación</div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={() => setInfo(setIsInfluencer, !isInfluencer)} className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isInfluencer ? 'bg-claude' : 'bg-bg4'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isInfluencer ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                  <span className="text-[13px]">¿Involucra influencer externo?</span>
                </label>
                {isInfluencer && (
                  <>
                    <div>
                      <label className={labelCls}>Tipo de publicación</label>
                      <select value={pubType} onChange={e => setInfo(setPubType, e.target.value)} className={fieldCls}>
                        {PUB_TYPES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Influencer</label>
                        <input value={infName} onChange={e => setInfo(setInfName, e.target.value)} className={fieldCls} placeholder="Nombre" /></div>
                      <div><label className={labelCls}>Handle / cuenta</label>
                        <input value={infHandle} onChange={e => setInfo(setInfHandle, e.target.value)} className={fieldCls} placeholder="@usuario" /></div>
                    </div>
                    <div><label className={labelCls}>Agencia que lo gestiona</label>
                      <input value={infAgency} onChange={e => setInfo(setInfAgency, e.target.value)} className={fieldCls} placeholder="Opcional" /></div>
                  </>
                )}
                <div>
                  <label className={labelCls}>Formato</label>
                  <select value={contentFormat} onChange={e => setInfo(setContentFormat, e.target.value)} className={fieldCls}>
                    <option value="">— Sin definir —</option>
                    {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Estimado de tiempo</label>
              <div className="flex gap-1.5 flex-wrap">
                {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map(h => (
                  <button key={h} onClick={() => setInfo(setEstHours, h)}
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                      estHours === h ? 'border-claude text-claude bg-claude/7 font-semibold' : 'bg-bg2 border-black/7 text-gray-500 hover:border-black/13'
                    }`}>
                    {fmtHoras(h)}
                  </button>
                ))}
                <button onClick={() => setInfo(setEstHours, null)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                    estHours == null ? 'border-claude text-claude bg-claude/7 font-semibold' : 'bg-bg2 border-black/7 text-gray-400 hover:border-black/13'
                  }`}>
                  —
                </button>
              </div>
              <div className="mt-2">
                {suggestedHours == null ? (
                  <button onClick={suggestEstimate} disabled={suggesting}
                    className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 disabled:opacity-40">
                    {suggesting ? 'Pensando…' : '✦ Sugerir con Claude'}
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-2 text-[11px] bg-claude/7 border border-claude/20 text-claude px-2.5 py-1 rounded-md">
                    Claude sugiere: <span className="font-semibold">{fmtHoras(suggestedHours)}</span>
                    <button onClick={async () => { await updateTask(task.id, { estimated_hours: suggestedHours }); setEstHours(suggestedHours); setSuggestedHours(null) }}
                      className="text-success hover:opacity-70 cursor-pointer" title="Aceptar">✓</button>
                    <button onClick={() => setSuggestedHours(null)} className="text-gray-400 hover:text-danger cursor-pointer" title="Descartar">✕</button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Delegado a</label>
                <select value={delegatedTo} onChange={e => setInfo(setDelegatedTo, e.target.value)} className={fieldCls}>
                  <option value="">Nadie</option>
                  {/* Solo el equipo del mismo contexto que la tarea (banco no aparece en agencia y viceversa) */}
                  {contacts.filter(c => c.context === task.context).map(c => <option key={c.id} value={c.name}>{c.name}{c.role ? ` · ${c.role}` : ''}</option>)}
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

            {/* Contexto acumulado (context_readme) — colapsable, guarda al instante */}
            <div className="border border-black/7 rounded-lg overflow-hidden">
              <button onClick={() => setShowContext(s => !s)} className="w-full flex items-center justify-between px-3 py-2 bg-bg2 hover:bg-bg3 cursor-pointer">
                <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📄 Contexto {contextReadme ? '' : '· vacío'}</span>
                <span className="text-[10px] text-gray-400">{showContext ? '▼' : '▶'}</span>
              </button>
              {showContext && (
                <div className="p-3 border-t border-black/7">
                  <textarea value={contextReadme} onChange={e => setContextReadme(e.target.value)}
                    onBlur={() => { if (contextReadme !== (task.context_readme || '')) updateTask(task.id, { context_readme: contextReadme || null }) }}
                    rows={5} className={fieldCls + ' resize-y'}
                    placeholder="Contexto acumulado: de qué se trata, quién pide, historial. Claude lo usa como contexto en el chat de esta tarea." />
                  <div className="text-[10px] text-gray-400 mt-1">Se guarda al salir del campo. El chat de la tarea lo usa como contexto y lo actualiza al pegar contenido.</div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={saveInfo} disabled={!dirty || savingInfo}
                className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {savingInfo ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </div>

            {/* Organización — guarda al instante */}
            <div className="border-t border-black/7 pt-3 mt-1 flex flex-col gap-3">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Organización · se guarda al instante</div>

              <div>
                <label className={labelCls}>Contexto</label>
                <select value={task.context} className={fieldCls} onChange={e => changeContext(e.target.value)}>
                  <option value="banco">Banco Falabella</option>
                  <option value="agencia">Agencia</option>
                  <option value="personal">Personal</option>
                </select>
              </div>

              {task.context === 'agencia' && (
                <div>
                  <label className={labelCls}>Cliente / marca</label>
                  <select value={task.client_id ?? ''} className={fieldCls}
                    onChange={async e => { await updateTask(task.id, { client_id: e.target.value ? Number(e.target.value) : null }); await loadAll() }}>
                    <option value="">Agencia interna (sin cliente)</option>
                    {clients.filter(c => c.context === 'agencia').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {!isEmailReply && (<>
              <div>
                <label className={labelCls}>Parte de proyecto</label>
                <select value={task.project_id ?? ''} className={fieldCls}
                  onChange={async e => { await updateTask(task.id, { project_id: e.target.value ? Number(e.target.value) : null }); await loadAll() }}>
                  <option value="">— Ninguno —</option>
                  {/* Separación de contexto: solo proyectos del mismo contexto que la tarea */}
                  {projects.filter(p => p.context === task.context).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Subtarea de</label>
                <select value={task.parent_task_id ?? ''} className={fieldCls}
                  onChange={async e => { await updateTask(task.id, { parent_task_id: e.target.value ? Number(e.target.value) : null }); await loadAll() }}>
                  <option value="">— Ninguna (independiente) —</option>
                  {/* Separación de contexto: solo tareas del mismo contexto como padre */}
                  {tasks.filter(t => t.id !== task.id && t.parent_task_id !== task.id && !t.done && !t.es_recordatorio && t.context === task.context).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              </>)}

              <div className="flex items-center gap-3 p-3 bg-bg2 rounded-lg border border-black/7">
                <button onClick={async () => { const next = !isContent; await updateTask(task.id, { task_type: next ? 'contenido' : 'independiente' }); if (next) setTab('slide') }}
                  className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isContent ? 'bg-claude' : 'bg-bg4'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isContent ? 'left-5.5' : 'left-0.5'}`} />
                </button>
                <div>
                  <div className="text-[13px]">Convertir a tarea de contenido</div>
                  <div className="text-[11px] text-gray-400">Habilita el tab Slide para vincular o crear una presentación</div>
                </div>
              </div>
            </div>

            <TaskAttachments taskId={task.id} />
          </div>
        )}

        {/* SUBTAREAS */}
        {tab === 'subtareas' && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Subtareas vinculadas</div>
              <button onClick={() => setSubModalOpen(true)} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15">+ Nueva subtarea</button>
            </div>

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
            {pendingAction && (
              <div className="bg-claude/5 border border-claude/30 rounded-lg p-3 mb-2 text-[13px]">
                <div className="text-[11px] font-mono text-claude uppercase tracking-wider mb-1.5">✦ Cambios propuestos — aprobá para aplicar</div>
                <ul className="text-[12px] text-gray-600 space-y-0.5 mb-2 list-none">
                  {pendingAction.due_date && pendingAction.due_date !== 'null' && <li>📅 Nueva fecha de entrega: <span className="font-medium">{pendingAction.due_date}</span></li>}
                  {(pendingAction.priority || pendingAction.prioridad) && (pendingAction.priority || pendingAction.prioridad) !== 'null' && <li>🚩 Prioridad: <span className="font-medium">{pendingAction.priority || pendingAction.prioridad}</span></li>}
                  {pendingAction.context_readme && pendingAction.context_readme !== 'null' && <li>📄 Contexto de la tarea actualizado</li>}
                  {(pendingAction.subtareas || []).filter((s: any) => s.title || s.titulo).length > 0 && <li>✓ {pendingAction.subtareas.filter((s: any) => s.title || s.titulo).length} subtarea(s): {pendingAction.subtareas.map((s: any) => s.title || s.titulo).filter(Boolean).join(', ')}</li>}
                </ul>
                <div className="flex gap-2">
                  <button onClick={() => applyAction(pendingAction)} className="text-[11px] bg-claude text-white px-3 py-1 rounded-md cursor-pointer hover:bg-purple-700">Aplicar</button>
                  <button onClick={() => setPendingAction(null)} className="text-[11px] bg-bg3 border border-black/7 text-gray-500 px-3 py-1 rounded-md cursor-pointer hover:bg-bg4">Descartar</button>
                </div>
              </div>
            )}

            <div className="border-t border-black/7 pt-3">
              {chatImages.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {chatImages.map((im, i) => (
                    <div key={i} className="relative">
                      <img src={im.url} alt="" className="w-12 h-12 object-cover rounded border border-black/10" />
                      <button onClick={() => setChatImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center cursor-pointer">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <label className="self-center text-base cursor-pointer text-gray-400 hover:text-claude" title="Adjuntar imagen">
                  📎<input type="file" accept="image/*" multiple className="hidden" onChange={e => { addChatImages(e.target.files); e.target.value = '' }} />
                </label>
                <button onClick={() => chatRecording ? chatStopRec() : chatStartRec()}
                  className={`self-center text-base cursor-pointer ${chatRecording ? 'text-danger animate-pulse' : 'text-gray-400 hover:text-claude'}`} title="Dictar">🎙</button>
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  rows={2} disabled={chatLoading} placeholder="Pegá texto, adjuntá imagen o dictá…"
                  className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20" />
                <button onClick={sendChat} disabled={chatLoading} className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] self-end hover:bg-purple-700 cursor-pointer disabled:opacity-40">Enviar</button>
              </div>
            </div>
          </div>
        )}

        {/* EMAIL */}
        {tab === 'email' && (
          <div className="animate-fade-in flex flex-col gap-3">
            <div>
              <label className={labelCls}>Email recibido</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                onBlur={() => updateTask(task.id, { notes: notes.trim() || null })}
                rows={5} className={fieldCls + ' resize-y'}
                placeholder="Pegá acá el email/hilo recibido. Claude lo usa para redactar la respuesta." />
            </div>

            <button onClick={generateEmail} disabled={emailLoading}
              className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 cursor-pointer disabled:opacity-40 font-medium">
              {emailLoading ? 'Redactando…' : '✦ Redactar respuesta con Claude'}
            </button>

            {task.draft_body ? (
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-[11px] font-mono text-gray-400 w-12 uppercase">Asunto</span>
                  <span className="text-[13px] font-medium">{task.draft_subject || '—'}</span>
                </div>
                <div className="bg-bg2 border border-black/7 rounded-[10px] p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap">{task.draft_body}</div>
              </div>
            ) : (
              <div className="text-center py-5 text-gray-400 text-[13px]">Aún no hay borrador. Pegá el email y redactá la respuesta.</div>
            )}

            <button onClick={async () => { await updateTask(task.id, { done: true }); closeDetail() }}
              className="self-start text-xs bg-success/10 border border-success/30 text-success px-4 py-2 rounded-lg cursor-pointer hover:bg-success/18 transition-colors">
              ✓ Marcar respondido (cierra la tarea)
            </button>
          </div>
        )}

        {/* SLIDE */}
        {tab === 'slide' && (
          <div className="animate-fade-in flex flex-col gap-3">
            {task.presentation_id ? (
              <div className="bg-bg2 border border-black/7 rounded-[10px] p-3.5">
                <div className="text-[11px] font-mono text-gray-400 uppercase mb-1">Vinculada a presentación</div>
                <div className="font-medium text-gray-900 mb-0.5">{presentations.find(p => p.id === task.presentation_id)?.title || 'Presentación'}</div>
                <div className="text-xs text-gray-400 mb-2.5">Aparece en la presentación ordenada por fecha de publicación. El slide de producción se crea desde la presentación.</div>
                <div className="flex gap-2">
                  <button onClick={() => { setView(task.context === 'banco' ? 'banco-presentaciones' : 'agencia-presentaciones'); closeDetail() }}
                    className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15">Ir a Presentaciones →</button>
                  <button onClick={async () => { await updateTask(task.id, { presentation_id: null }); await loadAll() }}
                    className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4">Quitar vínculo</button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[13px] text-gray-500">Asigná esta tarea de contenido a una presentación o creá una nueva.</div>
                <div className="flex gap-2">
                  <select value={assignPresId} onChange={e => setAssignPresId(e.target.value ? Number(e.target.value) : '')} className={fieldCls + ' flex-1'}>
                    <option value="">Elegí una presentación…</option>
                    {presentations.filter(p => p.context === task.context).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <button onClick={() => assignPresId && assignToPresentation(Number(assignPresId))} disabled={!assignPresId}
                    className="text-xs bg-claude text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-purple-700 disabled:opacity-40 shrink-0">Asignar</button>
                </div>
                <button onClick={() => setNewPresOpen(true)}
                  className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-claude/15 w-fit">+ Crear nueva presentación</button>
              </>
            )}
            {newPresOpen && (
              <NewPresentationModal onClose={() => setNewPresOpen(false)}
                defaultContext={task.context} defaultClientId={task.client_id}
                onCreated={(id) => assignToPresentation(id)} />
            )}
          </div>
        )}
      </div>

      {subModalOpen && (
        <CaptureModal onClose={() => setSubModalOpen(false)}
          preselectContext={task.context} preselectClientId={task.client_id} preselectParentId={task.id} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmDel(false) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[400px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar tarea</div>
            <p className="text-[13px] text-gray-500 mb-4">
              Esta acción no se puede deshacer. ¿Eliminar permanentemente "<span className="font-medium text-gray-700">{task.title}</span>"? Se borran también sus subtareas, checklist y adjuntos.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(false)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={deleteTask} disabled={deleting} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-40">
                {deleting ? 'Eliminando…' : 'Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
