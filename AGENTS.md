# RaidDominion Portal — Guía para Agentes

> Portal comunitario oficial del addon RaidDominion (WoW 3.3.5a, esMX).
> Conversión progresiva de la landing estática `raid-dominion-guild`
> (Astro 4 + Tailwind) en portal con cuentas, upload de SavedVariables,
> dashboards de hermandad y directorio público.

## 1. Stack

- **Framework:** Astro 4 + TypeScript
- **Styling:** Tailwind CSS v3 (tema WoW: ámbar/dorado, fondo oscuro)
- **Backend:** Supabase (JS client v2)
- **Deploy:** Netlify (Node 20)
- **Package Manager:** npm

## 2. Propósito del portal

1. **Descarga del addon**: versión oficial v3.0.0 (`D:\_DEV\RaidDominion - main`).
   El dev del WoW client (`D:\WowClient esMX\Interface\AddOns\RaidDominion`) es
   la versión MÁS RECIENTE; el portal sirve la versión ANTERIOR (oficial).
2. **Upload de SavedVariables**: el usuario sube `RaidDominionDB` (`.lua`) y el
   portal lo parsea para mostrar el roster/bandas/roles de su hermandad.
3. **Verificación de maestro de hermandad**: si se confirma maestro, se le
   invita a registrar su hermandad y recibe un portal web gratuito para su guild.
4. **Roles progresivos** (estilo agendalisto): `visitante` → `member` →
   `guild_master` → `moderator` / `admin`. Toda cuenta nueva nace
   `visitante` (trigger `raiddominion_force_visitante`, migración 20260106)
   y valida su personaje subiendo el SV.

## 3. Ecosistema Supabase multi-app (reglas)

Comparte instancia con `lexigo`, `encuentrosvip`, `agendaya`, `guild_portal`.

### Reglas ABSOLUTAS

1. Toda tabla nueva: prefijo `raiddominion_`. Jamás sin prefijo.
2. NUNCA modificar tablas/funciones/triggers/policies de otras apps.
3. NUNCA reescribir `handle_new_user()` — editar solo la canónica en `../supabase-shared/`.
4. NUNCA `DROP TABLE` sin verificar prefijo `raiddominion_`.
5. Siempre `IF EXISTS` / `IF NOT EXISTS` en migraciones.
6. NUNCA confiar en `raw_user_meta_data` sin sanitizar.
7. Cada app externa en `handle_new_user()` envuelta en `BEGIN/EXCEPTION`.
8. NUNCA `DROP TRIGGER on_auth_user_created` sin coordinación cross-app.
9. Mantener sincronizados `raiddominion_profiles.role` y `user_apps.role`.

### Reglas RLS

1. Solo `auth.uid() = user_id` en policies. Sin subconsultas a otras tablas.
2. `raiddominion_profiles` es la única fuente de verdad del rol.
3. Limpiar policies anteriores con `DO $$ ... DROP ALL` en cada migración RLS.
4. `user_apps` NO tiene RLS (compartida).
5. Policies con prefijo `raiddominion_`.

### Flujo de registro

```
signUp → on_auth_user_created → handle_new_user()
  → [bloque raiddominion PENDIENTE en la canónica; mientras tanto]
    getMyProfile() crea la fila al vuelo (policy INSERT propia, 20260105)
  → trigger raiddominion_force_visitante: toda fila nueva nace 'visitante'
  → promoción 'member' al acumular ≥2 personajes registrados (RPC
    raiddominion_try_promote_member, conteo en raiddominion_characters) → audit log
```

### Ecosistema detallado

Para el mapa completo de tablas por app, piezas clave (`auth.users`, `apps`,
`user_apps`, `{app}_profiles`, `handle_new_user()`, `sanitize_signup_role()`,
`ensureUserApp()`) y cómo agregar una app, leer
`AGENTS.sections/supabase-tables.md`.

## 4. Roles y flujo de usuario

### Roles (5 niveles)

Definidos en `src/lib/roles.ts`. Comparar por índice (`ROLES.indexOf`).

| Role | Índice | Auto-asignable | Acceso |
|---|---|---|---|
| `visitante` | 0 | ✅ (toda cuenta nueva) | Landing, directorio público, `/upload`, dashboard básico |
| `member` | 1 | ✅ (≥2 personajes registrados, sin importar hermandad) | Todo lo anterior + personaje validado, visibilidad pública |
| `guild_master` | 2 | ✅ (vía RPC: SV con isGM + ≥3 personajes validados) | Dashboard de su hermandad, portal público en `/:slug` |
| `moderator` | 3 | ❌ (solo admin) | Revisar claims/verificaciones, moderar públicos |
| `admin` | 4 | ❌ (solo admin, seed manual por email) | Gestión de usuarios, moderación total |

### Flujo principal

```
visitante / member
  ├─ /upload → sube SV (producido con "Registrar" en el addon) → parser → preview
  ├─ /dashboard → toggle perfil público → página viva en /p/:slug
  ├─ "Mi Hermandad": SIN formularios. El SV es la única vía:
  │    a) Formato nuevo: registry.guild.isGM=true + Miembro validado
  │       (≥3 personajes validados) → raiddominion_claim_from_sv al subir (auto GM)
  │    └─ slug autogenerado + dashboard /dashboard/guild
  │         └─ toggle is_public → portal vivo en /:slug
  └─ Re-subir SV actualiza roster/bandas del portal
```

> ⚠️ **Anti-falso-positivo (20260825):** `raiddominion_claim_from_sv` descarta
> cualquier candidata cuyo nombre ya esté registrado por OTRO maestro. El
> reclamo manual (`raiddominion_claim_guild`) fue ELIMINADO.

### URLs públicas

- Portal de hermandad: **`/:slug`** vía `src/pages/portal.astro` + rewrite Netlify.
- Perfil de jugador: **`/p/:slug`** vía `src/pages/jugador.astro` + rewrite Netlify.
- Slugs reservados: `upload`, `login`, `dashboard`, `admin`, `moderate`,
  `guilds`, `p`, `api`, `assets`, `_astro`, `portal`, `jugador`.

### Detalles de onboarding y evidencia

Para el flujo completo de onboarding visitante → member, unicidad global,
evidencia de membresía (GM v3, legacy, bandas) y helpers de roles, leer
`AGENTS.sections/supabase-tables.md` (sección "Onboarding").

## 5. Formato de SavedVariables

Formato oficial v3.0.0. Parser en `src/lib/parser/savedVariables.ts`.
Especificación completa: `AGENTS.sections/parser.md`.

## 6. Organización de código

```
src/
├── components/      # UI reutilizable (Navigation, Footer, cards, AddonGuidesGrid, ...)
├── layouts/         # Layout.astro (tema global)
├── pages/           # Rutas Astro (/ index, /upload, /login, /dashboard, /portal → /:slug, /jugador → /p/:slug, /guilds)
├── sections/        # Secciones de la landing (GrandLogo, AddonSection, Donaciones, ...)
├── data/            # datos estáticos (features, raids.json, addonGuides.ts)
├── lib/
│   ├── supabase.ts  # cliente tipado
│   ├── roles.ts     # roles y helpers
│   ├── api.ts       # wrappers RPC/queries tipadas
│   ├── routes.ts    # resolver de rutas públicas
│   └── parser/      # savedVariables.ts (parser SV)
├── types/           # interfaces TS
└── utils/           # utilidades
```

> 🗺️ **Guías**: el contenido de las guías del addon vive en
> `src/data/addonGuides.ts` y se muestra en la sección Addon de la landing
> (`AddonSection.astro` → `AddonGuidesGrid.astro`). NO existen páginas
> `/guides` independientes. Deep-link vía hash `#guide-<id>`.

## 7. Convenciones de código

- TypeScript estricto (`astro/tsconfigs/strict`). Sin `any` en código nuevo.
- Nombres de archivos: PascalCase para componentes, camelCase para utilidades.
- Comentarios en español, solo cuando aportan (NO comentarios triviales).
- Tailwind exclusivamente; no CSS modules.
- Preferir editar archivos existentes sobre crear nuevos.
- **Contrato único de tabs**: los nombres/ids/hashes de las pestañas del
  dashboard viven SOLO en `src/lib/ui/tabs.ts` (`DASHBOARD_TABS`, `PANELS`,
  `panelFromHash`). `dashboard.astro` y `Navigation.astro` los importan; jamás
  escribir ids/labels/hashes sueltos en esas páginas.
- `build` real: `astro build`. Para verificación usar SIEMPRE
  `scripts/verifica.sh` (ver §8).

## 8. Build & Deploy

```bash
npm install
npm run dev         # servidor dev (localhost:4321)
scripts/verifica.sh # verificación de build (sandbox ext4 nativo)
npm run preview     # previsualizar build
```

- Deploy Netlify (Node 20). Redirects SPA en `netlify.toml` si se añaden rutas.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ El proyecto reside en `/mnt/d/` (DrvFs/WSL2): `astro check` puede tardar.

### Build (sandbox ext4)

`verifica.sh` sincroniza el árbol a un sandbox nativo (`~/rd-build`, `node_modules`
propio) y construye ahí; si el build es OK, sincroniza `dist/` de vuelta al worktree.

```bash
scripts/verifica.sh            # rápido: astro build (sin astro check)
scripts/verifica.sh --check    # completo: astro check && astro build
scripts/verifica.sh --async    # background; resultado en ~/rd-build/.build-status/
scripts/verifica.sh --ci       # gate de build (uso interno)
```

## 9. Trabajar con un agente (opencode)

- **Commits con permiso**: antes de commit, presentar resumen de cambios +
  checklist + preguntar explícitamente. No commitear sin autorización.
- **Checklist de cambios:**
  1. `scripts/verifica.sh` — sin errores nuevos.
  2. `git diff --stat` — solo archivos previstos.
  3. Sin secretos/claves en el diff.
  4. Comportamiento esperado verificado (navegación, parseo, roles).
  5. Mensaje descriptivo en español, un cambio lógico por commit.
- Leer archivos antes de editar. Entender convenciones antes de escribir.
- Recordar: tablas `raiddominion_` NO `profiles`/`guilds` genéricos.

## 10. Sistema de agentes de mejora

Agentes en `.opencode/agents/`, registro en `.opencode/opencode.json`,
prioridades en `.opencode/improve/priorities.md`. Cualquier agente DEBE:

1. Leer `.opencode/improve/priorities.md` antes de cambios estructurales.
2. Ejecutar `scripts/verifica.sh` después de cada cambio (o
   `scripts/verifica.sh --check` si el cambio es de tipos).
3. NO modificar archivos de otras apps del ecosistema.
4. NO modificar `../supabase-shared/` (salvo el bloque raiddominion coordinado).

| Agente | Rol | Secciones extra |
|---|---|---|
| `ui-ux` | Accesibilidad, responsive, tema WoW, i18n | — |
| `product` | Features de comunidad, flujo member→guild_master, conversión | `supabase-tables.md` |
| `development` | Supabase, parser SV, dashboards, rutas | `supabase-tables.md`, `parser.md`, `addon.md` |
| `refactorer` | Refactor seguro que preserva comportamiento | — |
| `qa` | Types, build, RLS, reglas multi-app, parser | `supabase-tables.md`, `parser.md` |

Flujo: `product` define → `development`/`ui-ux` implementan → `refactorer`
mantiene → `qa` aprueba antes de commit.

## 11. Addon RaidDominion (contrato entre repos)

Addon dev en `D:\WowClient esMX\Interface\AddOns\RaidDominion` (v3.0.0).
Contrato completo: `AGENTS.sections/addon.md`.
