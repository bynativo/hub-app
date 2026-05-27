// Parser LOCAL del formato estructurado que Claude genera en otros chats, p.ej.:
//   BF | Nombre de tarea  Tipo: Subtarea del proyecto | Prioridad: Alta | Entrega: 13 junio | Estimado: 3h — descripción
// Si el texto pegado ya viene en este formato, lo parseamos sin llamar a la API.

export interface RawTask {
  context: 'banco' | 'agencia' | 'personal'
  sigla: string | null
  title: string
  tipoRaw: string
  prioridad: string
  due_date: string | null
  estimated_hours: number | null
  desc: string
  phase: string | null
  updateHint: boolean
}

export interface StructuredParse {
  project: string | null
  tasks: RawTask[]
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function iso(y: number, mo: number, d: number) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// "13 junio" | "13 de junio" | "13/06" | "13-06-2026" | "2026-06-13"
function parseDate(s: string): string | null {
  const t = s.trim().toLowerCase()
  if (!t) return null
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
  if (m) {
    let y = m[3] ? +m[3] : new Date().getFullYear()
    if (y < 100) y += 2000
    return iso(y, +m[2], +m[1])
  }
  m = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)(?:\s+(\d{4}))?/i)
  if (m && MONTHS[m[2]]) {
    const y = m[3] ? +m[3] : new Date().getFullYear()
    return iso(y, MONTHS[m[2]], +m[1])
  }
  return null
}

// "3h" | "1.5h" | "30min" | "90 min"
function parseHours(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (!t) return null
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*h/)
  if (m) return parseFloat(m[1].replace(',', '.'))
  m = t.match(/(\d+)\s*min/)
  if (m) return Math.round((+m[1] / 60) * 100) / 100
  m = t.match(/(\d+(?:[.,]\d+)?)/)
  if (m) return parseFloat(m[1].replace(',', '.'))
  return null
}

function priorityOf(s: string): string {
  const t = s.toLowerCase()
  if (t.includes('alta')) return 'alta'
  if (t.includes('baja')) return 'baja'
  return 'media'
}

// Prefijo de nomenclatura: BF | …  /  INF | …  /  INF | SIGLA | …
const PREFIX_RE = /^\s*(BF|INF)\s*\|\s*(?:([A-Z0-9]{2,6})\s*\|\s*)?(.*)$/i
const META_RE = /(tipo|prioridad|entrega|estimado)\s*:/i
const UPDATE_RE = /\b(renombrar|ajustar|cambiar|actualizar|renombra|ajusta|cambia|actualiza)\b/i

function field(metaPart: string, name: string): string {
  const m = metaPart.match(new RegExp(name + '\\s*:\\s*([^|]+)', 'i'))
  return m ? m[1].trim() : ''
}

// Encabezado de proyecto/fase: por palabra clave (PROYECTO/FASE/…) o línea entera
// en mayúsculas. No es header si es una línea de tarea (con prefijo).
function headerKind(line: string): 'project' | 'phase' | null {
  if (PREFIX_RE.test(line) || META_RE.test(line)) return null
  if (/^(fase|etapa|sprint)\b/i.test(line)) return 'phase'
  if (/^proyecto\b/i.test(line)) return 'project'
  const letters = line.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) return 'project'
  return null
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, p, c) => p + c.toUpperCase()).trim()
}

// Parsea un bloque (línea de prefijo + posibles líneas siguientes con metadata/desc).
function parseTaskBlock(block: string, phase: string | null): { task: RawTask; hasMeta: boolean } | null {
  const pm = block.match(PREFIX_RE)
  if (!pm) return null
  const tag = pm[1].toUpperCase()
  const sigla = pm[2] ? pm[2].toUpperCase() : null
  let rest = pm[3]

  // Descripción tras un guión largo/medio (— o –)
  let desc = ''
  const dm = rest.match(/\s[—–]\s+(.+)$/)
  if (dm) { desc = dm[1].trim(); rest = rest.slice(0, rest.length - dm[0].length) }

  const metaStart = rest.search(META_RE)
  const hasMeta = metaStart >= 0
  const title = (hasMeta ? rest.slice(0, metaStart) : rest).trim()
  const metaPart = hasMeta ? rest.slice(metaStart) : ''
  const estimado = field(metaPart, 'estimado')

  return {
    hasMeta,
    task: {
      context: tag === 'BF' ? 'banco' : 'agencia',
      sigla,
      title: title || '(sin título)',
      tipoRaw: field(metaPart, 'tipo'),
      prioridad: priorityOf(field(metaPart, 'prioridad')),
      due_date: parseDate(field(metaPart, 'entrega')),
      estimated_hours: estimado ? parseHours(estimado) : null,
      desc,
      phase,
      updateHint: UPDATE_RE.test(block),
    },
  }
}

export function parseStructuredNotes(text: string): StructuredParse | null {
  const lines = text.split(/\r?\n/)
  const tasks: RawTask[] = []
  let project: string | null = null
  let currentPhase: string | null = null
  let anyMeta = false

  // Bloque actual: una línea de prefijo + las siguientes (la metadata/desc puede
  // venir en líneas separadas cuando Claude no la pone todo en una sola línea).
  let blockLines: string[] = []
  let blockPhase: string | null = null
  const flush = () => {
    if (!blockLines.length) return
    const joined = blockLines.join(' ').replace(/\s+/g, ' ').trim()
    const r = parseTaskBlock(joined, blockPhase)
    if (r) { tasks.push(r.task); if (r.hasMeta) anyMeta = true }
    blockLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const kind = PREFIX_RE.test(line) ? null : headerKind(line)
    if (PREFIX_RE.test(line)) {
      flush()
      blockLines = [line]
      blockPhase = currentPhase
    } else if (kind === 'phase') {
      flush()
      currentPhase = titleCase(line)
    } else if (kind === 'project') {
      flush()
      const pmatch = line.match(/proyecto(?:\s+principal)?\s*:?\s*(.*)/i)
      const nm = pmatch && pmatch[1].trim() ? pmatch[1].trim() : line.replace(/^proyecto(\s+principal)?\s*:?\s*/i, '') || line
      if (!project) project = titleCase(nm)
      currentPhase = null
    } else if (blockLines.length) {
      blockLines.push(line) // continuación de la tarea en curso
    }
  }
  flush()

  // Solo "estructurado" si al menos una tarea trae metadata (Tipo/Prioridad/Entrega/Estimado).
  if (!tasks.length || !anyMeta) return null
  return { project, tasks }
}
