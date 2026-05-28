import { useEffect, useState } from 'react'
import { useStore } from '../../lib/store'

// Toast simple en bottom-center. Único slot — un toast nuevo reemplaza al anterior.
// Auto-dismiss vía timer del store. Para los toasts con acción (ej. Deshacer)
// mostramos una barrita que cuenta el tiempo restante hasta el dismiss.
export function Toast() {
  const toast = useStore(s => s.toast)
  const dismiss = useStore(s => s.dismissToast)
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(1)

  useEffect(() => {
    if (!toast) { setRemaining(0); setTotal(1); return }
    const initial = Math.max(1, toast.expiresAt - Date.now())
    setRemaining(initial); setTotal(initial)
    const interval = setInterval(() => {
      const r = toast.expiresAt - Date.now()
      setRemaining(r > 0 ? r : 0)
    }, 100)
    return () => clearInterval(interval)
  }, [toast?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null
  const pctRemaining = Math.min(100, Math.max(0, (remaining / total) * 100))

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] animate-fade-in">
      <div className="bg-bg2 border border-black/13 shadow-lg rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="text-[13px] text-gray-700 max-w-[420px] truncate">{toast.message}</span>
          {toast.actionLabel && toast.actionFn && (
            <button
              onClick={async () => {
                await toast.actionFn!()
              }}
              className="text-[12px] font-medium text-claude bg-claude/7 border border-claude/20 px-2.5 py-0.5 rounded-md hover:bg-claude hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            onClick={dismiss}
            className="text-[12px] text-gray-400 hover:text-gray-700 cursor-pointer shrink-0 leading-none"
            title="Cerrar"
          >✕</button>
        </div>
        {toast.actionLabel && (
          <div className="h-[2px] bg-claude/15">
            <div className="h-full bg-claude transition-all" style={{ width: `${pctRemaining}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
