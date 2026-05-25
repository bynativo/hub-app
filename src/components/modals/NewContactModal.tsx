import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'

const CONTEXTS = [
  { v: 'banco', l: 'Banco' },
  { v: 'agencia', l: 'Agencia' },
  { v: 'personal', l: 'Personal' },
  { v: 'red', l: 'Red' },
]
const ORIGINS = [
  { v: 'manual', l: 'Manual' },
  { v: 'reunion', l: 'Reunión' },
  { v: 'email', l: 'Email extraído' },
]

export function NewContactModal({ onClose, defaultContext = 'agencia' }: { onClose: () => void; defaultContext?: string }) {
  const loadAll = useStore(s => s.loadAll)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [context, setContext] = useState(defaultContext)
  const [origin, setOrigin] = useState('manual')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('contacts').insert({
      name: name.trim(), role: role.trim() || null, company: company.trim() || null,
      context, origin, email: email.trim() || null,
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
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[480px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Nuevo contacto</div>

        <div className="mb-3">
          <label className={labelCls}>Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Rol</label>
            <input value={role} onChange={e => setRole(e.target.value)} className={inputCls} placeholder="Cargo" />
          </div>
          <div>
            <label className={labelCls}>Empresa</label>
            <input value={company} onChange={e => setCompany(e.target.value)} className={inputCls} placeholder="Empresa" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Contexto</label>
            <select value={context} onChange={e => setContext(e.target.value)} className={fieldCls}>
              {CONTEXTS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Origen</label>
            <select value={origin} onChange={e => setOrigin(e.target.value)} className={fieldCls}>
              {ORIGINS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls + ' font-mono text-xs'} placeholder="correo@empresa.com" />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear contacto'}
          </button>
        </div>
      </div>
    </div>
  )
}
