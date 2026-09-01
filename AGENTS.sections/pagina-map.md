# Mapa de Páginas y Componentes — RaidDominion Portal

> Inventario vivo de los TIPOS de página del portal, sus bloques componentes y
> los átomos transversales que los componen. Objetivo: que un agente nuevo
> sepa exactamente qué piezas tocar para cada pantalla y qué fuentes son
> ÚNICAS (contratos) vs. duplicadas (a migrar). Complementa `design.md`
> (tokens y material) y `AGENTS.md` §6 (organización de código).

---

## 1. Tipos de página (A–I)

### A. Landing — `src/pages/index.astro`
Composición: `Layout` + `Navigation` + 3 secciones (`GrandLogo`,
`AddonSection`→`AddonGuidesGrid`, `Donaciones`) unidas por `ui.divider`.
Cero JS de datos. Estilos locales (`is:global`) solo para fade-in/smoke.

### B. Directorios públicos (5) — `src/pages/{servidores,jugadores,personajes,bandas,hermandades}/index.astro`
Esqueleto ~idéntico en los 5 (hoy 100-230 líneas c/u):

1. `Breadcrumb`
2. `PageHeader` (eyebrow `Directorio público` + `ui.titleHero` + intro)
3. `dividerFadeRight`
4. `#status` (loading `liveText`)
5. `#grid` (grid de cards)
6. `EmptyState` (sectionHead+sectionBody+CTA)
7. `dividerFadeLeft`
8. `<script>` propio: `card()` + `chip()` + fetch + toggle status/empty

Variantes: **Personajes** y **Hermandades** añaden filtros (search + select);
el resto es directo. El `DirectoryPage.astro` encapsula los pasos 1-7; cada
página conserva solo su `<script>` y slots de filtros.

### C. Fichas públicas slug — `src/pages/{personaje,servidor,banda}.astro`
- **Shell**: `src/components/DetailShell.astro` = Layout + Navigation +
  Breadcrumb + `#loading` + `#not-found` + `<slot/>`.
- **Vista** (`src/components/views/`): `CharacterView`, `ServerView`+
  `RealmView`, `BandView` — cada una **auto-gated** por segmentos de ruta
  (`src/lib/routes.ts`: `currentSegments`/`currentSection`/`currentSlug`).
- Estructura de vista: header (eyebrow+icono+h1 ficha+chips/stats +
  `dividerFadeRight`) → **tab-bar** (`rd-tabbar` + `src/lib/ui/tabs.ts`) →
  **paneles ventana** (`PanelWindow`) → `dividerFadeLeft`; script con
  render + `showView`/`showNotFound`.

### D. Perfil de jugador — `src/components/JugadorProfile.astro`
Vista tipo C **sin DetailShell**: duplica su propio `main` + `#loading` +
`#not-found`. Mismo modelo de tab-bar (`JUGADOR_TABS` + `initAvailableTabs`)
y paneles ventana (Personajes/Bandas/Hermandades). Única página física:
`src/pages/jugador.astro`.

### E. Portal de hermandad — `src/pages/hermandad/index.astro`
Shell propio (Layout+Nav+Breadcrumb+`#loading`+`#not-found`) + banner de
preview privado + hero + `#portal-tabs` (**barra fija de 3** via
`PORTAL_TABS` + `createTabBar`) + 3 paneles (Roster con filtros
`ui.disclosure` + search, Bandas, Reglas) + `#no-snapshot`.

### F. Dashboard — `src/pages/dashboard.astro` (monolito ~1743 líneas)
Header de cuenta + `#tab-bar` (`DASHBOARD_TABS`) + 4 paneles
(Registro/Personajes/Bandas/Hermandad) + panel Config (hash `#perfil`).
Cada panel: **o** `EmptyState` **o** ventana (`PanelWindow`). Un único
mega-script; el render ya está parcialmente extraído en
`src/lib/ui/dashboard/*` (`bands.ts`, `guilds.ts`, `visitor.ts`,
`characters.ts`, `chips.ts`, `format.ts`).

### G. Upload — `src/pages/upload.astro`
Header + dropzone + warnings + resultado (stats, claim banner, preview con
`src/lib/ui/preview.ts`).

### H. Auth — `src/pages/login.astro`
Header centrado + panel (`ui.panel`) + tabs Ingreso/Crear + form
(`ui.form.*`).

### I. Staff — `src/pages/admin.astro` y `src/pages/moderate.astro`
Shell (con `#denied`) + header + vistas. Admin navega por hash
(`ADMIN_PANELS` + `resolveAdminHash` de `tabs.ts`).

---

## 2. Átomos transversales (contratos ÚNICOS vs. duplicados)

| Átomo | Fuente | Estado |
|---|---|---|
| Tokens visuales `ui.*` | `src/lib/ui/design.ts` | ✅ ÚNICA |
| Cards/Chips/Stats | `src/lib/ui/card.ts` | ✅ ÚNICA |
| Tabs (6 barras) | `src/lib/ui/tabs.ts` | ✅ ÚNICA |
| Rutas/gates/notfound | `src/lib/ui/routes.ts` | ✅ ÚNICA |
| Rutas de addon | `AGENTS.sections/addon.md` | ✅ ÚNICA |
| Cabecera de panel ventana | `PanelWindow.astro` | ✅ ÚNICA (antes 27 literales) |
| Empty state | `EmptyState.astro` | ✅ ÚNICA (antes 7 bloques) |
| PageHeader directorio | `PageHeader.astro` | ✅ ÚNICA (antes 5) |
| H1 hero | token `ui.titleHero` | ✅ ÚNICA (antes 8 literales) |
| H1 ficha | token `ui.titleFicha` + `ui.gradientTitle` | ✅ ÚNICA (antes 6) |
| Helpers JS (`el`/`chip`/`statChip`) | `src/lib/ui/dom.ts` | ✅ ÚNICA |
| Breadcrumb | `src/components/Breadcrumb.astro` (+`__rdBreadcrumb`) | ✅ ÚNICA |

### Reglas de no-duplicación (derivadas)
1. El h1 hero (`titleHero`) y el h1 de ficha (`titleFicha`) viven SOLO en
   `design.ts`. Nunca escribir el literal del gradiente en una página.
2. La cabecera de panel ventana (sectionHead+cutTop+dot+título) se renderiza
   SOLO con `PanelWindow.astro`.
3. El estado vacío se renderiza SOLO con `EmptyState.astro` (nunca
   `sectionHead`/`sectionBody` sueltos dentro de un empty).
4. En JS, crear nodos/chips vía `src/lib/ui/dom.ts`; cards vía
   `src/lib/ui/card.ts`. No re-definir `el()`/`chip()` por archivo.
5. Los ids `#status`, `#grid`, `#empty` de los directorios son un CONTRATO
   del `DirectoryPage.astro`; el script de cada página los usa, no los crea.

---

## 3. Contratos entre capas (no duplicar en otros archivos)

- Slugs reservados: `RESERVED` en `src/lib/ui/routes.ts` ↔ `astro.config.mjs`
  (middleware dev) ↔ `netlify.toml`. Si añades una ruta, actualiza los tres.
- Tabs: ids/labels/hashes en `src/lib/ui/tabs.ts` (única fuente; ver
  `AGENTS.md` §7 "Contrato único de tabs").
- Estructura de view pública: `showView(viewId)`/`showNotFound(msg)` de
  `routes.ts` esperan los bloques `#loading`/`#not-found` del shell anfitrión
  (DetailShell, JugadorProfile o hermandad/index).

## 4. Referencias cruzadas
- `AGENTS.md` §6 (organización de código), §7 (contratos de tabs/visual).
- `AGENTS.sections/design.md` (tokens, reglas Rn, material).
- `src/lib/ui/design.ts`, `card.ts`, `tabs.ts`, `routes.ts`, `dom.ts`.