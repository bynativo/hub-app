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

const CUATRO_ESTADOS = ['Inbox', 'En seguimiento', 'Entregado', 'Archivado']

export const ESTADOS_FLOW: Record<string, string[]> = {
  banco:    CUATRO_ESTADOS,
  agencia:  CUATRO_ESTADOS,
  personal: CUATRO_ESTADOS,
}

export const ESTADOS: Record<string, string[]> = ESTADOS_FLOW

export const STATUS_COLUMNS: Record<string, string[]> = {
  banco:    CUATRO_ESTADOS,
  agencia:  CUATRO_ESTADOS,
  personal: CUATRO_ESTADOS,
}

export const KANBAN_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'inbox',       label: 'Inbox',         statuses: ['Inbox'] },
  { key: 'seguimiento', label: 'En seguimiento', statuses: ['En seguimiento'] },
  { key: 'entregado',   label: 'Entregado',      statuses: ['Entregado'] },
  { key: 'archivado',   label: 'Archivado',      statuses: ['Archivado'] },
]

export const WAITING_STATES = ['En seguimiento']

export const WAITING_STATES_BY_CONTEXT: Record<string, string[]> = {
  banco:    ['En seguimiento'],
  agencia:  ['En seguimiento'],
  personal: ['En seguimiento'],
}

export function isWaitingState(context: string, status: string): boolean {
  return (WAITING_STATES_BY_CONTEXT[context] || []).includes(status)
}

export const CLOSING_STATES = ['Entregado', 'Archivado']

export const STATUS_ICON: Record<string, string> = {
  Inbox:            '○',
  'En seguimiento': '👀',
  Entregado:        '✓',
  Archivado:        '☑',
}

export const STATUS_COLOR: Record<string, string> = {
  Inbox:            '#6b7280',
  'En seguimiento': '#d97706',
  Entregado:        '#16a34a',
  Archivado:        '#9ca3af',
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

export const FASES = ['creativo', 'produccion', 'publicacion'] as const
export type Fase = typeof FASES[number]

// Etapas por fase — solo contenido. Las de influencer se agregan cuando se active ese flujo.
export const ETAPAS_POR_FASE: Record<string, string[]> = {
  creativo:    ['ideacion', 'guion', 'feedback interno', 'feedback contraparte', 'aprobado'],
  produccion:  ['preproduccion', 'grabacion', 'edicion', 'feedback contenido', 'ajustes', 'entregado a CM'],
  publicacion: ['pendiente de contenido', 'listo para programar', 'programado', 'publicado', 'patrocinado'],
}

// Roles de equipo para delegación
export const BANCO_ROLES: { v: string; label: string; subtitle: string }[] = [
  { v: 'gonza', label: 'Gonza', subtitle: 'Coordinador contenidos' },
  { v: 'jani', label: 'Jani', subtitle: 'CM' },
  { v: 'palta', label: 'Palta', subtitle: 'Productora' },
  { v: 'pauli', label: 'Pauli', subtitle: 'Social media' },
  { v: 'otro', label: 'Otro', subtitle: 'Texto libre' },
]

export const AGENCIA_ROLES: { v: string; label: string; subtitle: string }[] = [
  { v: 'diseno', label: 'Diseño', subtitle: 'Diseñador/a' },
  { v: 'copy', label: 'Copy', subtitle: 'Redactor/a' },
  { v: 'cuenta', label: 'Cuenta', subtitle: 'Ejecutivo/a de cuenta' },
  { v: 'produccion', label: 'Producción', subtitle: 'Audiovisual' },
  { v: 'otro', label: 'Otro', subtitle: 'Texto libre' },
]

// Etapas de delegación
export const DELEGATION_STAGES: { v: string; label: string; taskPrefix: string; reviewPrefix: string }[] = [
  { v: 'bajar_idea', label: 'Bajar idea', taskPrefix: 'Bajar idea', reviewPrefix: 'Revisar idea' },
  { v: 'produccion', label: 'Producción del contenido', taskPrefix: 'Producir', reviewPrefix: 'Revisar contenido final' },
  { v: 'aprobacion_interna', label: 'Aprobación interna', taskPrefix: 'Aprobar', reviewPrefix: 'Revisar aprobación' },
  { v: 'publicacion', label: 'Publicación', taskPrefix: 'Publicar', reviewPrefix: 'Confirmar publicación' },
  { v: 'reporte', label: 'Reporte / métricas', taskPrefix: 'Reportar', reviewPrefix: 'Revisar reporte' },
  { v: 'otro', label: 'Otro', taskPrefix: 'Revisar', reviewPrefix: 'Revisar' },
]

// Etapas del flujo de contenido (badge en tarjeta)
export const CONTENT_STAGES: { v: string; label: string; emoji: string }[] = [
  { v: 'bajando_idea', label: 'Bajando idea', emoji: '💡' },
  { v: 'en_produccion', label: 'En producción', emoji: '🎬' },
  { v: 'en_revision_interna', label: 'En revisión interna', emoji: '👁' },
  { v: 'en_aprobacion_externa', label: 'En aprobación externa', emoji: '✅' },
  { v: 'para_publicar', label: 'Para publicar', emoji: '📅' },
  { v: 'en_reporte', label: 'En reporte', emoji: '📊' },
]
