import { useState } from 'react'

// Patron uniforme de seleccion fecha+hora para recordatorios.
// Date picker + 4 horas clave + "Otra hora" + resumen. Evita el datetime-local
// nativo (que en algunos browsers permite minutos arbitrarios y resulta
// confuso).
//
// API: value = 'YYYY-MM-DDTHH:mm' (o '' para vacio). onChange dispara cada
// vez que cambia date o time. Al elegir fecha se setea automaticamente la
// hora a 09:00 si no habia hora previa.

const PRESETS = [
  { v: '09:00', l: '9:00 AM', s: 'Inicio del día' },
  { v: '11:00', l: '11:00 AM', s: 'Media mañana' },
  { v: '15:00', l: '3:00 PM', s: 'Inicio de la tarde' },
  { v: '17:00', l: '5:00 PM', s: 'Fin del día' },
] as const

const PRESET_VALUES = PRESETS.map(p => p.v) as readonly string[]

function splitVal(v: string): { date: string; time: string } {
  if (!v) return { date: '', time: '' }
  const [d, t = ''] = v.split('T')
  return { date: d, time: t.slice(0, 5) }
}

export function ReminderDateTimePicker({
  value,
  onChange,
  dateLabel = 'Fecha del recordatorio',
  timeLabel = 'Hora',
  showSummary = true,
}: {
  value: string
  onChange: (v: string) => void
  dateLabel?: string
  timeLabel?: string
  showSummary?: boolean
}) {
  const { date, time } = splitVal(value)
  // customTime se inicializa segun el valor inicial. Se mantiene como state
  // para que el usuario pueda alternar la vista (input manual) sin que cambie
  // el time efectivo.
  const [customTime, setCustomTime] = useState(!!time && !PRESET_VALUES.includes(time))

  const fld = 'w-full bg-bg3 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'
  const lbl = 'block text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1'

  function setDate(d: string) {
    if (!d) { onChange(''); return }
    onChange(`${d}T${time || '09:00'}`)
  }
  function setTime(t: string) {
    if (!date) return
    onChange(`${date}T${t}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className={lbl}>{dateLabel}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={fld} />
      </div>
      {date && (
        <div>
          <label className={lbl}>{timeLabel}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map(p => {
              const active = !customTime && time === p.v
              return (
                <button key={p.v} type="button"
                  onClick={() => { setTime(p.v); setCustomTime(false) }}
                  className={`flex flex-col items-center py-1.5 px-1 border rounded-lg cursor-pointer transition-all ${
                    active ? 'border-claude/30 bg-claude/10 text-claude font-medium' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
                  }`}>
                  <span className="text-[12px] leading-tight">{p.l}</span>
                  <span className="text-[9px] font-mono mt-0.5 opacity-70">{p.s}</span>
                </button>
              )
            })}
          </div>
          <button type="button"
            onClick={() => setCustomTime(c => !c)}
            className={`mt-2 w-full text-[11px] py-1.5 px-2 border rounded-md cursor-pointer transition-all ${
              customTime ? 'border-claude/30 bg-claude/7 text-claude font-medium' : 'border-black/7 bg-bg3 text-gray-500 hover:bg-bg4'
            }`}>
            {customTime ? '▼ Otra hora' : '▸ Otra hora'}
          </button>
          {customTime && (
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={fld + ' mt-1.5'} />
          )}
          {showSummary && time && (
            <div className="mt-2 text-[11px] text-gray-500 bg-claude/5 border border-claude/15 rounded-md px-2.5 py-1.5">
              Te avisaremos el <span className="font-medium text-claude">{new Date(`${date}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</span> a las <span className="font-medium text-claude">{time}</span>.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
