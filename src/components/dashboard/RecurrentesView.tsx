import { useStore } from '../../lib/store'

export function RecurrentesView() {
  const { recurrentes } = useStore()

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Recurrentes</h1>
      <p className="text-gray-500 text-[13px] mb-5">Generacion automatica mensual</p>

      <div className="flex flex-col gap-2">
        {recurrentes.map(r => (
          <div key={r.id} className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[13px] font-medium">{r.title}</div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{r.freq}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: r.context === 'banco' ? 'rgba(37,99,235,0.07)' : 'rgba(13,148,136,0.07)',
                      color: r.context === 'banco' ? '#2563eb' : '#0d9488'
                    }}>
                {r.context}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                Dia {r.day_of_month} · {r.time_minutes}min
              </span>
              {r.clients && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">
                  {r.clients.name}
                </span>
              )}
              {(r.cats || []).slice(0, 3).map(c => (
                <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">#{c}</span>
              ))}
            </div>
          </div>
        ))}
        {!recurrentes.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin recurrentes configuradas</div>
        )}
      </div>
    </div>
  )
}
