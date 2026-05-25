import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaude } from '../../lib/claude'
import { ESTADOS, STATUS_ICON, STATUS_COLOR, CATS, ORIGIN_LABELS } from '../../lib/constants'
import { ctxLabel } from '../../lib/helpers'
import type { Subtask, Thread } from '../../lib/types'

type Tab = 'chat' | 'info' | 'email' | 'reunion' | 'slide'

export function TaskDetail() {
  const { tasks, currentTaskId, closeDetail, updateTaskStatus } = useStore()
  const task = tasks.find(t => t.id === currentTaskId)
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const [editingSub, setEditingSub] = useState<number | null>(null)
  const [subTitle, setSubTitle] = useState('')
  const [subStatus, setSubStatus] = useState('pendiente')
  const [subDueDate, setSubDueDate] = useState('')
  const [subHours, setSubHours] = useState('')
  const [subNotes, setSubNotes] = useState('')
  const [subLink, setSubLink] = useState('')

  useEffect(() => {
    if (!task) return
    setActiveTab('chat')
    setChatMessages([{
      role: 'assistant',
      content: `Estoy al tanto de esta tarea: "${task.title}" (${ctxLabel(task.context)}). ¿Por donde empezamos?`
    }])

    Promise.all([
      supabase.from('subtasks').select('*').eq('task_id', task.id).order('position'),
      supabase.from('threads').select('*').eq('task_id', task.id).order('created_at'),
    ]).then(([subs, ths]) => {
      setSubtasks(subs.data || [])
      setThreads(ths.data || [])
    })
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null

  const stForCtx = ESTADOS[task.context] || ESTADOS.banco
  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: '💬 Conversar' },
    { id: 'info', label: '📋 Info' },
    { id: 'email', label: '📩 Email' },
    { id: 'reunion', label: '📅 Reunion' },
    { id: 'slide', label: '🎬 Slide' },
  ]

  async function toggleSubtask(id: number, done: boolean) {
    await supabase.from('subtasks').update({ done: !done }).eq('id', id)
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !done } : s))
  }

  async function addSubtask() {
    if (!task) return
    const { data } = await supabase.from('subtasks').insert({
      task_id: task.id,
      title: 'Nueva subtarea',
      status: 'pendiente',
      position: subtasks.length,
      done: false,
    }).select().single()
    if (!data) return
    setSubtasks(prev => [...prev, data])
    setEditingSub(data.id)
    setSubTitle(data.title); setSubStatus('pendiente'); setSubDueDate(''); setSubHours(''); setSubNotes(''); setSubLink('')
  }

  function buildSystemPrompt() {
    if (!task) return ''
    return `Eres el asistente de trabajo de Felipe. Se directo, practico y conciso.

TAREA ACTUAL: ${task.title}
Contexto: ${ctxLabel(task.context)}
Cliente: ${task.clients?.name || 'ninguno'}
Proyecto: ${task.projects?.name || 'ninguno'}
Prioridad: ${task.priority} | Origen: ${ORIGIN_LABELS[task.origin] || task.origin}
Categorias: ${(task.cats || []).join(', ') || 'ninguna'}
Fecha limite: ${task.due_date || 'sin fecha'} | Notas: ${task.notes || 'ninguna'}
Plan actual: ${task.plan?.length ? task.plan.join(' → ') : 'sin plan aun'}
Draft email: ${task.draft_body ? 'existe borrador' : 'no hay borrador'}
Status: ${task.status || 'Inbox'}

Subtareas actuales: ${subtasks.length ? subtasks.map(s => `${s.done ? '✓' : '○'} ${s.title}${s.due_date ? ' ('+s.due_date+')' : ''}`).join(', ') : 'ninguna'}

Otras tareas de Felipe con fecha proxima:
${tasks.filter(t => !t.done && t.id !== task.id && t.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 8).map(t => `- "${t.title}" vence ${t.due_date} [${t.priority}]`).join('\n') || '- ninguna'}

Canales: Gmail (agencia + personal) = envio directo. Outlook (banco) = solo copia manual, cortafuegos corporativo.

REGLAS:
- Se directo, practico y conciso. No teorico ni idealista.
- Cuando sugieras subtareas, se especifico y realista. No crees tareas que suenen bien pero no aporten valor real.
- Cuando el usuario diga que hara algo para una fecha, revisa sus otras tareas con due_date proximo y advierte si hay conflicto de carga.
- Cuando el usuario pida crear subtareas, crealas directamente en Supabase via la API y asigna fechas tentativas distribuidas hasta la fecha limite de la tarea principal.
- Emails: tono humano y profesional, que NADIE note la IA. Si aprueba un email, dile que vaya a la pestana "Email".
- Si propones reunion, incluye agenda con 5-6 puntos concretos.
- Espanol. Respuestas concisas, no mas de 3 parrafos a menos que se pida detalle.`
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !task || chatLoading) return
    const userMsg = chatInput
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatInput('')
    setChatLoading(true)

    try {
      const history = [...chatMessages, { role: 'user', content: userMsg }]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
      const reply = await callClaude(history, buildSystemPrompt())
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexion. Verifica que ANTHROPIC_API_KEY este configurada en Vercel.' }])
    } finally {
      setChatLoading(false)
      msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="fixed top-[52px] right-0 bottom-0 w-[540px] bg-bg border-l border-black/13 z-50 flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-black/7 flex items-start gap-2.5 shrink-0 bg-bg2">
        <div className="flex-1">
          <div className="font-serif text-[17px] font-light mb-1.5 leading-snug">{task.title}</div>
          <div className="flex gap-1 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                  style={{ background: (STATUS_COLOR[task.status || 'Inbox'] || '#6b7280') + '16', color: STATUS_COLOR[task.status || 'Inbox'] }}>
              {task.status || 'Inbox'}
            </span>
            {task.clients && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia border border-agencia/20">
                {task.clients.name}
              </span>
            )}
          </div>
        </div>
        <button onClick={closeDetail} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/7 bg-bg2 shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'text-claude border-claude'
                : 'text-gray-400 border-transparent hover:text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Status bar */}
            <div className="flex gap-1.5 flex-wrap mb-3 p-2.5 bg-bg3 rounded-[10px] border border-black/7">
              {stForCtx.map(s => (
                <button
                  key={s}
                  onClick={() => updateTaskStatus(task.id, s)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-md border cursor-pointer transition-all ${
                    s === task.status
                      ? 'font-semibold shadow-[0_0_0_2px_currentColor]'
                      : 'bg-bg2 border-black/7 text-gray-500 hover:border-black/13'
                  }`}
                  style={s === task.status ? { color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s], background: STATUS_COLOR[s] + '16' } : {}}
                >
                  {STATUS_ICON[s]} {s}
                </button>
              ))}
            </div>

            {/* Context box */}
            <div className="bg-claude/7 border border-claude/20 rounded-[10px] p-3 mb-3 text-xs text-gray-500 leading-relaxed">
              <strong className="text-claude text-[10px] font-mono block mb-1 tracking-wider uppercase">Contexto de esta tarea</strong>
              {ctxLabel(task.context)} · {task.priority} prioridad
              {task.due_date && ` · Vence ${task.due_date.slice(5).replace('-', '/')}`}
              {task.notes && <><br />Notas: {task.notes}</>}
            </div>

            {/* Quick actions */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {[
                { label: 'Plan de ataque', prompt: 'Dame los pasos concretos para abordar esta tarea.' },
                { label: 'Redactar email', prompt: 'Redacta el email de respuesta. Tono humano, que nadie note IA.' },
                { label: 'Ver riesgos', prompt: 'Hay riesgos o bloqueos que debo considerar?' },
                { label: 'Update equipo', prompt: 'Dame un WhatsApp para actualizar al equipo sobre esta tarea.' },
              ].map(q => (
                <button
                  key={q.label}
                  onClick={() => { setChatInput(q.prompt); }}
                  className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2.5 py-1 rounded-full cursor-pointer hover:border-claude/20 hover:text-claude hover:bg-claude/7 font-mono transition-all"
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-[120px] max-h-[320px] overflow-y-auto flex flex-col gap-2 pb-1">
              {chatMessages.map((m, i) => (
                <div key={i} className={`max-w-[90%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                  <div className={`px-3 py-2 rounded-[10px] text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-claude text-white rounded-br-sm'
                      : 'bg-bg3 border border-black/7 rounded-bl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-1 px-3 py-2 bg-bg3 border border-black/7 rounded-[10px] w-fit self-start">
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                  <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                </div>
              )}
              <div ref={msgsEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-black/7 pt-3 mt-3 flex gap-2">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
                className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)] min-h-[42px] max-h-[120px]"
                placeholder="Escribe sobre esta tarea..."
                rows={2}
                disabled={chatLoading}
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading}
                className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] self-end hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="animate-fade-in">
            {/* Categories */}
            <div className="mb-4">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Categorias</div>
              <div className="flex flex-wrap gap-1.5">
                {(CATS[task.context] || []).map(c => (
                  <span
                    key={c}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border cursor-pointer transition-all ${
                      (task.cats || []).includes(c)
                        ? 'border-claude/20 text-claude bg-claude/7'
                        : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'
                    }`}
                  >
                    #{c}
                  </span>
                ))}
              </div>
            </div>

            {/* Plan */}
            {task.plan && task.plan.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">✦ Plan de abordaje</div>
                <div className="bg-bg2 border border-black/7 rounded-[10px] shadow-sm">
                  {task.plan.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 border-b border-black/7 last:border-b-0">
                      <div className="font-mono text-[10px] text-claude bg-claude/7 border border-claude/20 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <span className="text-[13px]">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subtasks */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Subtareas</div>
                <button onClick={addSubtask}
                  className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-claude/15 transition-colors">
                  + Nueva subtarea
                </button>
              </div>
              {subtasks.length ? subtasks.map(s => (
                <div key={s.id}>
                  <div className="flex items-center gap-2 py-1.5 border-b border-black/7 text-[13px]">
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSubtask(s.id, s.done) }}
                      className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[9px] transition-all ${
                        s.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'
                      }`}
                    >
                      {s.done && '✓'}
                    </div>
                    <span
                      onClick={() => {
                        if (editingSub === s.id) { setEditingSub(null); return }
                        setEditingSub(s.id); setSubTitle(s.title); setSubStatus(s.status || 'pendiente'); setSubDueDate(s.due_date || ''); setSubHours(s.estimated_hours != null ? String(s.estimated_hours) : ''); setSubNotes(s.notes || ''); setSubLink(s.link_url || '')
                      }}
                      className={`cursor-pointer hover:text-claude transition-colors flex-1 ${s.done ? 'line-through text-gray-400' : ''}`}
                    >
                      {s.title}
                    </span>
                    {s.due_date && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 shrink-0">
                        {s.due_date.slice(5).replace('-', '/')}
                      </span>
                    )}
                    {s.estimated_hours != null && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 shrink-0">
                        {s.estimated_hours}h
                      </span>
                    )}
                  </div>
                  {editingSub === s.id && (
                    <div className="bg-bg3 border border-black/7 rounded-lg p-3 my-1.5 animate-fade-in">
                      <div className="mb-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Titulo</label>
                        <input value={subTitle} onChange={e => setSubTitle(e.target.value)}
                          className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Estado</label>
                          <select value={subStatus} onChange={e => setSubStatus(e.target.value)}
                            className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none cursor-pointer">
                            <option value="pendiente">Pendiente</option>
                            <option value="en progreso">En progreso</option>
                            <option value="hecho">Hecho</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Fecha tentativa</label>
                          <input type="date" value={subDueDate} onChange={e => setSubDueDate(e.target.value)}
                            className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Horas est.</label>
                          <input type="number" min="0" step="0.5" value={subHours} onChange={e => setSubHours(e.target.value)}
                            className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20"
                            placeholder="1" />
                        </div>
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Notas</label>
                        <textarea value={subNotes} onChange={e => setSubNotes(e.target.value)} rows={2}
                          className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20"
                          placeholder="Detalles de esta subtarea..." />
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Enlace</label>
                        <input value={subLink} onChange={e => setSubLink(e.target.value)} type="url"
                          className="w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 font-mono"
                          placeholder="https://..." />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingSub(null)}
                          className="text-[11px] text-gray-400 px-2 py-1 cursor-pointer hover:text-gray-900">Cancelar</button>
                        <button onClick={async () => {
                          const updates = { title: subTitle, status: subStatus, due_date: subDueDate || null, estimated_hours: subHours ? Number(subHours) : null, notes: subNotes || null, link_url: subLink || null, done: subStatus === 'hecho' }
                          await supabase.from('subtasks').update(updates).eq('id', s.id)
                          setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x))
                          setEditingSub(null)
                        }}
                          className="text-[11px] bg-claude text-white px-3 py-1 rounded-md cursor-pointer hover:bg-purple-700 transition-colors">
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )) : (
                <div className="text-xs text-gray-400">Sin subtareas</div>
              )}
            </div>

            {/* Threads */}
            {threads.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">📧 Hilos vinculados</div>
                {threads.map(th => (
                  <div key={th.id} className="bg-bg2 border border-black/7 rounded-lg p-2.5 mb-2 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{th.from_name || 'Sin remitente'}</span>
                      <span className="text-[10px] text-gray-400 font-mono ml-auto">{th.received_at || ''}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 mb-1">{th.subject}</div>
                    <div className="text-xs text-gray-500 leading-relaxed max-h-16 overflow-hidden">{th.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'email' && (
          <div className="animate-fade-in">
            {task.draft_body ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded-[5px] border ${
                    task.draft_needs_review
                      ? 'bg-warn/7 text-warn border-warn/25'
                      : 'bg-success/7 text-success border-success/25'
                  }`}>
                    {task.draft_needs_review ? '⚠ Revisar' : '✓ Listo'}
                  </span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-mono text-gray-400 w-12 uppercase">Para</span>
                    <span className="text-[13px]">{task.draft_to || '—'}</span>
                  </div>
                  {task.draft_cc && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-mono text-gray-400 w-12 uppercase">CC</span>
                      <span className="text-[13px]">{task.draft_cc}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-mono text-gray-400 w-12 uppercase">Asunto</span>
                    <span className="text-[13px] font-medium">{task.draft_subject || '—'}</span>
                  </div>
                </div>
                <div className="bg-bg2 border border-black/7 rounded-[10px] p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {task.draft_body}
                </div>
              </div>
            ) : (
              <div className="text-center py-7 text-gray-400 text-[13px]">
                Sin borrador de email. Usa el chat para pedirle a Claude que redacte uno.
              </div>
            )}
          </div>
        )}

        {activeTab === 'reunion' && (
          <div className="animate-fade-in">
            {task.meeting_title ? (
              <div className="bg-bg2 border border-agencia/20 rounded-[10px] p-3.5">
                <div className="font-medium mb-1">{task.meeting_title}</div>
                <div className="text-xs text-gray-400 mb-3">{task.meeting_duration || '—'}</div>
                {task.meeting_agenda && task.meeting_agenda.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-agencia mb-2 uppercase">Agenda</div>
                    {task.meeting_agenda.map((item, i) => (
                      <div key={i} className="flex gap-2 py-1 text-xs border-b border-black/7 last:border-0">
                        <span className="text-agencia font-mono text-[10px] shrink-0 mt-0.5">{i + 1}.</span>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-7 text-gray-400 text-[13px]">
                Sin reunion programada. Usa el chat para proponer una.
              </div>
            )}
          </div>
        )}

        {activeTab === 'slide' && (
          <div className="animate-fade-in text-center py-7 text-gray-400 text-[13px]">
            {task.slide_idea ? (
              <div className="text-left">
                <div className="font-medium text-gray-900 mb-2">{task.slide_idea}</div>
                <div className="text-xs">Slide #{task.slide_number} · {task.content_format}</div>
              </div>
            ) : (
              'Esta tarea no tiene slide vinculada aun.'
            )}
          </div>
        )}
      </div>
    </div>
  )
}
