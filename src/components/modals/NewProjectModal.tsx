import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { TIPO_AGENCIA } from '../../lib/constants'

const STATUSES = ['activo', 'en pausa', 'cerrado']

export function NewProjectModal({ onClose, defaultContext = 'banco' }: { onClose: () => void; defaultContext?: string }) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const agClients = clients.filter(c => c.context === 'agencia')

  const [name, setName] = useState('')
  const [context, setContext] = useState(defaultContext)
  const [clientId, setClientId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('activo')
  const [tipoAgencia, setTipoAgencia] = useState(TIPO_AGENCIA[0])
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('projects').insert({
      name: name.trim(), context, client_id: context === 'agencia' ? clientId : null,
      description: description.trim() || null, due_date: dueDate || null, status, type: 'proyecto',
      tipo_agencia: context === 'agencia' ? tipoAgencia : null,
    })
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await loadAll()
    onClose()
  }

  const fieldCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer focus:border-claude/20 focus:bg-bg2'
  const inputCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-12 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[520px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Nuevo proyecto</div>

        <div className="mb-3">
          <label className={labelCls}>Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ej: Campaña Always-On Q3" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Contexto</label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }} className={fieldCls}>
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={fieldCls}>
              {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
        </div>

        {context === 'agencia' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Cliente</label>
              <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                <option value="">Agencia interna</option>
                {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo de proyecto</label>
              <select value={tipoAgencia} onChange={e => setTipoAgencia(e.target.value)} className={fieldCls}>
                {TIPO_AGENCIA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="mb-3">
          <label className={labelCls}>Fecha estimada</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={fieldCls} />
        </div>

        <div className="mb-4">
          <label className={labelCls}>Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputCls + ' resize-y'} placeholder="De qué trata el proyecto…" />
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
