import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'

// Mini-modal para crear un proyecto/campaña sin salir del modal Capturar.
// Al guardar, llama a onCreated(id) para que el contexto que lo abrió lo seleccione.
export function QuickProjectModal({ onClose, onCreated, defaultContext, defaultClientId }: {
  onClose: () => void
  onCreated: (id: number) => void
  defaultContext: string
  defaultClientId?: number | null
}) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const agClients = clients.filter(c => c.context === 'agencia')

  const [name, setName] = useState('')
  const [context, setContext] = useState(defaultContext)
  const [clientId, setClientId] = useState<number | null>(defaultClientId ?? null)
  const [isOngoing, setIsOngoing] = useState(true)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    const isAgencia = context === 'agencia'
    const { data, error } = await supabase.from('projects').insert({
      name: name.trim(),
      context,
      client_id: isAgencia ? clientId : null,
      es_interno: isAgencia ? !clientId : false,
      type: 'proyecto',
      status: 'activo',
      is_ongoing: isOngoing,
      due_date: isOngoing ? null : (dueDate || null),
    }).select().single()
    if (error || !data) { alert('Error creando proyecto: ' + error?.message); setSaving(false); return }
    await loadAll()
    setSaving(false)
    onCreated(data.id)
    onClose()
  }

  const fieldCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="fixed inset-0 bg-black/40 z-[320] flex items-start justify-center pt-20 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[440px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Nuevo proyecto / campaña</div>

        <div className="mb-3">
          <label className={labelCls}>Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className={fieldCls} placeholder="Ej: Campaña Cyber Junio" />
        </div>

        <div className={`grid ${context === 'agencia' ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-3`}>
          <div>
            <label className={labelCls}>Contexto</label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }} className={fieldCls + ' cursor-pointer'}>
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          {context === 'agencia' && (
            <div>
              <label className={labelCls}>Cliente (opcional)</label>
              <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)} className={fieldCls + ' cursor-pointer'}>
                <option value="">Agencia interna (sin cliente)</option>
                {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>Fecha de término</label>
            <button type="button" onClick={() => setIsOngoing(v => !v)} className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <span className={`w-8 h-4 rounded-full relative transition-colors ${isOngoing ? 'bg-claude' : 'bg-bg4'}`}>
                <span className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${isOngoing ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
              Sin fecha de término definida
            </button>
          </div>
          {isOngoing
            ? <div className="text-[11px] text-gray-400">El proyecto queda como <span className="text-claude font-medium">Ongoing</span>.</div>
            : <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={fieldCls} />}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}
