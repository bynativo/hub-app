import { getTodayLabel } from '../../lib/helpers'

export function Topbar() {
  return (
    <header className="bg-bg2 border-b border-black/7 flex items-center px-4 gap-3 h-[52px] shrink-0 z-10 shadow-sm">
      <div className="font-serif text-lg font-light">
        hub<span className="text-claude">·</span>trabajo
        <sub className="text-[10px] text-gray-400 font-mono align-middle ml-1">v9</sub>
      </div>
      <div className="font-mono text-[11px] text-gray-400 bg-bg3 border border-black/7 px-2.5 py-1 rounded-md">
        {getTodayLabel()}
      </div>
      <div className="flex-1" />
    </header>
  )
}
