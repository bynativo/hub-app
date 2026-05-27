# HUB · Sistema de trabajo

App de gestion de trabajo personal para contextos multiples: banco, agencia de publicidad y proyectos propios. Dashboard unificado con tareas, presentaciones de contenido, grilla de publicaciones y chat con Claude integrado.

**Produccion:** https://hub-app-seven.vercel.app
**Repo:** https://github.com/bynativo/hub-app

---

## Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilos | Tailwind CSS v4 |
| Estado | Zustand |
| Base de datos | Supabase (PostgreSQL + RLS) |
| API Claude | Supabase Edge Function `claude-proxy` (primario) + Vercel Serverless `/api/chat` (fallback) → Anthropic API (claude-sonnet-4-6) |
| Deploy | Vercel (auto-deploy desde GitHub main) |

---

## Supabase

**URL:** `https://ltgdpbmnvpjwwqkirbxw.supabase.co`
**Proyecto:** `ltgdpbmnvpjwwqkirbxw`

### Tablas existentes

| Tabla | Filas | Descripcion |
|-------|-------|-------------|
| `tasks` | 6 | Tareas con contexto, prioridad, status, origen, draft email, plan, meeting |
| `projects` | 7 | Proyectos/campanas con tipo, cliente, fecha entrega |
| `clients` | 3 | Clientes de agencia (activos) |
| `recurrentes` | 4 | Tareas recurrentes con frecuencia y asignacion |
| `subtasks` | 9 | Subtareas vinculadas a tasks |
| `threads` | 3 | Hilos de email vinculados a tasks |
| `attachments` | 0 | Archivos adjuntos a tasks |
| `notes` | 0 | Notas de reuniones |
| `memory` | 2 | Memoria persistente (conversaciones, decisiones, grilla) |
| `presentations` | 2 | Decks de contenido con slug, KV color, mes |
| `slides` | 20 | Ideas/slides con dual status, plataformas, fechas, grilla |

### Relaciones clave

- `tasks` → `projects`, `clients` (FK)
- `subtasks`, `threads`, `attachments` → `tasks` (FK)
- `slides` → `presentations`, `tasks`, `projects` (FK para grilla)
- `presentations` → `projects`, `clients` (FK)

---

## Funcionalidades implementadas (rediseño v9)

Reconstrucción completa en 11 componentes (rama `redesign`). Detalle por componente:

### 1. Sidebar + layout
- Botón **Capturar** destacado arriba (estado global en el store).
- Grupos fijos: **General** (Hoy, Esta semana, Seguimiento, Recurrentes, Contactos), **Banco Falabella** (Tareas, Proyectos, Presentaciones, Grilla mayo), **Agencia** (Tareas, Clientes, Equipo, Presentaciones), **Personal** (Tareas). Contadores en vivo.

### 2. Dashboard Hoy + toggle Lista/Kanban
- Secciones **Hoy** (vence hoy), **Mañana** (vence mañana), **Seguimiento** (estados de espera).
- Kanban universal de 4 columnas: **Por hacer / En curso / Esperando / Cerrado** (agrupan los estados de todos los contextos). Drag & drop nativo que setea un status apropiado al contexto y persiste en Supabase.

### 3. Modal Capturar unificado (3 tabs)
- **Tarea directa**: tipo independiente / subtarea de… (`parent_task_id`) / parte de proyecto (selecciona o crea proyecto); contexto + cliente, prioridad, origen, fecha, toggle "tarea de contenido", descripción.
- **Reunión / Notas**: extracción con Claude que clasifica cada tarea (independiente/con_subtareas/proyecto/recurrente); aprobación por checkbox.
- **Micrófono**: Web Speech API → mismo flujo de extracción.

### 4. Chat con Claude en el dashboard
- Botón flotante. Claude recibe la carga actual + clientes + proyectos, pide solo lo que falta, advierte sobrecarga y crea la tarea/recurrente vía un bloque de acción `crear` que el front ejecuta en Supabase.

### 5. Estados por contexto + alarmas de seguimiento
- Estados por contexto (`ESTADOS_FLOW`/`ESTADOS_PAUSA`). Al pasar a un estado "Esperando" aparece el modal de alarma (4h / mañana 9:00 / lunes 8:00 / fecha / sin) → guarda `followup_at` + `followup_type`.
- Vista Seguimiento con acciones: redactar seguimiento con Claude, marcar respondido, posponer.

### 6. Vista de tarea con tabs
- **Info** (editable, status por contexto que dispara la alarma, "delegado a" desde contactos), **Subtareas** (`parent_task_id`, expandibles), **Checklist** (tabla `checklists`), **Chat** (crea subtareas con fechas distribuidas), **Email** (borrador con Claude), **Slide** (si `task_type=contenido`).

### 7. Proyectos
- Vista por contexto con progreso (tareas hechas/total), estado, cliente. Detalle con tareas vinculadas + "Nueva tarea" preseleccionada. "+ Nuevo proyecto" (`projects.status`).

### 8. Clientes (agencia)
- Tarjetas + detalle editable (contacto/rol, alcance, propuesta, Drive). Recurrentes vinculadas + "Nueva recurrente" y "Crear tarea" preseleccionando el cliente.

### 9. CRM Contactos
- Grilla global con badge de contexto (Banco/Agencia/Personal/Red) y origen; buscador; "+ Nuevo contacto" (tabla `contacts`). "Equipo" = misma vista filtrada a agencia.

### 10. Recurrentes globales
- Lista de todas las recurrentes con punto de color por contexto + modal de creación.

### 11. Slide de contenido
- Header: nº, título KV, 2 status (🎬 Producción / 📅 CM), equipo, **redes**, **formato** (con `colab_nombre` si Colab).
- **3 fechas** (Grabación / Entrega / Publicación) con reglas (≥24h) y alertas; fecha por red (`fechas_por_plataforma`).
- **Body 2 col**: Info + Visual (referencia y contenido final 9:16 con preview de feed).
- **Guión** con versiones (si `tiene_guion`); **3 aprobaciones secuenciales** (popup con nombre, Aprobar/Rechazar/Enviar feedback → crea tarea de revisión); **links** copiables (presentación / slide / aprobación).

### Chat con Claude (infra)
- Front usa `callClaudeProxy`: edge function de Supabase primero (`{ text }`), fallback a `/api/chat` (Vercel, `{ reply }`). El edge function tiene el secret `ANTHROPIC_API_KEY` y usa `claude-sonnet-4-6` — operativo en local y prod (sesión 4).
- `callClaude` (usado por Capturar/Notas) va directo a `/api/chat`, por lo que esas dos features solo funcionan en prod (vite dev no sirve la serverless de Vercel).

---

## Funcionalidades pendientes

### Autenticacion y roles
- [ ] Login con Supabase Auth (magic link o Google OAuth)
- [ ] Roles: admin (yo), viewer (cliente ve solo su presentacion), editor (equipo agencia)
- [ ] RLS policies basadas en `auth.uid()` en lugar de anon key abierta
- [ ] Compartir presentacion con link restringido (solo lectura, sin navegacion al hub)

### Plataforma banco separada
- [ ] Vista dedicada Banco Falabella con flujo Outlook (copia manual → cortafuegos corporativo)
- [ ] Integracion con SharePoint para contenido final
- [ ] Dashboard de RRSS banco con metricas
- [ ] Flujo de aprobacion interno banco (gerencia → CM → publicacion)

### Integracion herramientas agencia
- [ ] Gmail API para envio directo de emails desde el hub
- [ ] Google Drive API para vincular contenido final automaticamente
- [ ] WhatsApp Business API para updates al equipo
- [ ] Google Calendar API para crear reuniones desde tab Reunion
- [ ] Notificaciones push (tareas vencidas, follow-up delegados)

### Features de producto
- [ ] Modal de captura de tarea (procesar con Claude → auto-categorizar + plan + borrador)
- [x] Vista Kanban (drag & drop por estado) — implementado en Dashboard (sesion 2)
- [ ] Modo foco (plan del dia generado por Claude)
- [ ] Busqueda global en memoria (Supabase full-text)
- [ ] Notas y reuniones (grabacion → transcripcion → extraccion de tareas)
- [ ] Tarea recurrente: generacion automatica mensual
- [ ] Crear/editar proyectos y presentaciones desde la UI
- [ ] Crear/editar slides desde modal
- [ ] Flujo completo: idea aprobada → asignar a grilla con deteccion de conflictos
- [ ] Export de grilla (PDF / compartir link)

---

## Estructura del proyecto

```
hub-app/
├── api/
│   └── chat.ts              # Vercel serverless → Anthropic API
├── src/
│   ├── lib/
│   │   ├── supabase.ts       # Cliente Supabase
│   │   ├── store.ts          # Zustand store (estado global)
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── constants.ts      # Colores, estados, plataformas, categorias
│   │   ├── helpers.ts        # Formateo de fechas, labels
│   │   └── claude.ts         # callClaudeProxy (Supabase edge fn) + callClaude (/api/chat)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Topbar.tsx
│   │   │   └── Sidebar.tsx        # nueva estructura de grupos + Capturar
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx      # Hoy/Mañana/Seguimiento + toggle
│   │   │   ├── KanbanBoard.tsx    # 4 columnas universales + DnD
│   │   │   ├── ClaudeChat.tsx     # chat flotante que crea en Supabase
│   │   │   ├── ContextView.tsx
│   │   │   ├── ProjectsView.tsx
│   │   │   ├── RecurrentesView.tsx
│   │   │   ├── ClientesView.tsx
│   │   │   ├── ContactsView.tsx   # CRM / Equipo
│   │   │   └── SeguimientoView.tsx
│   │   ├── tasks/
│   │   │   ├── TaskItem.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskDetail.tsx     # tabs Info/Subtareas/Checklist/Chat/Email/Slide
│   │   ├── modals/
│   │   │   ├── CaptureModal.tsx   # 3 tabs con jerarquía
│   │   │   ├── FollowupModal.tsx  # alarma de seguimiento
│   │   │   ├── RecurrenteModal.tsx
│   │   │   ├── NewProjectModal.tsx
│   │   │   └── NewContactModal.tsx
│   │   ├── presentations/
│   │   │   ├── PresentationsView.tsx
│   │   │   └── PresentationDetail.tsx  # editor de slide completo (11a/b/c)
│   │   └── grilla/
│   │       └── GrillaView.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── functions/
│       └── claude-proxy/
│           └── index.ts     # edge function proxy → Anthropic (claude-sonnet-4-6)
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Flujo de trabajo

```
Claude.ai (diseno y arquitectura)
    │
    ▼
Claude Code (ejecucion)
    │
    ├── Lee index.html original como referencia de funcionalidad
    ├── Consulta schema Supabase via MCP
    ├── Crea proyecto Vite + React + TS + Tailwind
    ├── Construye componente por componente
    ├── Verifica con Playwright (screenshots automaticos)
    ├── Deploy a Vercel
    └── Conecta GitHub para auto-deploy
```

### Desarrollo local

```bash
npm install
npm run dev        # http://localhost:5173
```

### Variables de entorno (Vercel)

| Variable | Descripcion |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic para chat con Claude |

Las credenciales de Supabase estan hardcodeadas en `src/lib/supabase.ts` (anon key publica, protegida por RLS).

---

## Decisiones tecnicas

- **Flex layout para app shell** — el grid original (`grid-cols-[230px_1fr] grid-rows-[52px_1fr]`) causaba problemas de asignacion de celdas. Cambiado a flex column (topbar) + flex row (sidebar + main) que es mas predecible.
- **Zustand: selectores individuales** — usar `useStore(s => ({ a: s.a, b: s.b }))` crea un objeto nuevo cada render y causa loop infinito (React error #185). Siempre usar `useStore(s => s.field)` por separado.
- **Tailwind v4 con `@theme`** — colores custom (bg, bg2, bg3, claude, banco, agencia, etc.) definidos en `@theme` de `index.css`. Soporta opacity modifiers (`bg-claude/7`, `border-black/13`).
- **Claude model ID** — la API key del proyecto tiene acceso a `claude-sonnet-4-6`. Otros model IDs como `claude-sonnet-4-20250514` o `claude-3-5-sonnet-20241022` no estan disponibles para esta key.
- **Serverless proxy** — `/api/chat` (Vercel function) hace proxy a Anthropic API para mantener la key server-side. No se usa SDK, es fetch directo.
- **Supabase anon key publica** — hardcodeada en frontend, protegida por RLS. Pendiente migrar a Supabase Auth para RLS basado en `auth.uid()`.
- **Estados agencia con acentos** — los datos reales en `tasks.status` usan `En ejecución` y `En revisión cliente`. Los constantes `ESTADOS` / `STATUS_ICON` / `STATUS_COLOR` deben coincidir caracter por caracter con la DB o las tarjetas no aparecen en su columna Kanban ni reciben icono/color.
- **claude-proxy de Supabase (RESUELTO sesión 4)** — el edge function `…/functions/v1/claude-proxy` ya tiene el secret `ANTHROPIC_API_KEY` y devuelve `{ "text": ... }` 200 con `claude-sonnet-4-6`. El front (`callClaudeProxy`) lee `data.text`. El source vive versionado en `supabase/functions/claude-proxy/index.ts`. OJO: el secret y el código son independientes — editar/redeployar el function desde el dashboard de Supabase revierte el código (así se perdió el fix de modelo una vez); redeployar siempre desde el source del repo.
- **PostgREST schema cache** — tras una migración DDL, el cache del REST puede quedar desactualizado unos segundos; se mitiga con `NOTIFY pgrst, 'reload schema'` al final de la migración.
- **Subtareas vía `parent_task_id`** — las subtareas son tareas completas auto-referenciadas; la tabla legacy `subtasks` quedó sin uso en el UI del rediseño. Checklist usa la tabla `checklists` (columna `title`).
- **`loadAll()` silencioso tras mutaciones** — el loader full-screen (`loading`) solo se muestra en la carga inicial (flag `initialized` en el store). Los refrescos tras crear/editar son silenciosos; si se volviera a poner `loading=true` en cada `loadAll`, App desmonta todo el árbol y resetea el estado local de los componentes (se cerraría el chat, modales, etc.).
- **Columna `campaña` con ñ** — en `slides` la columna real es `campaña`/`campaña_nombre` (con ñ); acceder vía `(slide as Record<string, any>)['campaña']`, no `campana`.
- **Colores de contexto** — convención de la app: banco azul (`#2563eb`), agencia teal (`#0d9488`), personal ámbar (`#d97706`). Usar `ctxColor()` para consistencia.
- **Validar con `npm run build`, NO solo `tsc --noEmit`** — el build real es `tsc -b && vite build` (lo que corre Vercel) y usa la config estricta de `tsconfig.app.json`; `tsc --noEmit` lee otra config y NO caza errores como casts inválidos (`TS2352`). Si el build falla, Vercel deja prod en el último build exitoso (silenciosamente). Siempre `npm run build` antes de pushear.
- **Archivado por estado (`tasks.archived_at`)** — al pasar a un estado de cierre (`CLOSING_STATES` = Cerrado/Entregado/Descartado) la tarea se archiva (archived_at = now) y TODAS las vistas/contadores de tareas activas la excluyen con `&& !t.archived_at`. Distinto de `done` (checkbox). Se desarchiva al reabrir.
- **Kanban por contexto (`STATUS_COLUMNS`)** — las vistas de tareas de cada contexto usan columnas = estados del contexto (1 estado por columna). `KanbanBoard` acepta prop `columns`; sin ella usa las 4 universales (`KANBAN_GROUPS`) del dashboard.
- **Google Calendar via OAuth refresh token** — `calendar-proxy` usa secrets `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` (no service account) y mintea un access token por llamada. El índice de `calendar_events.google_id` debe ser único NORMAL (no parcial) para que el upsert `on_conflict=google_id` funcione. Para sincronizar: botón "↻ Google" en la vista Calendario.
- **Buscador Cmd+K (`SearchModal`)** — busca sobre el store (tareas incl. archivadas, proyectos, presentaciones) + query a `attachments`; se abre con `openSearch()` del store.

---

## Changelog

### 2026-05-27 — Sesion 9: Fix vistas por fecha, Kanban con subtareas, Capturar obligatorio, Equipo banco, Recurrentes por contexto, separación de contextos

Migración aplicada: `20260527000000_enforce_task_context_separation` (trigger `trg_task_context_links`).

- **Fix "tareas de hoy no aparecían":** NO era timezone (`due_date` es `date` y `todayISO()` ya es local). La causa: las vistas por fecha filtraban `!parent_task_id`, excluyendo subtareas (que tienen su propio `due_date`). Ahora Hoy/Mañana/Esta-Próxima semana y sus contadores incluyen subtareas.
- **Kanban con subtareas anidadas:** `KanbanBoard` muestra cada subtarea como card dentro de su tarjeta padre, con su propio estado; contador ✓ hechas/total. Botón ⤢ "Ver solo esta tarea y sus subtareas" filtra el tablero al padre + hijas, con "Limpiar filtro". (Seguimiento sigue siendo lista especializada, no Kanban.)
- **Capturar obligatorio:** contexto y fecha de entrega son obligatorios (validación + resaltado rojo). Prompt de extracción reforzado: Claude infiere fecha desde expresiones relativas; tareas sin fecha se expanden y resaltan antes de crear.
- **Equipo en Banco Falabella:** nav + ruta `banco-equipo` (ContactsView context="banco"). "Delegado a" en TaskDetail filtra contactos por contexto de la tarea.
- **Recurrentes por contexto:** `RecurrentesView` acepta `context` (subconjunto filtrado; agencia con filtro por cliente). Nav/rutas en Banco, Agencia, Personal. La global (General) sigue mostrando todas.
- **Separación estricta de contextos:** selectores de tarea padre/proyecto filtran por contexto; cambiar contexto limpia padre/proyecto/cliente y propaga a subtareas. Trigger en DB impide `parent_task_id`/`project_id` cross-context (limpieza previa: subtarea 66 agencia→banco).

### 2026-05-27 — Sesion 8: Lista/Kanban por contexto, archivado, buscador, eliminar, proyectos personales, extracción editable + Google Calendar activo

Migración aplicada: `tasks.archived_at`.

- **Lista/Kanban en vistas de contexto:** Banco/Agencia/Personal tienen toggle Lista (agrupada por status) / Kanban (columnas por contexto via `STATUS_COLUMNS`). `KanbanBoard` acepta `columns`.
- **Cerrado en Personal + archivado automático:** al pasar a un estado de cierre (Cerrado/Entregado/Descartado) `updateTaskStatus` setea `archived_at` y la tarea se oculta de todas las vistas/contadores (se desarchiva al reabrir). Constante `CLOSING_STATES`.
- **Buscador general (Cmd+K):** `SearchModal` desde el topbar y atajo. Busca título/notas/context_readme/subtareas (store) + adjuntos (query a `attachments`). Agrupa Activas / Archivadas / Proyectos / Presentaciones. "Usar como plantilla" en archivadas abre Capturar pre-rellenado (`template` en CaptureModal). Store: `searchOpen`.
- **Eliminar tarea:** menú (...) en el panel → confirmación → DELETE (CASCADE borra subtareas/checklists/threads/attachments; slides quedan con task_id null).
- **Proyectos en Personal:** nav + ruta `personal-proyectos` (ProjectsView/NewProjectModal/Capturar ya eran genéricos por contexto).
- **Extracción = formulario completo editable:** cada tarea que Claude extrae se muestra como `SuggestionForm` editable (todos los campos de Tarea directa), expandible, con aprobar/editar/descartar individual.
- **Google Calendar ACTIVO:** OAuth con refresh token (secrets `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` en Supabase); `calendar-proxy` intercambia el refresh token por access token en cada llamada y upserta en `calendar_events`. Fix: el índice único de `google_id` era parcial y el upsert (ON CONFLICT) fallaba en silencio → ahora índice normal.

### 2026-05-26 — Sesion 7: Tanda de 12 mejoras (P1–P12)

- **P1 — Tareas padre colapsables:** `TaskItem` muestra caret ▶/▼ + contador; colapsadas por defecto; click expande/contrae las subtareas. Aplica a todas las listas.
- **P2 — Panel: edición avanzada:** sección "Organización" (parte de proyecto / subtarea de / convertir a contenido), guarda al instante.
- **P3 — Extracción completa + imágenes:** Notas/Micrófono pre-rellenan todos los campos (fecha, requested_at, estimado, origen). Subida de imágenes → Claude visión extrae tareas. Bucket Storage `capturas` (+ policies anon) y `attachments.es_contexto`. Fix: la extracción leía `data.reply` en vez de `data.text`.
- **P4 — `requested_at`:** campo "¿Cuándo te lo pidieron?" en Capturar; badge 📨 en la tarjeta si difiere de la creación.
- **P5 — `context_readme`:** sección colapsable "Contexto" editable; usado como system prompt del chat de la tarea; pre-rellenado al crear.
- **P6 — Estimado sugerido:** botón "Sugerir con Claude" → badge "Claude sugiere: Xh ✓/✕" (usa promedio de similares).
- **P7 — Chat de tarea continuo:** adjuntar imágenes (visión) y dictar; Claude propone fecha/prioridad/contexto/subtareas vía bloque `accion` con card de aprobación.
- **P8 — Tipo `responder_email`:** toggle "Es solo una respuesta" en Capturar; panel con email recibido + redactar respuesta + marcar respondido; 15min; ícono ✉️; sin subtareas. `fmtHoras` muestra minutos (<1h).
- **P9 — Google Calendar (arquitectura lista):** tabla `calendar_events` + Edge Function `calendar-proxy` (Google→tabla con `GOOGLE_OAUTH_TOKEN`). Vista "Calendario" (semana/día, eventos + tareas + tiempo libre, crear/sincronizar), "Agenda de hoy" en el dashboard, agenda inyectada al chat. **Pendiente:** cargar el token OAuth como secret.
- **P10 — Vista Lista:** sección unificada "Próximamente" (Hoy/Mañana/Seguimiento/Próximamente); paridad con Kanban.
- **P11 / P12 — Esta/Próxima semana y Calendario RRSS:** ya estaban (sesion 6), ahora en prod.

### 2026-05-26 — Sesion 6: Bugs, vistas de semana y fix de build

- **Vista Lista (dashboard):** ademas de Hoy/Mañana/Seguimiento ahora muestra
  "Próximas" (con fecha futura) y "Sin fecha" → ninguna tarea activa queda
  invisible (paridad con Kanban). El Kanban excluye recordatorios (viven en
  Seguimiento) y acepta `items` para mostrar un subconjunto.
- **Subtareas anidadas:** `TaskItem` despliega las subtareas con indent bajo la
  tarea madre en todas las listas (un nivel), cada una clickeable.
- **Modal de subtarea:** "+ Nueva subtarea" abre el `CaptureModal` completo con
  `parent_task_id` precargado (tipo=subtarea). Se agrego "Estimado de tiempo" al
  CaptureModal.
- **Calendario RRSS:** "Grilla mayo"/"Grilla" del sidebar renombradas a
  "Calendario RRSS" (banco y agencia); es el calendario unificado de todos los meses.
- **Vistas de semana:** nuevo `WeekView` reutilizable. "Esta semana" (hoy→+7) y
  "Próxima semana" (lunes→domingo siguiente), agrupadas por dia (dias vacios
  ocultos), con toggle Lista/Kanban. Helper `nextWeekRange()`.
- **FIX CRITICO de build:** un cast invalido en `GrillaView` (`TS2352`) rompia
  `tsc -b && vite build` desde la sesion del punto 9 → **todos los deploys de
  Vercel venian fallando** y prod quedo clavado en un build viejo (los puntos
  9-12, los bugs y las vistas de semana nunca se habian publicado). Corregido;
  prod al dia.

### 2026-05-26 — Sesion 5: Plan de 11 puntos (2 → 12)

Completado un plan de features punto por punto (commit + push + verificacion por screenshot en cada uno).

**Migraciones aplicadas a produccion:** `tasks.es_recordatorio`/`recordatorio_at`; `projects.tipo_agencia`; `presentations.tipo`/`external_url`; `slides.es_texto`/`texto_contenido`/`media_url`/`carrusel_archivos`; `contacts.phone`.

- **2. Dashboard:** total de horas estimadas al final de la seccion Hoy; estado vacio discreto para Mañana (la seccion Mañana ya existia).
- **3. Recordatorios:** toggle "Es recordatorio" en Capturar (fecha+hora) → `es_recordatorio`/`recordatorio_at`, status `Recordatorio` (no pasa por Inbox); aparecen en Seguimiento, destacados al vencer; posponer obliga nueva fecha. Excluidos de listas por contexto.
- **4. Estimado de tiempo:** selector 0.5/1/1.5/2/3/4/6/8h en tab Info → `estimated_hours`; badge "⏱ Xh" en la tarjeta; `fmtHoras` en helpers.
- **5. Clientes:** secciones Activos/Prospectos; seccion "Proyectos vinculados" en el panel (lo demas ya existia).
- **6. Proyectos:** `tipo_agencia` (Marca / Proyecto puntual / Presupuesto nuevo cliente), selector en agencia + badge en lista.
- **7. Presentaciones:** vista por contexto; agencia en carpetas por cliente + Agencia interna; `NewPresentationModal` con tipos; slides de texto (`es_texto`); asignar tarea de contenido a presentacion desde el tab Slide.
- **8. Grilla:** separada por contexto (sin toggle mezclado); ruta + nav `agencia-grilla`; selector de cliente en agencia; filtro por red (incl. LinkedIn); alerta de superposicion misma fecha + misma red.
- **9. Slide de contenido:** body reorganizado a (Info+Visual) | (Idea+Guion); carrusel con `carrusel_archivos` como slider; fix de la columna real `campaña` (con ñ).
- **10. CRM Contactos:** campo `phone` en modal y tarjeta (vista global, badges, origen y buscador ya existian).
- **11. Recurrentes:** filtro por contexto (lista global, punto de color y modal ya existian).
- **12. Chat con Claude:** verificado end-to-end (crea tareas/recurrentes en Supabase con la carga actual inyectada). **Fix:** `loadAll()` ya no muestra el loader full-screen en cada refresco (flag `initialized`) — antes desmontaba el arbol y reseteaba el estado (p. ej. cerraba el chat) en cada mutacion.

### 2026-05-26 — Sesion 4: Chat de Claude operativo (proxy Supabase)

Desbloqueado el chat de Claude. De los 3 pendientes de infra anotados, 2 ya estaban resueltos al revisar el estado real (push a GitHub reautenticado con token en keychain; rediseño de la rama `redesign` ya integrado en `main` y pusheado). El bloqueo real era el edge function `claude-proxy`, con tres capas:

1. **Sin API key** → el usuario seteó el secret `ANTHROPIC_API_KEY` en Supabase.
2. **Modelo equivocado** → el function usaba `claude-sonnet-4-20250514` (la key responde 404 a ese modelo); redeployado a `claude-sonnet-4-6` (igual que Vercel).
3. **Bug de parseo** → `callClaudeProxy` leía `data.reply`/`data.content[0].text`, pero el function devuelve `{ text }`; ahora lee `data.text` primero (con fallback a las otras formas). Sin esto el chat devolvía string vacío y no caía al fallback.

Verificado en vivo: el proxy responde `{"text":"PONG"}` 200; chat operativo en local (`localhost:5173`) y prod. El source del edge function se **versionó** en `supabase/functions/claude-proxy/index.ts` (antes solo existía en Supabase y al editarlo desde el dashboard se revertía el modelo).

**Commit:** `Fix chat de Claude: parsear {text} del edge function + alinear modelo` (`098b491`).

### 2026-05-25 — Sesion 3: Rediseño completo (v9)

Reconstrucción del hub en 11 componentes, en la rama `redesign` (prod intacta hasta el merge). Cada componente verificado en navegador (Playwright) y commiteado por separado.

**Componentes:** 1) sidebar+layout · 2) dashboard Hoy/Mañana/Seguimiento + Kanban universal · 3) modal Capturar con jerarquía · 4) chat Claude que crea en Supabase · 5) estados por contexto + alarmas de seguimiento · 6) vista de tarea con 6 tabs · 7) proyectos · 8) clientes agencia · 9) CRM contactos + equipo · 10) recurrentes globales · 11) editor de slide (11a base/esquema, 11b fechas+body, 11c guión+aprobaciones+links).

**Migraciones aplicadas a producción:** `tasks.parent_task_id`, `tasks.followup_at`/`followup_type`, `projects.status`, tabla `contacts`, RLS en `checklists`/`contacts`, y en `slides`: `redes`, `formato`, `colab_nombre`, `tiene_guion`, `fechas_por_plataforma`, `guion_versiones`, `aprobaciones`.

**Tipos nuevos:** `Contact`, `Checklist`; campos nuevos en `Task` (`parent_task_id`, `followup_at`, `followup_type`), `Project` (`status`), `Slide` (redes/formato/colab/guion/aprobaciones/etc.), `Client`.

**Decisiones:** rama `redesign` + auto-deploy solo desde main (prod no se rompe a medias); migraciones a prod a medida que cada componente las necesita; subtareas vía `parent_task_id`.

### 2026-05-24 — Sesion 2: Fechas, modulo Clientes y Kanban

**Hecho:**
1. **Fechas en tareas y subtareas** — date picker `due_date` en el modal Capturar (tarea); en el modal de subtarea (TaskDetail) `due_date` + nuevo campo `estimated_hours`, mas boton "+ Nueva subtarea". Migracion: `subtasks.estimated_hours numeric DEFAULT 1`.
2. **Selector cliente en recurrentes** — verificado (ya existia): al elegir contexto Agencia aparece selector de cliente + "Agencia interna", guarda `client_id`. Se anadieron props `preselectContext` / `preselectClientId` al `RecurrenteModal` y `CaptureModal`.
3. **Modulo de Clientes** — nueva vista `ClientesView` con tarjetas + panel de detalle editable (contacto, rol, alcance, URLs), seccion de recurrentes del cliente y botones "+ Nueva recurrente" / "+ Crear tarea" pre-seleccionando el cliente. Nuevo item "Clientes" en el sidebar.
4. **Vista Kanban** — toggle Lista/Kanban en Dashboard, columnas por status del contexto, drag & drop nativo que persiste `status` en Supabase (`KanbanBoard`).
5. **Fix** — alineados los constantes de estado agencia (`En ejecución`, `En revisión (cliente)`) con los valores reales de la DB.

**Tipos:** `Subtask.estimated_hours`, `Task.estimated_hours` + `Task.kanban_order`, y campos de `Client` (`contact_name`, `contact_role`, `service_scope`, `proposal_url`, `drive_folder_url`, `is_internal`).

**Verificado con Playwright:** capturas de cada punto (modal fecha, editor subtarea, modal recurrente con cliente, vista Clientes + detalle, Kanban banco/agencia) y prueba end-to-end de drag & drop (status persistido en Supabase y revertido).

### 2026-05-20 — Sesion 1: Reescritura completa

**Hecho:**
1. Creado proyecto Vite + React + TS + Tailwind v4 desde cero
2. Leido `index.html` original (2266 lineas) como referencia de funcionalidad
3. Consultado schema Supabase via MCP (11 tablas, relaciones, datos reales)
4. Construidos 15 componentes organizados en 5 modulos (layout, dashboard, tasks, presentations, grilla)
5. Zustand store con carga paralela de 5 tablas desde Supabase
6. Deploy a Vercel con auto-deploy desde GitHub
7. Fix de layout (grid → flex) y loop infinito de zustand
8. Integrado Claude API real via serverless function (`/api/chat`)
9. Chat funcional en Dashboard (contexto global de tareas) y TaskDetail (contexto de tarea individual)
10. Quick prompts, typing indicator, historial de 12 mensajes
11. README completo con documentacion del proyecto

**Commits:**
- `Initial hub-app: Vite + React + TypeScript + Tailwind`
- `Fix layout: flex layout + zustand selector infinite loop`
- `Add Claude API integration via Vercel serverless function`
- `Fix Claude model ID to claude-sonnet-4-6`
- `Add comprehensive README with stack, DB schema, features and roadmap`

**Verificado con Playwright:** screenshots automaticos confirmaron layout correcto y chat con Claude funcionando en produccion.

---

## Origen

Reescritura completa de un `index.html` monolitico de 200KB (HTML+CSS+JS en un solo archivo) que estaba roto en produccion por conflictos de JavaScript. El archivo original sirvio como referencia de funcionalidad y datos, no de codigo.
