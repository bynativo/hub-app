import { PUB_TYPES } from '../../lib/constants'
import { tipoShortLabel } from '../../lib/helpers'

export type TipoConCantidad = { tipo: string; cantidad: number }

// Widget de checkboxes + contadores (− N +) para elegir tipos de contenido por
// perfil de influencer. Cada tipo activo va al array como {tipo, cantidad}; al
// destildar se quita. Los 7 tipos están divididos visualmente en dos grupos
// (van a grilla / solo calendario Influencers).
export function TiposChecklist({
  value,
  onChange,
}: {
  value: TipoConCantidad[]
  onChange: (next: TipoConCantidad[]) => void
}) {
  function find(tipo: string): TipoConCantidad | undefined {
    return value.find(v => v.tipo === tipo)
  }

  function toggle(tipo: string) {
    const exists = find(tipo)
    if (exists) onChange(value.filter(v => v.tipo !== tipo))
    else onChange([...value, { tipo, cantidad: 1 }])
  }

  function setCantidad(tipo: string, cantidad: number) {
    if (cantidad < 1) { onChange(value.filter(v => v.tipo !== tipo)); return }
    onChange(value.map(v => v.tipo === tipo ? { ...v, cantidad } : v))
  }

  const grilla = PUB_TYPES.slice(0, 4)
  const soloInfl = PUB_TYPES.slice(4)

  const Row = ({ v, label }: { v: string; label: string }) => {
    const item = find(v)
    const active = !!item
    return (
      <div className="flex items-center gap-2 py-0.5">
        <button
          type="button"
          onClick={() => toggle(v)}
          className={`w-4 h-4 rounded border-[1.5px] shrink-0 flex items-center justify-center text-[10px] cursor-pointer transition-colors ${
            active ? 'bg-claude border-claude text-white' : 'border-black/25 hover:border-claude'
          }`}
          title={active ? 'Quitar' : 'Activar'}
        >
          {active && '✓'}
        </button>
        <span
          onClick={() => toggle(v)}
          className={`text-[12px] flex-1 cursor-pointer ${active ? 'text-gray-900' : 'text-gray-600'}`}
        >
          {label}
        </span>
        {active && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCantidad(v, item!.cantidad - 1)}
              className="w-5 h-5 rounded border border-black/13 text-[12px] text-gray-500 hover:border-claude hover:text-claude cursor-pointer flex items-center justify-center leading-none"
              title="Menos"
            >−</button>
            <span className="w-5 text-center text-[12px] font-mono text-claude font-medium">{item!.cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad(v, item!.cantidad + 1)}
              className="w-5 h-5 rounded border border-black/13 text-[12px] text-gray-500 hover:border-claude hover:text-claude cursor-pointer flex items-center justify-center leading-none"
              title="Más"
            >+</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase">Van a grilla + cal. RRSS + cal. Influencers</div>
      <div className="flex flex-col">
        {grilla.map(o => <Row key={o.v} v={o.v} label={o.label} />)}
      </div>
      <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase mt-2">Solo calendario de Influencers</div>
      <div className="flex flex-col">
        {soloInfl.map(o => <Row key={o.v} v={o.v} label={o.label} />)}
      </div>
    </div>
  )
}

// Badges compactos para mostrar el resumen de tipos de un perfil. "Story IG ×2"
export function TiposSummary({ value }: { value: TipoConCantidad[] }) {
  if (!value || !value.length) {
    return <span className="text-[11px] text-gray-400 italic">Sin tipos seleccionados</span>
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {value.map(it => (
        <span key={it.tipo} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/10 text-claude font-medium">
          {tipoShortLabel(it.tipo)} ×{it.cantidad}
        </span>
      ))}
    </div>
  )
}
