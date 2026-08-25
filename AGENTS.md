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
   y valida su personaje subiendo el SV; ver §4 para la promoción.

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
  raiddominion el rol efectivo lo fuerza el trigger de perfiles
  (`raiddominion_force_visitante`: toda fila nueva nace `visitante`);
  `guild_master` se asigna vía RPC seguro al reclamar hermandad
  (con verificación), NUNCA desde el cliente.
- ⚠️ La canónica `handle_new_user()` aún NO tiene bloque `raiddominion`
  (verificado 2026-08-23). Mitigación vigente: el perfil se crea al vuelo
  vía policy INSERT propia (20260105). Coordinar el bloque con las otras
  apps antes de añadirlo (backlog P0 en priorities.md).
- `ensureUserApp()` — RPC anti-huérfanos (`../supabase-shared/ensure_user_app.sql`).

### Flujo de registro

```
signUp → on_auth_user_created → handle_new_user()
  → [bloque raiddominion PENDIENTE en la canónica; mientras tanto]
    getMyProfile() crea la fila al vuelo (policy INSERT propia, 20260105)
  → trigger raiddominion_force_visitante: toda fila nueva nace 'visitante'
  → promoción 'member' SOLO por evidencia cruzada de roster (§4, RPC
    raiddominion_try_promote_member) → audit log
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
| `raiddominion` | `raiddominion_` | `profiles`, `characters`, `roster_evidence`, `guilds`, `guild_members`, `saved_variables`, `guild_config`, `audit_log` |
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
| `visitante` | 0 | ✅ (toda cuenta nueva) | Landing, directorio público, `/upload`, dashboard básico. Aún no usa el addon activamente |
| `member` | 1 | ✅ (vía evidencia cruzada de roster) | Todo lo anterior + personaje validado, visibilidad pública por personaje |
| `guild_master` | 2 | ✅ (vía RPC + verificación) | Dashboard de su hermandad, portal público en raíz `/:slug` |
| `moderator` | 3 | ❌ (solo admin) | Revisar claims/verificaciones, moderar públicos |
| `admin` | 4 | ❌ (solo admin, seed manual por email) | Gestión de usuarios, moderación total |

### Onboarding visitante → member (anti-falseo)

1. Usuario sube SV → parser extrae `registry.player` → `raiddominion_upsert_character`.
2. **Unicidad global** `(lower(name), lower(realm))`: si el personaje ya está vinculado a
   OTRA cuenta → `conflict` con mensaje claro (contactar moderador para liberarlo).
3. Evidencia de membresía en `raiddominion_roster_evidence` (sirve para validar
   a OTROS miembros), en orden de fiabilidad:
   a) `registry.*.guild.memberList` — roster GM del formato v3 (el que el
      addon escribe hoy; sin notas por diseño).
   b) `Guild.memberList` — sección legacy v2 (archivos antiguos).
   c) Jugadores de `bands[].players` (curados in-game por el líder).
4. Promoción a `member` SOLO si el personaje del visitante aparece en evidencia
   subida por un usuario DISTINTO (`raiddominion_try_promote_member`) → audit log.
   Mensaje al visitante: motivar a un compañero a subir SU SV con el roster.

Helpers: `canAccessGuildDashboard()`, `canManageGuild()`, `isStaff()`.

### URLs públicas (decisión validada)

- Portal de hermandad: **raíz `/:slug`** vía shell estática `src/pages/portal.astro`
  + rewrite Netlify `/:slug → /portal` (los archivos reales tienen prioridad).
  Resuelve client-side contra `raiddominion_guilds` (RLS: públicas o propias del
  owner, con banner de vista previa); mensaje "no encontrado" si no existe.
- Perfil de jugador: **`/p/:slug`** vía shell `src/pages/jugador.astro` +
  rewrite Netlify `/p/* → /jugador`. Requiere migración `20260103_public_pages.sql`
  ejecutada (columna `raiddominion_profiles.slug`, RPC `raiddominion_ensure_profile_slug`,
  lectura pública si `is_public`).
- Slugs reservados: `upload`, `login`, `dashboard`, `admin`, `moderate`,
  `guilds`, `p`, `api`, `assets`, `_astro`, `portal`, `jugador`.
- Snapshot público del portal (roster/bandas/reglas) vive en
  `raiddominion_guild_config.config_key='portal_snapshot'`; el dashboard lo
  sincroniza desde el análisis más reciente al guardar la ficha.

### Flujo

```
visitante / member
  ├─ /upload → sube SV (producido con "Registrar" en el addon) → parser → preview
  ├─ /dashboard → toggle perfil público → página viva en /p/:slug
  ├─ "Mi Hermandad": SIN formularios. El SV es la única vía (sin reclamo manual):
  │    a) Formato nuevo: registry.guild.isGM=true + Miembro validado
  │       → raiddominion_claim_from_sv al subir (auto GM, ficha = datos
  │         exactos del addon; re-upload la mantiene actualizada)
  │    └─ slug autogenerado + dashboard /dashboard/guild
  │         └─ toggle is_public → portal vivo en /:slug
  └─ Re-subir SV actualiza roster/bandas del portal
```

> ⚠️ **Anti-falso-positivo (20260825):** `raiddominion_claim_from_sv` descarta
> cualquier candidata cuyo nombre ya esté registrado por OTRO maestro
> (comparación por nombre insensible a mayúsculas, con reino cuando el SV lo
> aporta): nunca se crea un duplicado. El reclamo manual
> (`raiddominion_claim_guild`) fue ELIMINADO: nadie puede reclamar a mano un
> nombre de hermandad que no exista en su SV. La única vía a `guild_master` es
> que el SV acredite `isGM=true` y se cumpla todo el flujo de requisitos.

## 5. Formato de SavedVariables (v3.0.0 oficial)

Parser en `src/lib/parser/savedVariables.ts` (evoluciona `public/guildList.py`).

### Estructura de `RaidDominionDB` (formato REAL verificado 2026-08-22)

Referencias: `D:\WowClient esMX\WTF\Account\IAMM\SavedVariables\RaidDominion.lua`
(formato vigente), IAMM1/JUNGJX (secciones legacy).

```lua
RaidDominionDB = {
  ["registry"] = {                    -- ⭐ FUENTE PRINCIPAL — DOS formas reales:
    -- a) mapa por personaje (config compartida v3, vigente):
    ["Nombre-Reino"] = { ["spammer"], ["player"] = {...equipamiento...}, ["guild"],
      ["assignments"], ["bands"], ["savedAt"] },
    -- b) objeto único plano (formato intermedio): ["player"], ["savedAt"],
    --    ["guild"] = { name, numMembers, isGM, rankIndex, rank }
    -- En AMBAS formas, guild de un GM incluye además:
    --    ["memberList"] = { { name, rank, rankIndex, level, class,
    --      classFile, online } }  -- SIN notas pública/oficial (privacidad)
  ["characters"] = {                    -- roster de TODA la cuenta (config compartida)
    ["Nombre-Reino"] = { ["name"], ["realm"], ["faction"], ["className"], ["classFile"],
      ["raceName"], ["level"], ["version"], ["firstSeen"], ["lastSeen"] },
  },
  ["Guild"] = {                       -- LEGACY opcional (evidencia de membresía)
    ["lastUpdate"], ["generatedBy"],
    ["memberList"] = { { ["name"], ["officerNote"], ["class"], ["publicNote"], ["rank"] } },
  },
  ["bands"] = {                       -- bandas VIVAS
    { ["name"], ["icon"], ["schedule"], ["minGS"],
      ["players"] = { { ["name"], ["class"(FILEID)], ["role"], ["dual"], ["leader"], ["banned"], ["sanction"], ["notes"], ["points"] } },
      ["spammer"] = { ...config... } },
  },
  -- NO EXISTEN en archivos reales: attendance, gearScore, Core como fuente.
  ["roles"/"buffs"/"abilities"/"auras"] = { { ["name"], ["icon"] } },
  ["rules"/"mechanics"] = { { ["title"], ["content"], ["icon"] } },
  ["assignments"] = { ["roles"], ["buffs"], ["abilities"], ["auras"] },  -- mapa nombre→jugador
  ["ui"] = { ["showRolesMenu"], ["showBuffsMenu"], ... },   -- submenús editables
  ["chat"] = { ["channel"], ["discordLink"] }, ["general"], ["loot"], ["modules"], ["profiles"],
}
```

### Reglas del parser

- Prioridad: **formato oficial v3.0.0** (el de arriba). El formato v2 (`Guild`
  como único origen, bandas solo en `Core`) NO se parsea como fuente principal.
- Claim de maestro en DOS flujos:
  a) **Primario (v3):** cualquier `registry.*.guild.isGM=true` habilita
     `raiddominion_claim_from_sv` al subir.
  b) **Fallback legacy (v2):** `generatedBy` + `rank` de liderazgo en
     `Guild.memberList` SOLO alimenta evidencia/info legacy; ya NO reclama
     (el reclamo manual `raiddominion_claim_guild` fue ELIMINADO en
     `20260825_claim_gm_guard.sql`).
- Evidencia de membresía: roster GM v3 (`registry.*.guild.memberList`),
  `Guild.memberList` legacy y jugadores de banda.
- Nunca parsear con regex frágil de `{}` (el de guildList.py): usar un parser
  estructural que respete anidación y strings con comillas escapadas.
- No confiar en `officerNote` para mostrar públicamente (puede contener info
  interna) — separar campos públicos vs. privados en `raiddominion_guild_members`.
- Límites: archivos ≤ 2 MB; sanitizar contenido; nunca volcar `raw` completo
  en la UI.
- El rol `guild_master` se asigna SOLO vía RPC SECURITY DEFINER
  (`raiddominion_claim_from_sv` / `raiddominion_claim_guild`), nunca desde el cliente.
- Los datos de la ficha de hermandad NO son editables en la plataforma:
  provienen del SV y se actualizan re-subiendo.

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
  primero (lento en DrvFs) — para verificación rápida usar `scripts/verifica.sh`
  (ver §8). NUNCA `npx astro build` directo en sesiones paralelas: rompe el
  lock global y satura la CPU/I/O de DrvFs.

## 8. Build & Deploy

```bash
npm install
npm run dev         # servidor dev (localhost:4321)
scripts/verifica.sh # verificación de build SERIALIZADA (ver abajo)
npm run preview     # previsualizar build
```

- Deploy Netlify (Node 20). Redirects SPA en `netlify.toml` si se añaden rutas.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ El proyecto reside en `/mnt/d/` (DrvFs/WSL2): `astro check` puede tardar;
  no depende de inotify para validar.

### ⚠️ Build serializado (regla ABSOLUTA en sesiones paralelas)

Con varias sesiones, `npx astro build` directo colisiona: cada build compite por
CPU/I/O en DrvFs y los builds se cuelgan o tardan minutos. Toda verificación
pasa SIEMPRE por `scripts/verifica.sh`, que toma un lock GLOBAL del proyecto
(`.worktrees/.build.lock`): un solo build a la vez, el resto espera en cola.

```bash
scripts/verifica.sh            # rápido: astro build (sin astro check)
scripts/verifica.sh --check    # completo: astro check && astro build
```

- `--ci` es para uso interno del watcher (gate de build previo a promover main).
- El watcher ya aplica el gate: un turno aprobado NO se promueve a main si su
  commit no compila (construye en un worktree temporal, sin tocar tu árbol).
- NUNCA correr `npx astro build` ni `astro check` directo si hay sesiones
  paralelas activas: esperar el lock y verificar vía el script.

## 9. Trabajar con un agente (opencode)

- **Commits con permiso**: antes de commit, presentar resumen de cambios +
  checklist + preguntar explícitamente. No commitear sin autorización.
- **Checklist de cambios:**
  1. `scripts/verifica.sh` — sin errores nuevos (build serializado).
  2. `git diff --stat` — solo archivos previstos.
  3. Sin secretos/claves en el diff.
  4. Comportamiento esperado verificado (navegación, parseo, roles).
  5. Mensaje descriptivo en español, un cambio lógico por commit.
- Leer archivos antes de editar. Entender convenciones antes de escribir.
- Recordar: tablas `raiddominion_` NO `profiles`/`guilds` genéricos.

### Trabajo multi-sesión paralelo (worktrees) — ver MANUAL.md

Cuando el proyecto corre con sesiones paralelas (`scripts/new-session.sh`):

1. **Toda sesión autónoma nace de `scripts/new-session.sh <nombre>`** y trabaja
   SOLO dentro de `.worktrees/<nombre>/` (branch `sesion/<nombre>`). Jamás en la
   raíz si existen otras sesiones activas.
2. **Ninguna sesión ejecuta `astro dev`, ocupa el puerto 4321, mata procesos
   node ni ejecuta `npm install`.** El server vive únicamente en
   `.worktrees/integra` (terminal del usuario). Dependencias: solo en la raíz
   (los worktrees comparten `node_modules` y `.env` por symlink).
2b. **Ninguna sesión corre `npx astro build`/`astro check` directo**: la
   verificación de build es SIEMPRE vía `scripts/verifica.sh` (lock global,
   un solo build a la vez). Varios builds en paralelo saturan DrvFs y se
   cuelgan.
3. **Fotos borrador**: el watcher (`scripts/watch-integra.sh`) commitea WIP con
   prefijo `wip(<sesion>):` y los publica en la branch `integracion` (preview
   :4321). Esos commits son desechables: NUNCA se rebasean ni se promueven.
4. **Commits oficiales = exclusivamente del usuario**: solo ante la orden
   explícita "commitea", la sesión prepara (no ejecuta) el mensaje profesional,
   lo muestra con su diffstat y espera confirmación. Tras confirmar hace squash
   de todo el turno en UN commit (formato convencional + trailers
   `Session:`/`Round:`/`Agentes:`); el watcher lo promueve a main → Netlify.
5. **Conflicto al fusionar**: el watcher aborta y reporta sin dañar nada. La
   sesión dueña resuelve: `git -C .worktrees/<nombre> rebase main` (o merge de
   main) y reintenta. Manual §Conflictos.

Una sesión solitaria dirigida por el usuario puede trabajar en la raíz como
siempre (reglas 2 y 4 le siguen aplicando).

## 10. Sistema de agentes de mejora

Agentes en `.opencode/agents/`, registro en `.opencode/opencode.json`,
prioridades en `.opencode/improve/priorities.md`. Cualquier agente DEBE:

1. Leer `.opencode/improve/priorities.md` antes de cambios estructurales.
2. Ejecutar `scripts/verifica.sh` después de cada cambio (o
   `scripts/verifica.sh --check` si el cambio es de tipos).
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

## 11. Producto compañero: addon RaidDominion (contrato entre repos)

El addon dev vive en `D:\WowClient esMX\Interface\AddOns\RaidDominion`
(v3.0.0, con sus propios agentes y harness). Su SavedVariables
`RaidDominionDB` es LA API pública que este portal consume.

1. **Productor del contrato:** el árbol `registry["Nombre-Reino"]` lo escribe
   el ítem de menú **"Registrar"** (`RD_Utils_Registry.lua`) y el roster de
   cuenta lo escribe `RD_Utils_Characters.lua`. Sin "Registrar" NO hay
   `registry.player`: las guías y `/upload` deben guiar al usuario a pulsarlo.
2. **Sincronía obligatoria:** renombrar/mover claves de `registry`,
   `characters`, `bands` o `Guild` en el addon exige actualizar en el MISMO
   ciclo `src/lib/parser/savedVariables.ts` + `src/types/parser.ts`; y viceversa.
3. **Privacidad:** `registry.guild.memberList` (roster GM) viaja SIN notas
   pública/oficial por diseño; jamás exponer notas de oficio en el portal.
4. **Fuente de verdad dual:** formato vivo = este §5 + `RD_Utils_Registry.lua`.
   Ante duda, leer ambos antes de tocar parser o guías.
5. Slash commands vigentes del addon: `/rd`, `/rdc`, `/rdh`, `/rdloot`
   (`RD_Init.lua`). Las guías (`src/data/addonGuides.ts`) deben reflejar
   EXACTAMENTE menús (`MENU_DEFINITIONS`) y comandos de `RD_Constants.lua`.