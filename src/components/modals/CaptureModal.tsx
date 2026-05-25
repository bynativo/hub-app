import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { callClaude } from '../../lib/claude'
/* eslint-disable @typescript-eslint/no-explicit-any */

type CaptureTab = 'tarea' | 'notas' | 'micro'

interface SuggestedTask {
  title: string
  context: string
  priority: string
  selected: boolean
}

export function CaptureModal({ onClose, preselectContext, preselectClientId }: {
  onClose: () => void
  preselectContext?: string
  preselectClientId?: number | null
}) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const [tab, setTab] = useState<CaptureTab>('tarea')

  // -- Tab Tarea --
  const [title, setTitle] = useState('')
  const [context, setContext] = useState(preselectContext ?? 'banco')
  const [priority, setPriority] = useState('media')
  const [origin, setOrigin] = useState('propia')
  const [clientId, setClientId] = useState<number | null>(preselectClientId ?? null)
  const [isContent, setIsContent] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const agClients = clients.filter(c => c.context === 'agencia')

  async function handleSaveTask() {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      context,
      priority,
      origin,
      client_id: context === 'agencia' ? clientId : null,
      task_type: isContent ? 'contenido' : 'independiente',
      due_date: dueDate || null,
      notes: notes.trim() || null,
      status: 'Inbox',
      done: false,
      cats: [],
      plan: [],
      meeting_agenda: [],
    })
    if (error) {
      alert('Error: ' + error.message)
      setSaving(false)
      return
    }
    await loadAll()
    onClose()
  }

  // -- Tab Notas --
  const [meetingNotes, setMeetingNotes] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([])
  const [extracted, setExtracted] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  async function handleExtract(text: string) {
    if (!text.trim()) return
    setExtracting(true)
    setSuggestions([])
    try {
      const res = await fetch('https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Extrae las tareas concretas de estas notas. Para cada una devuelve: titulo corto y practico, contexto (banco/agencia/personal), prioridad (alta/media/baja). Solo JSON: {"tareas":[{"titulo":"...","contexto":"...","prioridad":"..."}]}\n\nNotas:\n${text.trim()}` }],
          system: 'Extrae tareas practicas y especificas. No inventes, solo extrae lo que esta explicito.',
        }),
      })
      let reply: string
      if (res.ok) {
        const data = await res.json()
        reply = data.reply || data.content?.[0]?.text || JSON.stringify(data)
      } else {
        // Fallback to Vercel proxy
        reply = await callClaude(
          [{ role: 'user', content: `Extrae las tareas concretas de estas notas. Para cada una devuelve: titulo corto y practico, contexto (banco/agencia/personal), prioridad (alta/media/baja). Solo JSON: {"tareas":[{"titulo":"...","contexto":"...","prioridad":"..."}]}\n\nNotas:\n${text.trim()}` }],
          'Extrae tareas practicas y especificas. No inventes, solo extrae lo que esta explicito.'
        )
      }
      const cleaned = reply.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const items = parsed.tareas || parsed.tasks || []
      setSuggestions(items.map((t: any) => ({
        title: t.titulo || t.title, context: t.contexto || t.context || 'agencia', priority: t.prioridad || t.priority || 'media', selected: true,
      })))
      setExtracted(true)
    } catch {
      alert('Error extrayendo tareas. Intenta de nuevo.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleCreateSelected() {
    const selected = suggestions.filter(s => s.selected)
    if (!selected.length) return
    setSavingNotes(true)
    const rows = selected.map(s => ({
      title: s.title, context: s.context, priority: s.priority, origin: 'reunion',
      status: 'Inbox', done: false, cats: [], plan: [], meeting_agenda: [],
      notes: `Extraida de nota: "${(tab === 'micro' ? transcript : meetingNotes).slice(0, 100)}..."`,
    }))
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) { alert('Error: ' + error.message); setSavingNotes(false); return }
    await loadAll()
    onClose()
  }

  // -- Tab Micro --
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  function startRecording() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Tu navegador no soporta reconocimiento de voz.'); return }
    const recognition = new SR()
    recognition.lang = 'es-CL'
    recognition.continuous = true
    recognition.interimResults = true
    let finalText = transcript
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript + ' '
        } else {
          interim += e.results[i][0].transcript
        }
      }
      setTranscript(finalText + interim)
    }
    recognition.onerror = () => { setRecording(false) }
    recognition.onend = () => { setRecording(false) }
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  // Cleanup
  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  const tabCls = (t: CaptureTab) =>
    `flex-1 py-2.5 text-xs font-mono text-center cursor-pointer border-b-2 transition-all ${
      tab === t ? 'text-claude border-claude' : 'text-gray-400 border-transparent hover:text-gray-500'
    }`

  // Shared suggestion list renderer
  function renderSuggestions() {
    if (!extracted) return null
    if (!suggestions.length) return <div className="text-center py-4 text-gray-400 text-[13px]">No se identificaron tareas.</div>
    return (
      <div className="mb-4">
        <div className="text-[11px] font-mono text-claude tracking-wider uppercase mb-2">
          ✦ {suggestions.length} tarea{suggestions.length > 1 ? 's' : ''} identificada{suggestions.length > 1 ? 's' : ''}
        </div>
        <div className="flex flex-col gap-1.5">
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => setSuggestions(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
              className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${s.selected ? 'bg-claude/5 border-claude/20' : 'bg-bg3 border-black/7 opacity-50'}`}>
              <div className={`w-4 h-4 rounded border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center text-[10px] transition-all ${s.selected ? 'bg-claude border-claude text-white' : 'border-black/13'}`}>
                {s.selected && '✓'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] leading-snug">{s.title}</div>
                <div className="flex gap-1.5 mt-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: s.context === 'banco' ? 'rgba(37,99,235,0.07)' : s.context === 'agencia' ? 'rgba(13,148,136,0.07)' : 'rgba(217,119,6,0.07)', color: s.context === 'banco' ? '#2563eb' : s.context === 'agencia' ? '#0d9488' : '#d97706' }}>
                    {s.context}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: s.priority === 'alta' ? 'rgba(220,38,38,0.07)' : s.priority === 'media' ? 'rgba(217,119,6,0.07)' : 'rgba(22,163,74,0.07)', color: s.priority === 'alta' ? '#dc2626' : s.priority === 'media' ? '#d97706' : '#16a34a' }}>
                    {s.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-8 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl w-[580px] max-w-[96vw] mb-10 shadow-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-black/7">
          <button className={tabCls('tarea')} onClick={() => setTab('tarea')}>📋 Tarea directa</button>
          <button className={tabCls('notas')} onClick={() => setTab('notas')}>📝 Reunion / Notas</button>
          <button className={tabCls('micro')} onClick={() => setTab('micro')}>🎙 Microfono</button>
        </div>

        <div className="p-6">
          {/* ===== TAB TAREA ===== */}
          {tab === 'tarea' && (
            <>
              <div className="mb-3">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Titulo *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
                  placeholder="Que hay que hacer?" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto</label>
                  <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
                    <option value="banco">Banco Falabella</option>
                    <option value="agencia">Agencia</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Prioridad</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>
              </div>

              {context === 'agencia' && (
                <div className="mb-3">
                  <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Cliente</label>
                  <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
                    <option value="">Agencia interna</option>
                    {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="mb-3">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Origen</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'propia', label: '💡 Propia' },
                    { value: 'gmail-agencia', label: '📧 Email' },
                    { value: 'whatsapp', label: '💬 WhatsApp' },
                    { value: 'reunion', label: '🤝 Reunion' },
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

              <div className="mb-3">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Fecha limite</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]" />
              </div>

              {/* Toggle contenido */}
              <div className="mb-3 flex items-center gap-3 p-3 bg-bg3 rounded-lg border border-black/7">
                <button onClick={() => setIsContent(!isContent)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${isContent ? 'bg-claude' : 'bg-bg4'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isContent ? 'left-5.5' : 'left-0.5'}`} />
                </button>
                <div>
                  <div className="text-[13px]">Tarea de contenido</div>
                  <div className="text-[11px] text-gray-400">Se crea con task_type='contenido' y activa vista de slide</div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Descripcion (opcional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none resize-y focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
                  placeholder="Quien pide, contexto adicional..." rows={3} />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={handleSaveTask} disabled={!title.trim() || saving}
                  className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Guardando...' : 'Guardar tarea'}
                </button>
              </div>
            </>
          )}

          {/* ===== TAB NOTAS ===== */}
          {tab === 'notas' && (
            <>
              <p className="text-[13px] text-gray-400 mb-3">Escribe lo que te pidieron y Claude extrae las tareas</p>
              <div className="mb-3">
                <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto de la reunion</label>
                <select value={context} onChange={e => setContext(e.target.value)}
                  className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
                  <option value="banco">Banco Falabella</option>
                  <option value="agencia">Agencia</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
              <textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)}
                className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-3 text-[13px] outline-none resize-y focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)] leading-relaxed mb-4"
                placeholder="Escribe las notas de la reunion o lo que te pidieron de palabra..." rows={10} autoFocus />

              <button onClick={() => handleExtract(meetingNotes)} disabled={!meetingNotes.trim() || extracting}
                className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium mb-4">
                {extracting ? <span className="flex items-center justify-center gap-2">
                  <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
                  <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
                  <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
                  <span className="ml-1">Extrayendo...</span>
                </span> : '✦ Extraer tareas con Claude'}
              </button>

              {renderSuggestions()}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                {extracted && suggestions.some(s => s.selected) && (
                  <button onClick={handleCreateSelected} disabled={savingNotes}
                    className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    {savingNotes ? 'Creando...' : `Crear ${suggestions.filter(s => s.selected).length} tarea${suggestions.filter(s => s.selected).length > 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ===== TAB MICRO ===== */}
          {tab === 'micro' && (
            <>
              <p className="text-[13px] text-gray-400 mb-4">Graba con el microfono y se transcribe en tiempo real</p>

              <div className="flex items-center gap-3 mb-4">
                {recording ? (
                  <button onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-3 bg-danger/10 border border-danger/30 text-danger rounded-lg cursor-pointer font-medium text-xs transition-all hover:bg-danger/20">
                    <span className="w-3 h-3 rounded-full bg-danger animate-pulse" /> Detener grabacion
                  </button>
                ) : (
                  <button onClick={startRecording}
                    className="flex items-center gap-2 px-5 py-3 bg-claude/7 border border-claude/20 text-claude rounded-lg cursor-pointer font-medium text-xs transition-all hover:bg-claude/15">
                    🎙 Iniciar grabacion
                  </button>
                )}
                {recording && <span className="text-[11px] font-mono text-danger">Grabando...</span>}
              </div>

              <div className="bg-bg3 border border-black/7 rounded-lg px-3 py-3 text-[13px] leading-relaxed min-h-[200px] mb-4 whitespace-pre-wrap">
                {transcript || <span className="text-gray-400">La transcripcion aparecera aqui...</span>}
              </div>

              {transcript && !extracted && (
                <button onClick={() => handleExtract(transcript)} disabled={extracting}
                  className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium mb-4">
                  {extracting ? 'Extrayendo...' : '✦ Extraer tareas con Claude'}
                </button>
              )}

              {renderSuggestions()}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
                {extracted && suggestions.some(s => s.selected) && (
                  <button onClick={handleCreateSelected} disabled={savingNotes}
                    className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    {savingNotes ? 'Creando...' : `Crear ${suggestions.filter(s => s.selected).length} tarea${suggestions.filter(s => s.selected).length > 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
