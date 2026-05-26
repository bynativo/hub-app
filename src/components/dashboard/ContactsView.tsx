import { useState } from 'react'
import { useStore } from '../../lib/store'
import { NewContactModal } from '../modals/NewContactModal'

const CTX_BADGE: Record<string, { label: string; color: string }> = {
  banco: { label: 'Banco', color: '#2563eb' },
  agencia: { label: 'Agencia', color: '#0d9488' },
  personal: { label: 'Personal', color: '#d97706' },
  red: { label: 'Red', color: '#7c3aed' },
}
const ORIGIN_LABEL: Record<string, string> = {
  email: 'email extraído', reunion: 'reunión', manual: 'manual',
}

export function ContactsView({ context, title = 'Contactos' }: { context?: string; title?: string }) {
  const allContacts = useStore(s => s.contacts)
  const [query, setQuery] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const base = context ? allContacts.filter(c => c.context === context) : allContacts
  const q = query.trim().toLowerCase()
  const contacts = q
    ? base.filter(c => [c.name, c.role, c.company].filter(Boolean).some(v => v!.toLowerCase().includes(q)))
    : base

  function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  }

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5">{title}</h1>
          <p className="text-gray-500 text-[13px]">{base.length} contacto{base.length !== 1 ? 's' : ''}{context ? '' : ' · CRM global'}</p>
        </div>
        <button onClick={() => setNewOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nuevo contacto
        </button>
      </div>

      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, rol o empresa…"
        className="w-full max-w-[420px] bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)] mb-4" />

      {contacts.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
          {contacts.map(c => {
            const badge = CTX_BADGE[c.context || ''] || { label: c.context || '—', color: '#6b7280' }
            return (
              <div key={c.id} className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm flex items-start gap-3">
                <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[12px] font-medium text-white" style={{ background: badge.color }}>
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium leading-snug">{c.name}</div>
                  <div className="text-[12px] text-gray-500">
                    {c.role || <span className="text-gray-400 italic">sin rol</span>}
                    {c.company && <span className="text-gray-400"> · {c.company}</span>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: badge.color + '14', color: badge.color }}>{badge.label}</span>
                    {c.origin && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{ORIGIN_LABEL[c.origin] || c.origin}</span>}
                    {c.email && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 truncate max-w-[160px]">{c.email}</span>}
                    {c.phone && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">📞 {c.phone}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-10 text-gray-400 text-[13px]">
          {q ? 'Sin contactos que coincidan con la búsqueda.' : 'Sin contactos todavía. Agregá el primero.'}
        </div>
      )}

      {newOpen && <NewContactModal onClose={() => setNewOpen(false)} defaultContext={context || 'agencia'} />}
    </div>
  )
}
