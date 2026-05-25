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
| API Claude | Vercel Serverless Functions → Anthropic API (claude-sonnet-4-6) |
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
- Front usa `callClaudeProxy`: edge function de Supabase primero, fallback a `/api/chat` (Vercel, con la API key). Ver pendiente del proxy más abajo.

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
│   │   └── claude.ts         # Helper para llamar /api/chat
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
- **claude-proxy de Supabase sin API key (PENDIENTE)** — el edge function `…/functions/v1/claude-proxy` responde 500 "API key not configured". En producción el chat/extracción funcionan por el fallback a Vercel `/api/chat`; en dev local no. Para resolver: setear `ANTHROPIC_API_KEY` como secret del edge function.
- **PostgREST schema cache** — tras una migración DDL, el cache del REST puede quedar desactualizado unos segundos; se mitiga con `NOTIFY pgrst, 'reload schema'` al final de la migración.
- **Subtareas vía `parent_task_id`** — las subtareas son tareas completas auto-referenciadas; la tabla legacy `subtasks` quedó sin uso en el UI del rediseño. Checklist usa la tabla `checklists` (columna `title`).

---

## Changelog

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
