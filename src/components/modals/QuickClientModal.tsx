import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'

export function QuickClientModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: number) => void }) {
  const loadAll = useStore(s => s.loadAll)
  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<'activo' | 'prospecto'>('activo')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clients')
      .insert({ name: name.trim(), context: 'agencia', active: true, tipo })
      .select().single()
    if (error || !data) { alert('Error: ' + error?.message); setSaving(false); return }
    await loadAll()
    onCreated?.(data.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[320] flex items-start justify-center pt-20 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[420px] max-w-[96vw] shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Nuevo cliente</div>

        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            placeholder="Nombre del cliente" />
        </div>

        <div className="mb-4">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 'activo', l: 'Activo' },
              { v: 'prospecto', l: 'Prospecto' },
            ] as { v: 'activo' | 'prospecto'; l: string }[]).map(o => (
              <button key={o.v} onClick={() => setTipo(o.v)}
                className={`py-2 border rounded-lg text-[13px] cursor-pointer transition-all ${
                  tipo === o.v ? 'border-claude/20 text-claude bg-claude/7 font-medium' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                }`}>
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">El resto (contacto, alcance, propuesta, Drive) se completa después en el detalle del cliente.</p>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
