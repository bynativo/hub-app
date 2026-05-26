import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { TIPO_PRESENTACION } from '../../lib/constants'
import { ctxColor } from '../../lib/helpers'

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
    + '-' + Math.random().toString(36).slice(2, 6)
}

export function NewPresentationModal({ onClose, onCreated, defaultContext = 'banco', defaultClientId = null }: {
  onClose: () => void
  onCreated?: (id: number) => void
  defaultContext?: string
  defaultClientId?: number | null
}) {
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const agClients = clients.filter(c => c.context === 'agencia')

  const [title, setTitle] = useState('')
  const [tipo, setTipo] = useState(TIPO_PRESENTACION[0])
  const [context, setContext] = useState(defaultContext)
  const [clientId, setClientId] = useState<number | null>(defaultClientId)
  const [monthLabel, setMonthLabel] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const isGrilla = tipo === 'Grilla mensual'
  const isExternal = tipo === 'General (link externo)'

  async function save() {
    if (!title.trim()) return
    if (isExternal && !externalUrl.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('presentations').insert({
      slug: slugify(title), title: title.trim(), context,
      client_id: context === 'agencia' ? clientId : null,
      kv_color: ctxColor(context),
      month_label: isGrilla ? (monthLabel.trim() || null) : null,
      tipo,
      external_url: isExternal ? externalUrl.trim() : null,
      share_enabled: false,
    }).select().single()
    if (error || !data) { alert('Error: ' + error?.message); setSaving(false); return }
    await loadAll()
    onCreated?.(data.id)
    onClose()
  }

  const fieldCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer focus:border-claude/20 focus:bg-bg2'
  const inputCls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-start justify-center pt-16 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[480px] max-w-[96vw] mb-10 shadow-lg">
        <div className="font-serif text-xl font-light mb-4">Nueva presentación</div>

        <div className="mb-3">
          <label className={labelCls}>Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Ej: Grilla junio · Café Aurora" autoFocus />
        </div>

        <div className="mb-3">
          <label className={labelCls}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={fieldCls}>
            {TIPO_PRESENTACION.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Contexto</label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }} className={fieldCls}>
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
            </select>
          </div>
          {context === 'agencia' && (
            <div>
              <label className={labelCls}>Cliente</label>
              <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)} className={fieldCls}>
                <option value="">Agencia interna</option>
                {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {isGrilla && (
          <div className="mb-3">
            <label className={labelCls}>Mes / etiqueta</label>
            <input value={monthLabel} onChange={e => setMonthLabel(e.target.value)} className={inputCls} placeholder="Ej: Junio 2026" />
          </div>
        )}

        {isExternal && (
          <div className="mb-3">
            <label className={labelCls}>Link externo *</label>
            <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} type="url" className={inputCls + ' font-mono text-xs'} placeholder="https://… (Canva, Slides, PDF…)" />
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={!title.trim() || (isExternal && !externalUrl.trim()) || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear presentación'}
          </button>
        </div>
      </div>
    </div>
  )
}
