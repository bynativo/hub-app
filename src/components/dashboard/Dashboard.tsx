import { useState, useRef } from 'react'
import { useStore } from '../../lib/store'
import { getGreeting, ctxLabel } from '../../lib/helpers'
import { callClaude } from '../../lib/claude'
import { TaskList } from '../tasks/TaskList'

function StatCard({ label, value, color, borderColor }: { label: string; value: number; color?: string; borderColor?: string }) {
  return (
    <div className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm" style={borderColor ? { borderColor } : {}}>
      <div className="text-[11px] text-gray-400 font-mono mb-1 tracking-wider">{label}</div>
      <div className="text-2xl font-medium" style={color ? { color } : {}}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">tareas</div>
    </div>
  )
}

const QUICK_PROMPTS: Record<string, string> = {
  'Priorizar dia': 'Prioriza mis tareas de hoy con orden de ataque concreto.',
  'Email seguimiento': 'Redacta un email de seguimiento para un cliente que lleva 3 dias sin responder.',
  'Resumen': 'Resumen ejecutivo de todos mis pendientes por contexto.',
  'Tiempo total': 'Estima el tiempo total para todo lo activo.',
}

export function Dashboard() {
  const { tasks } = useStore()
  const active = tasks.filter(t => !t.done)
  const banco = active.filter(t => t.context === 'banco')
  const agencia = active.filter(t => t.context === 'agencia')
  const personal = active.filter(t => t.context === 'personal')
  const overdue = active.filter(t => t.due_date && new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())).length
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTasks = active.filter(t => t.due_date === todayStr || (t.due_date && new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())))
  const todayIds = new Set(todayTasks.map(t => t.id))

  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hola. Haz clic en cualquier tarea para abrir una conversacion conmigo, o preguntame algo general sobre tu carga de trabajo.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  function buildSystem() {
    const summary = active.map(t =>
      `- [${t.priority}] ${t.title} (${ctxLabel(t.context)}${t.due_date ? `, vence ${t.due_date}` : ''}${t.status ? `, ${t.status}` : ''})`
    ).join('\n')
    return `Eres el agente de trabajo personal del usuario. Tienes acceso a todas sus tareas activas.

TAREAS ACTIVAS (${active.length}):
${summary}

Contextos: Banco Falabella (${banco.length}), Agencia (${agencia.length}), Personal (${personal.length})
Vencidas: ${overdue}

REGLAS:
- Espanol, directo y practico
- Respuestas concisas
- Prioriza por urgencia real, no solo por la etiqueta
- Si pide email, tono humano y profesional`
  }

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)
    try {
      const history = [...messages, { role: 'user', content: msg }]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
      const reply = await callClaude(history, buildSystem())
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexion. Verifica que ANTHROPIC_API_KEY este configurada.' }])
    } finally {
      setLoading(false)
      msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">{getGreeting()}</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tareas activas{overdue ? ` · ${overdue} vencidas` : ''}
      </p>

      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <StatCard label="Total activo" value={active.length} />
        <StatCard label="Banco" value={banco.length} color="#2563eb" borderColor="rgba(37,99,235,0.2)" />
        <StatCard label="Agencia" value={agencia.length} color="#0d9488" borderColor="rgba(13,148,136,0.2)" />
        <StatCard label="Propios" value={personal.length} color="#d97706" borderColor="rgba(217,119,6,0.2)" />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <div>
          {/* Hoy */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📌 Hoy</div>
          </div>
          {todayTasks.length ? (
            <TaskList tasks={todayTasks} />
          ) : (
            <div className="bg-bg2 border border-black/7 rounded-[10px] p-5 text-center shadow-sm mb-2">
              <div className="text-[15px] mb-1">Sin tareas urgentes para hoy</div>
              <div className="text-[12px] text-gray-400">Buen momento para avanzar con lo de esta semana</div>
            </div>
          )}

          <div className="flex items-center justify-between mb-2.5 mt-5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🔴 Urgente</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'alta' && !todayIds.has(t.id))} emptyText="Sin urgentes" />

          <div className="flex items-center justify-between mb-2.5 mt-5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🟡 Esta semana</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'media' && !todayIds.has(t.id))} emptyText="Sin tareas esta semana" />

          <div className="flex items-center justify-between mb-2.5 mt-5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🟢 Proximamente</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'baja' && !todayIds.has(t.id))} emptyText="Sin tareas proximas" />
        </div>

        {/* Claude Panel */}
        <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md">
          <div className="p-3 border-b border-black/7 flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-claude/7 border border-claude/20 flex items-center justify-center text-[13px]">✦</div>
            <div>
              <div className="text-[13px] font-medium">Agente Claude</div>
              <div className="text-[11px] text-gray-400">Supabase ✓ · {active.length} tareas activas</div>
            </div>
          </div>
          <div className="p-2.5 border-b border-black/7 flex gap-1.5 flex-wrap">
            {Object.keys(QUICK_PROMPTS).map(chip => (
              <span
                key={chip}
                onClick={() => send(QUICK_PROMPTS[chip])}
                className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2 py-1 rounded-full cursor-pointer hover:border-claude/20 hover:text-claude hover:bg-claude/7 font-mono transition-all"
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="h-[230px] overflow-y-auto p-3 flex flex-col gap-2">
            {messages.map((m, i) => (
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
            {loading && (
              <div className="flex items-center gap-1 px-3 py-2 bg-bg3 border border-black/7 rounded-[10px] w-fit self-start">
                <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
                <div className="dot w-[5px] h-[5px] bg-gray-400 rounded-full" />
              </div>
            )}
            <div ref={msgsEndRef} />
          </div>
          <div className="p-2.5 border-t border-black/7 flex gap-2 bg-bg3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20"
              placeholder="Pregunta o pide algo..."
              rows={1}
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading}
              className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
