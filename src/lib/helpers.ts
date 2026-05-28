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

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayISO(): string {
  return localISO(new Date())
}

// Suma (o resta, con n negativo) días a una fecha ISO YYYY-MM-DD.
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localISO(d)
}

export function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localISO(d)
}

// Lunes a domingo de la próxima semana (ISO YYYY-MM-DD).
export function nextWeekRange(): { from: string; to: string } {
  const dow = new Date().getDay() // 0=dom..6=sab
  const toMon = ((1 - dow + 7) % 7) || 7 // días hasta el próximo lunes (si hoy es lunes, +7)
  const from = addDaysISO(todayISO(), toMon)
  return { from, to: addDaysISO(from, 6) }
}

// Dias desde hoy hasta `due` (negativo = vencida). null si no hay fecha.
export function daysUntil(due: string | null): number | null {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const td = new Date()
  td.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - td.getTime()) / 86400000)
}

// Formatea horas estimadas: 0.25 -> "15min", 0.5 -> "30min", 2 -> "2h", 1.5 -> "1.5h"
export function fmtHoras(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}min`
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`
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

// ===== Nomenclatura automática de títulos de tareas =====
// banco → "BF" | agencia interna → "INF" | agencia con cliente → "INF | SIGLA" | personal → ""
export function taskPrefix(context: string, client?: { sigla?: string | null; name: string } | null): string {
  if (context === 'banco') return 'BF'
  if (context === 'agencia') {
    if (!client) return 'INF'
    const sigla = (client.sigla?.trim() || client.name.slice(0, 3)).toUpperCase()
    return `INF | ${sigla}`
  }
  return '' // personal: sin prefijo
}

// Construye el título completo a guardar: "PREFIJO | nombre" (o solo el nombre si no hay prefijo).
export function buildTitle(prefix: string, cleanName: string): string {
  const c = cleanName.trim()
  return prefix ? `${prefix} | ${c}` : c
}

// Separa un título guardado en { prefix, name } para mostrarlos con estilos distintos.
export function splitTitle(title: string): { prefix: string; name: string } {
  let m = title.match(/^\s*INF\s*\|\s*([A-Z0-9]{2,6})\s*\|\s*(.*)$/is)
  if (m) return { prefix: `INF | ${m[1].toUpperCase()}`, name: m[2] }
  m = title.match(/^\s*INF\s*\|\s*(.*)$/is)
  if (m) return { prefix: 'INF', name: m[1] }
  m = title.match(/^\s*BF\s*\|\s*(.*)$/is)
  if (m) return { prefix: 'BF', name: m[1] }
  return { prefix: '', name: title }
}

// Quita el prefijo de nomenclatura, dejando el nombre limpio (para editar sin duplicar).
export function stripPrefix(title: string): string {
  return splitTitle(title).name
}

// Texto del badge de atraso para una tarea vencida ("3 días", "1 semana", "2 meses…").
// Devuelve null si no está atrasada o no tiene fecha.
export function overdueLabel(dueIso: string | null): string | null {
  if (!dueIso) return null
  const d = new Date(dueIso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (days <= 0) return null
  if (days === 1) return '1 día de atraso'
  if (days < 7) return `${days} días de atraso`
  if (days < 14) return '1 semana de atraso'
  if (days < 30) return `${Math.floor(days / 7)} semanas de atraso`
  if (days < 60) return '1 mes de atraso'
  return `${Math.floor(days / 30)} meses de atraso`
}

// Badge según el tipo de publicación de contenido (influencer/colab). null = producción propia.
export function pubTypeBadge(pt: string | null): { label: string; color: string } | null {
  if (pt === 'colab_ig') return { label: 'Colab', color: '#7c3aed' }
  if (pt === 'tiktok_propia') return { label: 'Influencer', color: '#e1306c' }
  if (pt === 'cuenta_influencer') return { label: 'Influencer externo', color: '#e1306c' }
  return null
}

// Una pieza "va a grilla" (producible) salvo la que se publica desde la cuenta del influencer.
export function vaAGrilla(pt: string | null): boolean {
  return pt !== 'cuenta_influencer'
}

// Contenido: la entrega (due) debe ser al menos 24h antes de la publicación.
// Devuelve la fecha mínima sugerida de entrega si NO se cumple; null si está OK o faltan datos.
export function deliveryWarning(due: string | null, publish: string | null): string | null {
  if (!due || !publish) return null
  const minDelivery = addDaysISO(publish, -1)
  return due > minDelivery ? minDelivery : null
}
