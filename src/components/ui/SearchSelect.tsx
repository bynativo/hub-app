import { useState, useEffect, useRef } from 'react'

interface Option {
  value: number
  label: string
}

interface Props {
  value: number | null
  options: Option[]
  onChange: (val: number | null) => void
  emptyLabel: string
  className?: string
}

export function SearchSelect({ value, options, onChange, emptyLabel, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  function handleSelect(val: number | null) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : (selected?.label ?? '')}
        placeholder={open ? 'Buscar…' : emptyLabel}
        onFocus={handleFocus}
        onChange={e => setQuery(e.target.value)}
        className={className}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-bg2 border border-black/10 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            onMouseDown={() => handleSelect(null)}
            className="w-full text-left px-3 py-2 text-[12px] text-gray-400 hover:bg-bg3 border-b border-black/5"
          >
            {emptyLabel}
          </button>
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => handleSelect(o.value)}
              className={`w-full text-left px-3 py-2 text-[12px] hover:bg-bg3 ${
                o.value === value ? 'text-claude font-medium' : 'text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-gray-400 italic">Sin resultados</div>
          )}
        </div>
      )}
    </div>
  )
}
