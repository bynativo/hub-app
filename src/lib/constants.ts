export const CTX_COLORS: Record<string, string> = {
  banco: '#2563eb',
  agencia: '#0d9488',
  personal: '#d97706',
}

export const CATS: Record<string, string[]> = {
  banco: ['administrativo', 'rrss', 'contenido', 'estrategia', 'proveedores', 'pagos', 'reportes', 'equipo', 'campanas', 'reuniones', 'aprobaciones'],
  agencia: ['estrategia', 'propuesta', 'rrss', 'contenido', 'medios', 'influencer', 'administrativo', 'clientes', 'nuevos-negocios', 'reportes', 'produccion', 'agencia-interna', 'facturacion', 'brief'],
  personal: ['idea', 'prospeccion', 'desarrollo', 'networking', 'formacion', 'vision', 'marca-personal'],
}

export const ORIGIN_LABELS: Record<string, string> = {
  'gmail-agencia': 'Gmail agencia',
  'outlook-banco': 'Outlook banco',
  'gmail-personal': 'Gmail personal',
  'whatsapp': 'WhatsApp',
  'reunion': 'Reunion',
  'propia': 'Propia',
}

// Flujo principal de estados por contexto (orden de avance)
export const ESTADOS_FLOW: Record<string, string[]> = {
  banco: ['Inbox', 'Trabajando', 'Pend. validación', 'Cerrado'],
  agencia: ['Inbox', 'Propuesta', 'En ejecución', 'Revisión interna', 'En revisión cliente', 'Cerrado'],
  personal: ['Inbox', 'Trabajando', 'Cerrado'],
}

// Estados de pausa por contexto (fuera del flujo lineal)
export const ESTADOS_PAUSA: Record<string, string[]> = {
  banco: ['Delegado', 'Bloqueado'],
  agencia: ['Delegado', 'Bloqueado'],
  personal: ['En pausa', 'Delegado'],
}

// Todos los estados seleccionables por contexto (flujo + pausa)
export const ESTADOS: Record<string, string[]> = {
  banco: [...ESTADOS_FLOW.banco, ...ESTADOS_PAUSA.banco],
  agencia: [...ESTADOS_FLOW.agencia, ...ESTADOS_PAUSA.agencia],
  personal: [...ESTADOS_FLOW.personal, ...ESTADOS_PAUSA.personal],
}

// Columnas del Kanban por contexto (vistas de tareas de cada contexto)
export const STATUS_COLUMNS: Record<string, string[]> = {
  banco: ['Inbox', 'Trabajando', 'Pend. validación', 'Delegado', 'Bloqueado', 'Cerrado'],
  agencia: ['Inbox', 'Propuesta', 'En ejecución', 'Revisión interna', 'En revisión cliente', 'Delegado', 'Bloqueado', 'Cerrado'],
  personal: ['Inbox', 'Trabajando', 'En pausa', 'Delegado', 'Cerrado'],
}

// 4 columnas universales del Kanban del dashboard
export const KANBAN_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'porhacer', label: 'Por hacer', statuses: ['Inbox'] },
  { key: 'encurso', label: 'En curso', statuses: ['Trabajando', 'En ejecución', 'Revisión interna', 'Propuesta'] },
  { key: 'esperando', label: 'Esperando', statuses: ['Delegado', 'Pend. validación', 'En revisión cliente', 'Bloqueado'] },
  { key: 'cerrado', label: 'Cerrado', statuses: ['Cerrado', 'Entregado', 'Descartado'] },
]

// Estados que disparan alarma de seguimiento ("Esperando"). Global = union de
// todos los contextos. Usar para conteos generales (Sidebar, store).
export const WAITING_STATES = ['Delegado', 'Pend. validación', 'En revisión cliente', 'Bloqueado']

// Estados de espera POR contexto. Una tarea cuenta como "esperando respuesta
// vencida" solo si su status esta en la lista de su propio contexto. Sirve para
// no confundir entre contextos (ej: 'Pend. validación' es waiting solo en banco).
export const WAITING_STATES_BY_CONTEXT: Record<string, string[]> = {
  banco: ['Delegado', 'Pend. validación', 'Bloqueado'],
  agencia: ['En revisión cliente', 'Delegado', 'Bloqueado'],
  personal: ['Delegado'],
}

// True si el status pertenece al bucket "esperando" del contexto de la tarea.
export function isWaitingState(context: string, status: string): boolean {
  return (WAITING_STATES_BY_CONTEXT[context] || []).includes(status)
}

// Estados de cierre: al pasar a uno de estos, la tarea se archiva (archived_at) y se oculta de las vistas
export const CLOSING_STATES = ['Cerrado', 'Entregado', 'Descartado']

export const STATUS_ICON: Record<string, string> = {
  Inbox: '○', Trabajando: '▶', 'Pend. validación': '⌛', Cerrado: '✓',
  Propuesta: '◎', 'En ejecución': '▶', 'Revisión interna': '◐',
  'En revisión cliente': '⌛', Delegado: '→', Bloqueado: '✕',
  'En pausa': '‖', Entregado: '✓', Descartado: '✕', Planificando: '◈',
  Recordatorio: '🔔',
}

export const STATUS_COLOR: Record<string, string> = {
  Inbox: '#6b7280', Trabajando: '#2563eb', 'Pend. validación': '#d97706', Cerrado: '#16a34a',
  Propuesta: '#7c3aed', 'En ejecución': '#2563eb', 'Revisión interna': '#7c3aed',
  'En revisión cliente': '#d97706', Delegado: '#d97706', Bloqueado: '#dc2626',
  'En pausa': '#6b7280', Entregado: '#16a34a', Descartado: '#9ca3af', Planificando: '#7c3aed',
  Recordatorio: '#d97706',
}

export const PLAT_META: Record<string, { label: string; css: string; color: string }> = {
  ig_feed: { label: 'IG Feed', css: 'ig', color: '#e1306c' },
  ig_story: { label: 'IG Story', css: 'ig', color: '#e1306c' },
  ig_reels: { label: 'IG Reels', css: 'ig', color: '#e1306c' },
  tiktok: { label: 'TikTok', css: 'tiktok', color: '#333' },
  youtube: { label: 'YouTube', css: 'yt', color: '#ff0000' },
  youtube_shorts: { label: 'YT Shorts', css: 'yt', color: '#ff0000' },
  facebook: { label: 'Facebook', css: 'fb', color: '#1877f2' },
  x: { label: 'X', css: 'x', color: '#333' },
  linkedin: { label: 'LinkedIn', css: 'li', color: '#0a66c2' },
  anuncio_pauta: { label: 'Pauta', css: 'pauta', color: '#7c3aed' },
}

// Plataformas de contenido disponibles en todo el sistema
export const PLATAFORMAS_CONTENIDO = ['ig_feed', 'ig_story', 'ig_reels', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin']

export const TIPO_META: Record<string, { label: string }> = {
  video: { label: 'Video' },
  carrusel: { label: 'Carrusel' },
  reels: { label: 'Reels' },
  story: { label: 'Story' },
  shorts: { label: 'Shorts' },
  imagen: { label: 'Imagen' },
  link_ad: { label: 'Link Ad' },
  texto: { label: 'Texto' },
}

// Redes a nivel de slide (más simple que PLAT_META, que es por formato de plataforma)
export const REDES: { v: string; label: string; color: string }[] = [
  { v: 'ig', label: 'IG', color: '#e1306c' },
  { v: 'tiktok', label: 'TikTok', color: '#111111' },
  { v: 'youtube', label: 'YouTube', color: '#ff0000' },
  { v: 'facebook', label: 'Facebook', color: '#1877f2' },
  { v: 'x', label: 'X', color: '#111111' },
  { v: 'linkedin', label: 'LinkedIn', color: '#0a66c2' },
]

export const FORMATOS = ['Video vertical', 'Video horizontal', 'Gráfica estática', 'Carrusel', 'Animación', 'Colab', 'IG Story']

// Tipos de publicación de una pieza con influencer. Los 4 primeros van a la
// grilla (calendario RRSS + calendario Influencers); los 3 últimos solo aparecen
// en el calendario de Influencers. Sin tipo = 'propia' implícito.
// Compat: valores legados ('colab_ig', 'tiktok_propia', 'cuenta_influencer') se
// siguen reconociendo en pubTypeBadge / vaAGrilla pero no aparecen en el selector.
export const PUB_TYPES: { v: string; label: string }[] = [
  // Van a grilla + calendario RRSS + calendario Influencers
  { v: 'colab', label: 'Colab — publicación colaborativa en nuestra cuenta' },
  { v: 'tiktok_colab', label: 'TikTok desde su cuenta + nos entregan el video' },
  { v: 'reel_colab', label: 'Reel desde su cuenta + nos entregan el video' },
  { v: 'solo_contenido', label: 'Solo nos hacen el contenido (graban y entregan; ellos no publican)' },
  // Solo van al calendario de Influencers
  { v: 'tiktok_influencer', label: 'TikTok desde su cuenta' },
  { v: 'reel_influencer', label: 'Reel desde su cuenta' },
  { v: 'stories_influencer', label: 'Story de Instagram' },
]

// Conjunto de tipos que SÍ aparecen en la grilla (calendario RRSS). Usado por vaAGrilla.
// Incluye valores legados para que las piezas viejas sigan visibles.
export const PUB_TYPES_EN_GRILLA = new Set([
  'colab', 'tiktok_colab', 'reel_colab', 'solo_contenido',
  // legados
  'colab_ig', 'tiktok_propia',
])

// Tipos de proyecto de agencia
export const TIPO_AGENCIA = ['Marca', 'Proyecto puntual', 'Presupuesto nuevo cliente']

// Tipos de presentación
export const TIPO_PRESENTACION = ['Grilla mensual', 'Propuesta de campaña', 'General (link externo)']

export const PROD_STATUS: Record<string, string[]> = {
  banco: ['Pendiente', 'En grabacion', 'En edicion', 'Entregado a CM'],
  agencia: ['Pendiente', 'En produccion', 'Entregado al cliente'],
}

export const CM_STATUS = ['Pendiente de contenido', 'Listo para programar', 'Programado', 'Publicado']
