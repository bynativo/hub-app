import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { callClaude } from '../../lib/claude'

interface SuggestedTask {
  title: string
  context: string
  priority: string
  selected: boolean
}

export function NotesModal({ onClose }: { onClose: () => void }) {
  const loadAll = useStore(s => s.loadAll)
  const [notes, setNotes] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([])
  const [extracted, setExtracted] = useState(false)

  async function handleExtract() {
    if (!notes.trim()) return
    setExtracting(true)
    setSuggestions([])
    try {
      const reply = await callClaude(
        [{ role: 'user', content: notes.trim() }],
        `Eres un asistente que extrae tareas de notas de reuniones o instrucciones verbales.

Del texto que recibas, identifica cada tarea o accion concreta mencionada.

Responde SOLO con JSON valido, sin markdown ni explicacion:
{"tasks":[{"title":"descripcion concreta de la tarea","context":"banco|agencia|personal","priority":"alta|media|baja"}]}

Reglas:
- Cada tarea debe ser accionable y concreta
- Si no puedes determinar el contexto, usa "agencia"
- Si no puedes determinar la prioridad, usa "media"
- Minimo 1 tarea, maximo 10`
      )

      const cleaned = reply.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const tasks = (parsed.tasks || []).map((t: { title: string; context?: string; priority?: string }) => ({
        title: t.title,
        context: t.context || 'agencia',
        priority: t.priority || 'media',
        selected: true,
      }))
      setSuggestions(tasks)
      setExtracted(true)
    } catch {
      setSuggestions([])
      alert('Error extrayendo tareas. Intenta de nuevo.')
    } finally {
      setExtracting(false)
    }
  }

  function toggleSuggestion(idx: number) {
    setSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))
  }

  async function handleCreateSelected() {
    const selected = suggestions.filter(s => s.selected)
    if (!selected.length) return
    setSaving(true)
    const rows = selected.map(s => ({
      title: s.title,
      context: s.context,
      priority: s.priority,
      origin: 'reunion',
      status: 'Inbox',
      done: false,
      cats: [],
      plan: [],
      meeting_agenda: [],
      notes: `Extraida de nota: "${notes.slice(0, 100)}..."`,
    }))
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) {
      alert('Error: ' + error.message)
      setSaving(false)
      return
    }
    await loadAll()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-8 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[600px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-1">Reunion / Nota rapida</div>
        <p className="text-[13px] text-gray-400 mb-4">Escribe lo que te pidieron y Claude extrae las tareas</p>

        <div className="mb-4">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-3 text-[13px] outline-none resize-y focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)] leading-relaxed"
            placeholder="Escribe las notas de la reunion o lo que te pidieron de palabra..."
            rows={10}
            autoFocus
          />
        </div>

        <button
          onClick={handleExtract}
          disabled={!notes.trim() || extracting}
          className="w-full text-xs bg-claude/7 border border-claude/20 text-claude px-4 py-2.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-medium mb-4"
        >
          {extracting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
              <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
              <span className="dot w-[5px] h-[5px] bg-claude rounded-full inline-block" />
              <span className="ml-1">Extrayendo tareas con Claude...</span>
            </span>
          ) : '✦ Extraer tareas con Claude'}
        </button>

        {extracted && suggestions.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-mono text-claude tracking-wider uppercase mb-2">
              ✦ {suggestions.length} tarea{suggestions.length > 1 ? 's' : ''} identificada{suggestions.length > 1 ? 's' : ''}
            </div>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onClick={() => toggleSuggestion(i)}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    s.selected
                      ? 'bg-claude/5 border-claude/20'
                      : 'bg-bg3 border-black/7 opacity-50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-[1.5px] shrink-0 mt-0.5 flex items-center justify-center text-[10px] transition-all ${
                    s.selected ? 'bg-claude border-claude text-white' : 'border-black/13'
                  }`}>
                    {s.selected && '✓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] leading-snug">{s.title}</div>
                    <div className="flex gap-1.5 mt-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              background: s.context === 'banco' ? 'rgba(37,99,235,0.07)' : s.context === 'agencia' ? 'rgba(13,148,136,0.07)' : 'rgba(217,119,6,0.07)',
                              color: s.context === 'banco' ? '#2563eb' : s.context === 'agencia' ? '#0d9488' : '#d97706'
                            }}>
                        {s.context}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              background: s.priority === 'alta' ? 'rgba(220,38,38,0.07)' : s.priority === 'media' ? 'rgba(217,119,6,0.07)' : 'rgba(22,163,74,0.07)',
                              color: s.priority === 'alta' ? '#dc2626' : s.priority === 'media' ? '#d97706' : '#16a34a'
                            }}>
                        {s.priority}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {extracted && !suggestions.length && (
          <div className="text-center py-4 text-gray-400 text-[13px] mb-4">
            No se identificaron tareas. Intenta con mas detalle.
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
            Cancelar
          </button>
          {extracted && suggestions.some(s => s.selected) && (
            <button
              onClick={handleCreateSelected}
              disabled={saving}
              className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Creando...' : `Crear ${suggestions.filter(s => s.selected).length} tarea${suggestions.filter(s => s.selected).length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
