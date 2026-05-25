import { useState } from 'react'
import { useStore } from '../../lib/store'

function fmtTime(d: Date) {
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}
function in4Hours(): Date {
  return new Date(Date.now() + 4 * 3600 * 1000)
}
function tomorrow9(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}
function nextMonday8(): Date {
  const d = new Date()
  const day = d.getDay() // 0=dom..6=sab
  const add = ((1 - day + 7) % 7) || 7 // próximo lunes (nunca hoy)
  d.setDate(d.getDate() + add)
  d.setHours(8, 0, 0, 0)
  return d
}

export function FollowupModal() {
  const pendingId = useStore(s => s.pendingFollowupTaskId)
  const tasks = useStore(s => s.tasks)
  const setFollowup = useStore(s => s.setFollowup)
  const closeFollowup = useStore(s => s.closeFollowup)
  const [specific, setSpecific] = useState('')

  const task = tasks.find(t => t.id === pendingId)
  if (!task) return null

  const d4 = in4Hours()
  const dTom = tomorrow9()
  const dMon = nextMonday8()
  const isToday4 = d4.toDateString() === new Date().toDateString()

  const choose = (at: string | null, type: string) => setFollowup(task.id, at, type)

  const optionCls = 'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-black/7 bg-bg3 hover:border-claude/30 hover:bg-claude/5 cursor-pointer transition-all text-left'

  return (
    <div className="fixed inset-0 bg-black/40 z-[320] flex items-start justify-center pt-16 overflow-y-auto backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) closeFollowup() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl p-6 w-[460px] max-w-[96vw] shadow-lg">
        <div className="flex items-start gap-2 mb-1">
          <span className="text-lg">⏰</span>
          <div className="flex-1">
            <div className="font-serif text-xl font-light">Recordatorio de seguimiento</div>
            <p className="text-[13px] text-gray-400 mt-0.5">
              "{task.title}" pasó a <span className="font-medium text-gray-600">{task.status}</span>. ¿Cuándo te lo recuerdo?
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <button className={optionCls} onClick={() => choose(d4.toISOString(), '4h')}>
            <span className="text-[13px] font-medium">En 4 horas</span>
            <span className="text-[12px] font-mono text-gray-400">{isToday4 ? 'hoy' : 'mañana'} {fmtTime(d4)}</span>
          </button>

          <button className={optionCls} onClick={() => choose(dTom.toISOString(), 'tomorrow_9')}>
            <span className="text-[13px] font-medium">Mañana a las 9:00</span>
            <span className="text-[12px] font-mono text-gray-400">{fmtDate(dTom)}</span>
          </button>

          <button className={optionCls} onClick={() => choose(dMon.toISOString(), 'monday_8')}>
            <span className="text-[13px] font-medium">Inicio de semana · lunes 8:00</span>
            <span className="text-[12px] font-mono text-gray-400">{fmtDate(dMon)}</span>
          </button>

          <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-black/7 bg-bg3">
            <span className="text-[13px] font-medium shrink-0">Fecha específica</span>
            <input type="date" value={specific} onChange={e => setSpecific(e.target.value)}
              className="ml-auto bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20" />
            <button
              disabled={!specific}
              onClick={() => { const d = new Date(specific + 'T09:00:00'); choose(d.toISOString(), 'specific') }}
              className="text-[11px] bg-claude text-white px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed">
              OK
            </button>
          </div>

          <button className={optionCls + ' justify-center text-gray-400'} onClick={() => choose(null, 'none')}>
            <span className="text-[13px]">Sin recordatorio</span>
          </button>
        </div>
      </div>
    </div>
  )
}
