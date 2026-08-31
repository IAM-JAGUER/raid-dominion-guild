# Patrones exitosos — RaidDominion Portal

Patrones que funcionan y deben reutilizarse. Cada uno indica dónde verlo
aplicado en la práctica — si el archivo de referencia cambia de nombre,
actualiza la línea en vez de dejarla apuntando a algo que ya no existe.

## P001: Dashboard con pestañas
- `LayoutDashboard.astro` como wrapper
- Pestañas via `TabNav.astro` + `activeTab` state
- Cada pestaña = componente separado
- Contrato único de nombres/ids/hashes: `src/lib/ui/tabs.ts` (`DASHBOARD_TABS`,
  `PANELS`, `panelFromHash`) — `dashboard.astro` y `Navigation.astro` importan
  de ahí, nunca hardcodean ids/labels/hashes sueltos.

## P002: Parser de SavedVariables
- `src/lib/parser/savedVariables.ts` — parser estructural (no regex frágil)
- Tipos en `src/types/parser.ts`
- Claves: registry, characters, bands, Guild

## P003: Migraciones Supabase
- Formato `YYYYMMDD_descripcion.sql`
- Todo con prefijo `raiddominion_`
- RLS policies con `auth.uid() = user_id`
- SECURITY DEFINER + SET search_path = ''
- Redactadas por `@development`, aplicadas manualmente por el usuario (ver
  `AGENTS.md` §8) — el agente nunca ejecuta `db push` ni SQL directo.

## P004: API routes en Astro
- `src/pages/api/*.ts` para endpoints
- Middleware para auth (`src/middleware.ts`)
- Supabase client en `src/lib/supabase.ts`

## P005: Build serializado
- `scripts/verifica.sh` con lock global
- Nunca `npx astro build` directo
- Sandbox ext4 para builds rápidos (mitiga la lentitud de DrvFs en `/mnt/d/`)

## P006: Contrato SV addon ↔ portal
- Parser en `savedVariables.ts`
- Addon escribe en `RD_Utils_Registry.lua`
- Sincronía obligatoria al cambiar claves (rutas y detalle en
  `AGENTS.sections/addon.md`)

## P007: Tema WoW (ámbar/dorado)
- Tokens en `src/lib/ui/design.ts`
- Importar tokens, no duplicar literales
- `rounded-md` para elementos con texto
- `rounded-full` solo para elementos sin texto
- Reglas completas y su porqué: `AGENTS.sections/design.md`

## P008: Multi-app Supabase
- `../supabase-shared/` NO modificar
- `handle_new_user()` canónica
- Tablas sin prefijo NO tocar
- `raiddominion_profiles.role` = fuente de verdad

## P009: Tokens de tipografía, estado y formulario
- Escala tipográfica: `ui.text.*` (hero/h1-h3/body/bodyMuted/caption) en
  `design.ts` — reemplaza tamaños Tailwind sueltos.
- Estado semántico: `ui.status.*` (success/warning/error/info) — reemplaza
  `red-500`/`green-500` sueltos en mensajes de validación del parser,
  errores de formulario y clasificación de hallazgos.
- Formularios: `ui.form.*` (label/input/inputError/helperText/errorText) —
  usado en login, registro, `/upload`.
- Loading: `ui.loading.*` (skeleton/spinner/liveText) — usado en carga de
  roster/bandas y feedback de parseo de SV.
- Detalle completo: `AGENTS.sections/design.md` §2-§6.

## P010: Feedback de operaciones asíncronas
- Toda operación que tarda (upload, parseo, submit, carga de dashboard)
  muestra estado con `ui.loading.spinner` o `ui.loading.skeleton`.
- Estado anunciado a lectores de pantalla vía contenedor
  `aria-live="polite"` con `ui.loading.liveText`.
- Nunca dejar una operación async "muda" — ver `frallas.md` F010.

## P011: Accesibilidad de formularios
- `<label>` con `for`/`id`, nunca placeholder-como-label.
- Error de campo asociado por `aria-describedby` al mensaje (`ui.form.errorText`).
- Foco visible vía `ui.focusRing` en todo elemento interactivo sin foco
  propio ya definido.
- Focus trapping en modales/dialogs: `src/utils/focusTrap.ts` (reutilizable,
  no reimplementar por componente).

## P012: Testing — GAP CONOCIDO, sin patrón establecido aún
No existe hoy una estrategia de testing (unit/integration/e2e) documentada
más allá de la mención aislada a un fixture golden-file pendiente para el
parser (ver `priorities.md` P1). Este patrón queda vacío intencionalmente
como recordatorio: antes de que el proyecto crezca más, definir al menos
un test de contrato para el parser SV (entrada real → salida tipada
esperada) y un smoke test de las RPCs críticas (`claim_from_sv`,
`ensure_user_app`).
