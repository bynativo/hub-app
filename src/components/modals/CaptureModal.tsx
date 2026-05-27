import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { callClaude } from '../../lib/claude'
import { QuickClientModal } from './QuickClientModal'
import { fmtHoras, todayISO } from '../../lib/helpers'
import type { Client, Project, Task } from '../../lib/types'
/* eslint-disable @typescript-eslint/no-explicit-any */

type CaptureTab = 'tarea' | 'notas' | 'micro'
type TipoTarea = 'independiente' | 'subtarea' | 'proyecto'

interface Suggested {
  titulo: string
  contexto: string
  tipo: TipoTarea
  prioridad: string
  due_date: string | null
  requested_at: string | null
  estimated_hours: number | null
  origen: string
  // campos editables del formulario completo
  parentId: number | null
  projectId: number | null
  clientId: number | null
  isContent: boolean
  isReminder: boolean
  reminderAt: string
  desc: string
  selected: boolean
  expanded: boolean
}

function normTipo(t: string): TipoTarea {
  return t === 'subtarea' ? 'subtarea' : t === 'proyecto' ? 'proyecto' : 'independiente'
}

const PROXY_URL = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/claude-proxy'

const EXTRACT_SYSTEM = 'Sos un asistente que extrae tareas accionables de notas, mensajes o imágenes (correos, WhatsApp, documentos). No inventes; solo lo explícito o claramente implícito. Devolvés SOLO JSON.'

function extractPrompt(text: string) {
  return `Hoy es ${todayISO()}. Extrae las tareas concretas. Para CADA tarea devolvé estos campos:
- titulo: corto y práctico
- contexto: banco | agencia | personal — OBLIGATORIO, siempre elegí el más probable según el contenido
- tipo: independiente | con_subtareas | proyecto | recurrente
- prioridad: alta | media | baja
- due_date: fecha de entrega "YYYY-MM-DD" — OBLIGATORIA. Inferila siempre que puedas: convertí expresiones relativas ("hoy", "mañana", "el viernes", "fin de mes", "en una semana") a fecha concreta tomando hoy=${todayISO()}. Solo dejá null si es realmente imposible inferir una fecha.
- requested_at: fecha en que lo pidieron "YYYY-MM-DD" si se infiere (ej. fecha del correo), sino null
- estimated_hours: estimación de esfuerzo, uno de 0.5,1,1.5,2,3,4,6,8
- origen: gmail-agencia | whatsapp | reunion | propia

Responde SOLO JSON: {"tareas":[{"titulo":"...","contexto":"...","tipo":"...","prioridad":"...","due_date":null,"requested_at":null,"estimated_hours":1,"origen":"..."}]}

${text.trim() ? `Contenido:\n${text.trim()}` : ''}`
}

function parseSuggested(reply: string): Suggested[] {
  const cleaned = reply.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)
  const items = parsed.tareas || parsed.tasks || []
  return items.map((t: any) => ({
    titulo: t.titulo || t.title || '',
    contexto: t.contexto || t.context || 'agencia',
    tipo: normTipo(t.tipo || t.type || ''),
    prioridad: t.prioridad || t.priority || 'media',
    due_date: t.due_date || null,
    requested_at: t.requested_at || null,
    estimated_hours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
    origen: t.origen || t.origin || 'propia',
    parentId: null, projectId: null, clientId: null,
    isContent: false, isReminder: false, reminderAt: '', desc: '',
    selected: true, expanded: false,
  }))
}

// Formulario completo y editable por cada tarea extraída (igual al tab Tarea directa)
function SuggestionForm({ s, onChange, onRemove, clients, projects, tasks, showError }: {
  s: Suggested
  onChange: (patch: Partial<Suggested>) => void
  onRemove: () => void
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  showError?: boolean
}) {
  const fld = 'w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'
  const lbl = 'text-[10px] font-mono text-gray-400 uppercase block mb-1'
  // Fecha de entrega obligatoria (salvo recordatorios, que usan reminderAt)
  const dueMissing = !!showError && !s.isReminder && !s.due_date
  const errFld = fld + ' border-danger/60 bg-danger/5'
  const agClients = clients.filter(c => c.context === 'agencia')
  const ctxProjects = projects.filter(p => p.context === s.contexto)
  const activeTasks = tasks.filter(t => !t.done && !t.parent_task_id && !t.archived_at && !t.es_recordatorio)
  const togg = (on: boolean) => `w-9 h-5 rounded-full relative transition-colors shrink-0 ${on ? 'bg-claude' : 'bg-bg4'}`
  const knob = (on: boolean) => `w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${on ? 'left-[18px]' : 'left-0.5'}`

  return (
    <div className={`rounded-lg border transition-all ${s.selected ? 'border-claude/20 bg-claude/5' : 'border-black/7 bg-bg3 opacity-60'}`}>
      <div className="flex items-center gap-2 p-2.5">
        <div onClick={() => onChange({ selected: !s.selected })}
          className={`w-4 h-4 rounded border-[1.5px] shrink-0 flex items-center justify-center text-[10px] cursor-pointer ${s.selected ? 'bg-claude border-claude text-white' : 'border-black/13'}`}>{s.selected && '✓'}</div>
        <span onClick={() => onChange({ expanded: !s.expanded })} className="flex-1 text-[13px] cursor-pointer truncate">{s.titulo || '(sin título)'}</span>
        {!s.expanded && (
          <>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 shrink-0">{s.contexto}</span>
            {s.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn shrink-0">{s.due_date.slice(5).replace('-', '/')}</span>}
          </>
        )}
        <button onClick={() => onChange({ expanded: !s.expanded })} className="text-gray-400 text-[11px] cursor-pointer w-4 shrink-0">{s.expanded ? '▾' : '▸'}</button>
        <button onClick={onRemove} className="text-gray-300 hover:text-danger text-xs cursor-pointer shrink-0" title="Descartar">✕</button>
      </div>

      {s.expanded && (
        <div className="border-t border-black/7 p-2.5 flex flex-col gap-2">
          <div><label className={lbl}>Título</label><input value={s.titulo} onChange={e => onChange({ titulo: e.target.value })} className={fld} /></div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <button type="button" onClick={() => onChange({ isReminder: !s.isReminder })} className={togg(s.isReminder)}><div className={knob(s.isReminder)} /></button>
            🔔 Es recordatorio
          </label>
          {s.isReminder && <div><label className={lbl}>Fecha y hora</label><input type="datetime-local" value={s.reminderAt} onChange={e => onChange({ reminderAt: e.target.value })} className={fld} /></div>}

          {!s.isReminder && (
            <div>
              <label className={lbl}>Tipo</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['independiente', 'subtarea', 'proyecto'] as TipoTarea[]).map(tp => (
                  <button key={tp} onClick={() => onChange({ tipo: tp })} className={`py-1.5 border rounded-md text-[11px] cursor-pointer transition-all ${s.tipo === tp ? 'border-claude/20 text-claude bg-claude/7' : 'border-black/7 text-gray-500 bg-bg2 hover:bg-bg4'}`}>
                    {tp === 'independiente' ? 'Independiente' : tp === 'subtarea' ? 'Subtarea' : 'Proyecto'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!s.isReminder && s.tipo === 'subtarea' && (
            <div><label className={lbl}>Tarea padre</label>
              <select value={s.parentId ?? ''} onChange={e => onChange({ parentId: e.target.value ? Number(e.target.value) : null })} className={fld}>
                <option value="">Seleccionar…</option>
                {activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select></div>
          )}
          {!s.isReminder && s.tipo === 'proyecto' && (
            <div><label className={lbl}>Proyecto</label>
              <select value={s.projectId ?? ''} onChange={e => onChange({ projectId: e.target.value ? Number(e.target.value) : null })} className={fld}>
                <option value="">Seleccionar…</option>
                {ctxProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Contexto</label>
              <select value={s.contexto} onChange={e => onChange({ contexto: e.target.value, clientId: null })} className={fld}>
                <option value="banco">Banco</option><option value="agencia">Agencia</option><option value="personal">Personal</option>
              </select></div>
            {s.contexto === 'agencia' && (
              <div><label className={lbl}>Cliente</label>
                <select value={s.clientId ?? ''} onChange={e => onChange({ clientId: e.target.value ? Number(e.target.value) : null })} className={fld}>
                  <option value="">Agencia interna</option>
                  {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Prioridad</label>
              <select value={s.prioridad} onChange={e => onChange({ prioridad: e.target.value })} className={fld}>
                <option value="alta">🔴 Alta</option><option value="media">🟡 Media</option><option value="baja">🟢 Baja</option>
              </select></div>
            <div><label className={lbl}>Origen</label>
              <select value={s.origen} onChange={e => onChange({ origen: e.target.value })} className={fld}>
                <option value="gmail-agencia">📧 Email</option><option value="whatsapp">💬 WhatsApp</option><option value="reunion">🤝 Reunión</option><option value="propia">💡 Propia</option>
              </select></div>
          </div>

          {!s.isReminder && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Fecha entrega <span className="text-danger">*</span></label>
                <input type="date" value={s.due_date || ''} onChange={e => onChange({ due_date: e.target.value || null })} className={dueMissing ? errFld : fld} />
                {dueMissing && <span className="text-[10px] text-danger">Obligatoria</span>}
              </div>
              <div><label className={lbl}>¿Cuándo te lo pidieron?</label><input type="date" value={s.requested_at || ''} onChange={e => onChange({ requested_at: e.target.value || null })} className={fld} /></div>
            </div>
          )}

          <div>
            <label className={lbl}>Estimado</label>
            <div className="flex gap-1 flex-wrap">
              {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map(h => (
                <button key={h} onClick={() => onChange({ estimated_hours: h })} className={`text-[10px] font-mono px-2 py-0.5 rounded border cursor-pointer ${s.estimated_hours === h ? 'border-claude text-claude bg-claude/7' : 'border-black/7 text-gray-500 bg-bg2'}`}>{fmtHoras(h)}</button>
              ))}
              <button onClick={() => onChange({ estimated_hours: null })} className={`text-[10px] font-mono px-2 py-0.5 rounded border cursor-pointer ${s.estimated_hours == null ? 'border-claude text-claude bg-claude/7' : 'border-black/7 text-gray-400 bg-bg2'}`}>—</button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <button type="button" onClick={() => onChange({ isContent: !s.isContent })} className={togg(s.isContent)}><div className={knob(s.isContent)} /></button>
            Es tarea de contenido
          </label>

          <div><label className={lbl}>Descripción / contexto</label><textarea value={s.desc} onChange={e => onChange({ desc: e.target.value })} rows={2} className={fld + ' resize-y'} placeholder="Detalles adicionales…" /></div>
        </div>
      )}
    </div>
  )
}

// El edge function devuelve { text }; leemos eso primero.
async function callProxy(content: any): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }], system: EXTRACT_SYSTEM }),
  })
  if (!res.ok) throw new Error('proxy')
  const data = await res.json()
  return data.text || data.reply || data.content?.[0]?.text || ''
}

async function extractTasks(text: string): Promise<Suggested[]> {
  let reply: string
  try {
    reply = await callProxy(extractPrompt(text))
  } catch {
    reply = await callClaude([{ role: 'user', content: extractPrompt(text) }], EXTRACT_SYSTEM)
  }
  return parseSuggested(reply)
}

// Extracción por visión: manda el prompt + imágenes (base64) al proxy.
async function extractFromImages(images: { media_type: string; data: string }[], extraText: string): Promise<Suggested[]> {
  const content = [
    { type: 'text', text: extractPrompt(extraText || '(Las tareas están en las imágenes adjuntas: correos, WhatsApp o documentos.)') },
    ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
  ]
  return parseSuggested(await callProxy(content))
}

export function CaptureModal({ onClose, preselectContext, preselectClientId, preselectProjectId, preselectParentId, template }: {
  onClose: () => void
  preselectContext?: string
  preselectClientId?: number | null
  preselectProjectId?: number | null
  preselectParentId?: number | null
  template?: { title?: string; context?: string; priority?: string; origin?: string; notes?: string | null; estimated_hours?: number | null; task_type?: string }
}) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const projects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const [tab, setTab] = useState<CaptureTab>('tarea')

  const agClients = clients.filter(c => c.context === 'agencia')

  // ===== Tab Tarea =====
  const [title, setTitle] = useState(template?.title ?? '')
  const [tipo, setTipo] = useState<TipoTarea>(preselectParentId ? 'subtarea' : preselectProjectId ? 'proyecto' : 'independiente')
  const [parentId, setParentId] = useState<number | null>(preselectParentId ?? null)
  const [projectId, setProjectId] = useState<number | '' | '__new__'>(preselectProjectId ?? '')
  const [newProject, setNewProject] = useState('')
  const [context, setContext] = useState(preselectContext ?? template?.context ?? 'banco')
  const [clientId, setClientId] = useState<number | null>(preselectClientId ?? null)
  const [priority, setPriority] = useState(template?.priority ?? 'media')
  const [origin, setOrigin] = useState(template?.origin ?? 'propia')
  const [dueDate, setDueDate] = useState('')
  const [requestedAt, setRequestedAt] = useState(todayISO())
  const [isContent, setIsContent] = useState(template?.task_type === 'contenido')
  const [estHours, setEstHours] = useState<number | null>(template?.estimated_hours ?? null)
  const [isReminder, setIsReminder] = useState(false)
  const [reminderAt, setReminderAt] = useState('')
  const [isEmailReply, setIsEmailReply] = useState(false)
  const [desc, setDesc] = useState(template?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [quickClientOpen, setQuickClientOpen] = useState(false)
  // Fecha de entrega obligatoria salvo recordatorios (usan reminderAt como fecha)
  const dueError = showErrors && !isReminder && !dueDate
  const ctxError = showErrors && !context

  const activeTasks = tasks.filter(t => !t.done)
  const ctxProjects = projects.filter(p => p.context === context)

  // Al elegir tarea padre, heredar su contexto
  useEffect(() => {
    if (tipo === 'subtarea' && parentId) {
      const parent = tasks.find(t => t.id === parentId)
      if (parent && parent.context !== context) setContext(parent.context)
    }
  }, [parentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveTask() {
    if (!title.trim()) return
    if (isReminder && !reminderAt) return
    // Contexto y fecha de entrega son obligatorios (la fecha no aplica a recordatorios)
    if (!context || (!isReminder && !dueDate)) { setShowErrors(true); return }
    setSaving(true)
    const reminder = isReminder && !!reminderAt
    const emailReply = isEmailReply && origin === 'gmail-agencia'

    let resolvedProjectId: number | null = null
    if (!reminder && !emailReply && tipo === 'proyecto') {
      if (projectId === '__new__' || (!projectId && newProject.trim())) {
        const { data, error } = await supabase.from('projects').insert({
          name: newProject.trim(), context, client_id: context === 'agencia' ? clientId : null, type: 'proyecto',
        }).select().single()
        if (error || !data) { alert('Error creando proyecto: ' + error?.message); setSaving(false); return }
        resolvedProjectId = data.id
      } else if (projectId) {
        resolvedProjectId = Number(projectId)
      }
    }

    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      context,
      priority,
      origin,
      client_id: context === 'agencia' ? clientId : null,
      project_id: emailReply ? null : resolvedProjectId,
      parent_task_id: (reminder || emailReply) ? null : (tipo === 'subtarea' ? parentId : null),
      task_type: emailReply ? 'responder_email' : (isContent ? 'contenido' : 'independiente'),
      due_date: reminder ? null : (dueDate || null),
      requested_at: requestedAt || todayISO(),
      estimated_hours: emailReply ? 0.25 : estHours,
      notes: desc.trim() || null,
      context_readme: desc.trim() || null,
      status: reminder ? 'Recordatorio' : 'Inbox',
      es_recordatorio: reminder,
      recordatorio_at: reminder ? new Date(reminderAt).toISOString() : null,
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    })
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await loadAll()
    onClose()
  }

  // ===== Tabs Notas / Micro (extracción) =====
  const [meetingText, setMeetingText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggested[]>([])
  const [extracted, setExtracted] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [images, setImages] = useState<{ name: string; url: string; media_type: string; data: string; file: File }[]>([])

  async function addImages(files: FileList | null) {
    if (!files) return
    const arr = await Promise.all(Array.from(files).map(f => new Promise<{ name: string; url: string; media_type: string; data: string; file: File }>(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string // data:<mime>;base64,XXXX
        resolve({ name: f.name, url: result, media_type: f.type || 'image/png', data: result.split(',')[1] || '', file: f })
      }
      reader.readAsDataURL(f)
    })))
    setImages(prev => [...prev, ...arr])
  }

  async function runExtract(text: string) {
    if (!text.trim()) return
    setExtracting(true); setSuggestions([])
    try {
      setSuggestions(await extractTasks(text)); setExtracted(true)
    } catch {
      alert('Error extrayendo tareas. Intenta de nuevo.')
    } finally {
      setExtracting(false)
    }
  }

  // Extrae de notas y/o imágenes (visión)
  async function handleExtract() {
    const hasImages = images.length > 0
    if (!meetingText.trim() && !hasImages) return
    setExtracting(true); setSuggestions([])
    try {
      const items = hasImages
        ? await extractFromImages(images.map(im => ({ media_type: im.media_type, data: im.data })), meetingText)
        : await extractTasks(meetingText)
      setSuggestions(items); setExtracted(true)
    } catch {
      alert('Error extrayendo tareas. Intenta de nuevo.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleCreateSelected() {
    const selected = suggestions.filter(s => s.selected)
    if (!selected.length) return
    // Contexto y fecha de entrega obligatorios en cada tarea seleccionada
    const isMissing = (s: Suggested) => !s.contexto || (!s.isReminder && !s.due_date)
    if (selected.some(isMissing)) {
      setShowErrors(true)
      // Expandir las tareas con campos faltantes para que el usuario las complete
      setSuggestions(prev => prev.map(s => (s.selected && isMissing(s)) ? { ...s, expanded: true } : s))
      return
    }
    setSavingNotes(true)
    const taskRows = selected.map(s => {
      const reminder = s.isReminder && !!s.reminderAt
      return {
        title: s.titulo, context: s.contexto, priority: s.prioridad, origin: s.origen || 'reunion',
        client_id: s.contexto === 'agencia' ? s.clientId : null,
        project_id: (!reminder && s.tipo === 'proyecto') ? s.projectId : null,
        parent_task_id: (!reminder && s.tipo === 'subtarea') ? s.parentId : null,
        task_type: s.isContent ? 'contenido' : 'independiente',
        due_date: reminder ? null : (s.due_date || null),
        requested_at: s.requested_at || todayISO(),
        estimated_hours: s.estimated_hours,
        notes: s.desc.trim() || null,
        context_readme: s.desc.trim() || meetingText.trim() || (images.length ? 'Extraído de imágenes adjuntas.' : null),
        status: reminder ? 'Recordatorio' : 'Inbox',
        es_recordatorio: reminder,
        recordatorio_at: reminder ? new Date(s.reminderAt).toISOString() : null,
        done: false, cats: [], plan: [], meeting_agenda: [],
      }
    })
    let firstTaskId: number | null = null
    if (taskRows.length) {
      const { data, error } = await supabase.from('tasks').insert(taskRows).select('id')
      if (error) { alert('Error: ' + error.message); setSavingNotes(false); return }
      firstTaskId = data?.[0]?.id ?? null
    }
    // Guardar las imágenes como contexto (es_contexto=true), vinculadas a la primera tarea creada
    if (images.length && firstTaskId) {
      for (const im of images) {
        const path = `${firstTaskId}/${Date.now()}-${im.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
        const up = await supabase.storage.from('capturas').upload(path, im.file, { contentType: im.media_type })
        if (!up.error) {
          const { data: pub } = supabase.storage.from('capturas').getPublicUrl(path)
          await supabase.from('attachments').insert({ task_id: firstTaskId, name: im.name, url: pub.publicUrl, es_contexto: true, size_kb: Math.round(im.file.size / 1024) })
        }
      }
    }
    await loadAll()
    onClose()
  }

  // ===== Tab Micro =====
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  function startRecording() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Tu navegador no soporta reconocimiento de voz.'); return }
    const recognition = new SR()
    recognition.lang = 'es-CL'; recognition.continuous = true; recognition.interimResults = true
    let finalText = transcript
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      setTranscript(finalText + interim)
    }
    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }
  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
    if (transcript.trim()) runExtract(transcript)
  }
  useEffect(() => () => recognitionRef.current?.stop(), [])

  const tabCls = (t: CaptureTab) =>
    `flex-1 py-2.5 text-xs font-mono text-center cursor-pointer border-b-2 transition-all ${
      tab === t ? 'text-claude border-claude' : 'text-gray-400 border-transparent hover:text-gray-500'
    }`
  const fieldCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer focus:border-claude/20 focus:bg-bg2'
  const inputCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  function renderSuggestions() {
    if (!extracted) return null
    if (!suggestions.length) return <div className="text-center py-4 text-gray-400 text-[13px]">No se identificaron tareas.</div>
    const update = (i: number, patch: Partial<Suggested>) => setSuggestions(prev => prev.map((x, j) => j === i ? { ...x, ...patch } : x))
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-mono text-claude tracking-wider uppercase">
            ✦ {suggestions.length} tarea{suggestions.length > 1 ? 's' : ''} — editá lo que quieras y aprobá
          </div>
          <button onClick={() => setSuggestions(prev => prev.map(s => ({ ...s, expanded: !prev.every(x => x.expanded) })))}
            className="text-[10px] text-gray-400 hover:text-claude cursor-pointer">expandir/contraer</button>
        </div>
        {showErrors && suggestions.some(s => s.selected && (!s.contexto || (!s.isReminder && !s.due_date))) && (
          <div className="text-[11px] text-danger bg-danger/5 border border-danger/30 rounded-md px-2.5 py-1.5 mb-2">
            Completá la fecha de entrega (obligatoria) en las tareas marcadas antes de crear.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {suggestions.map((s, i) => (
            <SuggestionForm key={i} s={s} onChange={p => update(i, p)} onRemove={() => setSuggestions(prev => prev.filter((_, j) => j !== i))}
              clients={clients} projects={projects} tasks={tasks} showError={showErrors} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-8 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl w-[580px] max-w-[96vw] mb-10 shadow-lg overflow-hidden">
        <div className="flex border-b border-black/7">
          <button className={tabCls('tarea')} onClick={() => setTab('tarea')}>📋 Tarea directa</button>
          <button className={tabCls('notas')} onClick={() => setTab('notas')}>📝 Reunión / Notas</button>
          <button className={tabCls('micro')} onClick={() => setTab('micro')}>🎙 Micrófono</button>
        </div>

        {/* Selectores compartidos por los 3 tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-black/7 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contexto <span className="text-danger">*</span></label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }}
              className={fieldCls + (ctxError ? ' border-danger/60 bg-danger/5' : '')}>
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          {context === 'agencia' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Cliente</label>
                <button type="button" onClick={() => setQuickClientOpen(true)} className="text-[11px] text-claude hover:underline cursor-pointer">+ Crear cliente rápido</button>
              </div>
              <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                <option value="">Agencia interna</option>
                {agClients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.tipo === 'prospecto' ? 'prospecto' : 'activo'}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="p-6">
          {tab === 'tarea' && (
            <>
              <div className="mb-3">
                <label className={labelCls}>Título *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="¿Qué hay que hacer?" autoFocus />
              </div>

              {/* Es recordatorio */}
              <div className="mb-3 flex items-center gap-3 p-3 bg-bg3 rounded-lg border border-black/7">
                <button type="button" onClick={() => setIsReminder(!isReminder)} className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isReminder ? 'bg-claude' : 'bg-bg4'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isReminder ? 'left-5.5' : 'left-0.5'}`} />
                </button>
                <div>
                  <div className="text-[13px]">🔔 Es recordatorio</div>
                  <div className="text-[11px] text-gray-400">Entra directo a Seguimiento y te avisa en la fecha/hora elegida</div>
                </div>
              </div>

              {isReminder && (
                <div className="mb-3">
                  <label className={labelCls}>Fecha y hora del recordatorio *</label>
                  <input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)} className={fieldCls} />
                </div>
              )}

              {!isReminder && !isEmailReply && (<>
              {/* Tipo / jerarquía */}
              <div className="mb-3">
                <label className={labelCls}>Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: 'independiente', l: 'Independiente' },
                    { v: 'subtarea', l: 'Subtarea de…' },
                    { v: 'proyecto', l: 'Parte de proyecto' },
                  ] as { v: TipoTarea; l: string }[]).map(o => (
                    <button key={o.v} onClick={() => setTipo(o.v)}
                      className={`py-2 px-1 border rounded-lg text-[11px] text-center cursor-pointer transition-all ${
                        tipo === o.v ? 'border-claude/20 text-claude bg-claude/7' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                      }`}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {tipo === 'subtarea' && (
                <div className="mb-3">
                  <label className={labelCls}>Tarea padre</label>
                  <select value={parentId ?? ''} onChange={e => setParentId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                    <option value="">Seleccionar tarea…</option>
                    {activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}

              {tipo === 'proyecto' && (
                <div className="mb-3">
                  <label className={labelCls}>Proyecto</label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value === '' ? '' : e.target.value === '__new__' ? '__new__' : Number(e.target.value))} className={fieldCls}>
                    <option value="">Seleccionar proyecto…</option>
                    {ctxProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">+ Crear proyecto nuevo</option>
                  </select>
                  {String(projectId) === '__new__' && (
                    <input value={newProject} onChange={e => setNewProject(e.target.value)} className={inputCls + ' mt-2'} placeholder="Nombre del nuevo proyecto" />
                  )}
                </div>
              )}
              </>)}

              <div className="mb-3">
                <label className={labelCls}>Prioridad</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls}>
                  <option value="alta">🔴 Alta</option>
                  <option value="media">🟡 Media</option>
                  <option value="baja">🟢 Baja</option>
                </select>
              </div>

              <div className="mb-3">
                <label className={labelCls}>Origen</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'gmail-agencia', label: '📧 Email' },
                    { value: 'whatsapp', label: '💬 WhatsApp' },
                    { value: 'reunion', label: '🤝 Reunión' },
                    { value: 'propia', label: '💡 Propia' },
                  ].map(o => (
                    <button key={o.value} onClick={() => setOrigin(o.value)}
                      className={`py-2 px-1 border rounded-lg text-[11px] text-center cursor-pointer transition-all ${
                        origin === o.value ? 'border-claude/20 text-claude bg-claude/7' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {origin === 'gmail-agencia' && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-bg3 rounded-lg border border-black/7">
                  <button type="button" onClick={() => setIsEmailReply(!isEmailReply)} className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isEmailReply ? 'bg-claude' : 'bg-bg4'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isEmailReply ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                  <div>
                    <div className="text-[13px]">✉️ Es solo una respuesta</div>
                    <div className="text-[11px] text-gray-400">Tarea simple de responder email · 15 min, sin subtareas ni proyecto</div>
                  </div>
                </div>
              )}

              {!isReminder && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Fecha de entrega <span className="text-danger">*</span></label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className={fieldCls + (dueError ? ' border-danger/60 bg-danger/5' : '')} />
                    {dueError && <span className="text-[10px] text-danger">Obligatoria</span>}
                  </div>
                  <div>
                    <label className={labelCls}>¿Cuándo te lo pidieron?</label>
                    <input type="date" value={requestedAt} onChange={e => setRequestedAt(e.target.value)} className={fieldCls} />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className={labelCls}>Estimado de tiempo</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map(h => (
                    <button key={h} type="button" onClick={() => setEstHours(h)}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                        estHours === h ? 'border-claude/20 text-claude bg-claude/7 font-semibold' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                      }`}>
                      {fmtHoras(h)}
                    </button>
                  ))}
                  <button type="button" onClick={() => setEstHours(null)}
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                      estHours == null ? 'border-claude/20 text-claude bg-claude/7 font-semibold' : 'border-black/7 text-gray-400 bg-bg3 hover:bg-bg4'
                    }`}>
                    —
                  </button>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-3 p-3 bg-bg3 rounded-lg border border-black/7">
                <button onClick={() => setIsContent(!isContent)} className={`w-10 h-5 rounded-full relative transition-colors ${isContent ? 'bg-claude' : 'bg-bg4'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isContent ? 'left-5.5' : 'left-0.5'}`} />
                </button>
                <div>
                  <div className="text-[13px]">Es tarea de contenido</div>
                  <div className="text-[11px] text-gray-400">Se crea con task_type='contenido' y activa la vista de slide</div>
                </div>
              </div>

              <div className="mb-4">
                <label className={labelCls}>Descripción (opcional)</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className={inputCls + ' resize-y'} placeholder="Quién pide, contexto adicional…" rows={3} />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={handleSaveTask} disabled={!title.trim() || saving || (isReminder && !reminderAt)}
                  className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Guardando…' : isReminder ? 'Crear recordatorio' : (isEmailReply && origin === 'gmail-agencia') ? 'Crear respuesta de email' : 'Guardar tarea'}
                </button>
              </div>
            </>
          )}

          {(tab === 'notas' || tab === 'micro') && (
            <>
              {tab === 'notas' ? (
                <>
                  <p className="text-[13px] text-gray-400 mb-3">Pegá lo que te pidieron y/o subí imágenes (correos, WhatsApp, documentos). Claude extrae y clasifica las tareas con todos los campos.</p>
                  <textarea value={meetingText} onChange={e => setMeetingText(e.target.value)}
                    className={inputCls + ' resize-y leading-relaxed mb-3'} placeholder="Notas, correo pegado, o dejá vacío y subí imágenes…" rows={6} autoFocus />

                  <div className="mb-3">
                    <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Imágenes (opcional)</label>
                    <input type="file" accept="image/*" multiple onChange={e => { addImages(e.target.files); e.target.value = '' }}
                      className="text-[12px] text-gray-500 file:mr-2 file:text-[11px] file:bg-claude/7 file:text-claude file:border file:border-claude/20 file:rounded-md file:px-2 file:py-1 file:cursor-pointer" />
                    {images.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {images.map((im, i) => (
                          <div key={i} className="relative">
                            <img src={im.url} alt={im.name} className="w-16 h-16 object-cover rounded-md border border-black/10" />
                            <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center cursor-pointer">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-gray-400 mb-3">Graba con el micrófono; al detener se extraen las tareas.</p>
                  <div className="flex items-center gap-3 mb-3">
                    {recording ? (
                      <button onClick={stopRecording} className="flex items-center gap-2 px-5 py-3 bg-danger/10 border border-danger/30 text-danger rounded-lg cursor-pointer font-medium text-xs hover:bg-danger/20">
                        <span className="w-3 h-3 rounded-full bg-danger animate-pulse" /> Detener grabación
                      </button>
                    ) : (
                      <button onClick={startRecording} className="flex items-center gap-2 px-5 py-3 bg-claude/7 border border-claude/20 text-claude rounded-lg cursor-pointer font-medium text-xs hover:bg-claude/15">
                        🎙 Iniciar grabación
                      </button>
                    )}
                    {recording && <span className="text-[11px] font-mono text-danger">Grabando…</span>}
                  </div>
                  <div className="bg-bg3 border border-black/7 rounded-lg px-3 py-3 text-[13px] leading-relaxed min-h-[120px] mb-3 whitespace-pre-wrap">
                    {transcript || <span className="text-gray-400">La transcripción aparecerá aquí…</span>}
                  </div>
                </>
              )}

              {tab === 'notas' && (
                <button onClick={handleExtract} disabled={(!meetingText.trim() && !images.length) || extracting}
                  className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium mb-4">
                  {extracting ? 'Extrayendo…' : images.length ? `✦ Extraer de ${images.length} imagen(es)${meetingText.trim() ? ' + texto' : ''}` : '✦ Extraer tareas con Claude'}
                </button>
              )}

              {renderSuggestions()}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                {extracted && suggestions.some(s => s.selected) && (
                  <button onClick={handleCreateSelected} disabled={savingNotes}
                    className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    {savingNotes ? 'Creando…' : `Crear ${suggestions.filter(s => s.selected).length}`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {quickClientOpen && (
        <QuickClientModal onClose={() => setQuickClientOpen(false)} onCreated={id => { setContext('agencia'); setClientId(id) }} />
      )}
    </div>
  )
}
