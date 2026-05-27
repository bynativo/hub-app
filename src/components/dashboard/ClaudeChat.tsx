import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaudeProxy } from '../../lib/claude'
import { todayISO, getTodayLabel } from '../../lib/helpers'
/* eslint-disable @typescript-eslint/no-explicit-any */

interface Msg { role: 'user' | 'assistant'; content: string }

// Extrae un bloque ```crear {...}``` (o cualquier fence con JSON que tenga title) de la respuesta.
function parseAction(text: string): { json: any; clean: string } | null {
  const fence = /```(?:crear|json)?\s*([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && (obj.title || obj.titulo)) {
        const clean = text.replace(m[0], '').trim()
        return { json: obj, clean }
      }
    } catch { /* sigue probando */ }
  }
  return null
}

export function ClaudeChat() {
  const tasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const projects = useStore(s => s.projects)
  const calendarEvents = useStore(s => s.calendarEvents)
  const loadAll = useStore(s => s.loadAll)

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hola Felipe. Contame qué tarea querés crear y la registro. Te pregunto solo lo que falte.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  function buildSystem() {
    const active = tasks.filter(t => !t.done)
    const load = active
      .filter(t => t.due_date)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      .map(t => `- "${t.title}" vence ${t.due_date} [${t.context}, ${t.priority}]`)
      .join('\n') || '- (ninguna con fecha)'
    const agClients = clients.filter(c => c.context === 'agencia').map(c => `${c.id}=${c.name}`).join(', ') || '(ninguno)'
    const projList = projects.map(p => `${p.id}=${p.name} [${p.context}]`).join(', ') || '(ninguno)'
    const now = todayISO()
    const agenda = calendarEvents
      .filter(e => (e.starts_at || '').slice(0, 10) >= now)
      .slice(0, 25)
      .map(e => `- ${(e.starts_at || '').slice(0, 16).replace('T', ' ')} ${e.title}`)
      .join('\n') || '- (sin reuniones próximas)'

    return `Eres el asistente de trabajo de Felipe. Tenés acceso a su Supabase. Cuando te describa una tarea, pedí solo lo necesario: contexto, fecha, y si pertenece a proyecto o cliente. Verificá su carga actual antes de sugerir fechas. Sé directo y práctico. Respondé en español. Cuando tengas toda la info, creá la tarea directamente en Supabase.

HOY: ${getTodayLabel()} (${todayISO()})

CARGA ACTUAL (tareas activas con fecha):
${load}

CLIENTES DE AGENCIA (id=nombre): ${agClients}
PROYECTOS (id=nombre): ${projList}

AGENDA / REUNIONES PRÓXIMAS (del Google Calendar):
${agenda}

REGLAS:
- Pedí solo lo que falte. Si el contexto no está claro, preguntá (banco/agencia/personal).
- Si no se menciona fecha, sugerí una razonable mirando la carga Y la agenda; si ese día/horario tiene reuniones o varias tareas, avisá y proponé el bloque libre más cercano.
- Si es agencia, preguntá si es de un cliente (usá los ids de arriba).
- No crees tareas que suenen bien pero no aporten valor real.

PROTOCOLO DE CREACIÓN: cuando tengas TODA la info, escribí una frase corta de confirmación y AL FINAL un bloque exactamente así:
\`\`\`crear
{"tipo":"tarea","title":"...","context":"banco|agencia|personal","priority":"alta|media|baja","due_date":"YYYY-MM-DD o null","client_id":null,"project_id":null}
\`\`\`
Para una recurrente usá {"tipo":"recurrente","title":"...","context":"...","priority":"...","freq":"diaria|semanal|mensual","client_id":null}. No incluyas el bloque hasta tener todo.`
  }

  async function executeAction(obj: any): Promise<string> {
    const context = obj.context || 'banco'
    if (obj.tipo === 'recurrente') {
      const { error } = await supabase.from('recurrentes').insert({
        title: obj.title || obj.titulo, context,
        client_id: context === 'agencia' ? (obj.client_id ?? null) : null,
        freq: obj.freq || 'mensual', day_of_month: '1', priority: obj.priority || 'media',
        active: true, cats: [], time_minutes: 60,
      })
      if (error) return `⚠ No pude crear la recurrente: ${error.message}`
      return `✓ Recurrente creada: "${obj.title || obj.titulo}" (${obj.freq || 'mensual'})`
    }
    const { error } = await supabase.from('tasks').insert({
      title: obj.title || obj.titulo, context, priority: obj.priority || 'media',
      due_date: obj.due_date && obj.due_date !== 'null' ? obj.due_date : null,
      client_id: context === 'agencia' ? (obj.client_id ?? null) : null,
      project_id: obj.project_id ?? null,
      parent_task_id: obj.parent_task_id ?? null,
      origin: 'propia', status: 'Inbox', done: false, cats: [], plan: [], meeting_agenda: [],
      task_type: 'independiente',
    })
    if (error) return `⚠ No pude crear la tarea: ${error.message}`
    return `✓ Tarea creada: "${obj.title || obj.titulo}"${obj.due_date && obj.due_date !== 'null' ? ` · vence ${obj.due_date}` : ''}`
  }

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return
    const history: Msg[] = [...messages, { role: 'user', content: msg }]
    setMessages(history)
    setInput('')
    setLoading(true)
    try {
      const reply = await callClaudeProxy(history.slice(-12), buildSystem())
      const action = parseAction(reply)
      if (action) {
        const display = action.clean || 'Listo, creando…'
        setMessages(prev => [...prev, { role: 'assistant', content: display }])
        const result = await executeAction(action.json)
        await loadAll()
        setMessages(prev => [...prev, { role: 'assistant', content: result }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión con Claude. Reintentá.' }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[200] flex items-center gap-2 bg-claude text-white px-4 py-3 rounded-full shadow-lg hover:bg-purple-700 transition-colors cursor-pointer"
      >
        <span className="text-base">✦</span>
        <span className="text-[13px] font-medium">Crear con Claude</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-[200] w-[400px] max-w-[94vw] h-[560px] max-h-[85vh] bg-bg2 border border-black/13 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="p-3 border-b border-black/7 flex items-center gap-2.5 bg-bg2">
        <div className="w-[26px] h-[26px] rounded-full bg-claude/7 border border-claude/20 flex items-center justify-center text-[13px]">✦</div>
        <div className="flex-1">
          <div className="text-[13px] font-medium">Crear con Claude</div>
          <div className="text-[11px] text-gray-400">Describí la tarea y la registro</div>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 text-lg hover:text-gray-900 cursor-pointer">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[90%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
            <div className={`px-3 py-2 rounded-[10px] text-[13px] leading-relaxed whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-claude text-white rounded-br-sm'
                : m.content.startsWith('✓') ? 'bg-success/10 border border-success/30 text-success rounded-bl-sm'
                : m.content.startsWith('⚠') ? 'bg-danger/10 border border-danger/30 text-danger rounded-bl-sm'
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
        <div ref={endRef} />
      </div>

      <div className="p-2.5 border-t border-black/7 flex gap-2 bg-bg3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20"
          placeholder="Ej: recordar enviar el reporte a Retail X el viernes"
          rows={1}
          disabled={loading}
        />
        <button onClick={send} disabled={loading}
          className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40">
          ↑
        </button>
      </div>
    </div>
  )
}
