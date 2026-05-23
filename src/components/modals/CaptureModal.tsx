import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'

export function CaptureModal({ onClose }: { onClose: () => void }) {
  const loadAll = useStore(s => s.loadAll)
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('banco')
  const [priority, setPriority] = useState('media')
  const [origin, setOrigin] = useState('propia')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      context,
      priority,
      origin,
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

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-8 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[520px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Capturar tarea</div>

        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Titulo *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            placeholder="Que hay que hacer?"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto</label>
            <select value={context} onChange={e => setContext(e.target.value)} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Prioridad</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Media</option>
              <option value="baja">🟢 Baja</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Origen</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { value: 'propia', label: '💡 Propia' },
              { value: 'gmail-agencia', label: '📧 Email' },
              { value: 'whatsapp', label: '💬 WhatsApp' },
              { value: 'reunion', label: '🤝 Reunion' },
            ].map(o => (
              <button
                key={o.value}
                onClick={() => setOrigin(o.value)}
                className={`py-2 px-1 border rounded-lg text-[11px] text-center cursor-pointer transition-all ${
                  origin === o.value
                    ? 'border-claude/20 text-claude bg-claude/7'
                    : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Descripcion (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none resize-y focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            placeholder="Quien pide, contexto adicional..."
            rows={3}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}
