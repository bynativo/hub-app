import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ESTADOS, STATUS_ICON, STATUS_COLOR, CATS } from '../../lib/constants'
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

  function handleChatSend() {
    if (!chatInput.trim() || !task) return
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }])
    const userMsg = chatInput
    const taskTitle = task.title
    setChatInput('')
    // Simulated response - in production this would call Claude API
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Entiendo. Sobre "${taskTitle}": ${userMsg.length > 20 ? 'Estoy analizando tu solicitud. En produccion, esta respuesta vendria de Claude con contexto completo de la tarea.' : 'Perfecto. ¿Que mas necesitas?'}`
      }])
    }, 500)
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

            {/* Messages */}
            <div className="flex-1 min-h-[120px] max-h-[320px] overflow-y-auto flex flex-col gap-2 pb-1">
              {chatMessages.map((m, i) => (
                <div key={i} className={`max-w-[90%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                  <div className={`px-3 py-2 rounded-[10px] text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-claude text-white rounded-br-sm'
                      : 'bg-bg3 border border-black/7 rounded-bl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
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
              />
              <button
                onClick={handleChatSend}
                className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] self-end hover:bg-purple-700 transition-colors cursor-pointer"
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
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Subtareas</div>
              {subtasks.length ? subtasks.map(s => (
                <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-black/7 text-[13px]">
                  <div
                    onClick={() => toggleSubtask(s.id, s.done)}
                    className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 cursor-pointer flex items-center justify-center text-[9px] transition-all ${
                      s.done ? 'bg-success border-success text-white' : 'border-black/13 hover:border-success'
                    }`}
                  >
                    {s.done && '✓'}
                  </div>
                  <span className={s.done ? 'line-through text-gray-400' : ''}>{s.title}</span>
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
