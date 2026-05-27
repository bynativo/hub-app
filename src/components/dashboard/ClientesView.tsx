import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { REDES } from '../../lib/constants'
import { RecurrenteModal } from '../modals/RecurrenteModal'
import { QuickClientModal } from '../modals/QuickClientModal'
import type { Recurrente } from '../../lib/types'

interface ClientForm {
  name: string
  sigla: string
  website_url: string
  contact_name: string
  contact_role: string
  service_scope: string
  proposal_url: string
  drive_folder_url: string
}

const EMPTY: ClientForm = { name: '', sigla: '', website_url: '', contact_name: '', contact_role: '', service_scope: '', proposal_url: '', drive_folder_url: '' }

export function ClientesView() {
  const clients = useStore(s => s.clients)
  const recurrentes = useStore(s => s.recurrentes)
  const tasks = useStore(s => s.tasks)
  const projects = useStore(s => s.projects)
  const loadAll = useStore(s => s.loadAll)
  const openCapture = useStore(s => s.openCapture)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<ClientForm>(EMPTY)
  const [social, setSocial] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recurrenteOpen, setRecurrenteOpen] = useState(false)
  const [editingRec, setEditingRec] = useState<Recurrente | null>(null)
  const [newClientOpen, setNewClientOpen] = useState(false)

  const agClients = clients.filter(c => c.context === 'agencia')
  const selected = clients.find(c => c.id === selectedId) || null

  useEffect(() => {
    if (!selected) return
    setForm({
      name: selected.name || '',
      sigla: selected.sigla || '',
      website_url: selected.website_url || '',
      contact_name: selected.contact_name || '',
      contact_role: selected.contact_role || '',
      service_scope: selected.service_scope || '',
      proposal_url: selected.proposal_url || '',
      drive_folder_url: selected.drive_folder_url || '',
    })
    setSocial(selected.social_links || {})
    setDirty(false)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof ClientForm>(key: K, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  function addSocial(v: string) { setSocial(prev => ({ ...prev, [v]: '' })); setDirty(true) }
  function removeSocial(v: string) { setSocial(prev => { const n = { ...prev }; delete n[v]; return n }); setDirty(true) }
  function setSocialUrl(v: string, url: string) { setSocial(prev => ({ ...prev, [v]: url })); setDirty(true) }

  const clientRecurrentes = selected ? recurrentes.filter(r => r.client_id === selected.id) : []
  const clientProjects = selected ? projects.filter(p => p.client_id === selected.id) : []
  const clientTaskCount = selected ? tasks.filter(t => t.client_id === selected.id && !t.done).length : 0

  const activos = agClients.filter(c => c.tipo !== 'prospecto')
  const prospectos = agClients.filter(c => c.tipo === 'prospecto')

  async function save() {
    if (!selected || !form.name.trim()) return
    setSaving(true)
    await supabase.from('clients').update({
      name: form.name.trim(),
      sigla: form.sigla.trim().toUpperCase() || null,
      website_url: form.website_url.trim() || null,
      social_links: social,
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

  const renderCard = (c: typeof clients[number]) => {
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
          <div className="text-[15px] font-medium flex-1">{c.name}</div>
          {c.sigla && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{c.sigla}</span>}
          {c.tipo === 'prospecto'
            ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn">prospecto</span>
            : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success">activo</span>}
        </div>
        <div className="text-[13px] text-gray-500 pl-[22px]">
          {c.contact_name || <span className="text-gray-400 italic">Sin contacto</span>}
          {c.contact_role && <span className="text-gray-400"> · {c.contact_role}</span>}
        </div>
      </div>
    )
  }

  const sectionLabelCls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2'

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#0d9488' }}>Clientes</h1>
          <p className="text-gray-500 text-[13px]">{agClients.length} clientes de agencia</p>
        </div>
        <button onClick={() => setNewClientOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nuevo cliente
        </button>
      </div>

      {!agClients.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">Sin clientes de agencia</div>
      ) : (
        <>
          <div className={sectionLabelCls}>● Activos · {activos.length}</div>
          {activos.length
            ? <div className="grid grid-cols-2 gap-2.5">{activos.map(renderCard)}</div>
            : <div className="text-xs text-gray-400">Sin clientes activos</div>}

          <div className={sectionLabelCls + ' mt-5'}>○ Prospectos · {prospectos.length}</div>
          {prospectos.length
            ? <div className="grid grid-cols-2 gap-2.5">{prospectos.map(renderCard)}</div>
            : <div className="text-xs text-gray-400">Sin prospectos</div>}
        </>
      )}

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
                onClick={() => openCapture({ context: 'agencia', clientId: selected.id })}
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
                <label className={labelCls}>Sigla / nomenclatura</label>
                <input value={form.sigla} onChange={e => set('sigla', e.target.value.toUpperCase().slice(0, 4))} maxLength={4}
                  className={fieldCls + ' uppercase font-mono'} placeholder="Ej: CPC" />
              </div>
              <div>
                <label className={labelCls}>URL sitio web</label>
                <input value={form.website_url} onChange={e => set('website_url', e.target.value)} type="url"
                  className={fieldCls + ' font-mono text-xs'} placeholder="https://..." />
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

            {/* Redes sociales — el usuario agrega solo las que existen para el cliente */}
            <div className="mb-4">
              <label className={labelCls}>Redes sociales</label>
              {REDES.some(r => r.v in social) && (
                <div className="flex flex-col gap-1.5 mb-2">
                  {REDES.filter(r => r.v in social).map(r => (
                    <div key={r.v} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono w-16 shrink-0 font-medium" style={{ color: r.color }}>{r.label}</span>
                      <input value={social[r.v]} onChange={e => setSocialUrl(r.v, e.target.value)} type="url"
                        className={fieldCls + ' flex-1 font-mono text-xs'} placeholder="https://..." />
                      <button onClick={() => removeSocial(r.v)} title="Quitar red"
                        className="text-gray-300 hover:text-danger text-sm cursor-pointer shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {REDES.filter(r => !(r.v in social)).map(r => (
                  <button key={r.v} onClick={() => addSocial(r.v)}
                    className="text-[11px] font-mono px-2 py-1 rounded-md border border-black/7 bg-bg3 hover:bg-bg4 cursor-pointer transition-colors"
                    style={{ color: r.color }}>+ {r.label}</button>
                ))}
                {REDES.every(r => r.v in social) && <span className="text-[11px] text-gray-400">Todas las redes agregadas</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              {(form.website_url || form.proposal_url || form.drive_folder_url) && (
                <div className="flex gap-2 mr-auto flex-wrap">
                  {form.website_url && (
                    <a href={form.website_url} target="_blank" rel="noreferrer"
                      className="text-[11px] text-gray-600 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md hover:bg-bg4 transition-colors">
                      ↗ Sitio web
                    </a>
                  )}
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

            {/* Proyectos vinculados */}
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">
              Proyectos vinculados {clientProjects.length > 0 && <span className="text-gray-300">· {clientProjects.length}</span>}
            </div>
            {clientProjects.length ? (
              <div className="flex flex-col gap-1.5 mb-5">
                {clientProjects.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/7 bg-bg3">
                    <span className="text-[13px] flex-1">📁 {p.name}</span>
                    {(p.tipo_agencia || p.type) && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">🏷 {p.tipo_agencia || p.type}</span>}
                    {p.status && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{p.status}</span>}
                    {p.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{p.due_date.slice(5).replace('-', '/')}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 mb-5">Sin proyectos para este cliente</div>
            )}

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
                  <div key={r.id} onClick={() => setEditingRec(r)}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-black/7 bg-bg3 cursor-pointer hover:border-black/13 hover:shadow-sm transition-all">
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

      {recurrenteOpen && selected && (
        <RecurrenteModal onClose={() => setRecurrenteOpen(false)} preselectContext="agencia" preselectClientId={selected.id} />
      )}
      {editingRec && (
        <RecurrenteModal onClose={() => setEditingRec(null)} recurrente={editingRec} />
      )}
      {newClientOpen && (
        <QuickClientModal onClose={() => setNewClientOpen(false)} onCreated={id => setSelectedId(id)} />
      )}
    </div>
  )
}
