# Prioridades de Mejora — RaidDominion Portal

> Este archivo es el **backlog operativo** — cambia seguido, se poda. Las
> convenciones visuales PERMANENTES viven en `AGENTS.sections/design.md`
> (no aquí, para que no se entierren bajo el backlog). Las reglas multi-app,
> de migración y del parser viven en `AGENTS.md` y `AGENTS.sections/`.

---

## Divisiones

| División | Enfoque | Agente | Prioridad |
|----------|---------|--------|-----------|
| **QA** | Types, build, RLS, reglas multi-app, límites del parser, gate mínimo de accesibilidad | `@qa` | 🔴 Crítica |
| **Development** | Supabase, parser SV v3.0.0, dashboards, rutas | `@development` | 🔴 Crítica |
| **Refactorer** | Refactor seguro, división de archivos, código muerto | `@refactorer` | 🔴 Crítica |
| **UI/UX** | Accesibilidad, responsive, tema WoW, i18n, personalidad visual, motion | `@ui-ux` | 🟡 Alta |
| **Product** | Features de comunidad, flujo member→guild_master, conversión, métricas | `@product` | 🟢 Media |

Flujo: `product` define (con métrica) → `development`/`ui-ux` implementan →
`refactorer` mantiene → `qa` aprueba antes de commit.

---

## Modelo de sesión de trabajo (vigente 2026-08-30)

Una sola sesión de edición activa (Zeus, WSL bash) + servidor local
auto-arrancado. No hay sesión secundaria de edición en paralelo. El
escenario de conflicto de merge entre sesiones descrito abajo en
"Histórico — decisiones resueltas" corresponde a un modelo anterior de
varias sesiones simultáneas y **ya no debería poder repetirse** bajo este
modelo. Si en el futuro se reactiva un modelo multi-sesión con edición
paralela, revisar primero ese histórico antes de repetir el mismo patrón de
conflicto.

---

## Backlog priorizado (estado 2026-08-30)

Atender EN ORDEN; marcar al completar y mover a "Histórico" cuando quede
verificado en producción (no dejar ítems ✅ acumulándose indefinidamente
en esta sección — ver criterio de poda al final del archivo).

### 🔴 P0 — Coordinar bloque `raiddominion` en `handle_new_user()`
La canónica de `../supabase-shared/` NO tiene bloque raiddominion (verificado
2026-08-23); hoy sobreviven huérfanos vía perfil creado al vuelo (policy INSERT
propia, 20260105). Coordinar con las otras apps antes de editarlo.
NO editar supabase-shared sin ese consenso.

### 🟡 P1 — Guías fieles al addon real
- Documentar el ítem "Registrar" (menú > RaidDominion) y su rol en /upload.
- Quitar `/rdminimap` (no existe en el addon real) o añadirlo al addon.
- Reemplazar "Bandas Core" por bandas vivas reales (`bands[]`).
- Añadir test fixture golden-file del SV real para el parser.

### 🟡 P1 — Capturar `characters[].version` del SV
Permitirá advertir al usuario si su archivo es anterior a 3.0.0.

### 🟡 P1 — Gap de UI/UX (auditoría 2026-08-30)
Detectado al revisar `design.ts`: sin tokens de formulario, estado semántico
ni loading pese a ser prioridades explícitas de `ui-ux.md`. Resuelto a nivel
de tokens (`ui.text.*`, `ui.status.*`, `ui.form.*`, `ui.loading.*`,
`ui.focusRing`, `ui.transition`, `ui.containerNav` agregados a `design.ts`,
ver `AGENTS.sections/design.md` §§2-6). Migración de componentes COMPLETADA
(2026-08-30): login, upload, admin, moderate, portal, listados y el
`#panel-perfil` del dashboard usan los tokens; los renderers JS dinámicos
migrados a módulos (`src/lib/ui/dashboard/*`). **Rediseño UI/UX de cards y
secciones COMPLETADO (2026-08-30)**: nuevo bloque de tokens de card
(`ui.card`, `ui.cardTop`, `ui.cardHover`, `ui.cardRow`, `ui.eyebrow`,
`ui.gradientTitle`, `ui.statValue`, `ui.iconTile`, `ui.divider`) + helpers
`src/lib/ui/card.ts`; aplicado a directorios, portal, fichas, roster/core,
dashboard y landing (ver `AGENTS.sections/design.md` §3).

### 🟢 P2 — Ledger de migraciones aplicadas manualmente (COMPLETADO, 2026-08-30)
`.opencode/improve/ciclos.json` registra las 40 migraciones de
`supabase/migrations/` en `migraciones_aplicadas` (todas confirmadas por el
usuario como aplicadas vía SQL Editor manual, sin CLI; `project_ref_verificado:
true`). El drift detectado en la auditoría del 2026-08-30 quedó resuelto
(`frallas.md` F012 mitigada). A partir de ahora: registrar SIEMPRE cada
aplicación en el ledger inmediatamente después de aplicarla.

### 🟢 P2 — Split de `dashboard.astro` (COMPLETADO, 2026-08-30)
`src/pages/dashboard.astro` bajó de 2824 → 1681 líneas. Módulos en
`src/lib/ui/dashboard/`: `characters.ts` (characterCard con DI), `chips.ts`
(configChip), `format.ts` (fmtDateTime, svLabel, ruleKey, ruleId, escapeHtml),
`visitor.ts` (renderers del Registro + collectRegistryGuilds/renderRegistryGuildCards),
`bands.ts` (bandPlayerCount/bandRuleCount/bandAssignedRules + renderBandDetail con DI),
`guilds.ts` (setMsg, loadGuildStats, loadBandProposals, renderGuildCard con DI).
Verificado con `verifica.sh --check` (0 errores, 0 warnings en dashboard).
Pendiente opcional (P1 UI/UX): tokenizar las clases sueltas del render JS
dinámico (chips de characterCard, tags de reglas) — los módulos conservan
literales puntuales donde el token `ui.chip` no coincide en padding (no
cambia el aspecto).

---

## Histórico — decisiones resueltas

### Multi-hermandad (decidido 2026-08-25, RESUELTO)
El usuario aprobó el rumbo **MULTI-HERMANDAD**: un jugador puede ser maestro de
varias guilds. `raiddominion_claim_from_sv` es idempotente y reclama TODAS las
hermandades del SV con `isGM=true` (aplica a `member` y a `guild_master`,
incluido el caso GM sin hermandad por seed manual).

Reglas derivadas vigentes:
- La migración canónica es `20260825_multi_guild.sql` y su flujo en
  `upload.astro` (`saveMyGuildSnapshotsFromSV`, `getMyGuilds`).
- Cualquier migración anterior de re-claim single-guild quedó descartada,
  subsumida por multi-guild. NUNCA fusionar ambas: redefinen la misma
  función.
- QA debe verificar constraints/índices de `raiddominion_guilds` para
  multi-owner (índice por `owner_id`, sin UNIQUE(owner_id)).

**Nota de contexto histórico (ya no aplica):** esta decisión se cerró en
medio de un conflicto de merge entre dos sesiones de edición simultáneas
que habían implementado el mismo flujo de forma incompatible. Bajo el
modelo de sesión única vigente desde 2026-08-30 (ver arriba), ese escenario
de conflicto de autoría en paralelo no debería volver a producirse. Se
conserva esta nota como referencia si el modelo de sesiones cambia en el
futuro.

---

## Criterio de poda de este archivo

- Ítems marcados ✅ y verificados en producción se mueven a "Histórico" con
  una línea resumen, no se dejan expandidos indefinidamente en el backlog
  activo.
- Decisiones arquitectónicas con impacto duradero (como multi-hermandad)
  quedan en "Histórico" permanentemente como referencia, pero fuera del
  flujo de trabajo día a día.
