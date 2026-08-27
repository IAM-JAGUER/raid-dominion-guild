# Prioridades de Mejora — RaidDominion Portal

> Este archivo define el **backlog priorizado** y las **convenciones de diseño**
> del portal. Las reglas multi-app, de migración y del parser viven en
> `AGENTS.md` y sus secciones (`AGENTS.sections/`).

---

## Divisiones

| División | Enfoque | Agente | Prioridad |
|----------|---------|--------|-----------|
| **QA** | Types, build, RLS, reglas multi-app, límites del parser | `@qa` | 🔴 Crítica |
| **Development** | Supabase, parser SV v3.0.0, dashboards, rutas | `@development` | 🔴 Crítica |
| **Refactorer** | Refactor seguro, división de archivos, código muerto | `@refactorer` | 🔴 Crítica |
| **UI/UX** | Accesibilidad, responsive, tema WoW, i18n | `@ui-ux` | 🟡 Alta |
| **Product** | Features de comunidad, flujo member→guild_master, conversión | `@product` | 🟢 Media |

---

## Backlog priorizado (estado 2026-08-23)

Derivado de la auditoría portal↔addon. Atender EN ORDEN; marcar al completar.

### 🔴 DECISIÓN CANÓNICA — Multi-hermandad (2026-08-25)
El usuario aprobó el rumbo **MULTI-HERMANDAD**: un jugador puede ser maestro de
varias guilds. `raiddominion_claim_from_sv` es idempotente y reclama TODAS las
hermandades del SV con `isGM=true` (aplica a `member` y a `guild_master`,
incluido el caso GM sin hermandad por seed manual). Fuente: sesión hades,
migración `20260825_multi_guild.sql`.

Reglas derivadas (VINCULANTES):
- **hades**: mantiene `20260825_multi_guild.sql` y su flujo en `upload.astro`
  (`saveMyGuildSnapshotsFromSV`, `getMyGuilds`). Es el nuevo invariante.
- **zeus**: DESCARTA `20260825_reclaim_guild_master.sql` y su re-claim
  single-guild en `upload.astro` (subsumido por multi-guild). NUNCA fusionar
  ambas migraciones: redefinen la misma función y la de zeus (orden
  alfabético posterior) revertiría a hermandad única.
- `preview.ts` (`RosterMember`, `renderRoster`) lo resuelve la versión de
  poseidon (cards + classColor, ya en main) + la de hades; zeus descarta su
  paginación.
- Ambas sesiones (zeus/hades) deben `rebase main` y resolver antes de promover
  (conflictos detectados 2026-08-25 en `preview.ts` y `upload.astro`).
- QA debe verificar constraints/índices de `raiddominion_guilds` para
  multi-owner (el índice por `owner_id` de hades + ausencia de UNIQUE(owner_id)).

### 🔴 P0 — Parser: evidencia del roster GM v3 ✅ HECHO (2026-08-23, ronda 4)
El addon v3 escribe el roster completo del maestro en
`registry["Char-Realm"].guild.memberList` ({name, rank, rankIndex, level,
class, classFile, online}, SIN notas por diseño). El parser actual SOLO lee
la sección legacy raíz `Guild.memberList`, así que en archivos puros v3 esa
evidencia se descarta. Tarea (@development):
1. Extender `asRegistryGuild`/tipos para capturar `memberList` del registry. ✅ (`savedVariables.ts` asGuildMemberSummaries, `types/parser.ts` GuildMemberSummary)
2. Incluirlo como evidencia primaria en `upload.astro` → `saveRosterEvidence`
   (mapear `rankIndex`→liderazgo; conservar privacidad: no hay notas). ✅ (`upload.astro` orden a/b/c con dedupe)
3. Validar con un SV real (fixture golden-file recomendado). ⏳ pendiente (requiere infra de tests)

### 🔴 P0 — Coordinar bloque `raiddominion` en `handle_new_user()`
La canónica de `../supabase-shared/` NO tiene bloque raiddominion (verificado
2026-08-23); hoy sobreviven huérfanos vía perfil creado al vuelo (policy INSERT
propia, 20260105). Coordinar con las otras apps antes de editarlo.
NO editar supabase-shared sin ese consenso.

### 🟡 P1 — Guías fieles al addon real
- Documentar el ítem "Registrar" (menú > RaidDominion) y su rol en /upload.
- Quitar `/rdminimap` (no existe en RD_Init.lua) o añadirlo al addon.
- Reemplazar "Bandas Core" por bandas vivas reales (`bands[]`).
- Añadir test fixture golden-file del SV real para el parser.

### 🟡 P1 — Capturar `characters[].version` del SV
Permitirá advertir al usuario si su archivo es anterior a 3.0.0.

---

## Convenciones de diseño v1

- Fuente de verdad visual: `src/lib/ui/design.ts` (tokens `ui.*`). Importar tokens, no duplicar literales.
- Bordes: máximo `rounded-lg`, salvo círculos inherentes (`rounded-full`). Prohibidos `rounded-xl/2xl/3xl` en `src/`.
- Criterio geométrico vinculante: todo elemento CON TEXTO (chips, badges, contadores, botones filtro) usa `rounded-lg`, sin excepción. `rounded-full` solo se permite en elementos SIN texto cuya forma es inherentemente píldora/círculo (dots, indicadores, medallones de icono circular, botones flotantes circulares).
- La excepción de divisores finos (h-1 con extremos suaves) vive EXCLUSIVAMENTE en el token `ui.sectionRule`; no duplicar `rounded-full` en divisores fuera de ese token.
- Encabezados de sección siempre vía `src/components/ui/SectionHeader.astro`.
- Superficie única: `ui.panel`; añadir `ui.panelHover` solo si el elemento es interactivo.
- Botones: `ui.btnBase` + variante (`btnPrimary`/`btnSecondary`/`btnGhost`) + tamaño de `ui.btnSizes`.
- Contenedor único `ui.container` (`max-w-6xl`). Excepción documentada: barra de navegación (max-w-7xl propio, nav ≠ contenedor de contenido).
- Tokens nuevos: `ui.chip` para etiquetas CON texto (el color lo aporta la paleta de acentos por categoría) y `ui.kbd` para comandos/rutas estilo tecla en material de referencia.
- Patrón reutilizable: estado activo de tarjetas interactivas vía atributo `aria-expanded` + CSS scoped `[aria-expanded='true']` (sin JS adicional para el reflejo visual).
- Excepción documentada: botón "✕ Cerrar" del lector de guías (`AddonGuidesGrid.astro`) conserva literales propios — componerlo con `btnBase/btnGhost/btnSizes.sm` alteraría su jerarquía visual (peso, tamaño y color) sin ganancia de consistencia.

## Convenciones de diseño v2
- **R1 Monogramas (enmienda al criterio geométrico):** `rounded-full` admite texto SOLO si es un único glifo (inicial de avatar, dígito de paso) en contenedor cuadrado `w-N h-N`. Palabras o frases jamás en `rounded-full`.
- **R2 Radio único:** todo chip/badge/contador con texto usa `rounded-lg` (idealmente vía token); prohibido `rounded-md` flotante en chips. Radio menor permitido: `rounded-t-lg` en pestañas ancladas a una barra.
- **R3 Superficie única en dashboards:** paneles siempre via `${ui.panel}` (borde canónico `amber-600/30`); prohibido reescribir el literal bg/border/rounded. Interactivo → añadir `ui.panelHover`.
- **R4 Alcance SectionHeader:** solo landing/páginas de contenido. Dashboards: h1 de página + `ui.subTitle`; no mezclar sistemas de encabezado.

## Dataset estático players.json
- `public/players.json` es contenido curado por staff; sus claves `officerNote` están todas vacías y NO provienen de SavedVariables de usuarios. Prohibido poblarlas desde datos de usuario (la evidencia v3 del parser viaja sin notas por diseño).
