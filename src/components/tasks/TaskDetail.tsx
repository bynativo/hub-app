import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaudeProxy } from '../../lib/claude'
import { ESTADOS, STATUS_ICON, STATUS_COLOR, PUB_TYPES, FORMATOS, DELEGATION_STAGES, CONTENT_STAGES } from '../../lib/constants'
import { ctxLabel, fmtHoras, taskPrefix, buildTitle, stripPrefix, splitTitle, deliveryWarning, recordingWarning, tipoShortLabel, todayISO, isRRSSContent } from '../../lib/helpers'
import { TiposChecklist, TiposSummary, type TipoConCantidad } from './TiposChecklist'
import { ReminderDateTimePicker } from '../shared/ReminderDateTimePicker'
import { NewPresentationModal } from '../modals/NewPresentationModal'
import { CaptureModal } from '../modals/CaptureModal'
import { DelegationModal, type DelegationFormData } from '../modals/DelegationModal'
import { AttachmentsZone, type AttachmentsZoneHandle } from './AttachmentsZone'
import { TaskItem } from './TaskItem'
import { ReminderRow } from './ReminderRow'
import type { Checklist, Task, TaskDelegation } from '../../lib/types'
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

// Fila de checklist con responsable + fecha. Al setear due_at se crea un
// recordatorio automático (vía syncChecklistReminder en TaskDetail) — el
// reminder_task_id queda apuntando a la tarea recordatorio en checklists.
function ChecklistRow({
  item, onToggleDone, onUpdate, onDelete,
}: {
  item: Checklist
  onToggleDone: () => void | Promise<void>
  onUpdate: (patch: Partial<Checklist>) => void | Promise<void>
  onDelete: () => void | Promise<void>
}) {
  // Date + hora separados (mismo patrón que el reminder del CaptureModal).
  // dueDate (YYYY-MM-DD), dueTime (HH:MM), customTime (true = mostrar input manual).
  function splitLocalDT(iso: string | null): { date: string; time: string } {
    if (!iso) return { date: '', time: '' }
    const d = new Date(iso)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { date, time }
  }
  const initial = splitLocalDT(item.due_at)
  const PRESETS = ['09:00', '11:00', '15:00', '17:00']
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [responsable, setResponsable] = useState(item.responsable || '')
  const [dueDate, setDueDate] = useState(initial.date)
  const [dueTime, setDueTime] = useState(initial.time)
  const [customTime, setCustomTime] = useState(!!initial.time && !PRESETS.includes(initial.time))
  const dueAt = dueDate && dueTime ? `${dueDate}T${dueTime}` : ''
  const hasAlarm = !!item.due_at
  const dueLabel = item.due_at
    ? new Date(item.due_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  function commitTitle() {
    if (title !== item.title) onUpdate({ title })
  }
  function applyAssignment() {
    onUpdate({
      responsable: responsable.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      title: title.trim(),
    })
    setExpanded(false)
  }
  function clearAssignment() {
    setResponsable(''); setDueDate(''); setDueTime(''); setCustomTime(false)
    onUpdate({ responsable: null, due_at: null })
  }

  const fld = 'w-full bg-bg2 border border-black/7 rounded-md px-2 py-1 text-[12px] outline-none focus:border-claude/20'
  const lbl = 'text-[10px] font-mono text-gray-400 tracking-wider uppercase block mb-1'

  return (
    <div className={`border rounded-md transition-colors ${expanded ? 'border-claude/20 bg-claude/5' : 'border-black/7 bg-bg2'}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 group">
        <div onClick={() => onToggleDone()}
          className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[9px] ${item.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'}`}>
          {item.done && '✓'}
        </div>
        <input value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={commitTitle}
          placeholder="Escribí el item…"
          className={`flex-1 bg-transparent text-[13px] outline-none border-b border-transparent focus:border-black/13 ${item.done ? 'line-through text-gray-400' : ''}`} />
        {/* Chips de responsable / fecha — compactos, click expande */}
        {item.responsable && (
          <span onClick={() => setExpanded(true)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 cursor-pointer hover:bg-bg3" title={`Responsable: ${item.responsable}`}>
            👤 {item.responsable}
          </span>
        )}
        {hasAlarm && (
          <span onClick={() => setExpanded(true)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/10 text-claude cursor-pointer hover:bg-claude/15" title={`Recordatorio: ${dueLabel}`}>
            🔔 {dueLabel}
          </span>
        )}
        {!item.responsable && !hasAlarm && (
          <button onClick={() => setExpanded(true)}
            className="text-[10px] text-gray-400 hover:text-claude opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
            title="Asignar responsable y fecha">+ asignar</button>
        )}
        <button onClick={() => setExpanded(e => !e)}
          className="text-gray-300 hover:text-gray-700 text-[12px] cursor-pointer"
          title={expanded ? 'Cerrar' : 'Editar'}>
          {expanded ? '▾' : '⋯'}
        </button>
        <button onClick={() => onDelete()}
          className="text-gray-300 hover:text-danger text-xs cursor-pointer">✕</button>
      </div>
      {expanded && (
        <div className="border-t border-black/7 px-2.5 py-2 flex flex-col gap-2.5">
          <div>
            <label className={lbl}>Responsable</label>
            <input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nombre" className={fld} />
          </div>
          <div>
            <label className={lbl}>Fecha del recordatorio</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={fld} />
          </div>
          {dueDate && (
            <div>
              <label className={lbl}>Hora</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { v: '09:00', l: '9:00 AM', s: 'Inicio del día' },
                  { v: '11:00', l: '11:00 AM', s: 'Media mañana' },
                  { v: '15:00', l: '3:00 PM', s: 'Inicio de la tarde' },
                  { v: '17:00', l: '5:00 PM', s: 'Fin del día' },
                ]).map(p => {
                  const active = !customTime && dueTime === p.v
                  return (
                    <button key={p.v} type="button"
                      onClick={() => { setDueTime(p.v); setCustomTime(false) }}
                      className={`flex flex-col items-center py-1.5 px-1 border rounded-lg cursor-pointer transition-all ${
                        active ? 'border-claude/30 bg-claude/10 text-claude font-medium' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                      }`}>
                      <span className="text-[12px] leading-tight">{p.l}</span>
                      <span className="text-[9px] font-mono mt-0.5 opacity-70">{p.s}</span>
                    </button>
                  )
                })}
              </div>
              <button type="button"
                onClick={() => setCustomTime(c => !c)}
                className={`mt-2 w-full text-[11px] py-1.5 px-2 border rounded-md cursor-pointer transition-all ${
                  customTime ? 'border-claude/30 bg-claude/7 text-claude font-medium' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                }`}>
                {customTime ? '▼ Otra hora' : '▸ Otra hora'}
              </button>
              {customTime && (
                <input type="time" value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className={fld + ' mt-1.5'} />
              )}
              {dueTime && (
                <div className="mt-2 text-[11px] text-gray-500 bg-claude/5 border border-claude/15 rounded-md px-2.5 py-1.5">
                  Te avisaremos el <span className="font-medium text-claude">{new Date(`${dueDate}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</span> a las <span className="font-medium text-claude">{dueTime}</span>.
                </div>
              )}
            </div>
          )}
          <div className="text-[10px] text-gray-400 leading-snug">
            {dueAt
              ? <>Se {hasAlarm ? 'actualiza' : 'crea'} un recordatorio 🔔 vinculado: <span className="text-claude font-medium">Verificar: {title.trim() || '(sin título)'}{responsable.trim() ? ` — ${responsable.trim()}` : ''}</span></>
              : 'Sin fecha y hora: no se crea recordatorio. Si había uno, al guardar se elimina.'}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={clearAssignment}
              className="text-[11px] text-gray-500 hover:text-danger cursor-pointer">
              Limpiar asignación
            </button>
            <div className="flex gap-2">
              <button onClick={() => {
                  setResponsable(item.responsable || '')
                  const reset = splitLocalDT(item.due_at)
                  setDueDate(reset.date); setDueTime(reset.time)
                  setCustomTime(!!reset.time && !PRESETS.includes(reset.time))
                  setExpanded(false)
                }}
                className="text-[11px] bg-bg3 border border-black/7 text-gray-500 px-3 py-1 rounded-md cursor-pointer hover:bg-bg4">
                Cancelar
              </button>
              <button onClick={applyAssignment}
                className="text-[11px] bg-claude text-white px-3 py-1 rounded-md cursor-pointer hover:bg-purple-700">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Mini-modal para crear N perfiles de influencer como subtareas bajo una
// tarea existente. Inspirado en el flujo "Solicitar influencers" del
// CaptureModal pero standalone — no crea brief ni recordatorio.
function CreatePerfilesMiniModal({
  parentTask, onClose, onCreated,
}: {
  parentTask: Task
  onClose: () => void
  onCreated: () => void
}) {
  const clients = useStore(s => s.clients)
  const loadAll = useStore(s => s.loadAll)
  const showToast = useStore(s => s.showToast)
  const [num, setNum] = useState(1)
  const [tiposPerfiles, setTiposPerfiles] = useState<TipoConCantidad[][]>([[{ tipo: 'colab', cantidad: 1 }]])
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const prefix = taskPrefix(parentTask.context, clients.find(c => c.id === parentTask.client_id) || null)
    const parentClean = stripPrefix(parentTask.title).split(' — ')[0] || stripPrefix(parentTask.title)
    const rows = Array.from({ length: num }, (_, i) => {
      const tipos = tiposPerfiles[i] || []
      return {
        title: buildTitle(prefix, `Perfil ${i + 1} — ${parentClean}`),
        context: parentTask.context,
        client_id: parentTask.client_id,
        project_id: parentTask.project_id,
        parent_task_id: parentTask.id,
        task_type: 'influencer',
        priority: 'media',
        origin: 'propia',
        status: 'Inbox',
        due_date: parentTask.due_date,
        requested_at: new Date().toISOString().slice(0, 10),
        es_influencer: true,
        influencer_tipos: tipos.length ? tipos : null,
        tipo_publicacion: tipos[0]?.tipo || 'colab',
        done: false,
        cats: [], plan: [], meeting_agenda: [],
      }
    })
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await loadAll()
    showToast(`✓ ${num} perfil${num === 1 ? '' : 'es'} creado${num === 1 ? '' : 's'}`, { durationMs: 2500 })
    setSaving(false)
    onCreated()
    onClose()
  }

  const lbl = 'text-[10px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'
  const fld = 'w-full bg-bg3 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'

  return (
    <div className="fixed inset-0 z-[340] flex items-start justify-center pt-12 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[520px] max-w-[94vw] shadow-lg mb-10">
        <div className="font-serif text-lg font-light mb-1">Crear perfiles de influencer</div>
        <p className="text-[12px] text-gray-500 mb-4">Las subtareas se crean bajo <span className="font-medium">{stripPrefix(parentTask.title)}</span> con task_type='influencer'. Después podés confirmar cada perfil y generar sus subtareas de contenido.</p>
        <div className="flex flex-col gap-3">
          <div>
            <label className={lbl}>¿Cuántos perfiles?</label>
            <input type="number" min={1} value={num}
              onChange={e => {
                const n = Math.max(1, parseInt(e.target.value, 10) || 1)
                setNum(n)
                setTiposPerfiles(prev => {
                  if (n <= prev.length) return prev.slice(0, n)
                  const extra = Array.from({ length: n - prev.length }, () => [{ tipo: 'colab', cantidad: 1 }] as TipoConCantidad[])
                  return [...prev, ...extra]
                })
              }}
              className={fld} />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className={lbl}>Tipos de contenido por perfil</label>
            {Array.from({ length: num }).map((_, i) => (
              <div key={i} className="border border-black/7 bg-bg2 rounded-md p-2.5">
                <div className="text-[11px] font-mono text-claude tracking-wider uppercase mb-1.5">Perfil {i + 1}</div>
                <TiposChecklist
                  value={tiposPerfiles[i] || []}
                  onChange={next => setTiposPerfiles(prev => {
                    const arr = [...prev]
                    while (arr.length < num) arr.push([])
                    arr[i] = next
                    return arr
                  })}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : `Crear ${num} perfil${num === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TaskDetail() {
  const tasks = useStore(s => s.tasks)
  const calendarEvents = useStore(s => s.calendarEvents)
  const contacts = useStore(s => s.contacts)
  const presentations = useStore(s => s.presentations)
  const projects = useStore(s => s.projects)
  const clients = useStore(s => s.clients)
  const setView = useStore(s => s.setView)
  const currentTaskId = useStore(s => s.currentTaskId)
  const closeDetail = useStore(s => s.closeDetail)
  const openDetail = useStore(s => s.openDetail)
  const openProjectDetail = useStore(s => s.openProjectDetail)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const updateTask = useStore(s => s.updateTask)
  const loadAll = useStore(s => s.loadAll)
  const deleteTaskSoft = useStore(s => s.deleteTaskSoft)
  const showToast = useStore(s => s.showToast)
  const recurrentes = useStore(s => s.recurrentes)
  const openRecurrentEdit = useStore(s => s.openRecurrentEdit)
  const openDuplicateTask = useStore(s => s.openDuplicateTask)

  const task = tasks.find(t => t.id === currentTaskId)
  const [tab, setTab] = useState<Tab>('info')
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [newPresOpen, setNewPresOpen] = useState(false)
  const [assignPresId, setAssignPresId] = useState<number | ''>('')
  // Adjuntos: ref para disparar uploadFiles desde el overlay drop full-panel.
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)
  // Contador de drag enter/leave (los browsers disparan ambos eventos al cruzar
  // elementos hijos — usar contador evita parpadeos del overlay).
  const dragCounter = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  // Info edits
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('media')
  const [dueDate, setDueDate] = useState('')
  const [publishDate, setPublishDate] = useState('')
  const [recordingDate, setRecordingDate] = useState('')
  const [profileRequestDate, setProfileRequestDate] = useState('')
  const [influencerTipos, setInfluencerTipos] = useState<TipoConCantidad[]>([])
  const [recordatorioAt, setRecordatorioAt] = useState('')
  // Toggles convertir tipo de tarea desde Info. Inicializados desde task en useEffect.
  const [isContent, setIsContent] = useState(false)
  const [isReminder, setIsReminder] = useState(false)
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
  // Nuevas fechas de planificación y delegación
  const [workDate, setWorkDate] = useState('')
  const [delegationDate, setDelegationDate] = useState('')
  const [delegationReturnDate, setDelegationReturnDate] = useState('')
  const [suggestingWorkDate, setSuggestingWorkDate] = useState(false)
  const [suggestedWorkDate, setSuggestedWorkDate] = useState<{ date: string; reason: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)

  // Delegación
  const [delegationModalOpen, setDelegationModalOpen] = useState(false)
  const [delegations, setDelegations] = useState<TaskDelegation[]>([])
  const [confirmClose, setConfirmClose] = useState<{ closerName: string } | null>(null)

  // Subtask add: usa el CaptureModal completo con parent_task_id precargado
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingPerfil, setConfirmingPerfil] = useState(false)
  // Modal de confirmación al desactivar un tipo con datos vinculados.
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ kind: 'contenido' | 'influencer' | 'recordatorio'; message: string; onConfirm: () => void } | null>(null)
  // Estado de aviso/acción al activar "Es influencer".
  const [influencerAviso, setInfluencerAviso] = useState<'has_content_children' | 'can_create_perfiles' | null>(null)
  const [showCreatePerfiles, setShowCreatePerfiles] = useState(false)

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
    setTitle(stripPrefix(task.title)); setPriority(task.priority); setDueDate(task.due_date || ''); setPublishDate(task.publish_date || ''); setRecordingDate(task.recording_date || ''); setProfileRequestDate(task.profile_request_date || '')
    // Compat: si la fila vieja no tiene influencer_tipos pero sí tipo_publicacion,
    // arrancamos con un único item de cantidad 1 (el usuario puede expandir desde ahí).
    if (Array.isArray(task.influencer_tipos) && task.influencer_tipos.length) {
      setInfluencerTipos(task.influencer_tipos as TipoConCantidad[])
    } else if (task.tipo_publicacion && task.tipo_publicacion !== 'propia') {
      setInfluencerTipos([{ tipo: task.tipo_publicacion, cantidad: 1 }])
    } else {
      setInfluencerTipos([])
    }
    setIsContent(task.task_type === 'contenido')
    setIsReminder(!!task.es_recordatorio)
    setIsInfluencer(!!task.es_influencer)
    setInfluencerAviso(null)
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
    setWorkDate((task as any).work_date || '')
    setDelegationDate((task as any).delegation_date || '')
    setDelegationReturnDate((task as any).delegation_return_date || '')
    setSuggestedWorkDate(null)
    setDirty(false)
    setMessages([{ role: 'assistant', content: `Estoy al tanto de "${task.title}" (${ctxLabel(task.context)}). Pegá texto, una captura o dictá: puedo actualizar fecha, prioridad, el contexto o crear subtareas (con tu aprobación).` }])
    setPendingAction(null); setChatImages([])
    supabase.from('checklists').select('*').eq('task_id', task.id).order('position').then(({ data }) => setChecklists(data || []))
    supabase.from('task_delegations').select('*').eq('task_id', task.id).order('created_at').then(({ data }) => setDelegations(data || []))
    setAssignPresId('')
  }, [currentTaskId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  if (!task) return null

  const ctxStates = ESTADOS[task.context] || ESTADOS.banco
  const titlePrefix = taskPrefix(task.context, clients.find(c => c.id === task.client_id) || null)
  const headerTitle = splitTitle(task.title)
  // isContent / isReminder ahora son state local (toggleable desde Info).
  // isEmailReply / isPerfil siguen derivados de task_type (no editables).
  const pubWarn = isContent ? deliveryWarning(dueDate || null, publishDate || null) : null
  const recWarn = isContent ? recordingWarning(recordingDate || null, dueDate || null) : null
  const isEmailReply = task.task_type === 'responder_email'
  // Perfil pendiente / confirmado: subtarea de una solicitud de influencers.
  // Cuando tiene nombre + handle se considera "confirmable" y se habilita el botón.
  const isPerfil = task.task_type === 'influencer'
  const perfilHasName = !!(infName || '').trim()
  const perfilHasHandle = !!(infHandle || '').trim()
  const perfilConfirmable = isPerfil && perfilHasName && perfilHasHandle
  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: '📋 Info' },
    ...(isEmailReply ? [] : [{ id: 'subtareas' as Tab, label: `✓ Subtareas${subtasks.length ? ` (${subtasks.length})` : ''}` }]),
    { id: 'checklist', label: '☑ Checklist' },
    { id: 'chat', label: '💬 Chat' },
    { id: 'email', label: isEmailReply ? '✉️ Responder' : '📩 Email' },
    ...(isContent ? [{ id: 'slide' as Tab, label: '🎬 Slide' }] : []),
  ]

  function setInfo<T>(setter: (v: T) => void, v: T) { setter(v); setDirty(true) }

  // ── Conversiones de tipo desde Info ────────────────────────────────
  // Toggle "Es contenido": al desactivar con subtareas de contenido o slide
  // vinculada, pide confirmación. Al desactivar también apaga "Es influencer".
  function toggleContent() {
    if (isContent) {
      const hasContentChildren = subtasks.some(s => s.task_type === 'contenido' && !s.archived_at)
      if (hasContentChildren) {
        setConfirmDeactivate({
          kind: 'contenido',
          message: 'Esta tarea tiene subtareas de contenido vinculadas. Si desactivás "Es contenido", las subtareas se mantienen pero esta tarea pierde su rol de contenido y no aparece más en la grilla / calendario RRSS.',
          onConfirm: () => {
            setInfo(setIsContent, false)
            if (isInfluencer) setInfo(setIsInfluencer, false)
            setInfluencerAviso(null)
            setConfirmDeactivate(null)
          },
        })
      } else {
        setInfo(setIsContent, false)
        if (isInfluencer) setInfo(setIsInfluencer, false)
        setInfluencerAviso(null)
      }
    } else {
      setInfo(setIsContent, true)
    }
  }
  // Toggle "Es influencer": al activar auto-activa "Es contenido" y muestra
  // aviso/acción según si ya hay subtareas de contenido. Al desactivar con
  // datos vinculados, pide confirmación.
  function toggleInfluencer() {
    if (isInfluencer) {
      const hasPerfilChildren = subtasks.some(s => s.task_type === 'influencer' && !s.archived_at)
      const hasData = !!(infName || '').trim() || !!(infHandle || '').trim() || !!(infAgency || '').trim()
      if (hasPerfilChildren || hasData) {
        setConfirmDeactivate({
          kind: 'influencer',
          message: hasPerfilChildren
            ? 'Esta tarea tiene subtareas de perfil vinculadas. Si desactivás "Es influencer", las subtareas se mantienen pero los datos del influencer (nombre, handle, agencia, tipo) se vacían en esta tarea.'
            : 'Vas a desactivar el modo influencer. Los campos (nombre, handle, agencia, tipo de publicación) se vacían en esta tarea.',
          onConfirm: () => {
            setInfo(setIsInfluencer, false)
            setInfluencerAviso(null)
            setConfirmDeactivate(null)
          },
        })
      } else {
        setInfo(setIsInfluencer, false)
        setInfluencerAviso(null)
      }
    } else {
      setInfo(setIsInfluencer, true)
      if (!isContent) setInfo(setIsContent, true)
      const hasContentChildren = subtasks.some(s => s.task_type === 'contenido' && !s.archived_at)
      setInfluencerAviso(hasContentChildren ? 'has_content_children' : 'can_create_perfiles')
    }
  }
  // Toggle "Es recordatorio": al desactivar con recordatorio_at definido pide
  // confirmación. Al activar setea recordatorio_at a hoy 09:00 si está vacío.
  function toggleReminderType() {
    if (isReminder) {
      const hasData = !!task?.recordatorio_at
      if (hasData) {
        setConfirmDeactivate({
          kind: 'recordatorio',
          message: 'Vas a convertir esto en tarea normal. La fecha y hora del recordatorio se pierde.',
          onConfirm: () => {
            setInfo(setIsReminder, false)
            setInfo(setRecordatorioAt, '')
            setConfirmDeactivate(null)
          },
        })
      } else {
        setInfo(setIsReminder, false)
      }
    } else {
      setInfo(setIsReminder, true)
      if (!recordatorioAt) {
        const d = new Date()
        const dt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`
        setInfo(setRecordatorioAt, dt)
      }
    }
  }

  async function saveInfo() {
    if (!task) return
    setSavingInfo(true)
    // En perfiles (task_type='influencer') también guardamos los campos influencer
    // aunque isContent=false: son perfiles a confirmar y el selector vive en su
    // propio panel, no en el bloque "Es contenido".
    const saveInflFields = (isContent && isInfluencer) || isPerfil
    // Para perfiles, tipo_publicacion deriva del primer tipo del array (fallback
    // de compat para vistas que aún leen ese campo scalar). Si el array está
    // vacío usamos pubType del state (default 'colab').
    const derivedTipoPub = isPerfil
      ? (influencerTipos[0]?.tipo || pubType || 'colab')
      : pubType
    // task_type: si el usuario activa/desactiva isContent, mover entre
    // 'contenido' e 'independiente'. Preservar tipos especiales
    // (solicitud_influencers / influencer / responder_email).
    const preservedTypes = ['solicitud_influencers', 'influencer', 'responder_email']
    const newTaskType = preservedTypes.includes(task.task_type)
      ? task.task_type
      : (isContent ? 'contenido' : 'independiente')
    await updateTask(task.id, {
      title: buildTitle(titlePrefix, title.trim() || stripPrefix(task.title)), priority, due_date: dueDate || null,
      task_type: newTaskType,
      publish_date: isContent ? (publishDate || null) : null,
      recording_date: isContent ? (recordingDate || null) : null,
      profile_request_date: (isContent && isInfluencer) ? (profileRequestDate || null) : null,
      es_influencer: isContent ? isInfluencer : (isPerfil ? true : null),
      tipo_publicacion: saveInflFields ? derivedTipoPub : (isContent ? 'propia' : null),
      influencer_tipos: isPerfil ? (influencerTipos.length ? influencerTipos : null) : null,
      influencer_nombre: saveInflFields ? (infName.trim() || null) : null,
      influencer_handle: saveInflFields ? (infHandle.trim() || null) : null,
      influencer_agencia: saveInflFields ? (infAgency.trim() || null) : null,
      content_format: isContent ? (contentFormat || null) : null,
      es_recordatorio: isReminder,
      recordatorio_at: isReminder && recordatorioAt ? new Date(recordatorioAt).toISOString() : null,
      notes: notes.trim() || null, delegated_to: delegatedTo || null, origin,
      estimated_hours: estHours,
      work_date: workDate || null,
      delegation_date: delegationDate || null,
      delegation_return_date: delegationReturnDate || null,
    }, 'Edición de tarea')
    setSavingInfo(false); setDirty(false)
  }

  // Confirma un perfil: crea UNA subtarea por cada unidad declarada en
  // influencer_tipos (ej: [{story_ig, 2}, {reel_cuenta, 1}] → 3 subtareas).
  // Cada subtarea queda task_type='contenido', es_influencer=true,
  // tipo_publicacion específico, handle copiado del perfil, parent=este perfil.
  // Etiqueta corta del perfil para los títulos: la primera parte del título del
  // perfil ("Perfil 1 — Campaña" → "Perfil 1").
  async function createContentTasksForPerfil() {
    if (!task) return
    if (!influencerTipos.length) return
    const solicitud = tasks.find(t => t.id === task.parent_task_id)
    const prefix = taskPrefix(task.context, clients.find(c => c.id === task.client_id) || null)
    const handle = (infHandle || '').trim()
    const nameOrHandle = (infName || '').trim()
    const perfilLabel = stripPrefix(task.title).split(' — ')[0] || (handle ? handle : 'Perfil')
    const rows: any[] = []
    for (const item of influencerTipos) {
      const short = tipoShortLabel(item.tipo)
      for (let i = 1; i <= item.cantidad; i++) {
        const idxLabel = item.cantidad > 1 ? ` ${i}` : ''
        const cleanTitle = `${short}${idxLabel} — ${perfilLabel}`
        rows.push({
          title: buildTitle(prefix, cleanTitle),
          context: task.context,
          client_id: task.client_id,
          project_id: task.project_id ?? solicitud?.project_id ?? null,
          parent_task_id: task.id,
          task_type: 'contenido',
          priority: 'media',
          origin: 'propia',
          status: 'Inbox',
          due_date: task.due_date,
          recording_date: solicitud?.recording_date || null,
          es_influencer: true,
          tipo_publicacion: item.tipo,
          influencer_nombre: nameOrHandle || null,
          influencer_handle: handle || null,
          influencer_agencia: (infAgency || '').trim() || null,
          done: false,
          cats: [], plan: [], meeting_agenda: [],
        })
      }
    }
    if (rows.length) await supabase.from('tasks').insert(rows)
  }

  async function confirmPerfilFlow(createContent: boolean) {
    if (dirty) await saveInfo()
    if (createContent) await createContentTasksForPerfil()
    setConfirmingPerfil(false)
    await loadAll()
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

  async function suggestWorkDate() {
    if (!task) return
    setSuggestingWorkDate(true)
    try {
      const today = new Date()
      const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)
      const toISO = (d: Date) => d.toISOString().slice(0, 10)
      // Eventos del calendario en la próxima semana para conocer disponibilidad
      const events = calendarEvents.filter(e => {
        const d = e.starts_at?.slice(0, 10)
        return d >= toISO(today) && d <= toISO(nextWeek)
      })
      const eventSummary = events.length
        ? events.slice(0, 10).map(e => `- ${e.starts_at.slice(0, 10)} ${e.starts_at.slice(11, 16)}: ${e.title}`).join('\n')
        : '(sin eventos registrados)'
      const activeTasks = tasks.filter(t => !t.done && !t.archived_at && !t.es_recordatorio && t.id !== task.id)
      const tasksSummary = activeTasks.slice(0, 8).map(t => `- ${t.title} (entrega: ${t.due_date || 'sin fecha'}, estimado: ${t.estimated_hours ? `${t.estimated_hours}h` : '?'})`).join('\n')
      const prompt = `Hoy es ${toISO(today)}. Sugerí el mejor día para trabajar en esta tarea ANTES de su fecha de entrega.
Tarea: "${title}"
Entrega: ${dueDate || 'sin fecha'}
Estimado: ${estHours ? `${estHours}h` : 'desconocido'}

Agenda de la próxima semana:
${eventSummary}

Otras tareas activas:
${tasksSummary}

Respondé SOLO JSON: {"fecha":"YYYY-MM-DD","razon":"texto corto en español (máx 60 chars)"}`
      const reply = await callClaudeProxy([{ role: 'user', content: prompt }], 'Sos un asistente de planificación. Devolvés SOLO JSON.')
      const cleaned = reply.replace(/```json|```/g, '').trim()
      const obj = JSON.parse(cleaned)
      if (obj.fecha) setSuggestedWorkDate({ date: obj.fecha, reason: obj.razon || '' })
    } catch {
      alert('No se pudo sugerir la fecha (proxy de Claude).')
    } finally {
      setSuggestingWorkDate(false)
    }
  }

  // Crea recordatorio automático para fecha de devolución delegada.
  async function createDelegationReturnReminder(returnDate: string) {
    if (!task || !returnDate) return
    await supabase.from('tasks').insert({
      title: `Hoy vence la devolución de ${stripPrefix(task.title)} — ¿ya lo tenés?`,
      context: task.context,
      client_id: task.client_id,
      parent_task_id: task.id,
      priority: 'alta',
      origin: 'propia',
      status: 'Recordatorio',
      es_recordatorio: true,
      recordatorio_at: new Date(`${returnDate}T09:00:00`).toISOString(),
      tipo_recordatorio: 'seguimiento',
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    })
    await loadAll()
  }

  // Guarda la delegación: crea registro en task_delegations, opcionalmente crea
  // tarea vinculada, actualiza status a "Delegado" y los campos de delegación.
  async function handleDelegationConfirm(data: DelegationFormData) {
    if (!task) return
    const { delegatedTo, stage, returnDate, note, createTask: doCreateTask } = data

    let createdTaskId: number | null = null
    if (doCreateTask) {
      const stageData = DELEGATION_STAGES.find(s => s.v === stage)
      const linkedTitle = buildTitle(titlePrefix, `${stageData?.taskPrefix || 'Revisar'}: ${stripPrefix(task.title)}`)
      const { data: newTask } = await supabase.from('tasks').insert({
        title: linkedTitle,
        context: task.context,
        client_id: task.client_id,
        project_id: task.project_id,
        parent_task_id: task.id,
        priority: 'alta',
        origin: 'propia',
        status: 'Inbox',
        due_date: returnDate,
        task_type: 'independiente',
        notes: note || null,
        done: false,
        cats: [], plan: [], meeting_agenda: [],
      }).select('id').single()
      createdTaskId = newTask?.id ?? null
    }

    const { error } = await supabase.from('task_delegations').insert({
      task_id: task.id,
      delegated_to: delegatedTo,
      stage,
      return_date: returnDate,
      note: note || null,
      created_task_id: createdTaskId,
    })
    if (error) throw error

    await updateTaskStatus(task.id, 'Delegado')
    await updateTask(task.id, {
      delegated_to: delegatedTo,
      delegation_date: todayISO(),
      delegation_return_date: returnDate,
    })

    setDelegatedTo(delegatedTo)
    setDelegationDate(todayISO())
    setDelegationReturnDate(returnDate)
    setDelegationModalOpen(false)

    const { data: dList } = await supabase
      .from('task_delegations').select('*')
      .eq('task_id', task.id).order('created_at')
    setDelegations(dList || [])

    await loadAll()
    showToast(`✓ Delegado a ${delegatedTo}`, { durationMs: 3000 })
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
    const item = checklists.find(c => c.id === id)
    // Si tiene recordatorio vinculado, borrarlo también para evitar huérfanos.
    if (item?.reminder_task_id) {
      await supabase.from('tasks').delete().eq('id', item.reminder_task_id)
    }
    await supabase.from('checklists').delete().eq('id', id)
    setChecklists(prev => prev.filter(c => c.id !== id))
    await loadAll()
  }

  // Sincroniza el recordatorio vinculado a un item: lo crea si due_at se
  // setea por primera vez, lo actualiza si cambia, lo borra si se limpia.
  // Devuelve el reminder_task_id resultante.
  async function syncChecklistReminder(item: Checklist, newTitle: string, newResponsable: string | null, newDueAt: string | null): Promise<number | null> {
    if (!task) return null
    const existingId = item.reminder_task_id
    const isoDue = newDueAt ? new Date(newDueAt).toISOString() : null
    if (existingId) {
      if (!isoDue) {
        // Limpiar el recordatorio
        await supabase.from('tasks').delete().eq('id', existingId)
        return null
      }
      const reminderTitle = `Verificar: ${newTitle.trim() || '(sin título)'}${newResponsable ? ` — ${newResponsable}` : ''}`
      await supabase.from('tasks').update({
        title: reminderTitle,
        recordatorio_at: isoDue,
        delegated_to: newResponsable || null,
      }).eq('id', existingId)
      return existingId
    }
    if (!isoDue) return null
    // Crear nuevo recordatorio
    const reminderTitle = `Verificar: ${newTitle.trim() || '(sin título)'}${newResponsable ? ` — ${newResponsable}` : ''}`
    const { data, error } = await supabase.from('tasks').insert({
      title: reminderTitle,
      context: task.context,
      client_id: task.client_id,
      project_id: task.project_id,
      parent_task_id: task.id,
      priority: 'media',
      origin: 'propia',
      status: 'Recordatorio',
      es_recordatorio: true,
      recordatorio_at: isoDue,
      tipo_recordatorio: 'general',
      delegated_to: newResponsable || null,
      requested_at: todayISO(),
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    }).select('id').single()
    if (error) { console.error('[syncChecklistReminder]', error); return null }
    return data?.id ?? null
  }

  // Guarda un cambio de checklist item + sincroniza recordatorio si cambió
  // alguno de los campos relevantes (responsable, due_at, title).
  async function updateChecklistFull(id: number, patch: Partial<Checklist>) {
    const current = checklists.find(c => c.id === id)
    if (!current) return
    const next: Checklist = { ...current, ...patch }
    const responsableChanged = patch.responsable !== undefined && patch.responsable !== current.responsable
    const dueChanged = patch.due_at !== undefined && patch.due_at !== current.due_at
    const titleChanged = patch.title !== undefined && patch.title !== current.title
    let newReminderId = current.reminder_task_id
    if (responsableChanged || dueChanged || (titleChanged && current.reminder_task_id)) {
      newReminderId = await syncChecklistReminder(current, next.title, next.responsable, next.due_at)
    }
    const finalPatch = { ...patch, reminder_task_id: newReminderId }
    await supabase.from('checklists').update(finalPatch).eq('id', id)
    setChecklists(prev => prev.map(c => c.id === id ? { ...c, ...finalPatch } : c))
    // Si se sincronizó un reminder, recargar para que aparezca en otras vistas.
    if (responsableChanged || dueChanged) await loadAll()
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
    // Soft delete: la fila desaparece del estado local + toast con "Deshacer"
    // durante 10s. Si nadie deshace, la store ejecuta el DELETE real (CASCADE
    // borra subtareas, checklists, threads, attachments).
    await deleteTaskSoft(task.id)
    setDeleting(false); setConfirmDel(false)
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

  // Handlers de drag&drop a nivel del panel — al arrastrar archivos sobre
  // CUALQUIER parte del panel mostramos overlay y al soltar lo subimos via
  // el ref de AttachmentsZone. dragCounter evita parpadeos en cruces a hijos.
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types || []).includes('Files')
  }
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragCounter.current += 1
    setDragActive(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setDragActive(false)
  }
  function onDragOver(e: React.DragEvent) {
    if (hasFiles(e)) e.preventDefault()
  }
  function onPanelDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragCounter.current = 0
    setDragActive(false)
    if (e.dataTransfer.files?.length) attachmentsRef.current?.uploadFiles(e.dataTransfer.files)
  }

  return (
    <div
      className="fixed top-0 md:top-[52px] right-0 bottom-0 left-0 md:left-auto w-full md:w-[540px] bg-bg md:border-l border-black/13 z-50 flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.08)]"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onPanelDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 z-[55] pointer-events-none flex items-center justify-center p-4">
          <div className="w-full h-full border-2 border-dashed border-claude rounded-2xl bg-claude/10 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="text-[40px] mb-1">📥</div>
              <div className="text-[16px] font-medium text-claude">Soltá para adjuntar</div>
              <div className="text-[12px] text-claude/70 mt-1">Se vincula a "{task.title}"</div>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="p-4 pb-3 border-b border-black/7 flex items-start gap-2.5 shrink-0 bg-bg2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            {task.parent_task_id && (
              <button onClick={() => openDetail(task.parent_task_id!)} className="text-[11px] text-claude hover:underline cursor-pointer">↑ ver tarea padre</button>
            )}
            {task.project_id && (
              <button onClick={() => openProjectDetail(task.project_id!)} className="text-[11px] text-claude hover:underline cursor-pointer">
                📁 ver proyecto{task.projects?.name ? `: ${task.projects.name}` : ''}
              </button>
            )}
          </div>
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
            {delegations.some(d => !d.completed_at) && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">↗ Revisión pendiente</span>
            )}
          </div>
        </div>
        <div className="relative flex items-center gap-1 shrink-0">
          <button onClick={() => setShowMenu(m => !m)} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer px-1 leading-none" title="Opciones">⋯</button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-[5]" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-7 bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 z-10 w-44">
                <button onClick={() => { setShowMenu(false); openDuplicateTask(task!.id) }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">📋 Duplicar tarea</button>
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

            {/* "Tipo de tarea" — convertir tipo en cualquier momento. Oculto
                para task_type='influencer' (perfil) y 'solicitud_influencers':
                esos tipos especiales se gestionan por su propio panel. */}
            {!isPerfil && task.task_type !== 'solicitud_influencers' && !isEmailReply && (() => {
              const togg = (on: boolean) => `w-10 h-5 rounded-full relative transition-colors shrink-0 ${on ? 'bg-claude' : 'bg-bg4'}`
              const knob = (on: boolean) => `w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${on ? 'left-5.5' : 'left-0.5'}`
              return (
                <div className="border border-black/7 rounded-lg p-3 flex flex-col gap-2.5">
                  <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Tipo de tarea</div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={toggleContent} className={togg(isContent)}>
                      <div className={knob(isContent)} />
                    </button>
                    <div>
                      <div className="text-[13px]">🎬 Es contenido</div>
                      <div className="text-[11px] text-gray-400">Activa tab Slide, fechas de contenido y vínculo a presentación.</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={toggleInfluencer} className={togg(isInfluencer)}>
                      <div className={knob(isInfluencer)} />
                    </button>
                    <div>
                      <div className="text-[13px]">⭐ Es influencer</div>
                      <div className="text-[11px] text-gray-400">Activa campos de influencer. Al activar, "Es contenido" se enciende automáticamente.</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={toggleReminderType} className={togg(isReminder)}>
                      <div className={knob(isReminder)} />
                    </button>
                    <div>
                      <div className="text-[13px]">🔔 Es recordatorio</div>
                      <div className="text-[11px] text-gray-400">Convierte en recordatorio. Fecha/hora abajo (auto-completada con hoy 9:00).</div>
                    </div>
                  </label>

                  {/* Aviso al activar "Es influencer" */}
                  {influencerAviso === 'has_content_children' && (
                    <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5">
                      ⚠ Esta tarea ya tiene subtareas de contenido vinculadas — los datos del influencer se aplican a esta tarea madre.
                    </div>
                  )}
                  {influencerAviso === 'can_create_perfiles' && (
                    <div className="flex items-center justify-between gap-2 bg-claude/5 border border-claude/15 rounded-md px-2.5 py-1.5">
                      <span className="text-[11px] text-gray-600">¿Querés generar subtareas de perfil ahora?</span>
                      <button type="button" onClick={() => setShowCreatePerfiles(true)}
                        className="text-[11px] text-claude bg-claude/10 border border-claude/25 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude hover:text-white transition-colors font-medium">
                        + Crear perfiles de influencer
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}

            <div>
              <label className={labelCls}>Estado</label>
              <div className="flex gap-1.5 flex-wrap">
                {ctxStates.map(s => (
                  <button key={s} onClick={() => {
                    if (s === 'Delegado') { setDelegationModalOpen(true); return }
                    if (s === 'Cerrado') {
                      const cr = task.closer_role
                      if (cr && cr !== 'felipe') {
                        const cn = cr === 'jani' ? 'Jani' : (task.closer_name || 'la persona asignada')
                        setConfirmClose({ closerName: cn })
                        return
                      }
                    }
                    updateTaskStatus(task.id, s)
                  }}
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                      s === task.status ? 'font-semibold' : 'bg-bg2 border-black/7 text-gray-500 hover:border-black/13'
                    }`}
                    style={s === task.status ? { color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s], background: STATUS_COLOR[s] + '16' } : {}}>
                    {STATUS_ICON[s]} {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Flujo banco RRSS/ADS — avisos contextuales */}
            {task.context === 'banco' && isContent && (() => {
              const isRRSS = isRRSSContent(task)
              if (!isRRSS && task.delegated_to === 'Gonza') {
                return (
                  <div className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
                    ✓ Contenido no-RRSS delegado a Gonza — no requiere aprobación de Felipe.
                  </div>
                )
              }
              if (isRRSS && task.status === 'Pend. validación') {
                return (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    ⚡ Contenido RRSS/ADS — requiere <span className="font-medium">aprobación de Felipe</span> (o Jani si Felipe delegó el cierre). Generá el link de aprobación desde el slide correspondiente.
                  </div>
                )
              }
              if (isRRSS) {
                return (
                  <div className="text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5">
                    📱 RRSS/ADS — aprobación obligatoria de Felipe al pasar a Pend. validación.
                  </div>
                )
              }
              return null
            })()}

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

            {isReminder && (
              <div>
                <label className={labelCls}>🔔 Fecha y hora del recordatorio</label>
                <ReminderDateTimePicker
                  value={recordatorioAt}
                  onChange={v => setInfo(setRecordatorioAt, v)}
                  dateLabel="Fecha"
                />
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

            {isPerfil && (
              <div className="border border-claude/20 bg-claude/5 rounded-lg p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-claude tracking-wider uppercase">👤 Perfil de influencer</div>
                  <TiposSummary value={influencerTipos} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Nombre del influencer</label>
                    <input value={infName} onChange={e => setInfo(setInfName, e.target.value)} className={fieldCls} placeholder="Nombre" /></div>
                  <div><label className={labelCls}>Handle / cuenta</label>
                    <input value={infHandle} onChange={e => setInfo(setInfHandle, e.target.value)} className={fieldCls} placeholder="@usuario" /></div>
                </div>
                <div><label className={labelCls}>Agencia que lo gestiona</label>
                  <input value={infAgency} onChange={e => setInfo(setInfAgency, e.target.value)} className={fieldCls} placeholder="Opcional" /></div>
                <div>
                  <label className={labelCls}>Tipos de contenido</label>
                  <div className="bg-bg2 border border-black/7 rounded-md p-2.5">
                    <TiposChecklist
                      value={influencerTipos}
                      onChange={next => setInfo(setInfluencerTipos, next)}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Al confirmar el perfil se ofrece crear <b>una subtarea por unidad</b> de cada tipo (ej: 2 Stories + 1 Reel = 3 subtareas).
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-gray-500">
                    {perfilConfirmable
                      ? <>✓ Perfil completo — listo para confirmar</>
                      : <>Completá nombre y handle para confirmar</>}
                  </span>
                  <button
                    type="button"
                    disabled={!perfilConfirmable}
                    onClick={() => setConfirmingPerfil(true)}
                    className="text-[11px] text-success bg-success/10 border border-success/25 px-3 py-1 rounded-md cursor-pointer hover:bg-success hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    ✓ Confirmar perfil
                  </button>
                </div>
              </div>
            )}

            {isContent && (
              <div className="border border-black/7 rounded-lg p-3 flex flex-col gap-2.5">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">
                  {isInfluencer ? 'Influencer / tipo de publicación' : 'Formato del contenido'}
                </div>
                {/* El toggle "Es influencer" vive arriba en "Tipo de tarea".
                    Acá solo mostramos los campos cuando isInfluencer está ON. */}
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

            {/* Etapa actual del flujo de contenido — guarda al instante */}
            {isContent && (
              <div>
                <label className={labelCls}>Etapa actual</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {CONTENT_STAGES.map(s => {
                    const active = task.current_stage === s.v
                    return (
                      <button key={s.v} type="button"
                        onClick={async () => {
                          await updateTask(task.id, { current_stage: active ? null : s.v })
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-2 border rounded-lg cursor-pointer transition-all text-left ${
                          active ? 'border-claude/30 bg-claude/7 text-claude' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                        }`}>
                        <span className="text-base leading-none">{s.emoji}</span>
                        <span className="text-[11px] leading-tight">{s.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">Visible como badge en las tarjetas. Click para activar/desactivar.</div>
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

            {/* Fechas de planificación y delegación */}
            <div className="border border-black/7 rounded-lg p-3 flex flex-col gap-3">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📅 Planificación y delegación</div>

              {/* Fecha de trabajo */}
              <div>
                <label className={labelCls}>Fecha de trabajo — cuándo trabajás esta tarea</label>
                <input type="date" value={workDate} onChange={e => { setInfo(setWorkDate, e.target.value); setSuggestedWorkDate(null) }} className={fieldCls} />
                <div className="mt-1.5">
                  {suggestedWorkDate == null ? (
                    <button onClick={suggestWorkDate} disabled={suggestingWorkDate}
                      className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 disabled:opacity-40">
                      {suggestingWorkDate ? 'Pensando…' : '✦ Sugerir con Claude'}
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 text-[11px] bg-claude/7 border border-claude/20 text-claude px-2.5 py-1 rounded-md flex-wrap">
                      <span>Te sugiero trabajar esto el <span className="font-semibold">{suggestedWorkDate.date.slice(5).replace('-', '/')}</span>{suggestedWorkDate.reason ? ` — ${suggestedWorkDate.reason}` : ''}</span>
                      <button onClick={() => { setInfo(setWorkDate, suggestedWorkDate.date); setSuggestedWorkDate(null) }}
                        className="text-success hover:opacity-70 cursor-pointer" title="Aceptar">✓</button>
                      <button onClick={() => setSuggestedWorkDate(null)} className="text-gray-400 hover:text-danger cursor-pointer" title="Descartar">✕</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Fecha de delegación — solo si hay alguien asignado */}
              {delegatedTo && (
                <div>
                  <label className={labelCls}>Fecha de delegación — cuándo le pasás la tarea a {delegatedTo}</label>
                  <input type="date" value={delegationDate} onChange={e => setInfo(setDelegationDate, e.target.value)} className={fieldCls} />
                </div>
              )}

              {/* Fecha de devolución — solo si hay delegación */}
              {delegatedTo && (
                <div>
                  <label className={labelCls}>Fecha de devolución — cuándo necesitás que te devuelvan lo delegado</label>
                  <input type="date" value={delegationReturnDate}
                    onChange={e => {
                      const v = e.target.value
                      setInfo(setDelegationReturnDate, v)
                      // Validar: devolución debe ser ≥24h antes de due_date
                      if (v && dueDate && v >= dueDate) {
                        alert(`⚠ La fecha de devolución debe ser al menos 1 día antes de la entrega (${dueDate}).`)
                      }
                    }}
                    className={fieldCls} />
                  {delegationReturnDate && dueDate && delegationReturnDate >= dueDate && (
                    <div className="text-[11px] text-danger mt-1">⚠ Debe ser al menos 1 día antes de la entrega ({dueDate})</div>
                  )}
                  {delegationReturnDate && !(delegationReturnDate >= dueDate) && (
                    <button
                      onClick={async () => {
                        await saveInfo()
                        await createDelegationReturnReminder(delegationReturnDate)
                      }}
                      className="mt-1.5 text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15">
                      🔔 Crear recordatorio de seguimiento
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Historial de delegaciones */}
            {delegations.length > 0 && (
              <div className="border border-black/7 rounded-lg p-3">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2.5">↗ Historial de delegaciones</div>
                <div className="flex flex-col gap-2">
                  {delegations.map((d, i) => (
                    <div key={d.id} className="flex items-start gap-2.5">
                      <div className="flex flex-col items-center shrink-0 pt-0.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${d.completed_at ? 'bg-success' : 'bg-orange-400'}`} />
                        {i < delegations.length - 1 && <div className="w-px bg-black/10 mt-1 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                          <span className="font-medium text-gray-700">{d.delegated_to}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500">{DELEGATION_STAGES.find(s => s.v === d.stage)?.label || d.stage}</span>
                          {d.return_date && (
                            <>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-400 font-mono">devuelve {d.return_date.slice(5).replace('-', '/')}</span>
                            </>
                          )}
                          {d.completed_at && (
                            <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-mono">✓ devuelta</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(d.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                          {d.note && <> · <span className="italic">"{d.note}"</span></>}
                          {d.created_task_id && <span className="ml-1.5 text-claude font-mono">· tarea creada</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sección Origen — solo visible si es instancia de recurrente */}
            {task.es_recurrente_instance && (() => {
              const origen = task.recurrente_id ? recurrentes.find(r => r.id === task.recurrente_id) : null
              return (
                <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 flex items-start gap-2.5">
                  <span className="text-base shrink-0">🔄</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono text-blue-600 tracking-wider uppercase mb-1">Origen</div>
                    <div className="text-[13px] text-gray-700">
                      Esta tarea fue generada automáticamente
                      {origen ? (
                        <> por la recurrente{' '}
                          <button
                            onClick={() => openRecurrentEdit(origen.id)}
                            className="text-blue-600 hover:text-blue-700 underline cursor-pointer font-medium"
                            title="Abrir y editar la recurrente"
                          >{origen.title}</button>
                        </>
                      ) : ' por una recurrente'}.
                    </div>
                    {origen && (
                      <div className="text-[11px] text-gray-500 mt-1">
                        {origen.freq === 'diaria' ? 'Frecuencia: diaria' : origen.freq === 'semanal' ? `Frecuencia: semanal (${origen.day_of_month})` : `Frecuencia: mensual (día ${origen.day_of_month})`}
                        {origen.estimated_hours ? ` · ${origen.estimated_hours}h estimadas` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

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

              {/* Responsable de cierre — solo Felipe puede cerrar por defecto */}
              <div>
                <label className={labelCls}>Responsable de cierre</label>
                <div className="flex gap-1.5 mb-1.5">
                  {[
                    { v: 'felipe', label: 'Felipe', sub: 'Por defecto' },
                    { v: 'jani', label: 'Jani', sub: 'CM' },
                    { v: 'otro', label: 'Otro', sub: 'Especificar' },
                  ].map(o => {
                    const active = task.closer_role === o.v || (!task.closer_role && o.v === 'felipe')
                    return (
                      <button key={o.v} type="button"
                        onClick={async () => {
                          await updateTask(task.id, { closer_role: o.v, closer_name: o.v !== 'otro' ? null : task.closer_name })
                        }}
                        className={`flex-1 flex flex-col items-center py-1.5 px-2 border rounded-lg cursor-pointer transition-all ${
                          active ? 'border-claude/30 bg-claude/7 text-claude' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                        }`}>
                        <span className="text-[12px] font-medium">{o.label}</span>
                        <span className="text-[10px] font-mono opacity-60">{o.sub}</span>
                      </button>
                    )
                  })}
                </div>
                {task.closer_role === 'otro' && (
                  <input
                    key={task.id + '-closer'}
                    defaultValue={task.closer_name || ''}
                    onBlur={async e => { await updateTask(task.id, { closer_name: e.target.value.trim() || null }) }}
                    placeholder="Nombre del responsable"
                    className={fieldCls}
                  />
                )}
                {task.closer_role && task.closer_role !== 'felipe' && (
                  <div className="text-[11px] text-orange-500 mt-1">
                    Solo {task.closer_role === 'jani' ? 'Jani' : (task.closer_name || 'la persona asignada')} puede cerrar esta tarea.
                  </div>
                )}
              </div>
            </div>

            <AttachmentsZone ref={attachmentsRef} taskId={task.id} />
          </div>
        )}

        {/* SUBTAREAS */}
        {tab === 'subtareas' && (() => {
          const directChildren = subtasks.filter(s => !s.es_recordatorio && !s.archived_at)
          const directReminders = subtasks.filter(s => s.es_recordatorio && !s.archived_at && !s.done)
          return (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">
                  Árbol de subtareas {directChildren.length > 0 && <span className="text-gray-300">· {directChildren.length} directas</span>}
                </div>
                <button onClick={() => setSubModalOpen(true)} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15">+ Nueva subtarea</button>
              </div>

              {/* Cada hija usa TaskItem que ya es recursivo: al expandir muestra
                  sus propias hijas con indent y colores por nivel, al infinito. */}
              {directChildren.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {directChildren.map(s => <TaskItem key={s.id} task={s} />)}
                </div>
              ) : !directReminders.length && (
                <div className="text-xs text-gray-400">Sin subtareas. Agregá una o pedíselas a Claude en el chat.</div>
              )}

              {directReminders.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1.5">
                    <span className="h-px flex-1 bg-black/7" />Recordatorios directos<span className="h-px flex-1 bg-black/7" />
                  </div>
                  <div className="flex flex-col gap-1">
                    {directReminders.map(r => <ReminderRow key={r.id} reminder={r} />)}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* CHECKLIST */}
        {tab === 'checklist' && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Checklist rápido</div>
              <button onClick={addChecklistItem} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15">+ Agregar item</button>
            </div>
            {checklists.length ? (
              <div className="flex flex-col gap-1.5">
                {checklists.map(c => (
                  <ChecklistRow key={c.id} item={c}
                    onToggleDone={async () => {
                      const newDone = !c.done
                      await updateChecklistItem(c.id, { done: newDone })
                      // Si tiene reminder vinculado, espejear el done para que no
                      // siga apareciendo en Seguimiento si el usuario ya marcó el item.
                      if (c.reminder_task_id) {
                        await supabase.from('tasks').update({ done: newDone }).eq('id', c.reminder_task_id)
                        await loadAll()
                      }
                    }}
                    onUpdate={patch => updateChecklistFull(c.id, patch)}
                    onDelete={() => deleteChecklistItem(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin items. Agregá pasos rápidos de verificación; podés asignar responsable + fecha y se crea un recordatorio automático.</div>
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

      {confirmDeactivate && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmDeactivate(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[440px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">
              Desactivar {confirmDeactivate.kind === 'contenido' ? '"Es contenido"' : confirmDeactivate.kind === 'influencer' ? '"Es influencer"' : '"Es recordatorio"'}
            </div>
            <p className="text-[13px] text-gray-500 mb-4">{confirmDeactivate.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeactivate(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={() => confirmDeactivate.onConfirm()} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer">Sí, desactivar</button>
            </div>
          </div>
        </div>
      )}

      {showCreatePerfiles && (
        <CreatePerfilesMiniModal
          parentTask={task}
          onClose={() => setShowCreatePerfiles(false)}
          onCreated={() => { setInfluencerAviso('has_content_children') }}
        />
      )}

      {confirmingPerfil && (() => {
        const total = influencerTipos.reduce((s, it) => s + it.cantidad, 0)
        return (
          <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmingPerfil(false) }}>
            <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[480px] max-w-[94vw] shadow-lg">
              <div className="font-serif text-lg font-light mb-1">Confirmar perfil</div>
              <p className="text-[13px] text-gray-500 mb-3">
                Vas a confirmar al influencer <span className="font-medium text-gray-700">{(infName || '').trim() || (infHandle || '').trim()}</span>.
                {total > 0
                  ? <> ¿Crear también las <b>{total} subtarea{total === 1 ? '' : 's'}</b> de contenido para este perfil ahora?</>
                  : <> No tenés tipos de contenido marcados — solo se confirma el perfil.</>}
              </p>
              {total > 0 && (
                <div className="mb-4 bg-bg3 border border-black/7 rounded-md p-2.5">
                  <TiposSummary value={influencerTipos} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => confirmPerfilFlow(false)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Solo confirmar, sin contenido</button>
                <button onClick={() => confirmPerfilFlow(true)} disabled={total === 0} className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  Sí, crear {total > 0 ? `${total} subtarea${total === 1 ? '' : 's'}` : 'contenido'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

      {delegationModalOpen && (
        <DelegationModal
          task={task}
          onClose={() => setDelegationModalOpen(false)}
          onConfirm={handleDelegationConfirm}
        />
      )}

      {confirmClose && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmClose(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[400px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Responsable de cierre</div>
            <p className="text-[13px] text-gray-500 mb-4">
              Esta tarea está configurada para ser cerrada por <span className="font-medium text-gray-700">{confirmClose.closerName}</span>. ¿Cerrarla de todas formas?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmClose(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={async () => { setConfirmClose(null); await updateTaskStatus(task.id, 'Cerrado') }} className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer">
                Sí, cerrar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
