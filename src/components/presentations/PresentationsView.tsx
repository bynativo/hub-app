import { useState } from 'react'
import { useStore } from '../../lib/store'

export function PresentationsView({ onOpen }: { onOpen: (id: number) => void }) {
  const { presentations } = useStore()
  const [filter, setFilter] = useState<string>('all')
  const filtered = filter === 'all' ? presentations : presentations.filter(p => p.context === filter)

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Presentaciones</h1>
      <p className="text-gray-500 text-[13px] mb-4">Decks de contenido</p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'banco', label: 'Banco Falabella' },
          { key: 'agencia', label: 'Agencia' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1 rounded-lg border transition-all cursor-pointer ${
              filter === f.key
                ? 'border-claude/20 text-claude bg-claude/7'
                : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {filtered.map(p => (
          <div
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="bg-bg2 border border-black/7 rounded-xl overflow-hidden cursor-pointer hover:border-black/13 hover:shadow-md hover:-translate-y-px transition-all shadow-sm"
          >
            <div className="h-2" style={{ background: p.kv_color }} />
            <div className="p-3.5">
              <div className="text-[13px] font-medium mb-1">{p.title}</div>
              {p.subtitle && <div className="text-[11px] text-gray-400 mb-2">{p.subtitle}</div>}
              <div className="flex gap-1.5">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: p.kv_color + '18', color: p.kv_color }}>
                  {p.context}
                </span>
                {p.month_label && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                    {p.month_label}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
