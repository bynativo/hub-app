import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxLabel } from '../../lib/helpers'
import { NewPresentationModal } from '../modals/NewPresentationModal'
import type { Presentation } from '../../lib/types'

export function PresentationsView({ context, onOpen }: { context?: string; onOpen: (id: number) => void }) {
  const presentations = useStore(s => s.presentations)
  const clients = useStore(s => s.clients)
  const [newOpen, setNewOpen] = useState<{ context: string; clientId: number | null } | null>(null)

  const list = context ? presentations.filter(p => p.context === context) : presentations
  const accent = context === 'agencia' ? '#0d9488' : context === 'banco' ? '#2563eb' : '#7c3aed'
  const newBtnCtx = context === 'agencia' ? 'agencia' : 'banco'

  const renderCard = (p: Presentation) => (
    <div
      key={p.id}
      onClick={() => onOpen(p.id)}
      className="bg-bg2 border border-black/7 rounded-xl overflow-hidden cursor-pointer hover:border-black/13 hover:shadow-md hover:-translate-y-px transition-all shadow-sm"
    >
      <div className="h-2" style={{ background: p.kv_color }} />
      <div className="p-3.5">
        <div className="text-[13px] font-medium mb-1">{p.title}</div>
        {p.subtitle && <div className="text-[11px] text-gray-400 mb-2">{p.subtitle}</div>}
        <div className="flex gap-1.5 flex-wrap">
          {p.tipo && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">{p.tipo}</span>}
          {p.month_label && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{p.month_label}</span>}
          {p.external_url && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">↗ externo</span>}
        </div>
      </div>
    </div>
  )

  const gridCls = 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3'
  const newBtnCls = 'text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors'

  // === Vista Agencia: carpetas por cliente + Agencia interna ===
  if (context === 'agencia') {
    const interna = list.filter(p => !p.client_id)
    const clientIds = [...new Set(list.filter(p => p.client_id).map(p => p.client_id as number))]
    const folders: { key: string; label: string; clientId: number | null; items: Presentation[] }[] = [
      { key: 'interna', label: 'Agencia interna', clientId: null, items: interna },
      ...clientIds.map(cid => ({
        key: `c${cid}`,
        label: clients.find(c => c.id === cid)?.name || `Cliente ${cid}`,
        clientId: cid,
        items: list.filter(p => p.client_id === cid),
      })),
    ]

    return (
      <div className="animate-fade-in p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>Presentaciones · Agencia</h1>
            <p className="text-gray-500 text-[13px]">{list.length} presentaciones · carpetas por cliente</p>
          </div>
          <button onClick={() => setNewOpen({ context: 'agencia', clientId: null })}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
            + Nueva presentación
          </button>
        </div>

        {folders.map(f => (
          <div key={f.key} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📁 {f.label} · {f.items.length}</div>
              <button onClick={() => setNewOpen({ context: 'agencia', clientId: f.clientId })} className={newBtnCls}>+ Nueva presentación</button>
            </div>
            {f.items.length
              ? <div className={gridCls}>{f.items.map(renderCard)}</div>
              : <div className="text-xs text-gray-400">Sin presentaciones en esta carpeta</div>}
          </div>
        ))}

        {newOpen && (
          <NewPresentationModal onClose={() => setNewOpen(null)} onCreated={onOpen}
            defaultContext={newOpen.context} defaultClientId={newOpen.clientId} />
        )}
      </div>
    )
  }

  // === Vista Banco / general ===
  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>
            Presentaciones{context ? ` · ${ctxLabel(context)}` : ''}
          </h1>
          <p className="text-gray-500 text-[13px]">{list.length} decks de contenido</p>
        </div>
        <button onClick={() => setNewOpen({ context: newBtnCtx, clientId: null })}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nueva presentación
        </button>
      </div>

      {list.length
        ? <div className={gridCls}>{list.map(renderCard)}</div>
        : <div className="text-center py-7 text-gray-400 text-[13px]">Sin presentaciones</div>}

      {newOpen && (
        <NewPresentationModal onClose={() => setNewOpen(null)} onCreated={onOpen}
          defaultContext={newOpen.context} defaultClientId={newOpen.clientId} />
      )}
    </div>
  )
}
