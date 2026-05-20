export function fmtDue(due: string | null): { text: string; urgent: boolean } | null {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const td = new Date()
  td.setHours(0, 0, 0, 0)
  const df = Math.round((d.getTime() - td.getTime()) / 86400000)
  if (df < 0) return { text: `Vencio hace ${Math.abs(df)}d`, urgent: true }
  if (df === 0) return { text: 'Hoy', urgent: true }
  if (df === 1) return { text: 'Manana', urgent: true }
  if (df <= 3) return { text: `${df} dias`, urgent: true }
  return { text: `${d.getDate()}/${d.getMonth() + 1}`, urgent: false }
}

export function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos dias'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function getTodayLabel(): string {
  const d = new Date()
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
  const mes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${dias[d.getDay()]} ${d.getDate()} ${mes[d.getMonth()]}`
}

export function ctxLabel(ctx: string): string {
  if (ctx === 'banco') return 'Banco Falabella'
  if (ctx === 'agencia') return 'Agencia'
  return 'Personal'
}

export function ctxColor(ctx: string): string {
  if (ctx === 'banco') return '#2563eb'
  if (ctx === 'agencia') return '#0d9488'
  return '#d97706'
}

export function priorityColor(p: string): string {
  if (p === 'alta') return '#dc2626'
  if (p === 'media') return '#d97706'
  return '#16a34a'
}
