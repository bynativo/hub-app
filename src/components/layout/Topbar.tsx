import { getTodayLabel } from '../../lib/helpers'
import { useStore } from '../../lib/store'

export function Topbar() {
  const setView = useStore(s => s.setView)

  return (
    <header className="col-span-full bg-bg2 border-b border-black/7 flex items-center px-4 gap-3 h-[52px] z-10 shadow-sm">
      <div className="font-serif text-lg font-light">
        hub<span className="text-claude">·</span>trabajo
        <sub className="text-[10px] text-gray-400 font-mono align-middle ml-1">v8</sub>
      </div>
      <div className="font-mono text-[11px] text-gray-400 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md">
        {getTodayLabel()}
      </div>
      <div className="flex-1" />
      <button onClick={() => setView('recurrentes')} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-3 py-1 rounded-lg hover:bg-bg4 transition-colors">
        ↻ Recurrentes
      </button>
      <button onClick={() => setView('dashboard')} className="text-xs bg-claude border-claude text-white px-3 py-1 rounded-lg hover:bg-purple-700 transition-colors">
        + Capturar
      </button>
    </header>
  )
}
