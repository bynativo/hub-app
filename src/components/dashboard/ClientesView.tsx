import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { CaptureModal } from '../modals/CaptureModal'
import { RecurrenteModal } from '../modals/RecurrenteModal'

interface ClientForm {
  name: string
  contact_name: string
  contact_role: string
  service_scope: string
  proposal_url: string
  drive_folder_url: string
}

const EMPTY: ClientForm = { name: '', contact_name: '', contact_role: '', service_scope: '', proposal_url: '', drive_folder_url: '' }

export function ClientesView() {
  const clients = useStore(s => s.clients)
  const recurrentes = useStore(s => s.recurrentes)
  const tasks = useStore(s => s.tasks)
  const loadAll = useStore(s => s.loadAll)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<ClientForm>(EMPTY)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [recurrenteOpen, setRecurrenteOpen] = useState(false)

  const agClients = clients.filter(c => c.context === 'agencia')
  const selected = clients.find(c => c.id === selectedId) || null

  useEffect(() => {
    if (!selected) return
    setForm({
      name: selected.name || '',
      contact_name: selected.contact_name || '',
      contact_role: selected.contact_role || '',
      service_scope: selected.service_scope || '',
      proposal_url: selected.proposal_url || '',
      drive_folder_url: selected.drive_folder_url || '',
    })
    setDirty(false)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof ClientForm>(key: K, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  const clientRecurrentes = selected ? recurrentes.filter(r => r.client_id === selected.id) : []
  const clientTaskCount = selected ? tasks.filter(t => t.client_id === selected.id && !t.done).length : 0

  async function save() {
    if (!selected || !form.name.trim()) return
    setSaving(true)
    await supabase.from('clients').update({
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_role: form.contact_role.trim() || null,
      service_scope: form.service_scope.trim() || null,
      proposal_url: form.proposal_url.trim() || null,
      drive_folder_url: form.drive_folder_url.trim() || null,
    }).eq('id', selected.id)
    await loadAll()
    setSaving(false)
    setDirty(false)
  }

  const fieldCls = 'w-full bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]'
  const labelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#0d9488' }}>Clientes</h1>
      <p className="text-gray-500 text-[13px] mb-5">{agClients.length} clientes de agencia</p>

      <div className="grid grid-cols-2 gap-2.5">
        {agClients.map(c => {
          const color = c.color || '#0d9488'
          return (
            <div
              key={c.id}
              data-client-card
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              className={`bg-bg2 border rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all shadow-sm ${
                selectedId === c.id ? 'border-claude/20 shadow-md' : 'border-black/7 hover:border-black/13'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                <div className="text-[15px] font-medium">{c.name}</div>
              </div>
              <div className="text-[13px] text-gray-500 pl-[22px]">
                {c.contact_name || <span className="text-gray-400 italic">Sin contacto</span>}
                {c.contact_role && <span className="text-gray-400"> · {c.contact_role}</span>}
              </div>
            </div>
          )
        })}
        {!agClients.length && (
          <div className="col-span-2 text-center py-7 text-gray-400 text-[13px]">Sin clientes de agencia</div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden shadow-md animate-fade-in">
          <div className="p-4 border-b border-black/7 flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: selected.color || '#0d9488' }} />
              <div className="font-serif text-lg font-light" style={{ color: '#0d9488' }}>{selected.name}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setCaptureOpen(true)}
                className="text-xs bg-claude/7 border border-claude/20 text-claude px-3 py-1.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer"
              >
                + Crear tarea
              </button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-lg">✕</button>
            </div>
          </div>

          <div className="p-4">
            {/* Editable fields */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className={labelCls}>Nombre *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>Contacto</label>
                <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={fieldCls} placeholder="Nombre del contacto" />
              </div>
              <div>
                <label className={labelCls}>Rol</label>
                <input value={form.contact_role} onChange={e => set('contact_role', e.target.value)} className={fieldCls} placeholder="Cargo / rol" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Alcance del servicio</label>
                <textarea value={form.service_scope} onChange={e => set('service_scope', e.target.value)} rows={3}
                  className={fieldCls + ' resize-y'} placeholder="Qué servicios prestamos a este cliente..." />
              </div>
              <div>
                <label className={labelCls}>URL propuesta</label>
                <input value={form.proposal_url} onChange={e => set('proposal_url', e.target.value)} type="url"
                  className={fieldCls + ' font-mono text-xs'} placeholder="https://..." />
              </div>
              <div>
                <label className={labelCls}>Carpeta Drive</label>
                <input value={form.drive_folder_url} onChange={e => set('drive_folder_url', e.target.value)} type="url"
                  className={fieldCls + ' font-mono text-xs'} placeholder="https://drive..." />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              {(form.proposal_url || form.drive_folder_url) && (
                <div className="flex gap-2 mr-auto">
                  {form.proposal_url && (
                    <a href={form.proposal_url} target="_blank" rel="noreferrer"
                      className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md hover:bg-claude/15 transition-colors">
                      ↗ Propuesta
                    </a>
                  )}
                  {form.drive_folder_url && (
                    <a href={form.drive_folder_url} target="_blank" rel="noreferrer"
                      className="text-[11px] text-agencia bg-agencia/7 border border-agencia/20 px-2.5 py-1 rounded-md hover:bg-agencia/15 transition-colors">
                      ↗ Drive
                    </a>
                  )}
                </div>
              )}
              <button
                onClick={save}
                disabled={!dirty || !form.name.trim() || saving}
                className="ml-auto text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </div>

            {/* Recurrentes */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">
                Tareas recurrentes {clientTaskCount > 0 && <span className="text-gray-300">· {clientTaskCount} tareas activas</span>}
              </div>
              <button
                onClick={() => setRecurrenteOpen(true)}
                className="text-[11px] text-agencia bg-agencia/7 border border-agencia/20 px-2 py-0.5 rounded-md cursor-pointer hover:bg-agencia/15 transition-colors"
              >
                + Nueva recurrente
              </button>
            </div>
            {clientRecurrentes.length ? (
              <div className="flex flex-col gap-1.5">
                {clientRecurrentes.map(r => (
                  <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/7 bg-bg3">
                    <span className="text-[13px] flex-1">{r.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{r.freq}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                      {r.freq === 'semanal' ? r.day_of_month : r.freq === 'diaria' ? 'Todos los días' : `Día ${r.day_of_month}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin recurrentes para este cliente</div>
            )}
          </div>
        </div>
      )}

      {captureOpen && selected && (
        <CaptureModal onClose={() => setCaptureOpen(false)} preselectContext="agencia" preselectClientId={selected.id} />
      )}
      {recurrenteOpen && selected && (
        <RecurrenteModal onClose={() => setRecurrenteOpen(false)} preselectContext="agencia" preselectClientId={selected.id} />
      )}
    </div>
  )
}
