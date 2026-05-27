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
  const [esInterno, setEsInterno] = useState(false)
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [noDueDate, setNoDueDate] = useState(false)
  const [status, setStatus] = useState('activo')
  const [tipoAgencia, setTipoAgencia] = useState(TIPO_AGENCIA[0])
  const [saving, setSaving] = useState(false)

  // En agencia, un proyecto de cliente exige cliente; el interno no lleva cliente.
  const needsClient = context === 'agencia' && !esInterno

  async function save() {
    if (!name.trim()) return
    if (needsClient && !clientId) return
    setSaving(true)
    const { error } = await supabase.from('projects').insert({
      name: name.trim(), context, client_id: needsClient ? clientId : null,
      es_interno: context === 'agencia' ? esInterno : false,
      description: description.trim() || null, due_date: noDueDate ? null : (dueDate || null),
      is_ongoing: noDueDate, status, type: 'proyecto',
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
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null); setEsInterno(false) }} className={fieldCls}>
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
          <>
            <div className="mb-3">
              <label className={labelCls}>Tipo de vínculo</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: false, l: 'Vinculado a cliente' },
                  { v: true, l: 'Proyecto interno de agencia' },
                ] as { v: boolean; l: string }[]).map(o => (
                  <button key={String(o.v)} onClick={() => { setEsInterno(o.v); if (o.v) setClientId(null) }}
                    className={`py-2 px-1 border rounded-lg text-[12px] text-center cursor-pointer transition-all ${
                      esInterno === o.v ? 'border-claude/20 text-claude bg-claude/7 font-medium' : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                    }`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {!esInterno && (
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
                    className={fieldCls + (needsClient && !clientId ? ' border-danger/60 bg-danger/5' : '')}>
                    <option value="">Seleccionar cliente…</option>
                    {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className={esInterno ? 'col-span-2' : ''}>
                <label className={labelCls}>Tipo de proyecto</label>
                <select value={tipoAgencia} onChange={e => setTipoAgencia(e.target.value)} className={fieldCls}>
                  {TIPO_AGENCIA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>Fecha de término</label>
            <button type="button" onClick={() => setNoDueDate(v => !v)} className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <span className={`w-8 h-4 rounded-full relative transition-colors ${noDueDate ? 'bg-claude' : 'bg-bg4'}`}>
                <span className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${noDueDate ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
              Sin fecha de término definida
            </button>
          </div>
          {noDueDate
            ? <div className="text-[11px] text-gray-400">El proyecto quedará como <span className="text-claude font-medium">Ongoing</span> (sin fecha de término).</div>
            : <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={fieldCls} />}
        </div>

        <div className="mb-4">
          <label className={labelCls}>Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputCls + ' resize-y'} placeholder="De qué trata el proyecto…" />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={!name.trim() || (needsClient && !clientId) || saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}
