import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { callClaude } from '../../lib/claude'
import { QuickClientModal } from './QuickClientModal'
import { QuickProjectModal } from './QuickProjectModal'
import { fmtHoras, todayISO, taskPrefix, buildTitle, stripPrefix, deliveryWarning, recordingWarning, vaAGrilla } from '../../lib/helpers'
import { TiposChecklist, type TipoConCantidad } from '../tasks/TiposChecklist'
import { ReminderDateTimePicker } from '../shared/ReminderDateTimePicker'
import { PUB_TYPES, FORMATOS } from '../../lib/constants'
import { parseStructuredNotes } from '../../lib/notesParser'
import type { RawTask } from '../../lib/notesParser'
import type { Client, Project, Task } from '../../lib/types'
/* eslint-disable @typescript-eslint/no-explicit-any */

type CaptureTab = 'tarea' | 'notas' | 'micro'
type TipoTarea = 'independiente' | 'subtarea' | 'proyecto' | 'solicitud_influencers'

interface Suggested {
  titulo: string
  contexto: string
  tipo: TipoTarea
  prioridad: string
  due_date: string | null
  publish_date: string | null
  recording_date: string | null
  profile_request_date: string | null
  requested_at: string | null
  estimated_hours: number | null
  origen: string
  // campos editables del formulario completo
  parentId: number | null
  projectId: number | null
  clientId: number | null
  isContent: boolean
  isInfluencer: boolean
  pubType: string
  infName: string
  infHandle: string
  infAgency: string
  isReminder: boolean
  reminderAt: string
  desc: string
  selected: boolean
  expanded: boolean
  // Si la nota pide actualizar una tarea existente (renombrar/ajustar/cambiar)
  updateTargetId: number | null
  mode: 'create' | 'update'
}

function normTipo(t: string): TipoTarea {
  return t === 'subtarea' ? 'subtarea' : t === 'proyecto' ? 'proyecto' : 'independiente'
}

// Calcula la fecha efectiva de una PendingSubtask. Prioridad:
//   1. dueDate absoluto (si lo escribió el usuario)
//   2. anchorDate + dayOffset (usado en bloque "Agregar tareas al proyecto")
//   3. null
function resolvePendingDate(it: PendingSubtask, anchorDate: string | null): string | null {
  if (it.dueDate) return it.dueDate
  if (it.dayOffset != null && anchorDate) {
    const d = new Date(`${anchorDate}T00:00:00`)
    d.setDate(d.getDate() + it.dayOffset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

// Inserta recursivamente el árbol de PendingSubtask. Si parentTaskId está
// definido, todas las hojas top-level son hijas (subtareas) — caso del toggle
// "Es tarea padre". Si parentTaskId es null, las top-level son tareas
// independientes del proyecto (caso del bloque "Agregar tareas al proyecto").
async function insertPendingSubtree(opts: {
  items: PendingSubtask[]
  parentTaskId: number | null
  context: string
  clientId: number | null
  projectId: number | null
  prefix: string
  anchorDate: string | null
}) {
  for (const it of opts.items) {
    if (!it.title.trim()) continue
    const isReminder = it.tipo === 'recordatorio' || it.tipo === 'responder_correo'
    const isContent = it.tipo === 'contenido' || it.tipo === 'influencer'
    const isInfluencer = it.tipo === 'influencer'
    const effectiveDate = resolvePendingDate(it, opts.anchorDate)
    const { data } = await supabase.from('tasks').insert({
      title: buildTitle(opts.prefix, it.title.trim()),
      context: opts.context,
      client_id: opts.context === 'agencia' ? opts.clientId : null,
      project_id: opts.projectId,
      parent_task_id: opts.parentTaskId,
      task_type: isContent ? 'contenido' : 'independiente',
      priority: it.priority,
      origin: 'propia',
      status: isReminder ? 'Recordatorio' : 'Inbox',
      due_date: (!isReminder && effectiveDate) ? effectiveDate : null,
      es_recordatorio: isReminder,
      recordatorio_at: (isReminder && effectiveDate) ? new Date(`${effectiveDate}T09:00:00`).toISOString() : null,
      tipo_recordatorio: it.tipo === 'responder_correo' ? 'responder_correo' : (isReminder ? 'general' : null),
      es_influencer: isContent ? isInfluencer : null,
      requested_at: todayISO(),
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    }).select('id').single()
    if (data && it.children.length) {
      await insertPendingSubtree({
        items: it.children,
        parentTaskId: data.id,
        context: opts.context,
        clientId: opts.clientId,
        projectId: opts.projectId,
        prefix: opts.prefix,
        anchorDate: opts.anchorDate,
      })
    }
  }
}

// Crea las N subtareas "Perfil 1..N — {título}" para una solicitud de influencers.
// Cada perfil queda en task_type='influencer' con influencer_tipos preseleccionados
// (array de {tipo, cantidad}) pero nombre/handle/agencia vacíos — se completan a
// medida que la agencia confirma cada perfil. tipo_publicacion queda como el
// primer tipo (fallback de compat) o 'colab' si el array está vacío.
async function createPerfilSubtasks(opts: {
  parentTaskId: number
  parentTitle: string
  num: number
  tipos: { tipo: string; cantidad: number }[][]
  context: string
  clientId: number | null
  projectId: number | null
  dueDate: string | null
}) {
  if (opts.num < 1) return
  const rows = Array.from({ length: opts.num }, (_, i) => {
    const tiposPerfil = opts.tipos[i] || []
    return {
      title: `Perfil ${i + 1} — ${opts.parentTitle}`,
      context: opts.context,
      client_id: opts.context === 'agencia' ? opts.clientId : null,
      project_id: opts.projectId,
      parent_task_id: opts.parentTaskId,
      task_type: 'influencer',
      priority: 'media',
      origin: 'propia',
      status: 'Inbox',
      due_date: opts.dueDate,
      requested_at: todayISO(),
      es_influencer: true,
      influencer_tipos: tiposPerfil.length ? tiposPerfil : null,
      tipo_publicacion: tiposPerfil[0]?.tipo || 'colab',
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    }
  })
  await supabase.from('tasks').insert(rows)
}

// Cuando se guarda una tarea de influencer con profile_request_date, se crea
// automáticamente un recordatorio hijo (tipo 'enviar_correo') para a las 9:00
// de ese día acordarse de pedir el perfil a la agencia. SeguimientoView detecta
// el prefijo del correo_contexto para ofrecer el system prompt específico.
async function createProfileRequestReminder(opts: {
  parentTaskId: number
  taskTitle: string
  context: string
  clientId: number | null
  influencerName: string
  influencerHandle: string
  influencerAgency: string
  profileRequestDate: string
}) {
  const target = opts.influencerName.trim() || opts.influencerHandle.trim() || opts.taskTitle
  const agencia = opts.influencerAgency.trim() || 'la agencia de influencers'
  await supabase.from('tasks').insert({
    title: `Solicitar perfil — ${target}`,
    context: opts.context,
    client_id: opts.context === 'agencia' ? opts.clientId : null,
    parent_task_id: opts.parentTaskId,
    priority: 'media',
    origin: 'propia',
    status: 'Recordatorio',
    es_recordatorio: true,
    recordatorio_at: new Date(`${opts.profileRequestDate}T09:00:00`).toISOString(),
    tipo_recordatorio: 'enviar_correo',
    correo_contexto: `Solicitar perfil de influencer para ${opts.taskTitle} a ${agencia}`,
    done: false,
    cats: [], plan: [], meeting_agenda: [],
  })
}

const PROXY_URL = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/claude-proxy'

const EXTRACT_SYSTEM = 'Sos un asistente que extrae tareas accionables de notas, mensajes o imágenes (correos, WhatsApp, documentos). No inventes; solo lo explícito o claramente implícito. Devolvés SOLO JSON.'

function extractPrompt(text: string, fixedContext?: string, clientName?: string | null) {
  const ctxLine = fixedContext
    ? `\n\nIMPORTANTE — CONTEXTO FIJO: Todas las tareas extraídas pertenecen al contexto "${fixedContext}". Asigná SIEMPRE ese contexto a todas las tareas sin excepción. No infieras el contexto del texto, usá siempre "${fixedContext}".${clientName ? ` El cliente de todas las tareas es "${clientName}" — no lo cambies.` : ''}`
    : ''
  return `Hoy es ${todayISO()}. Extrae las tareas concretas. Para CADA tarea devolvé estos campos:
- titulo: corto y práctico
- contexto: banco | agencia | personal${fixedContext ? ` — DEBE ser "${fixedContext}" siempre` : ' — OBLIGATORIO, siempre elegí el más probable según el contenido'}
- tipo: independiente | con_subtareas | proyecto | recurrente
- prioridad: alta | media | baja
- due_date: fecha de entrega "YYYY-MM-DD" — OBLIGATORIA. Inferila siempre que puedas: convertí expresiones relativas ("hoy", "mañana", "el viernes", "fin de mes", "en una semana") a fecha concreta tomando hoy=${todayISO()}. Solo dejá null si es realmente imposible inferir una fecha.
- requested_at: fecha en que lo pidieron "YYYY-MM-DD" si se infiere (ej. fecha del correo), sino null
- estimated_hours: estimación de esfuerzo, uno de 0.5,1,1.5,2,3,4,6,8
- origen: gmail-agencia | whatsapp | reunion | propia

Responde SOLO JSON: {"tareas":[{"titulo":"...","contexto":"...","tipo":"...","prioridad":"...","due_date":null,"requested_at":null,"estimated_hours":1,"origen":"..."}]}${ctxLine}

${text.trim() ? `Contenido:\n${text.trim()}` : ''}`
}

function parseSuggested(reply: string, fixedContext?: string): Suggested[] {
  const cleaned = reply.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)
  const items = parsed.tareas || parsed.tasks || []
  return items.map((t: any) => ({
    titulo: t.titulo || t.title || '',
    // Defensa: si vino un fixedContext del UI, sobreescribimos lo que devolvió
    // Claude (a veces ignora la instrucción y vuelve a inferir).
    contexto: fixedContext || t.contexto || t.context || 'agencia',
    tipo: normTipo(t.tipo || t.type || ''),
    prioridad: t.prioridad || t.priority || 'media',
    due_date: t.due_date || null,
    publish_date: t.publish_date || null,
    recording_date: t.recording_date || null,
    profile_request_date: t.profile_request_date || null,
    requested_at: t.requested_at || null,
    estimated_hours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
    origen: t.origen || t.origin || 'propia',
    parentId: null, projectId: null, clientId: null,
    isContent: false, isInfluencer: false, pubType: 'colab', infName: '', infHandle: '', infAgency: '',
    isReminder: false, reminderAt: '', desc: '',
    selected: true, expanded: false,
    updateTargetId: null, mode: 'create' as const,
  }))
}

// Formulario completo y editable por cada tarea extraída (igual al tab Tarea directa)
function SuggestionForm({ s, onChange, onRemove, clients, projects, tasks, showError, onCreateProject }: {
  s: Suggested
  onChange: (patch: Partial<Suggested>) => void
  onRemove: () => void
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  showError?: boolean
  onCreateProject: (ctx: string, clientId: number | null, cb: (id: number) => void) => void
}) {
  const fld = 'w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'
  const lbl = 'text-[10px] font-mono text-gray-400 uppercase block mb-1'
  // Fecha de entrega obligatoria (salvo recordatorios, que usan reminderAt)
  const dueMissing = !!showError && !s.isReminder && !s.due_date
  const errFld = fld + ' border-danger/60 bg-danger/5'
  const sPrefix = taskPrefix(s.contexto, clients.find(c => c.id === s.clientId) || null)
  const sPubWarn = s.isContent ? deliveryWarning(s.due_date, s.publish_date) : null
  const sRecWarn = s.isContent ? recordingWarning(s.recording_date, s.due_date) : null
  const updTarget = s.updateTargetId ? tasks.find(t => t.id === s.updateTargetId) : null
  const agClients = clients.filter(c => c.context === 'agencia')
  // Separación de contexto: proyectos y tareas padre solo del mismo contexto que la tarea
  const ctxProjects = projects.filter(p => p.context === s.contexto)
  const activeTasks = tasks.filter(t => !t.done && t.context === s.contexto && !t.parent_task_id && !t.archived_at && !t.es_recordatorio)
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
            {updTarget && s.mode === 'update' && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn shrink-0">↻ actualiza</span>}
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 shrink-0">{s.contexto}</span>
            {s.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn shrink-0">{s.due_date.slice(5).replace('-', '/')}</span>}
          </>
        )}
        <button onClick={() => onChange({ expanded: !s.expanded })} className="text-gray-400 text-[11px] cursor-pointer w-4 shrink-0">{s.expanded ? '▾' : '▸'}</button>
        <button onClick={onRemove} className="text-gray-300 hover:text-danger text-xs cursor-pointer shrink-0" title="Descartar">✕</button>
      </div>

      {s.expanded && (
        <div className="border-t border-black/7 p-2.5 flex flex-col gap-2">
          {updTarget && (
            <div className="bg-warn/5 border border-warn/30 rounded-md p-2">
              <div className="text-[11px] text-gray-600 mb-1.5">Parece una actualización de una tarea que ya existe: <span className="font-medium">{stripPrefix(updTarget.title)}</span></div>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => onChange({ mode: 'update' })}
                  className={`py-1.5 border rounded-md text-[11px] cursor-pointer transition-all ${s.mode === 'update' ? 'border-warn/40 text-warn bg-warn/10 font-medium' : 'border-black/7 text-gray-500 bg-bg2 hover:bg-bg4'}`}>
                  ↻ Actualizar existente
                </button>
                <button onClick={() => onChange({ mode: 'create' })}
                  className={`py-1.5 border rounded-md text-[11px] cursor-pointer transition-all ${s.mode === 'create' ? 'border-claude/20 text-claude bg-claude/7 font-medium' : 'border-black/7 text-gray-500 bg-bg2 hover:bg-bg4'}`}>
                  + Crear nueva
                </button>
              </div>
            </div>
          )}
          <div>
            <label className={lbl}>Título</label>
            <div className="flex items-stretch">
              {sPrefix && <span className="shrink-0 inline-flex items-center px-2 rounded-l-md border border-r-0 border-black/7 bg-bg4 text-claude font-mono text-[11px] font-medium">{sPrefix} |</span>}
              <input value={s.titulo} onChange={e => onChange({ titulo: e.target.value })} className={fld + (sPrefix ? ' rounded-l-none' : '')} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <button type="button" onClick={() => onChange({ isReminder: !s.isReminder })} className={togg(s.isReminder)}><div className={knob(s.isReminder)} /></button>
            🔔 Es recordatorio
          </label>
          {s.isReminder && (
            <ReminderDateTimePicker
              value={s.reminderAt}
              onChange={v => onChange({ reminderAt: v })}
              dateLabel="Fecha"
            />
          )}

          {!s.isReminder && (
            <div>
              <label className={lbl}>Tipo</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['independiente', 'subtarea', 'proyecto'] as TipoTarea[]).map(tp => (
                  <button key={tp} onClick={() => onChange({ tipo: tp })} className={`py-1.5 border rounded-md text-[11px] cursor-pointer transition-all ${s.tipo === tp ? 'border-claude/20 text-claude bg-claude/7' : 'border-black/7 text-gray-500 bg-bg2 hover:bg-bg4'}`}>
                    {tp === 'independiente' ? 'Independiente' : tp === 'subtarea' ? 'Subtarea' : 'Proyecto / Campaña'}
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
            <div><label className={lbl}>Proyecto / Campaña</label>
              <select value={s.projectId ?? ''} onChange={e => {
                const v = e.target.value
                if (v === '__new__') {
                  onCreateProject(s.contexto, s.clientId, id => onChange({ projectId: id }))
                } else {
                  onChange({ projectId: v ? Number(v) : null })
                }
              }} className={fld}>
                <option value="">Seleccionar…</option>
                {ctxProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new__">+ Crear nuevo proyecto / campaña</option>
              </select></div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Contexto</label>
              <select value={s.contexto} onChange={e => onChange({ contexto: e.target.value, clientId: null, parentId: null, projectId: null })} className={fld}>
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

          {!s.isReminder && !s.isContent && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Fecha entrega <span className="text-danger">*</span></label>
                <input type="date" value={s.due_date || ''} onChange={e => onChange({ due_date: e.target.value || null })} className={dueMissing ? errFld : fld} />
                {dueMissing && <span className="text-[10px] text-danger">Obligatoria</span>}
              </div>
              <div><label className={lbl}>¿Cuándo te lo pidieron?</label><input type="date" value={s.requested_at || ''} onChange={e => onChange({ requested_at: e.target.value || null })} className={fld} /></div>
            </div>
          )}

          {!s.isReminder && s.isContent && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>¿Cuándo fue solicitado?</label><input type="date" value={s.requested_at || ''} onChange={e => onChange({ requested_at: e.target.value || null })} className={fld} /></div>
                <div><label className={lbl}>Fecha de grabación 🎬</label><input type="date" value={s.recording_date || ''} onChange={e => onChange({ recording_date: e.target.value || null })} className={fld} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>¿Cuándo entregas el contenido? <span className="text-danger">*</span></label>
                  <input type="date" value={s.due_date || ''} onChange={e => onChange({ due_date: e.target.value || null })} className={dueMissing ? errFld : fld} />
                  {dueMissing && <span className="text-[10px] text-danger">Obligatoria</span>}
                </div>
                <div><label className={lbl}>¿Cuándo se publica?</label><input type="date" value={s.publish_date || ''} onChange={e => onChange({ publish_date: e.target.value || null })} className={fld} /></div>
              </div>
              {sRecWarn && <span className="text-[10px] text-warn">⚠ Grabación ≥24h antes de entrega. Máxima sugerida: {sRecWarn}</span>}
              {sPubWarn && <span className="text-[10px] text-warn">⚠ Entrega ≥24h antes de publicar. Mínima sugerida: {sPubWarn}</span>}
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

          <div className="flex items-center gap-4 flex-wrap text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => onChange({ isContent: !s.isContent, isInfluencer: s.isContent ? false : s.isInfluencer })} className={togg(s.isContent)}><div className={knob(s.isContent)} /></button>
              Es contenido
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => onChange({ isInfluencer: !s.isInfluencer, isContent: !s.isInfluencer ? true : s.isContent })} className={togg(s.isInfluencer)}><div className={knob(s.isInfluencer)} /></button>
              Es influencer
            </label>
          </div>
          {s.isInfluencer && (
            <div className="border border-claude/15 bg-claude/5 rounded-md p-2 flex flex-col gap-2">
              <div>
                <label className={lbl}>Tipo de publicación</label>
                <select value={s.pubType} onChange={e => onChange({ pubType: e.target.value })} className={fld}>
                  {PUB_TYPES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Influencer</label><input value={s.infName} onChange={e => onChange({ infName: e.target.value })} className={fld} placeholder="Nombre" /></div>
                <div><label className={lbl}>Handle</label><input value={s.infHandle} onChange={e => onChange({ infHandle: e.target.value })} className={fld} placeholder="@usuario" /></div>
              </div>
              <div><label className={lbl}>Agencia (opcional)</label><input value={s.infAgency} onChange={e => onChange({ infAgency: e.target.value })} className={fld} placeholder="Agencia / representante" /></div>
            </div>
          )}

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

async function extractTasks(text: string, fixedContext?: string, clientName?: string | null): Promise<Suggested[]> {
  let reply: string
  const prompt = extractPrompt(text, fixedContext, clientName)
  try {
    reply = await callProxy(prompt)
  } catch {
    reply = await callClaude([{ role: 'user', content: prompt }], EXTRACT_SYSTEM)
  }
  return parseSuggested(reply, fixedContext)
}

// Extracción multi-tipo: imágenes (vision), PDFs (document blocks de Claude) y
// archivos de texto (concatenados al prompt). El proxy reenvía el array tal
// cual; document blocks requieren un modelo que los soporte (claude-sonnet-4-6 sí).
async function extractFromAttachments(
  atts: { kind: 'image' | 'pdf' | 'text'; name: string; media_type: string; base64?: string; text?: string }[],
  extraText: string,
  fixedContext?: string,
  clientName?: string | null,
): Promise<Suggested[]> {
  const images = atts.filter(a => a.kind === 'image' && a.base64)
  const pdfs = atts.filter(a => a.kind === 'pdf' && a.base64)
  const texts = atts.filter(a => a.kind === 'text' && a.text)
  // Texto plano (txt/md) se inyecta como anexos al final del prompt.
  let fullText = extraText || ''
  for (const tf of texts) {
    fullText += `\n\n--- archivo adjunto: ${tf.name} ---\n${tf.text}`
  }
  // Si no hay imágenes ni PDFs, basta con el endpoint de texto.
  if (!images.length && !pdfs.length) {
    return parseSuggested(await callProxy(extractPrompt(fullText, fixedContext, clientName)), fixedContext)
  }
  const content: any[] = [
    { type: 'text', text: extractPrompt(fullText || '(Las tareas están en los adjuntos: imágenes, PDFs o documentos.)', fixedContext, clientName) },
    ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.base64 } })),
    ...pdfs.map(p => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 } })),
  ]
  return parseSuggested(await callProxy(content), fixedContext)
}

// Subtareas a crear inline desde el modal (toggle "Es tarea padre"). Cada
// nodo puede tener sus propias hijas, sin límite de profundidad.
type SubtaskType = 'tarea' | 'contenido' | 'influencer' | 'recordatorio' | 'responder_correo'
type PendingSubtask = {
  id: string
  title: string
  tipo: SubtaskType
  priority: 'alta' | 'media' | 'baja'
  dueDate: string
  // dayOffset: solo se usa en el bloque "Agregar tareas al proyecto" (punto 3).
  // Si dueDate está vacío y dayOffset tiene valor, se calcula
  // due_date = anchorDate + dayOffset (anchorDate = fecha de la tarea principal o hoy).
  dayOffset: number | null
  children: PendingSubtask[]
}

let _pendingId = 1
function makeEmptySubtask(): PendingSubtask {
  return { id: `s${_pendingId++}`, title: '', tipo: 'tarea', priority: 'media', dueDate: '', dayOffset: null, children: [] }
}

const SUBTASK_TYPES: { v: SubtaskType; label: string }[] = [
  { v: 'tarea', label: '📋 Tarea' },
  { v: 'contenido', label: '🎬 Contenido' },
  { v: 'influencer', label: '⭐ Influencer' },
  { v: 'recordatorio', label: '🔔 Recordatorio' },
  { v: 'responder_correo', label: '📧 Responder correo' },
]

// Fila editable de una subtarea pending. Recursiva: las hijas se renderizan
// con el mismo componente, indentadas. Cada nivel tiene su propio borde.
// showOffset agrega un input "Offset (días)" — usado en el bloque
// "Agregar tareas al proyecto" para definir fechas relativas a la tarea principal.
function SubtaskRow({
  item, level, onChange, onRemove, showOffset = false,
}: {
  item: PendingSubtask
  level: number
  onChange: (next: PendingSubtask) => void
  onRemove: () => void
  showOffset?: boolean
}) {
  const borderColors = ['#7c3aed', '#0d9488', '#2563eb', '#d97706']
  const indentBorder = borderColors[level % borderColors.length] + '30'
  function updateChild(idx: number, next: PendingSubtask) {
    onChange({ ...item, children: item.children.map((c, i) => i === idx ? next : c) })
  }
  function removeChild(idx: number) {
    onChange({ ...item, children: item.children.filter((_, i) => i !== idx) })
  }
  function addChild() {
    onChange({ ...item, children: [...item.children, makeEmptySubtask()] })
  }
  const fld = 'bg-bg2 border border-black/7 rounded-md px-2 py-1 text-[12px] outline-none focus:border-claude/20'
  return (
    <div>
      <div className="bg-bg3 border border-black/7 rounded-md p-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <input value={item.title} onChange={e => onChange({ ...item, title: e.target.value })}
            placeholder="Título de la subtarea" className={fld + ' flex-1'} />
          <button type="button" onClick={onRemove}
            className="text-[12px] text-danger hover:text-white hover:bg-danger px-1.5 py-0.5 rounded cursor-pointer">×</button>
        </div>
        <div className={`grid gap-1.5 ${showOffset ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <select value={item.tipo} onChange={e => onChange({ ...item, tipo: e.target.value as SubtaskType })}
            className={fld + ' cursor-pointer'}>
            {SUBTASK_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <select value={item.priority} onChange={e => onChange({ ...item, priority: e.target.value as PendingSubtask['priority'] })}
            className={fld + ' cursor-pointer'}>
            <option value="alta">🔴 Alta</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🟢 Baja</option>
          </select>
          <input type="date" value={item.dueDate} onChange={e => onChange({ ...item, dueDate: e.target.value })} className={fld} title="Fecha absoluta" />
          {showOffset && (
            <input type="number" placeholder="Offset (días)"
              value={item.dayOffset ?? ''}
              onChange={e => onChange({ ...item, dayOffset: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
              className={fld}
              title="Días respecto a la fecha de la tarea principal (D-30, D-7, D+0, D+14…)" />
          )}
        </div>
        <button type="button" onClick={addChild}
          className="text-[10px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15 transition-colors self-start">
          + Sub-subtarea
        </button>
      </div>
      {item.children.length > 0 && (
        <div className="ml-4 mt-1.5 flex flex-col gap-1.5 border-l-2 pl-2.5" style={{ borderColor: indentBorder }}>
          {item.children.map((c, i) => (
            <SubtaskRow key={c.id} item={c} level={level + 1} showOffset={showOffset}
              onChange={next => updateChild(i, next)}
              onRemove={() => removeChild(i)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CaptureModal({ onClose, preselectContext, preselectClientId, preselectProjectId, preselectParentId, preselectReminder, template }: {
  onClose: () => void
  preselectContext?: string
  preselectClientId?: number | null
  preselectProjectId?: number | null
  preselectParentId?: number | null
  preselectReminder?: boolean
  template?: { title?: string; context?: string; priority?: string; origin?: string; notes?: string | null; estimated_hours?: number | null; task_type?: string }
}) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const projects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const [tab, setTab] = useState<CaptureTab>('tarea')

  const agClients = clients.filter(c => c.context === 'agencia')

  // ===== Tab Tarea =====
  const [title, setTitle] = useState(stripPrefix(template?.title ?? ''))
  const [tipo, setTipo] = useState<TipoTarea>(preselectParentId ? 'subtarea' : preselectProjectId ? 'proyecto' : 'independiente')
  const [parentId, setParentId] = useState<number | null>(preselectParentId ?? null)
  const [projectId, setProjectId] = useState<number | ''>(preselectProjectId ?? '')
  const [context, setContext] = useState(preselectContext ?? template?.context ?? 'banco')
  const [clientId, setClientId] = useState<number | null>(preselectClientId ?? null)
  const [priority, setPriority] = useState(template?.priority ?? 'media')
  const [origin, setOrigin] = useState(template?.origin ?? 'propia')
  const [dueDate, setDueDate] = useState('')
  const [requestedAt, setRequestedAt] = useState(todayISO())
  const [publishDate, setPublishDate] = useState('')
  const [recordingDate, setRecordingDate] = useState('')
  const [briefDate, setBriefDate] = useState('')
  const [numPerfiles, setNumPerfiles] = useState<number>(1)
  // "Es tarea padre — agregar subtareas ahora" (solo aplica a tipo independiente).
  const [isParent, setIsParent] = useState(false)
  const [pendingSubtasks, setPendingSubtasks] = useState<PendingSubtask[]>([])
  // "Agregar más tareas al proyecto" (solo aplica a tipo proyecto con projectId).
  const [addingProjectTasks, setAddingProjectTasks] = useState(false)
  const [projectTasks, setProjectTasks] = useState<PendingSubtask[]>([])
  // Tipos de contenido por perfil — un array de {tipo, cantidad} por perfil.
  // Default por perfil: 1 unidad de 'colab'. Se sincroniza con numPerfiles.
  const [perfilesTipos, setPerfilesTipos] = useState<TipoConCantidad[][]>([[{ tipo: 'colab', cantidad: 1 }]])
  const [isContent, setIsContent] = useState(template?.task_type === 'contenido')
  const [isInfluencer, setIsInfluencer] = useState(false)
  const [pubType, setPubType] = useState('colab')
  const [infName, setInfName] = useState('')
  const [infHandle, setInfHandle] = useState('')
  const [infAgency, setInfAgency] = useState('')
  const [contentFormat, setContentFormat] = useState('')
  const [estHours, setEstHours] = useState<number | null>(template?.estimated_hours ?? null)
  const [isReminder, setIsReminder] = useState(!!preselectReminder)
  // Selector de recordatorio en dos pasos: primero la fecha (date), después
  // una hora clave (preset) o "Otra hora" (input manual). reminderAt se deriva
  // al guardar combinando ambos.
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [reminderCustomTime, setReminderCustomTime] = useState(false)
  const reminderAt = reminderDate && reminderTime ? `${reminderDate}T${reminderTime}` : ''
  // Vínculos del recordatorio (opcionales): proyecto/campaña + tarea. El
  // cliente para agencia se toma del selector del header (clientId).
  const [reminderProjectId, setReminderProjectId] = useState<number | null>(preselectProjectId ?? null)
  const [reminderTaskId, setReminderTaskId] = useState<number | null>(preselectParentId ?? null)
  const [reminderType, setReminderType] = useState('general')
  const [correoCtx, setCorreoCtx] = useState('')
  const [desc, setDesc] = useState(template?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [quickClientOpen, setQuickClientOpen] = useState(false)
  const [quickProject, setQuickProject] = useState<{ ctx: string; clientId: number | null; onCreated: (id: number) => void } | null>(null)
  // Fecha de entrega obligatoria salvo recordatorios (usan reminderAt como fecha)
  const dueError = showErrors && !isReminder && !dueDate
  const ctxError = showErrors && !context
  const briefError = showErrors && tipo === 'solicitud_influencers' && !briefDate
  const isSolicitud = tipo === 'solicitud_influencers'
  // Contenido: la entrega debe ser ≥24h antes de la publicación
  const pubWarn = isContent ? deliveryWarning(dueDate || null, publishDate || null) : null
  const recWarn = isContent ? recordingWarning(recordingDate || null, dueDate || null) : null

  // Separación de contexto: como tarea padre solo tareas del MISMO contexto (top-level, activas)
  const activeTasks = tasks.filter(t => !t.done && t.context === context && !t.parent_task_id && !t.es_recordatorio && !t.archived_at)
  const ctxProjects = projects.filter(p => p.context === context)
  // Prefijo de nomenclatura automático según contexto + cliente (se antepone al guardar)
  const titlePrefix = taskPrefix(context, clients.find(c => c.id === clientId) || null)

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
    // Para "Solicitar influencers" además es obligatoria la fecha de envío del brief.
    if (isSolicitud && !briefDate) { setShowErrors(true); return }
    setSaving(true)
    const reminder = isReminder && !!reminderAt

    // El proyecto se vincula cuando el usuario seleccionó uno en el selector
    // de Proyecto/Campaña, que ahora es visible para tipo='proyecto',
    // tipo='solicitud_influencers' y tareas de contenido. Antes solo se
    // capturaba con tipo='proyecto' → influencers + content quedaban sin
    // project_id aunque el usuario eligiera uno.
    let resolvedProjectId: number | null = null
    if (!reminder && projectId && (tipo === 'proyecto' || tipo === 'solicitud_influencers' || isContent)) {
      resolvedProjectId = Number(projectId)
    }

    const builtTitle = buildTitle(titlePrefix, title.trim())
    const { data: inserted, error } = await supabase.from('tasks').insert({
      title: builtTitle,
      context,
      priority,
      origin,
      client_id: context === 'agencia' ? clientId : null,
      // Para recordatorios: los vínculos vienen del bloque "Vincular a (opcional)"
      // — si hay tarea, project_id queda null (se infiere del padre); si solo hay
      // proyecto, parent_task_id queda null. Si no se eligió nada y el cliente
      // está seteado (agencia), el recordatorio queda flotando con client_id.
      project_id: reminder
        ? (reminderTaskId ? null : (reminderProjectId ?? null))
        : resolvedProjectId,
      parent_task_id: reminder
        ? (reminderTaskId ?? null)
        : (tipo === 'subtarea' ? parentId : null),
      task_type: isSolicitud ? 'solicitud_influencers'
        : isContent ? 'contenido'
        : 'independiente',
      due_date: reminder ? null : (dueDate || null),
      publish_date: (!reminder && isContent) ? (publishDate || null) : null,
      recording_date: (!reminder && (isContent || isSolicitud)) ? (recordingDate || null) : null,
      profile_request_date: null,
      brief_date: isSolicitud ? (briefDate || null) : null,
      num_perfiles: isSolicitud ? Math.max(1, numPerfiles) : null,
      es_influencer: isContent ? isInfluencer : null,
      tipo_publicacion: isContent ? (isInfluencer ? pubType : 'propia') : null,
      influencer_nombre: (isContent && isInfluencer) ? (infName.trim() || null) : null,
      influencer_handle: (isContent && isInfluencer) ? (infHandle.trim() || null) : null,
      influencer_agencia: (isContent && isInfluencer) ? (infAgency.trim() || null) : null,
      content_format: isContent ? (contentFormat || null) : null,
      requested_at: requestedAt || todayISO(),
      estimated_hours: estHours,
      notes: desc.trim() || null,
      context_readme: desc.trim() || null,
      status: reminder ? 'Recordatorio' : 'Inbox',
      es_recordatorio: reminder,
      recordatorio_at: reminder ? new Date(reminderAt).toISOString() : null,
      tipo_recordatorio: reminder ? reminderType : null,
      // correo_contexto se usa como "Asunto del correo" para responder_correo y
      // como "A quién / contexto" para enviar_correo.
      correo_contexto: (reminder && (reminderType === 'responder_correo' || reminderType === 'enviar_correo')) ? (correoCtx.trim() || null) : null,
      done: false,
      cats: [], plan: [], meeting_agenda: [],
    }).select('id').single()
    if (error || !inserted) { alert('Error: ' + (error?.message || 'no data')); setSaving(false); return }
    // Solicitar influencers: crear brief (recordatorio enviar_correo) + N subtareas Perfil X.
    if (!reminder && isSolicitud && briefDate) {
      await supabase.from('tasks').insert({
        title: `Enviar brief — ${builtTitle}`,
        context,
        client_id: context === 'agencia' ? clientId : null,
        parent_task_id: inserted.id,
        priority: 'media',
        origin: 'propia',
        status: 'Recordatorio',
        es_recordatorio: true,
        recordatorio_at: new Date(`${briefDate}T09:00:00`).toISOString(),
        tipo_recordatorio: 'enviar_correo',
        correo_contexto: `Enviar brief de influencers para ${builtTitle} a la agencia`,
        done: false,
        cats: [], plan: [], meeting_agenda: [],
      })
      await createPerfilSubtasks({
        parentTaskId: inserted.id,
        parentTitle: builtTitle,
        num: Math.max(1, numPerfiles),
        tipos: perfilesTipos,
        context,
        clientId,
        projectId: resolvedProjectId,
        dueDate: dueDate || null,
      })
    }
    // Tarea independiente con toggle "Es tarea padre": insertar el árbol
    // de subtareas pendientes recursivamente con parent_task_id correcto.
    if (!reminder && isParent && tipo === 'independiente' && pendingSubtasks.length) {
      await insertPendingSubtree({
        items: pendingSubtasks,
        parentTaskId: inserted.id,
        context,
        clientId,
        projectId: resolvedProjectId,
        prefix: titlePrefix,
        anchorDate: dueDate || null,
      })
    }
    // Tipo proyecto con "Agregar tareas al proyecto": las project tasks van
    // como top-level (parent_task_id=null) con project_id; cada una con sus
    // subtareas propias vía recursión.
    if (!reminder && tipo === 'proyecto' && resolvedProjectId && addingProjectTasks && projectTasks.length) {
      await insertPendingSubtree({
        items: projectTasks,
        parentTaskId: null,
        context,
        clientId,
        projectId: resolvedProjectId,
        prefix: titlePrefix,
        anchorDate: dueDate || null,
      })
    }
    await loadAll()
    onClose()
  }

  // ===== Tabs Notas / Micro (extracción) =====
  const [meetingText, setMeetingText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggested[]>([])
  const [extracted, setExtracted] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  // Attachments soporta imágenes (visión), PDFs (document blocks) y txt/md
  // (texto inyectado al prompt). Drag&drop + file picker llenan el mismo array.
  type Attachment = {
    id: number
    name: string
    kind: 'image' | 'pdf' | 'text'
    media_type: string
    size: number
    base64?: string
    url?: string  // solo imágenes (para preview)
    text?: string // solo txt/md
    file: File
  }
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const attachIdRef = useRef(1)
  // Formato estructurado parseado localmente (sin API), proyecto detectado y modo revisión
  const [localParsed, setLocalParsed] = useState(false)
  const [parsedProjectName, setParsedProjectName] = useState<string | null>(null)
  const [createProjectFlag, setCreateProjectFlag] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewIdx, setReviewIdx] = useState(0)

  // Normaliza un título para comparar (sin prefijo, sin acentos, minúsculas)
  function normTitle(s: string): string {
    return stripPrefix(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  // Busca una tarea existente parecida (mismo contexto) para ofrecer actualizarla
  function findSimilarTask(title: string, context: string): Task | null {
    const target = normTitle(title)
    if (!target) return null
    const words = new Set(target.split(' ').filter(w => w.length > 2))
    let best: Task | null = null, bestScore = 0
    for (const t of tasks) {
      if (t.done || t.archived_at || t.context !== context) continue
      const cand = normTitle(t.title)
      if (!cand) continue
      if (cand === target || cand.includes(target) || target.includes(cand)) return t
      const cw = new Set(cand.split(' ').filter(w => w.length > 2))
      let inter = 0; words.forEach(w => { if (cw.has(w)) inter++ })
      const union = new Set([...words, ...cw]).size || 1
      const score = inter / union
      if (score > bestScore) { bestScore = score; best = t }
    }
    return bestScore >= 0.5 ? best : null
  }
  // Convierte una tarea parseada del formato estructurado a Suggested editable
  function rawToSuggested(r: RawTask, hasProject: boolean): Suggested {
    const client = r.sigla ? clients.find(c => (c.sigla || '').toUpperCase() === r.sigla) : null
    const upd = r.updateHint ? findSimilarTask(r.title, r.context) : null
    const tipo: TipoTarea = hasProject ? 'proyecto' : (/subtarea/i.test(r.tipoRaw) ? 'subtarea' : /proyecto/i.test(r.tipoRaw) ? 'proyecto' : 'independiente')
    return {
      titulo: r.title, contexto: r.context, tipo, prioridad: r.prioridad,
      due_date: r.due_date, publish_date: null, recording_date: null, profile_request_date: null, requested_at: null, estimated_hours: r.estimated_hours, origen: 'reunion',
      parentId: null, projectId: null,
      clientId: r.context === 'agencia' ? (client?.id ?? null) : null,
      isContent: false, isInfluencer: false, pubType: 'colab', infName: '', infHandle: '', infAgency: '',
      isReminder: false, reminderAt: '',
      desc: r.phase ? `[${r.phase}] ${r.desc}`.trim() : r.desc,
      selected: true, expanded: false,
      updateTargetId: upd?.id ?? null, mode: upd ? 'update' : 'create',
    }
  }

  // Procesa un FileList y agrega los soportados (image/* | application/pdf |
  // text/* | .txt/.md) al state de attachments. Archivos no soportados se ignoran.
  async function addFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = Array.from(files)
    const next: Attachment[] = []
    for (const f of list) {
      const ext = f.name.toLowerCase().split('.').pop() || ''
      const isImage = (f.type || '').startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext)
      const isPdf = f.type === 'application/pdf' || ext === 'pdf'
      const isText = (f.type || '').startsWith('text/') || ['txt','md','markdown'].includes(ext)
      if (!isImage && !isPdf && !isText) continue
      if (isText) {
        const text = await f.text()
        next.push({ id: attachIdRef.current++, name: f.name, kind: 'text', media_type: f.type || 'text/plain', size: f.size, text, file: f })
        continue
      }
      const dataUrl = await new Promise<string>(resolve => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.readAsDataURL(f)
      })
      const base64 = dataUrl.split(',')[1] || ''
      const media_type = f.type || (isImage ? 'image/png' : 'application/pdf')
      next.push({
        id: attachIdRef.current++, name: f.name,
        kind: isImage ? 'image' : 'pdf',
        media_type, size: f.size, base64,
        url: isImage ? dataUrl : undefined,
        file: f,
      })
    }
    if (next.length) setAttachments(prev => [...prev, ...next])
  }

  function resetParseExtras() {
    setLocalParsed(false); setParsedProjectName(null); setCreateProjectFlag(false); setReviewMode(false); setReviewIdx(0)
  }

  async function runExtract(text: string) {
    if (!text.trim()) return
    resetParseExtras()
    // El dictado por voz rara vez viene estructurado, pero igual lo intentamos local.
    const parsed = parseStructuredNotes(text)
    if (parsed && parsed.tasks.length) {
      setSuggestions(parsed.tasks.map(r => rawToSuggested(r, !!parsed.project)))
      setParsedProjectName(parsed.project); setCreateProjectFlag(!!parsed.project); setLocalParsed(true); setExtracted(true)
      return
    }
    setExtracting(true); setSuggestions([])
    try {
      setSuggestions(await extractTasks(text)); setExtracted(true)
    } catch {
      alert('Error extrayendo tareas. Intenta de nuevo.')
    } finally {
      setExtracting(false)
    }
  }

  // Extrae de notas y/o adjuntos (imagen + PDF + texto). Primero intenta el
  // parser local del formato estructurado (sin gastar API); si no matchea,
  // recurre a Claude con todo el material adjunto.
  async function handleExtract() {
    const hasAttachments = attachments.length > 0
    if (!meetingText.trim() && !hasAttachments) return
    setShowErrors(false)
    resetParseExtras()

    if (meetingText.trim() && !hasAttachments) {
      const parsed = parseStructuredNotes(meetingText)
      if (parsed && parsed.tasks.length) {
        setSuggestions(parsed.tasks.map(r => rawToSuggested(r, !!parsed.project)))
        setParsedProjectName(parsed.project)
        setCreateProjectFlag(!!parsed.project)
        setLocalParsed(true)
        setExtracted(true)
        return // sin llamar a la API
      }
    }

    setExtracting(true); setSuggestions([])
    try {
      // Pasamos contexto/cliente actuales al extractor para que TODAS las tareas
      // hereden el contexto seleccionado en el dropdown (y el cliente si agencia).
      const clientName = context === 'agencia' && clientId
        ? (clients.find(c => c.id === clientId)?.name || null)
        : null
      const items = hasAttachments
        ? await extractFromAttachments(
            attachments.map(a => ({ kind: a.kind, name: a.name, media_type: a.media_type, base64: a.base64, text: a.text })),
            meetingText, context, clientName,
          )
        : await extractTasks(meetingText, context, clientName)
      // Defensa adicional: forzamos el contexto y el clientId (cuando agencia)
      // por si Claude ignoró la instrucción o devolvió un cliente distinto.
      const normalized = items.map(s => ({
        ...s,
        contexto: context,
        clientId: context === 'agencia' ? (clientId ?? s.clientId ?? null) : null,
      }))
      setSuggestions(normalized); setExtracted(true)
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
    // Las actualizaciones no exigen fecha (solo modifican lo que venga). Las nuevas sí.
    const isMissing = (s: Suggested) => s.mode !== 'update' && (!s.contexto || (!s.isReminder && !s.due_date))
    if (selected.some(isMissing)) {
      setShowErrors(true)
      // Expandir las tareas con campos faltantes para que el usuario las complete
      setSuggestions(prev => prev.map(s => (s.selected && isMissing(s)) ? { ...s, expanded: true } : s))
      return
    }
    setSavingNotes(true)

    // 1) Si se detectó estructura de proyecto, crear el proyecto primero
    let newProjectId: number | null = null
    const projCtx = createProjectFlag && parsedProjectName?.trim() ? (selected[0]?.contexto || 'banco') : null
    if (projCtx && parsedProjectName?.trim()) {
      const projClient = projCtx === 'agencia' ? (selected.find(s => s.clientId)?.clientId ?? null) : null
      const { data, error } = await supabase.from('projects').insert({
        name: parsedProjectName.trim(), context: projCtx, client_id: projClient,
        es_interno: projCtx === 'agencia' ? !projClient : false,
        type: 'proyecto', status: 'activo', is_ongoing: true,
      }).select().single()
      if (error || !data) { alert('Error creando proyecto: ' + error?.message); setSavingNotes(false); return }
      newProjectId = data.id
    }
    // Solo se vincula al proyecto nuevo si la tarea es del mismo contexto (regla de la DB)
    const projectFor = (s: Suggested) => (newProjectId && s.contexto === projCtx) ? newProjectId : null

    // 2) Actualizar las tareas existentes elegidas como "actualización"
    const updates = selected.filter(s => s.mode === 'update' && s.updateTargetId)
    for (const s of updates) {
      const prefix = taskPrefix(s.contexto, clients.find(c => c.id === s.clientId) || null)
      const patch: Record<string, any> = {
        title: buildTitle(prefix, s.titulo),
        priority: s.prioridad,
        due_date: s.isReminder ? null : (s.due_date || null),
        estimated_hours: s.estimated_hours,
      }
      if (s.desc.trim()) patch.context_readme = s.desc.trim()
      if (s.isContent) {
        patch.publish_date = s.publish_date || null
        patch.recording_date = s.recording_date || null
        if (s.isInfluencer) patch.profile_request_date = s.profile_request_date || null
      }
      const linked = projectFor(s)
      if (linked) patch.project_id = linked
      await supabase.from('tasks').update(patch).eq('id', s.updateTargetId)
    }

    // 3) Crear las tareas nuevas
    const creates = selected.filter(s => !(s.mode === 'update' && s.updateTargetId))
    const taskRows = creates.map(s => {
      const reminder = s.isReminder && !!s.reminderAt
      const prefix = taskPrefix(s.contexto, clients.find(c => c.id === s.clientId) || null)
      return {
        title: buildTitle(prefix, s.titulo), context: s.contexto, priority: s.prioridad, origin: s.origen || 'reunion',
        client_id: s.contexto === 'agencia' ? s.clientId : null,
        project_id: reminder ? null : (projectFor(s) ?? ((s.tipo === 'proyecto') ? s.projectId : null)),
        parent_task_id: (!reminder && s.tipo === 'subtarea') ? s.parentId : null,
        task_type: s.isContent ? 'contenido' : 'independiente',
        due_date: reminder ? null : (s.due_date || null),
        publish_date: (!reminder && s.isContent) ? (s.publish_date || null) : null,
        recording_date: (!reminder && s.isContent) ? (s.recording_date || null) : null,
        profile_request_date: (!reminder && s.isContent && s.isInfluencer) ? (s.profile_request_date || null) : null,
        es_influencer: s.isContent ? s.isInfluencer : null,
        tipo_publicacion: s.isContent ? (s.isInfluencer ? s.pubType : 'propia') : null,
        influencer_nombre: (s.isContent && s.isInfluencer) ? (s.infName.trim() || null) : null,
        influencer_handle: (s.isContent && s.isInfluencer) ? (s.infHandle.trim() || null) : null,
        influencer_agencia: (s.isContent && s.isInfluencer) ? (s.infAgency.trim() || null) : null,
        requested_at: s.requested_at || todayISO(),
        estimated_hours: s.estimated_hours,
        notes: s.desc.trim() || null,
        context_readme: s.desc.trim() || meetingText.trim() || (attachments.length ? `Extraído de ${attachments.length} adjunto(s).` : null),
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
      // Recordatorios automáticos por solicitud de perfil (uno por tarea de
      // influencer con profile_request_date). data viene en el mismo orden que creates.
      const created = data || []
      for (let i = 0; i < creates.length; i++) {
        const s = creates[i]
        const row = created[i]
        if (!row) continue
        const reminder = s.isReminder && !!s.reminderAt
        if (!reminder && s.isContent && s.isInfluencer && s.profile_request_date) {
          const prefix = taskPrefix(s.contexto, clients.find(c => c.id === s.clientId) || null)
          await createProfileRequestReminder({
            parentTaskId: row.id,
            taskTitle: buildTitle(prefix, s.titulo),
            context: s.contexto,
            clientId: s.clientId,
            influencerName: s.infName,
            influencerHandle: s.infHandle,
            influencerAgency: s.infAgency,
            profileRequestDate: s.profile_request_date,
          })
        }
      }
    }
    // Subir adjuntos persistibles (image / pdf) al bucket como contexto vinculado
    // a la primera tarea creada. Los txt/md ya quedaron inyectados al prompt y
    // viven en context_readme — no se suben a storage.
    const persistable = attachments.filter(a => a.kind === 'image' || a.kind === 'pdf')
    if (persistable.length && firstTaskId) {
      for (const a of persistable) {
        const path = `${firstTaskId}/${Date.now()}-${a.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
        const up = await supabase.storage.from('capturas').upload(path, a.file, { contentType: a.media_type })
        if (!up.error) {
          const { data: pub } = supabase.storage.from('capturas').getPublicUrl(path)
          await supabase.from('attachments').insert({ task_id: firstTaskId, name: a.name, url: pub.publicUrl, es_contexto: true, size_kb: Math.round(a.file.size / 1024) })
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
    const remove = (i: number) => setSuggestions(prev => prev.filter((_, j) => j !== i))
    const idx = Math.min(reviewIdx, suggestions.length - 1)
    return (
      <div className="mb-4">
        {localParsed && (
          <div className="text-[11px] text-success bg-success/7 border border-success/25 rounded-md px-2.5 py-1.5 mb-2">
            ✓ Formato estructurado detectado — parseado localmente sin usar Claude (0 tokens).
          </div>
        )}
        {parsedProjectName !== null && (
          <div className="bg-claude/5 border border-claude/20 rounded-md p-2.5 mb-2">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer mb-1.5">
              <button type="button" onClick={() => setCreateProjectFlag(v => !v)} className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${createProjectFlag ? 'bg-claude' : 'bg-bg4'}`}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${createProjectFlag ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              📁 Crear proyecto y vincular las tareas
            </label>
            {createProjectFlag && (
              <input value={parsedProjectName} onChange={e => setParsedProjectName(e.target.value)}
                className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" placeholder="Nombre del proyecto" />
            )}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-mono text-claude tracking-wider uppercase">
            ✦ {suggestions.length} tarea{suggestions.length > 1 ? 's' : ''} — editá lo que quieras y aprobá
          </div>
          {!reviewMode && (
            <button onClick={() => setSuggestions(prev => prev.map(s => ({ ...s, expanded: !prev.every(x => x.expanded) })))}
              className="text-[10px] text-gray-400 hover:text-claude cursor-pointer">expandir/contraer</button>
          )}
        </div>
        {showErrors && suggestions.some(s => s.selected && s.mode !== 'update' && (!s.contexto || (!s.isReminder && !s.due_date))) && (
          <div className="text-[11px] text-danger bg-danger/5 border border-danger/30 rounded-md px-2.5 py-1.5 mb-2">
            Completá la fecha de entrega (obligatoria) en las tareas marcadas antes de crear.
          </div>
        )}

        {reviewMode ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-gray-500">Revisando {idx + 1} de {suggestions.length}</span>
              <button onClick={() => setReviewMode(false)} className="text-[10px] text-gray-400 hover:text-claude cursor-pointer">Ver todas</button>
            </div>
            <SuggestionForm s={{ ...suggestions[idx], expanded: true }} onChange={p => update(idx, p)} onRemove={() => { remove(idx); setReviewIdx(i => Math.max(0, i - 1)) }}
              clients={clients} projects={projects} tasks={tasks} showError={showErrors}
              onCreateProject={(ctx, cId, cb) => setQuickProject({ ctx, clientId: cId, onCreated: cb })} />
            <div className="flex items-center justify-between mt-2">
              <button disabled={idx === 0} onClick={() => setReviewIdx(i => Math.max(0, i - 1))}
                className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-3 py-1 rounded-md cursor-pointer hover:bg-bg4 disabled:opacity-40 disabled:cursor-not-allowed">← Anterior</button>
              <button disabled={idx >= suggestions.length - 1} onClick={() => setReviewIdx(i => Math.min(suggestions.length - 1, i + 1))}
                className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-3 py-1 rounded-md cursor-pointer hover:bg-bg4 disabled:opacity-40 disabled:cursor-not-allowed">Siguiente →</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s, i) => (
              <SuggestionForm key={i} s={s} onChange={p => update(i, p)} onRemove={() => remove(i)}
                clients={clients} projects={projects} tasks={tasks} showError={showErrors}
                onCreateProject={(ctx, cId, cb) => setQuickProject({ ctx, clientId: cId, onCreated: cb })} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Drag & drop sobre todo el modal (solo activo en tab Notas). Usamos un
  // contador para tolerar dragenter/leave anidados sin parpadeo del overlay.
  function isFileDrag(e: React.DragEvent): boolean {
    const types = e.dataTransfer?.types
    if (!types) return false
    for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true
    return false
  }
  function onDragEnter(e: React.DragEvent) {
    if (tab !== 'notas') return
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragCounterRef.current++
    setDragOver(true)
  }
  function onDragOver(e: React.DragEvent) {
    if (tab !== 'notas') return
    if (!isFileDrag(e)) return
    e.preventDefault()
  }
  function onDragLeave(e: React.DragEvent) {
    if (tab !== 'notas') return
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setDragOver(false)
  }
  async function onDrop(e: React.DragEvent) {
    if (tab !== 'notas') return
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    await addFiles(e.dataTransfer.files)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-8 overflow-y-auto backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="bg-bg2 border border-black/7 rounded-2xl w-[580px] max-w-[96vw] mb-10 shadow-lg overflow-hidden relative">
        {dragOver && (
          <div className="absolute inset-0 z-[10] pointer-events-none flex items-center justify-center bg-claude/10 backdrop-blur-sm border-2 border-dashed border-claude rounded-2xl">
            <div className="text-claude text-base font-medium flex flex-col items-center gap-2">
              <span className="text-3xl">📎</span>
              Soltá aquí para adjuntar
              <span className="text-[11px] text-claude/70 font-normal">imágenes · PDF · txt/md</span>
            </div>
          </div>
        )}
        <div className="flex border-b border-black/7">
          <button className={tabCls('tarea')} onClick={() => setTab('tarea')}>📋 Tarea directa</button>
          <button className={tabCls('notas')} onClick={() => setTab('notas')}>📝 Reunión / Notas</button>
          <button className={tabCls('micro')} onClick={() => setTab('micro')}>🎙 Micrófono</button>
        </div>

        {/* Selectores compartidos por los 3 tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-black/7 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contexto <span className="text-danger">*</span></label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null); setParentId(null); setProjectId('') }}
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
                <div className="flex items-stretch">
                  {titlePrefix && (
                    <span className="shrink-0 inline-flex items-center px-3 rounded-l-lg border border-r-0 border-black/7 bg-bg4 text-claude font-mono text-[13px] font-medium">{titlePrefix} |</span>
                  )}
                  <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls + (titlePrefix ? ' rounded-l-none' : '')} placeholder="¿Qué hay que hacer?" autoFocus />
                </div>
                {titlePrefix && <p className="text-[10px] text-gray-400 mt-1">Se guardará como <span className="font-mono text-gray-500">{titlePrefix} | {title.trim() || '…'}</span></p>}
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
                <div className="mb-3 flex flex-col gap-2.5">
                  <div>
                    <label className={labelCls}>Tipo de recordatorio</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { v: 'general', l: '🔔 General' },
                        { v: 'seguimiento', l: '👀 Seguimiento' },
                        { v: 'responder_correo', l: '📧 Responder correo' },
                        { v: 'enviar_correo', l: '📨 Enviar correo' },
                      ] as { v: string; l: string }[]).map(o => (
                        <button key={o.v} type="button" onClick={() => setReminderType(o.v)}
                          className={`py-2 px-1 border rounded-lg text-[11px] text-center cursor-pointer transition-all ${
                            reminderType === o.v ? 'border-claude/20 text-claude bg-claude/7 font-medium' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                          }`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {reminderType === 'responder_correo' && (
                    <div>
                      <label className={labelCls}>Asunto o contexto del correo</label>
                      <textarea value={correoCtx} onChange={e => setCorreoCtx(e.target.value)} rows={2} className={fieldCls + ' resize-y'} placeholder="Pegá el asunto o un fragmento del correo…" />
                    </div>
                  )}
                  {reminderType === 'enviar_correo' && (
                    <div>
                      <label className={labelCls}>A quién / contexto</label>
                      <textarea value={correoCtx} onChange={e => setCorreoCtx(e.target.value)} rows={2} className={fieldCls + ' resize-y'} placeholder="A quién va dirigido y qué hay que pedirle…" />
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Fecha del recordatorio *</label>
                    <input type="date" value={reminderDate}
                      onChange={e => setReminderDate(e.target.value)}
                      className={fieldCls} />
                  </div>
                  {reminderDate && (
                    <div>
                      <label className={labelCls}>Hora *</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([
                          { v: '09:00', l: '9:00 AM', s: 'Inicio del día' },
                          { v: '11:00', l: '11:00 AM', s: 'Media mañana' },
                          { v: '15:00', l: '3:00 PM', s: 'Inicio de la tarde' },
                          { v: '17:00', l: '5:00 PM', s: 'Fin del día' },
                        ]).map(p => {
                          const active = !reminderCustomTime && reminderTime === p.v
                          return (
                            <button key={p.v} type="button"
                              onClick={() => { setReminderTime(p.v); setReminderCustomTime(false) }}
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
                        onClick={() => setReminderCustomTime(c => !c)}
                        className={`mt-2 w-full text-[11px] py-1.5 px-2 border rounded-md cursor-pointer transition-all ${
                          reminderCustomTime ? 'border-claude/30 bg-claude/7 text-claude font-medium' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                        }`}>
                        {reminderCustomTime ? '▼ Otra hora' : '▸ Otra hora'}
                      </button>
                      {reminderCustomTime && (
                        <input type="time" value={reminderTime}
                          onChange={e => setReminderTime(e.target.value)}
                          className={fieldCls + ' mt-1.5'} />
                      )}
                      {reminderTime && (
                        <div className="mt-2 text-[11px] text-gray-500 bg-claude/5 border border-claude/15 rounded-md px-2.5 py-1.5">
                          Te avisaremos el <span className="font-medium text-claude">{new Date(`${reminderDate}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</span> a las <span className="font-medium text-claude">{reminderTime}</span>.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vincular a (opcional) — al elegir tarea, el recordatorio
                      aparece como pseudo-tarea hija de esa tarea. Al elegir solo
                      proyecto, aparece en la lista unificada del proyecto. Al
                      no elegir nada (y agencia con cliente), aparece en el
                      panel del cliente bajo "Recordatorios". */}
                  {(() => {
                    const ctxProjects = projects.filter(p => p.context === context && (
                      context !== 'agencia' || !clientId || p.client_id === clientId
                    ))
                    const ctxTasks = tasks.filter(t => !t.done && !t.archived_at && !t.es_recordatorio
                      && t.context === context && !t.parent_task_id
                      && (context !== 'agencia' || !clientId || t.client_id === clientId)
                      && (!reminderProjectId || t.project_id === reminderProjectId)
                    )
                    return (
                      <div className="border border-black/7 rounded-md p-2.5 flex flex-col gap-2 bg-bg2">
                        <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase">Vincular a (opcional)</div>
                        {context === 'agencia' && clientId && (
                          <div className="text-[10px] text-gray-500">
                            Cliente: <span className="font-medium text-agencia">{clients.find(c => c.id === clientId)?.name}</span> (del selector arriba)
                          </div>
                        )}
                        <div>
                          <label className={labelCls}>{context === 'banco' ? 'Proyecto / Campaña' : 'Proyecto'}</label>
                          <select value={reminderProjectId ?? ''}
                            onChange={e => {
                              const v = e.target.value ? Number(e.target.value) : null
                              setReminderProjectId(v)
                              // Si la tarea elegida pertenece a otro proyecto, la des-vincula.
                              if (v && reminderTaskId) {
                                const t = tasks.find(x => x.id === reminderTaskId)
                                if (t && t.project_id !== v) setReminderTaskId(null)
                              }
                            }}
                            className={fieldCls}>
                            <option value="">Sin proyecto vinculado</option>
                            {ctxProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Tarea relacionada</label>
                          <select value={reminderTaskId ?? ''}
                            onChange={e => setReminderTaskId(e.target.value ? Number(e.target.value) : null)}
                            className={fieldCls}>
                            <option value="">Sin tarea vinculada</option>
                            {ctxTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                          </select>
                        </div>
                        <div className="text-[10px] text-gray-400 leading-snug">
                          {reminderTaskId
                            ? '🔔 Aparecerá como pseudo-tarea hija de esa tarea.'
                            : reminderProjectId
                              ? '🔔 Aparecerá en la lista unificada del proyecto.'
                              : context === 'agencia' && clientId
                                ? '🔔 Aparecerá en el panel del cliente bajo "Recordatorios".'
                                : '🔔 Aparecerá solo en Seguimiento / Mis tareas.'}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {!isReminder && (<>
              {/* Tipo / jerarquía. "Solicitar influencers" es un flujo aparte (genera
                  un brief + N subtareas de perfil pendientes) y solo aplica a banco/agencia. */}
              <div className="mb-3">
                <label className={labelCls}>Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {(([
                    { v: 'independiente', l: 'Independiente' },
                    { v: 'subtarea', l: 'Subtarea de…' },
                    { v: 'proyecto', l: 'Parte de proyecto / campaña' },
                    ...(context === 'banco' || context === 'agencia' ? [{ v: 'solicitud_influencers' as TipoTarea, l: '🎬 Solicitar influencers' }] : []),
                  ]) as { v: TipoTarea; l: string }[]).map(o => (
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

              {/* Selector de proyecto/campaña: para tipo='proyecto' es obligatorio
                  semánticamente (la tarea ES parte de un proyecto); para
                  solicitud_influencers y contenido es opcional (la tarea
                  puede vincularse a una campaña pero no es requisito). */}
              {(tipo === 'proyecto' || tipo === 'solicitud_influencers' || isContent) && (
                <div className="mb-3">
                  <label className={labelCls}>
                    Proyecto / Campaña
                    {tipo !== 'proyecto' && <span className="text-gray-400 font-normal normal-case font-sans"> (opcional)</span>}
                  </label>
                  <select value={projectId} onChange={e => {
                    const v = e.target.value
                    if (v === '__new__') {
                      setQuickProject({ ctx: context, clientId, onCreated: id => setProjectId(id) })
                    } else {
                      setProjectId(v === '' ? '' : Number(v))
                    }
                  }} className={fieldCls}>
                    <option value="">{tipo === 'proyecto' ? 'Seleccionar proyecto / campaña…' : 'Sin proyecto vinculado'}</option>
                    {ctxProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">+ Crear nuevo proyecto / campaña</option>
                  </select>
                </div>
              )}

              {/* "Agregar más tareas a este proyecto" — solo cuando hay
                  proyecto resuelto (existente o recién creado). Cada tarea
                  puede tener subtareas anidadas (mismo árbol que punto 2). */}
              {tipo === 'proyecto' && projectId && (
                <div className="mb-3 p-3 bg-bg3 rounded-lg border border-black/7 flex flex-col gap-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button"
                      onClick={() => {
                        const next = !addingProjectTasks
                        setAddingProjectTasks(next)
                        if (next && !projectTasks.length) setProjectTasks([makeEmptySubtask()])
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${addingProjectTasks ? 'bg-claude' : 'bg-bg4'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${addingProjectTasks ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-[13px]">Agregar más tareas a este proyecto ahora</div>
                      <div className="text-[11px] text-gray-400">Cada tarea puede tener sus propias subtareas anidadas.</div>
                    </div>
                  </label>
                  {addingProjectTasks && (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase">
                        Tareas del proyecto ({projectTasks.length})
                      </div>
                      {projectTasks.map((t, i) => (
                        <SubtaskRow key={t.id} item={t} level={0} showOffset
                          onChange={next => setProjectTasks(prev => prev.map((x, j) => j === i ? next : x))}
                          onRemove={() => setProjectTasks(prev => prev.filter((_, j) => j !== i))} />
                      ))}
                      <button type="button"
                        onClick={() => setProjectTasks(prev => [...prev, makeEmptySubtask()])}
                        className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-3 py-1.5 rounded-md cursor-pointer hover:bg-claude/15 transition-colors self-start">
                        + Agregar tarea al proyecto
                      </button>
                      <div className="text-[10px] text-gray-400 leading-snug">
                        Offset = días respecto a la fecha de la tarea principal arriba (D-30, D-7, D+0, D+14…). Si dejás fecha en blanco y offset también, la tarea queda sin fecha.
                      </div>
                    </div>
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

              {!isReminder && !isContent && !isSolicitud && (
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

              {/* Solicitud de influencers: 4 fechas + cuántos perfiles. Genera al
                  guardar un brief (recordatorio enviar_correo en briefDate 9:00) y
                  N subtareas de perfil pendientes (task_type='influencer'). */}
              {!isReminder && isSolicitud && (
                <div className="mb-3 p-3 bg-bg3 rounded-lg border border-claude/15 flex flex-col gap-2.5">
                  <div className="text-[11px] font-mono text-claude tracking-wider uppercase">🎬 Solicitud de influencers</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>¿Cuándo fue solicitado?</label>
                      <input type="date" value={requestedAt} onChange={e => setRequestedAt(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Fecha de envío del brief <span className="text-danger">*</span></label>
                      <input type="date" value={briefDate} onChange={e => setBriefDate(e.target.value)}
                        className={fieldCls + (briefError ? ' border-danger/60 bg-danger/5' : '')} />
                      {briefError && <span className="text-[10px] text-danger">Obligatoria</span>}
                    </div>
                    <div>
                      <label className={labelCls}>Fecha de grabación o evento 🎬</label>
                      <input type="date" value={recordingDate} onChange={e => setRecordingDate(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Fecha de entrega de perfiles <span className="text-danger">*</span></label>
                      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                        className={fieldCls + (dueError ? ' border-danger/60 bg-danger/5' : '')} />
                      {dueError && <span className="text-[10px] text-danger">Obligatoria</span>}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>¿Cuántos perfiles necesitás?</label>
                    <input type="number" min={1} value={numPerfiles}
                      onChange={e => {
                        const n = Math.max(1, parseInt(e.target.value, 10) || 1)
                        setNumPerfiles(n)
                        setPerfilesTipos(prev => {
                          if (n <= prev.length) return prev.slice(0, n)
                          const extra = Array.from({ length: n - prev.length }, () => [{ tipo: 'colab', cantidad: 1 }] as TipoConCantidad[])
                          return [...prev, ...extra]
                        })
                      }}
                      className={fieldCls} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className={labelCls}>Tipos de contenido por perfil</label>
                    {Array.from({ length: numPerfiles }).map((_, i) => (
                      <div key={i} className="border border-black/7 bg-bg2 rounded-md p-2.5">
                        <div className="text-[11px] font-mono text-claude tracking-wider uppercase mb-1.5">Perfil {i + 1}</div>
                        <TiposChecklist
                          value={perfilesTipos[i] || []}
                          onChange={next => setPerfilesTipos(prev => {
                            const arr = [...prev]
                            while (arr.length < numPerfiles) arr.push([])
                            arr[i] = next
                            return arr
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-snug">
                    Al guardar: se crea un recordatorio 🔔 a las 9:00 del día del envío del brief y {numPerfiles} subtarea{numPerfiles === 1 ? '' : 's'} "Perfil X" pendientes de confirmar. Después, al confirmar cada perfil podés crear automáticamente <b>una subtarea por unidad</b> de cada tipo elegido (ej: 2 Stories + 1 Reel = 3 subtareas).
                  </div>
                </div>
              )}

              {/* Tareas de contenido: 4 o 5 fechas en orden cronológico del flujo
                  (con perfil de influencer = 5; producción propia = 4). */}
              {!isReminder && isContent && (
                <div className="mb-3 p-3 bg-bg3 rounded-lg border border-black/7 flex flex-col gap-2.5">
                  <div className="text-[11px] font-mono text-claude tracking-wider uppercase">📅 Fechas del contenido</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>¿Cuándo fue solicitado?</label>
                      <input type="date" value={requestedAt} onChange={e => setRequestedAt(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Fecha de grabación 🎬</label>
                      <input type="date" value={recordingDate} onChange={e => setRecordingDate(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>¿Cuándo entregas el contenido? <span className="text-danger">*</span></label>
                      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                        className={fieldCls + (dueError ? ' border-danger/60 bg-danger/5' : '')} />
                      {dueError && <span className="text-[10px] text-danger">Obligatoria</span>}
                    </div>
                    <div>
                      <label className={labelCls}>¿Cuándo se publica?</label>
                      <input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} className={fieldCls} />
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 leading-snug">
                    <b>Grabación</b> = cuándo se filma (opcional). <b>Entrega</b> = tu responsabilidad (listo para revisión). <b>Publicación</b> = la define el CM; si no está definida aún, la puede completar después.
                  </div>
                  {recWarn && (
                    <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5">
                      ⚠ La grabación debe ser al menos 24h antes de la entrega. Grabación máxima sugerida: <span className="font-medium">{recWarn}</span>.
                    </div>
                  )}
                  {pubWarn && (
                    <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5">
                      ⚠ La entrega debe ser al menos 24h antes de la publicación. Entrega mínima sugerida: <span className="font-medium">{pubWarn}</span>.
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Formato</label>
                    <select value={contentFormat} onChange={e => setContentFormat(e.target.value)} className={fieldCls}>
                      <option value="">— Sin definir —</option>
                      {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
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

              {/* Dos toggles independientes: "Es contenido" y "Es influencer".
                  Activar influencer auto-activa contenido (toda tarea de influencer es contenido).
                  No aplica para "Solicitud de influencers" (que tiene su propio flujo). */}
              {!isSolicitud && (
              <div className="mb-3 p-3 bg-bg3 rounded-lg border border-black/7 flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => { const next = !isContent; setIsContent(next); if (!next) setIsInfluencer(false) }}
                      className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isContent ? 'bg-claude' : 'bg-bg4'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isContent ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-[13px]">Es contenido</div>
                      <div className="text-[11px] text-gray-400">Fechas, slide y presentación</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => { const next = !isInfluencer; setIsInfluencer(next); if (next) setIsContent(true) }}
                      className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isInfluencer ? 'bg-claude' : 'bg-bg4'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isInfluencer ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-[13px]">Es influencer</div>
                      <div className="text-[11px] text-gray-400">Nombre, handle, tipo</div>
                    </div>
                  </label>
                </div>
                {isInfluencer && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={labelCls}>Nombre del influencer</label>
                        <input value={infName} onChange={e => setInfName(e.target.value)} className={fieldCls} placeholder="Nombre" /></div>
                      <div><label className={labelCls}>Handle / cuenta</label>
                        <input value={infHandle} onChange={e => setInfHandle(e.target.value)} className={fieldCls} placeholder="@usuario" /></div>
                    </div>
                    <div><label className={labelCls}>Agencia que lo gestiona (opcional)</label>
                      <input value={infAgency} onChange={e => setInfAgency(e.target.value)} className={fieldCls} placeholder="Agencia / representante" /></div>
                    <div>
                      <label className={labelCls}>Tipo de publicación</label>
                      <select value={pubType} onChange={e => setPubType(e.target.value)} className={fieldCls}>
                        {PUB_TYPES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {vaAGrilla(pubType)
                          ? 'Va a grilla RRSS + calendario de Influencers.'
                          : 'Solo va al calendario de Influencers (no aparece en la grilla).'}
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* "Es tarea padre" — solo aplica a tipo independiente sin recordatorio. */}
              {!isReminder && tipo === 'independiente' && (
                <div className="mb-3 p-3 bg-bg3 rounded-lg border border-black/7 flex flex-col gap-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => { const next = !isParent; setIsParent(next); if (next && !pendingSubtasks.length) setPendingSubtasks([makeEmptySubtask()]) }}
                      className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${isParent ? 'bg-claude' : 'bg-bg4'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isParent ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-[13px]">Es tarea padre — agregar subtareas ahora</div>
                      <div className="text-[11px] text-gray-400">Las subtareas se crean junto con la tarea, sin límite de profundidad.</div>
                    </div>
                  </label>
                  {isParent && (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase">
                        Subtareas a crear ({pendingSubtasks.length})
                      </div>
                      {pendingSubtasks.map((s, i) => (
                        <SubtaskRow key={s.id} item={s} level={0}
                          onChange={next => setPendingSubtasks(prev => prev.map((x, j) => j === i ? next : x))}
                          onRemove={() => setPendingSubtasks(prev => prev.filter((_, j) => j !== i))} />
                      ))}
                      <button type="button"
                        onClick={() => setPendingSubtasks(prev => [...prev, makeEmptySubtask()])}
                        className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-3 py-1.5 rounded-md cursor-pointer hover:bg-claude/15 transition-colors self-start">
                        + Agregar subtarea
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className={labelCls}>Descripción (opcional)</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className={inputCls + ' resize-y'} placeholder="Quién pide, contexto adicional…" rows={3} />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={handleSaveTask} disabled={!title.trim() || saving || (isReminder && !reminderAt)}
                  className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Guardando…' : isReminder ? 'Crear recordatorio' : 'Guardar tarea'}
                </button>
              </div>
            </>
          )}

          {(tab === 'notas' || tab === 'micro') && (
            <>
              {tab === 'notas' ? (
                <>
                  <p className="text-[13px] text-gray-400 mb-3">Pegá lo que te pidieron y/o adjuntá archivos (imágenes, PDFs, texto). También podés arrastrar archivos a cualquier parte del modal. Si el texto ya viene en formato estructurado (<span className="font-mono text-[11px]">BF | … Tipo: … | Prioridad: … | Entrega: …</span>) se parsea local sin gastar API; si no, lo extrae Claude.</p>
                  <textarea value={meetingText} onChange={e => setMeetingText(e.target.value)}
                    className={inputCls + ' resize-y leading-relaxed mb-3'} placeholder="Notas, correo pegado, o dejá vacío y subí adjuntos…" rows={6} autoFocus />

                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Adjuntos (opcional)</label>
                      <label className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15 transition-colors font-medium">
                        + Adjuntar archivo
                        <input type="file" accept="image/*,application/pdf,text/plain,.txt,.md" multiple
                          className="hidden"
                          onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
                      </label>
                      <span className="text-[10px] text-gray-400">imágenes · PDF · txt/md</span>
                    </div>
                    {attachments.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-1">
                        {attachments.map(a => (
                          <div key={a.id} className="relative">
                            {a.kind === 'image' && a.url ? (
                              <img src={a.url} alt={a.name} title={a.name} className="w-16 h-16 object-cover rounded-md border border-black/10" />
                            ) : (
                              <div title={a.name} className="w-16 h-16 rounded-md border border-black/10 bg-bg3 flex flex-col items-center justify-center gap-0.5 px-1">
                                <span className="text-lg leading-none">{a.kind === 'pdf' ? '📄' : '📝'}</span>
                                <span className="text-[9px] font-mono text-gray-500 truncate max-w-full leading-tight">{a.name}</span>
                              </div>
                            )}
                            <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                              className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center cursor-pointer"
                              title="Quitar">✕</button>
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
                <button onClick={handleExtract} disabled={(!meetingText.trim() && !attachments.length) || extracting}
                  className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium mb-4">
                  {extracting ? 'Extrayendo…' : attachments.length ? `✦ Extraer de ${attachments.length} adjunto${attachments.length === 1 ? '' : 's'}${meetingText.trim() ? ' + texto' : ''}` : '✦ Procesar / extraer tareas'}
                </button>
              )}

              {renderSuggestions()}

              <div className="flex gap-2 justify-end items-center">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                {extracted && suggestions.some(s => s.selected) && (
                  <>
                    {!reviewMode && suggestions.length > 1 && (
                      <button onClick={() => { setReviewMode(true); setReviewIdx(0) }}
                        className="text-xs bg-bg3 border border-black/7 text-gray-600 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
                        Revisar una por una
                      </button>
                    )}
                    <button onClick={handleCreateSelected} disabled={savingNotes}
                      className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                      {savingNotes ? 'Creando…' : `Crear todas (${suggestions.filter(s => s.selected).length})`}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {quickClientOpen && (
        <QuickClientModal onClose={() => setQuickClientOpen(false)} onCreated={id => { setContext('agencia'); setClientId(id) }} />
      )}
      {quickProject && (
        <QuickProjectModal
          onClose={() => setQuickProject(null)}
          onCreated={id => quickProject.onCreated(id)}
          defaultContext={quickProject.ctx}
          defaultClientId={quickProject.clientId}
        />
      )}
    </div>
  )
}
