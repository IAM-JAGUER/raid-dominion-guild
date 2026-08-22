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
4. **Roles progresivos** (estilo agendalisto): `member` → `guild_master` →
   `moderator` / `admin`. El usuario empieza como `member`; al registrar su
   hermandad y crear cuenta puede hacer su perfil/hermandad pública y
   actualizarla desde su dashboard.

## 3. ⚠️ CRITICAL: Ecosistema Supabase multi-app

Este proyecto comparte la instancia Supabase con `lexigo`, `encuentrosvip`,
`agendaya`, `guild_portal`. Mismas `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

### Piezas clave (no reinventar)

- `auth.users` — identidad. `raw_user_meta_data` NO es confiable (sanitizar).
- `apps` — catálogo documental.
- `user_apps` — matriz de membresía {usuario, app}. Sin RLS.
- `{app}_profiles` — datos por app. `raiddominion_profiles.role` es la ÚNICA
  fuente de verdad del rol. Nunca tocar perfiles de otras apps.
- `handle_new_user()` — canónico en `../supabase-shared/handle_new_user.sql`.
  **NUNCA redefinirlo.** Al añadir la app `raiddominion`, editar SOLO la
  canónica (coordinando con las 5 apps).
- `sanitize_signup_role()` — canónico en `../supabase-shared/`. Para
  raiddominion: roles auto `member`; `guild_master` se asigna vía RPC seguro
  al crear/reclamar hermandad (con verificación), NO desde el cliente.
- `ensureUserApp()` — RPC anti-huérfanos (`../supabase-shared/ensure_user_app.sql`).

### Flujo de registro

```
signUp → on_auth_user_created → handle_new_user()
  → INSERT raiddominion_profiles (role='member')  [BEGIN/EXCEPTION]
  → INSERT user_apps (app_slug='raiddominion', role='member')
```

### Reglas ABSOLUTAS

1. Toda tabla nueva: prefijo `raiddominion_`. Jamás sin prefijo.
2. NUNCA modificar tablas/funciones/triggers/policies de otras apps.
3. NUNCA reescribir `handle_new_user()` — editar solo la canónica en supabase-shared.
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

### Mapa de tablas por app

| App | Prefijo | Tablas |
|---|---|---|
| `lexigo` | `lexigo_` | `profiles`, `courses`, `lessons`, ... |
| `encuentrosvip` | `encuentrosvip_` | `profiles`, `media`, `reviews`, ... |
| `agendaya` | `agendaya_` | `profiles`, `businesses`, `services`, ... |
| `guild_portal` | `guild_portal_` | `config`, `guides`, `roster_players`, ... |
| `raiddominion` | `raiddominion_` | `profiles`, `guilds`, `guild_members`, `saved_variables`, `guild_config` |
| Compartidas | — | `apps`, `user_apps`, `auth.users` |

### Cómo agregar una app al ecosistema

1. `INSERT INTO apps (slug, name) VALUES ('raiddominion', 'RaidDominion Portal')`
2. Crear tablas con prefijo `raiddominion_`
3. Añadir bloque en `handle_new_user()` (canónica, supabase-shared)
4. Crear policies RLS

## 4. Roles y flujo de usuario

### Roles (4 niveles)

Definidos en `src/lib/roles.ts`. Comparar por índice (`ROLES.indexOf`).

| Role | Índice | Auto-asignable | Acceso |
|---|---|---|---|
| `member` | 0 | ✅ | Landing, directorio público, `/upload`, `/dashboard` personal |
| `guild_master` | 1 | ✅ (vía RPC + verificación) | Dashboard de su hermandad, perfil público `/g/:slug` |
| `moderator` | 2 | ❌ (solo admin) | Revisar claims/verificaciones |
| `admin` | 3 | ❌ (solo admin) | Acceso total |

Helpers: `canAccessGuildDashboard()`, `canManageGuild()`, `isStaff()`.

### Flujo

```
member
  ├─ /upload → sube SV → parser → preview
  ├─ "Reclama tu hermandad" → createGuild() RPC → rol guild_master
  │    └─ Perfil público is_public=true + dashboard /dashboard/guild
  └─ /dashboard → historial de parseos, actualizar datos
```

## 5. Formato de SavedVariables (v3.0.0 oficial)

Parser en `src/lib/parser/savedVariables.ts` (evoluciona `public/guildList.py`).

### Estructura de `RaidDominionDB` (v3.0.0)

Formato REAL del addon v3 (referencia: perfiles JUNGJX/IAMM del WoW client
`D:\WowClient esMX\WTF\Account\*\SavedVariables\RaidDominion.lua`).

```lua
RaidDominionDB = {
  ["Guild"] = {                       -- export del roster de hermandad
    ["lastUpdate"] = <epoch>,
    ["generatedBy"] = "<personaje que exportó>",
    ["memberList"] = {
      { ["name"], ["officerNote"], ["class"], ["publicNote"], ["rank"], ["race"] },
    },
  },
  ["Core"] = {                        -- bandas Core (members, isLeader, isSanctioned, withNote)
    { ["name"], ["schedule"], ["minGS"], ["withNote"], ["members"] = { ... } },
  },
  ["bands"] = {                       -- bandas VIVAS (fuente principal en v3)
    { ["name"], ["icon"], ["schedule"], ["minGS"],
      ["players"] = { { ["name"], ["class"], ["role"], ["dual"], ["gearScore"], ["leader"], ["banned"], ["sanction"], ["notes"], ["points"] } },
      ["attendance"] = { { ["date"], ["present"] = {...}, ["absent"] = {...} } },
      ["spammer"] = { ["channels"], ["duration"], ["message"] } },
  },
  ["roles"]  = { { ["name"], ["icon"] } },    -- listas configurables {name, icon}
  ["buffs"]  = { { ["name"], ["icon"] } },
  ["abilities"] = { { ["name"], ["icon"] } },
  ["auras"]  = { { ["name"], ["icon"] } },
  ["mechanics"] = { { ["title"], ["content"], ["icon"] } },  -- listas de contenido
  ["rules"]  = { { ["title"], ["content"], ["icon"] } },
  ["assignments"] = {                 -- mapa nombre → jugador
    ["roles"] = {...}, ["buffs"] = {...}, ["abilities"] = {...}, ["auras"] = {...},
  },
  ["ui"] / ["chat"] / ["loot"] / ["general"] / ...,
}
```

### Reglas del parser

- Prioridad: **formato oficial v3.0.0** (el de arriba). El formato v2 (`Guild`
  como único origen, bandas solo en `Core`) NO se parsea como fuente principal.
- `generatedBy` + `rank` del personaje en `memberList` determinan el claim de
  maestro. Si `rank` no es de liderazgo → claim `pending` para moderador.
- Nunca parsear con regex frágil de `{}` (el de guildList.py): usar un parser
  estructural que respete anidación y strings con comillas escapadas.
- No confiar en `officerNote` para mostrar públicamente (puede contener info
  interna) — separar campos públicos vs. privados en `raiddominion_guild_members`.
- Límites: archivos ≤ 2 MB; sanitizar contenido; nunca volcar `raw` completo
  en la UI.
- El rol `guild_master` se asigna SOLO vía RPC `raiddominion_claim_guild`
  (SECURITY DEFINER), nunca desde el cliente.

## 6. Organización de código

```
src/
├── components/      # UI reutilizable (Navigation, Footer, cards, AddonGuidesGrid, ...)
├── layouts/         # Layout.astro (tema global)
├── pages/           # Rutas Astro (/ index, /upload, /dashboard, /g/:slug, /guilds)
├── sections/        # Secciones de la landing (GrandLogo, AddonSection, Donaciones, ...)
├── data/            # datos estáticos (features, raids.json, addonGuides.ts)
├── lib/
│   ├── supabase.ts  # cliente tipado
│   ├── roles.ts     # roles y helpers
│   ├── api.ts       # wrappers RPC/queries tipadas
│   └── parser/      # savedVariables.ts (parser SV)
├── types/           # interfaces TS
└── utils/           # utilidades
```

> 🗺️ **Guías**: el contenido completo de las guías del addon vive en
> `src/data/addonGuides.ts` y se muestra TODO dentro de la sección Addon de la
> landing (`AddonSection.astro` → `AddonGuidesGrid.astro`) como paneles
> expandibles (accordion), sin recargar página. NO existen páginas
> `/guides`, `/guides/[id]` ni `/rules` independientes: todo se integra en el
> index para enfocar el portal al addon. Deep-link interno vía hash
> `#guide-<id>`. Al añadir una sección o comando nuevo al addon
> (RD_Constants.lua del dev en `D:\WowClient esMX\Interface\AddOns\RaidDominion`),
> reflejarlo en estas guías.

## 7. Convenciones de código

- TypeScript estricto (`astro/tsconfigs/strict`). Sin `any` en código nuevo.
- Nombres de archivos: PascalCase para componentes, camelCase para utilidades.
- Comentarios en español, solo cuando aportan (NO comentarios triviales).
- Tailwind exclusivamente; no CSS modules.
- Preferir editar archivos existentes sobre crear nuevos.
- `build` real: `astro build`. El script `npm run build` corre `astro check`
  primero (lento en DrvFs) — para verificación rápida usar `npx astro build`.

## 8. Build & Deploy

```bash
npm install
npm run dev         # servidor dev (localhost:4321)
npx astro build     # build estático a ./dist/
npm run preview     # previsualizar build
```

- Deploy Netlify (Node 20). Redirects SPA en `netlify.toml` si se añaden rutas.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ El proyecto reside en `/mnt/d/` (DrvFs/WSL2): `astro check` puede tardar;
  no depende de inotify para validar.

## 9. Trabajar con un agente (opencode)

- **Commits con permiso**: antes de commit, presentar resumen de cambios +
  checklist + preguntar explícitamente. No commitear sin autorización.
- **Checklist de cambios:**
  1. `npx astro build` — sin errores nuevos.
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
2. Ejecutar `npx astro build` después de cada cambio (o `astro check` si el
   cambio es de tipos).
3. NO modificar archivos de otras apps del ecosistema.
4. NO modificar `../supabase-shared/` (salvo el bloque raiddominion coordinado).

| Agente | Rol |
|---|---|
| `ui-ux` | Accesibilidad, responsive, consistencia del tema WoW, i18n |
| `product` | Features de comunidad, flujo member→guild_master, conversión |
| `development` | Implementación: Supabase, parser SV, dashboards, rutas |
| `refactorer` | Refactor seguro que preserva comportamiento |
| `qa` | Revisión: types, build, RLS, reglas multi-app, límites del parser |

Flujo: `product` define → `development`/`ui-ux` implementan → `refactorer`
mantiene → `qa` aprueba antes de commit.