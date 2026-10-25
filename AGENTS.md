# RaidDominion Portal — Guía para Agentes

> Portal comunitario oficial del addon RaidDominion (WoW 3.3.5a, esMX).
> Conversión progresiva de la landing estática `raid-dominion-guild`
> (Astro 4 + Tailwind) en portal con cuentas, upload de SavedVariables,
> dashboards de hermandad y directorio público.

## 1. Stack

- **Framework:** Astro 4 + TypeScript
- **Styling:** Tailwind CSS v3 (tema WoW azul/acero: escala `brand`,
  fondo Abismo `#07111E`; ver `AGENTS.sections/design.md` §1b)
- **Backend:** Supabase (JS client v2)
- **Deploy:** Netlify (Node 20)
- **Package Manager:** npm

## 2. Propósito del portal

1. **Descarga del addon**: el portal sirve la versión oficial anterior a la
   del addon dev (más reciente). Rutas locales de ambos repos: SOLO en
   `AGENTS.sections/addon.md` — no las dupliques en otro archivo.
2. **Upload de SavedVariables**: el usuario sube `RaidDominion.lua` y el
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
| `guild_master` | 2 | ✅ (vía RPC: SV con isGM + ≥1 personaje validado) | Dashboard de su hermandad, portal público en `/hermandad/:slug` |
| `moderator` | 3 | ❌ (solo admin) | Revisar claims/verificaciones, moderar públicos |
| `admin` | 4 | ❌ (solo admin, seed manual por email) | Gestión de usuarios, moderación total |

### Flujo principal

```
visitante / member
  ├─ /upload → sube SV (producido con "Registrar" en el addon) → parser → preview
  ├─ /dashboard → toggle perfil público → página viva en /jugador/:slug
  ├─ "Mi Hermandad": SIN formularios. El SV es la única vía:
  │    a) Formato nuevo: registry.guild.isGM=true + Miembro validado
  │       (≥1 personaje validado con SV isGM, regla 20260925) → raiddominion_claim_from_sv al subir (auto GM)
  │    └─ slug autogenerado + dashboard /dashboard/guild
  │         └─ toggle is_public → portal vivo en /hermandad/:slug
  └─ Re-subir SV actualiza roster/bandas, metas, nota (con su interruptor
     "Nota pública", privada por defecto) e instancias guardadas del portal
```

- **Task Tracker** (`/dashboard#personajes`): catálogo manual por cuenta +
  estado activo/marcado por personaje + nota LOCAL + oculto del tracker. Los
  datos del personaje (equipo, metas, instancias, monedas, fechas) vienen de
  las subidas SV; el portal NO lee WTF ni GearScore. Ficha en línea
  `#personajes/ficha/<slug>` y catálogo `#personajes/catalogo`.

> ⚠️ **Anti-falso-positivo (20260825):** `raiddominion_claim_from_sv` descarta
> cualquier candidata cuyo nombre ya esté registrado por OTRO maestro. El
> reclamo manual (`raiddominion_claim_guild`) fue ELIMINADO.

### URLs públicas

- Portal de hermandad: **`/hermandad/:slug`** vía shell `src/pages/hermandad/index.astro`
  + rewrite Netlify `/hermandad/* → /hermandad` (la raíz legacy `/:slug` redirige 301).
- Directorio de hermandades: **`/hermandades`** (`src/pages/hermandades/index.astro`);
  `guilds` (legacy) redirige 301 a `/hermandades`.
- Perfil de jugador: **`/jugador/:slug`** vía `src/pages/jugador.astro` + rewrite Netlify.
- Fichas: **`/personaje/:slug`**, **`/servidor/:server`**, **`/servidor/:server/reino/:realm`**,
  **`/banda/:slug`** vía shells `personaje.astro`/`servidor.astro`/`banda.astro` + rewrites.
- Slugs reservados: `upload`, `login`, `dashboard`, `admin`, `moderate`,
  `guilds`, `api`, `assets`, `_astro`, `portal`, `jugador`, `personajes`,
  `personaje`, `servidor`, `servidores`, `reino`, `hermandad`, `hermandades`,
  `jugadores`, `banda`, `bandas`.

### Detalles de onboarding y evidencia

Para el flujo completo de onboarding visitante → member, unicidad global,
evidencia de membresía (GM v3, legacy, bandas) y helpers de roles, leer
`AGENTS.sections/supabase-tables.md` (sección "Onboarding").

## 5. Formato de SavedVariables

Formato actual v3.2.0, compatible con archivos v3.0.0/v3.0.1/v3.1.0. Parser en
`src/lib/parser/savedVariables.ts` (`PARSER_VERSION` v3.7.0).
Los textos del SV pueden traer markup de chat (`|c…|H…|h[Etiqueta]|h|r`):
el parser lo limpia (`src/lib/wowLink.ts`) y el render usa el MISMO widget de
UltimoWoW que el tracker local donde hay id (`src/lib/ui/wowhead.ts`) — ver
parser.md → «Markup de chat». Especificación completa: `AGENTS.sections/parser.md`.

## 6. Organización de código

```
src/
├── components/      # UI reutilizable (Navigation, Footer, cards, AddonGuidesGrid, ...)
├── layouts/         # Layout.astro (tema global)
├── pages/           # Rutas Astro (/ index, /upload, /login, /dashboard, /hermandad/:slug, /jugador/:slug, /hermandades, fichas)
├── sections/        # Secciones de la landing (GrandLogo, AddonSection, Donaciones, ...)
├── data/            # datos estáticos (features, raids.json, addonGuides.ts)
├── lib/
│   ├── supabase.ts  # cliente tipado
│   ├── roles.ts     # roles y helpers
│   ├── api.ts       # wrappers RPC/queries tipadas
│   ├── routes.ts    # resolver de rutas públicas
│   ├── ui/design.ts # tokens visuales — ver AGENTS.sections/design.md
│   ├── ui/icons.ts  # sistema de 65 iconos (contrato único) — ver design.md §10
│   ├── ui/dashboard/ # módulos del dashboard (registro, bandas, hermandad y tracker)
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
- **Contrato único visual**: cualquier clase Tailwind que se repita 2+ veces
  se convierte en token de `src/lib/ui/design.ts` antes de seguir usándose
  suelta. Reglas y razones completas en `AGENTS.sections/design.md`.
- **Contrato único de filtros**: buscador y chips de facetas de los
  directorios viven SOLO en `src/lib/ui/filterBar.ts` (`createFilterBar`),
  montados sobre `#filters` en la cabecera del panel (`DirectoryPage` y
  `/bandas`); `bandasPanel.ts` (día/tipo) lo consume para las pestañas
  Bandas. Jamás duplicar buscador/chips en una página (design.md §7b).
- **Contrato único de iconos**: los 65 iconos temáticos viven SOLO en
  `src/lib/ui/icons.ts` (sprite `public/icons/rd-icons.*`, generado por
  `scripts/icons-sheet.py`). Render SIEMPRE vía `Icon.astro` o `iconEl`
  (nunca spans/backgrounds sueltos); arte a color, prohibido recolorear
  (design.md §10).
- `build` real: `astro build`. Para verificación usar SIEMPRE
  `scripts/verifica.sh` (ver §8).

## 8. Build, Deploy y Migraciones

```bash
npm install
npm run dev         # servidor dev (localhost:4321)
scripts/verifica.sh # verificación de build (sandbox ext4 nativo)
npm run preview     # previsualizar build
```

- **Acceso LAN (celular)**: el dev server escucha en `0.0.0.0` (`host: true` en
  `astro.config.mjs`). WSL2 NAT requiere port proxy manual: `~/.local/bin/wsl-portforward`
  se ejecuta una vez por sesión de WSL (via `.bashrc`), **detecta la IP de LAN
  de Windows dinámicamente** (la del Wi-Fi cambia por DHCP; no hardcodear) y crea
  un `netsh interface portproxy` de `WIN_IP:4321 → WSL_IP:4321`. Firewall
  restringido a `192.168.1.0/24`. Desde el celular: `http://WIN_IP:4321/`.
- Deploy Netlify (Node 20). Redirects SPA en `netlify.toml` si se añaden rutas.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ El proyecto reside en `/mnt/d/` (DrvFs/WSL2): `astro check` puede tardar;
  se acepta como costo conocido, no se persigue optimizar más allá del
  sandbox ext4 de `verifica.sh`.

### Build (sandbox ext4)

`verifica.sh` sincroniza el árbol a un sandbox nativo (`~/rd-build`, `node_modules`
propio) y construye ahí; si el build es OK, sincroniza `dist/` de vuelta al worktree.

```bash
scripts/verifica.sh            # rápido: astro build (sin astro check)
scripts/verifica.sh --check    # completo: astro check && astro build
scripts/verifica.sh --async    # background; resultado en ~/rd-build/.build-status/
scripts/verifica.sh --ci       # gate de build (uso interno)
```

### Migraciones Supabase — política vigente: aplicación manual, sin CLI

Decisión deliberada (2026-08-30): el proyecto NO usa el CLI de Supabase.
Las migraciones se redactan en `supabase/migrations/` siguiendo P003 de
`patrones.md`, pero **se aplican a mano vía el SQL Editor del dashboard de
Supabase, exclusivamente por el usuario** — ningún agente ejecuta SQL contra
la base de datos remota, aunque tenga `bash: allow`.

Checklist al aplicar una migración manualmente:
1. Verificar en el header del dashboard que el proyecto activo es el de
   RaidDominion (se comparte instancia con `lexigo`/`encuentrosvip`/
   `agendaya`/`guild_portal` — aplicar en el proyecto equivocado es el
   riesgo real de este flujo, no el SQL en sí).
2. Ejecutar el `.sql`.
3. Registrar la aplicación en `.opencode/improve/ciclos.json` →
   `migraciones_aplicadas` (archivo, fecha, `project_ref_verificado: true`)
   inmediatamente — no dejarlo para después (ver `frallas.md` F012).

Sin CLI no hay tabla de tracking automática; `ciclos.json` es la única
fuente de verdad de qué se aplicó y cuándo. Si en algún momento se decide
adoptar el CLI (uso recomendado: solo diagnóstico de solo-lectura,
`migration list`/`db diff`, sin pasar a `db push` salvo decisión explícita
posterior), instalar como dev dependency (`npm install -D supabase`) desde
la misma terminal WSL que se use siempre para el proyecto — el binario
descargado es específico de plataforma y no es intercambiable entre WSL y
Windows nativo sobre la misma carpeta.

## 9. Trabajar con un agente (opencode)

### Modelo de sesión (vigente 2026-08-30)

Una sola sesión de edición (**Zeus**, WSL bash) + servidor local
(`npm run dev`), ambos auto-arrancados en el editor. No hay sesión
secundaria editando en paralelo. Esto reemplaza el modelo anterior de
varias sesiones simultáneas — ver `priorities.md` → "Histórico" para el
conflicto de merge que motivó el cambio, y no repetir ese patrón si se
reactiva un modelo multi-sesión en el futuro.

### Permisos que requieren confirmación explícita antes de ejecutar

- **Commits**: antes de commit, presentar resumen de cambios + checklist +
  preguntar explícitamente. No commitear sin autorización.
- **Migraciones**: el agente redacta el `.sql`; la aplicación es SIEMPRE
  manual y exclusiva del usuario (§8). El agente nunca ejecuta SQL contra
  Supabase, con o sin `bash: allow`.

### Servidor de Live Preview del usuario (prohibición absoluta)

El dev server del usuario (`npm run dev` / `npm start`, puerto **4321**)
es su Live Preview: **un agente NUNCA lo detiene ni lo reinicia**.

- Prohibido `kill`/`pkill`/`taskkill`/cierre del proceso del puerto 4321 y
  de cualquier servidor/port-forward del usuario (incluye el port proxy de
  LAN, §8, y los procesos de sus navegadores/previews).
- Nunca apuntar por patrón amplio (`pkill -f astro`, `taskkill /IM chrome.exe`):
  matar por PID solo si el PID es de un proceso **que el propio agente
  inició** y lo tiene registrado.
- Si un agente necesita un servidor para verificar (screenshots, curl),
  lánzalo en **puerto alterno** (`npm run dev -- --port 4322`) y detén
  únicamente ese PID propio al terminar.
- Para diagnosticar el servidor del usuario: `curl` de solo lectura contra
  4321 (p. ej. `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/`).
  Reiniciarlo es decisión exclusiva del usuario.

### Checklist de cambios

1. `scripts/verifica.sh` — sin errores nuevos.
2. `git diff --stat` — solo archivos previstos.
3. Sin secretos/claves en el diff.
4. Comportamiento esperado verificado (navegación, parseo, roles).
5. Mensaje descriptivo en español, un cambio lógico por commit.

- Leer archivos antes de editar. Entender convenciones antes de escribir.
- Recordar: tablas `raiddominion_` NO `profiles`/`guilds` genéricos.

## 10. Sistema de agentes de mejora

Agentes en `.opencode/agents/`, registro en `.opencode/opencode.json`,
prioridades en `.opencode/improve/priorities.md`, convenciones visuales en
`AGENTS.sections/design.md`, fallas conocidas en `.opencode/improve/frallas.md`,
patrones validados en `.opencode/improve/patrones.md`. Cualquier agente DEBE:

1. Leer `.opencode/improve/priorities.md` y `.opencode/improve/frallas.md`
   antes de cambios estructurales.
2. Ejecutar `scripts/verifica.sh` después de cada cambio (o
   `scripts/verifica.sh --check` si el cambio es de tipos).
3. NO modificar archivos de otras apps del ecosistema.
4. NO modificar `../supabase-shared/` (salvo el bloque raiddominion coordinado).
5. NO aplicar migraciones SQL — solo redactarlas (§8).

| Agente | Rol | Secciones extra |
|---|---|---|
| `ui-ux` | Accesibilidad, responsive, tema WoW, i18n, personalidad visual, motion | `design.md` |
| `product` | Features de comunidad, flujo member→guild_master, conversión, métricas | `supabase-tables.md`, `frallas.md`, `patrones.md` |
| `development` | Supabase, parser SV, dashboards, rutas | `supabase-tables.md`, `parser.md`, `addon.md`, `design.md` |
| `refactorer` | Refactor seguro que preserva comportamiento | — |
| `qa` | Types, build, RLS, reglas multi-app, parser, gate mínimo de accesibilidad | `supabase-tables.md`, `parser.md`, `design.md`, `frallas.md` |

Flujo: `product` define (con métrica) → `development`/`ui-ux` implementan →
`refactorer` mantiene → `qa` aprueba antes de commit.

## 11. Addon RaidDominion (contrato entre repos)

Rutas locales del addon dev y del repo del portal: SOLO en
`AGENTS.sections/addon.md` — no las repitas en `development.md`, `product.md`
ni ningún otro archivo; si cambian, se actualizan en un solo lugar.
Contrato completo: `AGENTS.sections/addon.md`.

## 12. Discord y chat con IA (Netlify Functions)

El portal es un build estático; la lógica serverless vive en **Netlify
Functions** (`netlify/functions/`, bundler esbuild). NO usar API routes de
Astro ni adapters. Las funciones **NO dependen de `@supabase/supabase-js`**:
usan REST directo (PostgREST, `_shared/supabase.ts`) porque supabase-js
v2.112+ exige WebSocket nativo (Node 22) y Netlify ejecuta funciones en
Node 20. `env()` (`_shared/env.ts`) lee `process.env` en deploy e
`import.meta.env` en dev (astro dev).

- **`netlify/functions/chat.ts`** — chat con IA contextualizado. Recibe
  `POST /api/chat` con `{ messages: [{ role, content }] }` (redirect Netlify
  `/api/chat → /.netlify/functions/chat`). El system prompt se arma en cada
  llamada con `_shared/context.ts` (fotografía pública de `raiddominion_guilds`,
  `raiddominion_characters`, `raiddominion_bands` y stats). UI en el **widget
  flotante global** `src/components/features/ChatWidget.astro` (anclado
  abajo-izquierda, incluido en `Layout.astro` → disponible en TODAS las
  páginas). No hay página `/chat`.
- **`netlify/functions/discord-daily.ts`** — Scheduled Function (cron de
  disparo horario UTC `0 * * * *`): usa el **motor de mercadeo**
  (`_shared/marketing`) para generar un mensaje dinámico enfocado a conversión
  y publicarlo en el webhook público de Discord. La **periodicidad real** se
  controla con la env `DISCORD_DAILY_HOURS` (horas UTC separadas por coma en
  las que sí publica; por defecto `6,10,14,18,22` ≈ 00‑17 esMX — es decir, 5
  envíos al día, el disparo horario descarta el resto de horas). Cambiar la
  cadencia = tocar la env, sin tocar código ni redeployar.
  **Idempotencia anti-duplicados (migración 20260925):** antes de evaluar y
  enviar, la función reclama el slot de su ventana horaria
  (`raiddominion_cron_claim_slot`, clave `YYYYMMDD-HH` UTC sobre
  `raiddominion_cron_slots` con `INSERT ... ON CONFLICT DO NOTHING`, atómico).
  Si otro disparo o un reintento de Netlify (las Scheduled Functions son
  at-least-once) ya tomó el slot, responde `skipped` y NO envía → solo un
  mensaje por ventana. Envs:
  `DISCORD_WEBHOOK_URL` / `DISCORD_PUBLIC_WEBHOOK_URL`; sin webhook, avisa y
  omite (no falla).
- **`netlify/functions/_shared/marketing.ts`** — motor de mercadeo inteligente
  (MISMO para cron y panel admin). Está orientado a generar NUEVOS USUARIOS
  del addon y CONTENIDO (subidas de SV, personajes validados, bandas y
  hermandades registradas), no solo visibilidad. Flujo por invocación:
  ① lee el snapshot de métricas (`raiddominion_marketing_stats`) → ② evalúa
  objetivos contra el histórico en `raiddominion_marketing`
  (`raiddominion_marketing_evaluate`): tendencia (up/hold/down) + `focus_boost`
  (objetivo bajo a priorizar) → ③ Groq redacta un mensaje de conversión con
  data real priorizando el foco; si se pasa `goalKey`, se focaliza en ese
  objetivo y el **eje** (bandas/hermandades/jugadores) se deriva de él
  (`ejeForGoal`) → ④ lo publica según **canal** (`test`/`prod`) vía
  `sendContent()`. NO persiste mensajes, solo estado de objetivos.
- **`netlify/functions/discord-send.ts`** — envío manual de un OBJETIVO a
  Discord desde el panel admin ("cuando quiera"). Recibe `POST /api/discord-send`
  con `{ goal_key, canal: 'test' | 'prod' }` (redirect `/api/discord-send →
  /.netlify/functions/discord-send`): el motor focaliza el mensaje en ese
  objetivo y lo publica. NO persiste nada. Cada tarjeta de objetivo del panel
  tiene sus dos botones (pruebas / público); el canal `test` usa
  `DISCORD_WEBHOOK_URL` (webhook privado/admin, SIN @everyone, CON logo,
  con IP/UA de quien lanzó la prueba en el pie del embed) y `prod` al público
  (con @everyone y logo). Solo alcanzable desde `/admin` (rol admin).
- **`netlify/functions/visit.ts`** — registro de visitas estilo guild-portal.
  El beacon de `Layout.astro` hace `POST /api/visit` con `{ path, page,
  visitorId }` en cada carga de página (redirect `/api/visit →
  /.netlify/functions/visit`). La función **excluye el tráfico local** —
  loopback, IPs privadas/RFC1918 y link-local (`isLocalIp`) y las IPs de la
  env `RD_IGNORED_IPS` (tu IP para no contarte a ti mismo ni en producción) —
  y registra el resto en `raiddominion_visits` vía el RPC SECURITY DEFINER
  `raiddominion_register_visit` (única vía de escritura; RLS bloquea el acceso
  directo) y, si es la 1ª visita de ese visitante a esa sección en 60 min
  (dedupe del RPC), avisa al **canal admin** de Discord
  (`DISCORD_WEBHOOK_URL`, `https://discord.com/api/webhooks/1475343307210100758/...`)
  con un embed **SIN logo** que presenta la **IP**, visitante,
  navegador (UA), origen (referrer), sección y ruta. La guardia de tráfico
  local existe en DOS capas: el endpoint (`isLocalIp` + `RD_IGNORED_IPS`,
  respuesta `skipped:true`) y el propio RPC (rechaza y NO inserta IPs
  loopback/RFC1918/link-local — por eso jamás aparecen en "Visitas a la web
  (7 días)"). Sin webhook, omite: nunca falla la página. Migraciones:
  `20260915_visits.sql` (tabla + RPC) y `20260920_visits_ip_cleanup.sql`
  (columna `ip`, limpieza de datos dev/test previos y rechazo local en el RPC).

Env adicionales (migración `20260920`): con `p_ip` al RPC, las visitas
registran la IP de cada visitante.
- **`_shared/`** — helpers comunes: `supabase.ts` (REST PostgREST con anon-key
  y `Accept-Profile: public`, RLS activa: solo lee datos públicos), `env.ts`
  (envs deploy/dev), `groq.ts` (`openai/gpt-oss-120b`, sobreescribible con
  `GROQ_MODEL`; modelo de razonamiento: `maxTokens` altos), `discord.ts`
  (webhooks), `context.ts` (contexto de comunidad), `marketing.ts` (motor).

### Migración de mercadeo (20260913_marketing_goals.sql)

Define/afina el sistema de mercadeo:

- Tabla `raiddominion_marketing` (objetivos de conversión + tendencia
  up/hold/down + `focus_boost` + target/current/previous).
- RPC `raiddominion_marketing_stats()` (snapshot de métricas, solo conteos,
  SECURITY DEFINER, GRANT anon/authenticated). **Atención:** si ya existía una
  versión anterior con distinta forma, el archivo hace `DROP FUNCTION IF EXISTS`
  antes del `CREATE OR REPLACE` (evita error 42P13).
- RPC `raiddominion_marketing_evaluate(p_stats jsonb)` (única vía de escritura
  al estado; calcula tendencia/foco, persiste y devuelve los objetivos).

> ⚠️ **Mensajes fijados (fuera de alcance, 2026-09-04):** la versión inicial de
> esta migración incluía `raiddominion_marketing_messages` + RPCs CRUD admin
> (`*_messages_admin`, `*_message_upsert`, `*_message_delete`). Se eliminaron del
> alcance: el panel de /admin solo envía los objetivos. Si la base llegó a
> recibirlos, aplicar `20260913_marketing_remove_messages.sql` para limpiarlos.

Si la base aún no la tiene, aplicarla a mano en el SQL Editor del proyecto
RaidDominion y registrarla en `ciclos.json`; si ya está aplicada, no hace
falta re-aplicarla.

### Migración de regeneración de metas (20260922_marketing_target_regrowth.sql)

Modifica `raiddominion_marketing_evaluate` para que **al cumplirse una meta
(`current >= target`) el objetivo "renazca" con una meta nueva más exigente**:
`new_target = GREATEST(target + 1, ceil(target × 1.5))` (ej. 1→2, 3→5, 8→12,
10→15, 30→45). Sin esta migración, un objetivo cumplido quedaba fuera de
`focus_boost` para siempre; con ella, si se estanca bajo la nueva meta vuelve
a priorizarse. Aplicarla manualmente en el SQL Editor y registrarla en
`ciclos.json`.

### Migración de tráfico orgánico (20260918_marketing_traffic.sql)

Ampliación del sistema de mercadeo con estadísticas de **visitas**
(`raiddominion_visits`, migración 20260915): 4 objetivos nuevos
(`visits_weekly`, `visitors_30d`, `visits_upload_7d`, `visits_directory_7d`)
y `raiddominion_marketing_stats()` ampliado con esas métricas (DROP + CREATE
OR REPLACE por cambio de tipo de retorno). Aplicarla manualmente en el SQL
Editor del proyecto RaidDominion y registrarla en `ciclos.json`.

Env adicionales: `GROQ_API_KEY` (Groq), `GROQ_MODEL` (sobreescribe el modelo de
Groq; por defecto `openai/gpt-oss-120b` — la disponibilidad de modelos en la
cuenta rota, ver `_shared/groq.ts`), `DISCORD_WEBHOOK_URL` (webhook
privado/admin: test de mercadeo y avisos de visitas),
`DISCORD_PUBLIC_WEBHOOK_URL` (canal público),
`DISCORD_DAILY_HOURS` (periodicidad del cron, ver `discord-daily.ts`),
`SITE_URL` (sobreescribe la URL canónica del portal; por defecto
`https://raid-dominion.netlify.app`). El `.env` local está en `.gitignore`;
configurar las mismas vars en Netlify.

Formato de los mensajes de mercadeo (cron y panel, ambos usan el MISMO motor):
- **Canal público (`prod`)**: una CAPTURA del addon como imagen del embed
  (`embed image`, desde `public/images/addon/*.jpg`), rotada de forma
  **balanceada según el eje del mensaje** (bandas/hermandades/jugadores) vía
  RPC `raiddominion_marketing_pick_image` (tabla `raiddominion_marketing_images`,
  migración 20260925; fallback determinista en `_shared/addonImages.ts` si el
  RPC no está aplicado) + logo como thumbnail + @everyone + CTA.
- **Canal admin/pruebas (`test`)**: MISMO embed con captura + CTA y logo
  thumbnail, SIN @everyone; es un preview de monitoreo con la **IP** y UA de
  quien lanzó la prueba en el pie del embed.
- **Solo los avisos de VISITAS (`visit.ts`) van SIN captura** (embed con IP y
  datos del visitante), también al canal admin.
- **Enlace útil de la plataforma con CTA** en ambos (título clicable del
  embed + línea markdown `➜ **<label>**: <url>` según eje): `/upload`,
  `/hermandades`, `/bandas`.
- **Formato balanceado y atractivo**: negritas en cifras/paso clave, máx. 3
  viñetas, entre 1 y 3 emojis colocados con mesura, CTA final. El prompt
  instruye NO incluir URLs (las agrega el código de forma determinística).

Canales del Discord comunitario (solo referencia; el envío usa el webhook URL
completo, Configurados en `.env`/Netlify):
- **Admin / pruebas y visitas** `1475343307210100758` → `DISCORD_WEBHOOK_URL`
  (webhook privado: botón "Pruebas" de cada objetivo y avisos de visitas;
  mensajes SIN @everyone).
- **Público / chat general y cron** `1475350391960109108` →
  `DISCORD_PUBLIC_WEBHOOK_URL` (canal público: cron `discord-daily` y botón
  "Público" de cada objetivo; con @everyone y captura del addon).

## 13. Changelog de este archivo

- **2026-10-25 (datos pasivos desde characters)**: el addon v3.2.0 deja de
  duplicar el array de equipo y las instancias en `registry[].player`; esos
  datos pasivos viven en `characters[]` y el parser v3.7.0 los superpone al
  personaje registrado (nivel/raza/clase incluidos), con `registry` como
  fallback para SV antiguos. `registry` sigue siendo la única fuente de
  registro: `characters` nunca crea fichas. Sin migración SQL: el RPC recibe
  el `p_player` ya mezclado. Detalle: `parser.md` y `addon.md`.

- **2026-10-24 (tooltips de juego)**: el portal adopta el método de tooltip de
  `wow-rd`: `power.js` de UltimoWoW, `data-wowhead="kind=id"` y URL
  `https://wotlk.ultimowow.com/es/?kind=id` (carga perezosa). El parser
  conserva `itemID` del equipamiento; las fichas pública y del tracker aplican
  tooltip a equipo y metas; las filas antiguas sin `itemID` quedan como texto
  plano (se completan al re-subir el SV).
  Se persisten tokens ricos de la nota (`raiddominion_character_notes.note_rich`)
  y el enlace del nombre de banda (`raiddominion_bands.name_link`); ambos usan
  el mismo render. Parser v3.6.0: `itemID` de equipo y `noteRich`. Las filas
  ya guardadas sin esos campos se completan al re-subir el SV. Migración `20261024_game_links_tooltips.sql`, pendiente de
  aplicación manual. Detalle: `design.md` §11 y `parser.md`.

- **2026-10-23 (Task Tracker del dashboard)**: la pestaña Personajes conserva
  "Datos del perfil" y suma debajo el **Task Tracker** adaptado de
  `C:\xampp\htdocs\wow-rd`: catálogo manual por cuenta, tarjetas
  colapsables con progreso/tabs (Activas, Marcadas, Inactivas, Instancias,
  Monedas), selección y acciones masivas, filtros/orden, leyenda interactiva,
  ficha en línea (`#personajes/ficha/<slug>`) y catálogo
  (`#personajes/catalogo`). Los datos del personaje salen de las subidas SV;
  **GearScore no existe en el portal** (se usa iLvl/piezas/visto). El estado
  privado vive en `raiddominion_tracker_catalog`,
  `raiddominion_character_tracker` y `raiddominion_character_tasks`
  (migración `20261023_character_task_tracker.sql`, pendiente de aplicación
  manual). Parser v3.5.0: `characters[]` expone `currencies`/`money`. Detalle:
  `supabase-tables.md` y `parser.md`.

- **2026-10-19 (core de banda)**: las placas del Core de `/banda/:slug`
  muestran sus badges solo como icono (integración, líder, baneado, dual,
  sanción y puntos) y el contenido cierra con un pie de leyenda fijo que
  decodifica los seis iconos; el valor exacto queda en `title`/`sr-only`.
  Detalle en `design.md` §7e.

- **2026-10-19 (ficha de servidor)**: `/servidor/:server` estandariza su
  lista de Reinos en una ventana `PanelWindow` con la barra de filtros
  (`createFilterBar`, buscador) y el paginador único; era la única ficha que
  quedó fuera del barrido de listas.

- **2026-10-19 (video del addon)**: la landing incrusta el video de
  presentación en la tarjeta "ADDON WOW 3.3.5A" mediante `VideoEmbed.astro`
  (fachada clic-para-reproducir + iframe `youtube-nocookie`, fallback al
  `watch`); dato único en `ADDON_VIDEO`. Detalle en `design.md` §7d.

- **2026-10-19 (filtros y paginador en pestañas)**: buscador+facetas
  (`createFilterBar`) y paginador (`createPaginator` / `packSections`) en
  todas las pestañas de lista del portal y del dashboard; extraído el
  paginador del roster a `src/lib/ui/paginator.ts` (tokens `ui.pager.*`,
  `PAGE_SIZE_GRID`/`PAGE_SIZE_LIST`); portal Reglas sin tope de 20. Detalle
  en `design.md` §7b.1/§7c y su historial.

- **2026-10-18 (luz espectral de contenedores)**: las placas de encabezado
  ganan la **chispa de vértice** que ya tenían las cabeceras de panel
  (destello radial del corte) y AMBAS estructuras (encabezados de página y
  títulos de contenido) llevan ahora una **banda espectral** que respira y
  vaga por el borde superior (vaivén ±18px; en combos de metal el vaivén es
  por capa con el bisel clavado en la esquina). Con `prefers-reduced-motion`
  todo conserva solo la respiración lenta (el vaivén se retira). Verificado
  por CSSOM (ambos branches) y píxeles (banda y chispa visibles en placa,
  panel y head; móvil 390). Detalle en `design.md` (historial).

- **2026-10-18 (contenedores vivos)**: encabezados y contenedores de
  contenido de todas las páginas suman luz viva (misma familia del pulso de
  divisores, portadoras propias): **bisel helado** en el corte diagonal
  sup-izq de todos los encabezados (placas `ui.plaque` y cabeceras de panel
  `ui.cutTop` — línea pegada al filo + resplandor, respirando) y **costuras
  de panel que respiran** (`.rd-metal::after` en paneles/cabeceras/cuerpos).
  Cards regulares quedan fuera a propósito (su vida es el hover). Con
  `prefers-reduced-motion` todo respira lento en opacidad pura (sin
  traslación). Verificado por CSSOM y píxeles (filos y costuras en portal,
  directorio, upload y móvil). Detalle en `design.md` (historial).

- **2026-10-18 (divisores)**: todos los divisores (`ui.divider`,
  `dividerFadeBoth`, `dividerFadeLeft`) y el separador inferior de las tab
  bars comparten ahora un sistema único en material.css: el trazo hairline
  (`border-image` anti-subpixel) con un **bloom helado de dos capas que
  respira** — la línea también late (opacidad del elemento) y el halo flota
  en vaivén espectral (solo opacity/transform, cero impacto en layout; sin
  partículas — la ventisca de puntos se retiró a pedido). El legacy
  `.rd-divider` (rombo ❖ sin uso) es la nueva base de `ui.divider`. Con
  `prefers-reduced-motion` se atenúa (respiración lenta de opacidad pura,
  sin traslación), no se congela. Verificado con píxeles (valle vs pico:
  línea 82→195; bloom simétrico; sin partículas) y CSSOM (branch animado con
  opacidad/transform a media animación) en landing, portal de hermandad y
  directorio (1400/390). Detalle en `design.md` (historial).

- **2026-10-18 (cifras de la landing)**: la placa de cifras pierde
  "multiservidor" y "pasos" (quedan cliente WoW / gratis), con label y cifra
  centrados en cada celda. Correcciones de alineación: el span `cardTop` sale
  de la tira (era el primer hijo del flex y anulaba los `first:`/`last:` del
  token → hairline fantasma + 16px de sangría en la 1ª celda), se retira el
  `gap-x-6` (sumado al `px-4` dejaba el separador a 40/16) y las celdas usan
  `!px-4 text-center` (simetría con el centrado); hairline solo desde `sm`
  (sin separadores sueltos si la fila envuelve). Verificado midiendo geometría
  real (harness iframe, dpr 1) a 390 y 1400: centros de placa/tira/celdas
  coincidentes y paddings simétricos. Detalle en `design.md` (historial).

- **2026-10-18 (paginador de roster)**: en el portal de hermandad, el número
  de página de "Página [X] de Y • N miembros" es un desplegable de salto
  directo a cualquier página (`renderRoster`, `preview.ts`), sincronizado con
  los botones prev/next. Verificado con el roster de 101 páginas
  (`/hermandad/colmillo-de-acero`).

- **2026-10-18 (placa de encabezado)**: `ui.plaque` con la geometría y
  superficie de la ventana de contenido — diagonal sup-izq (`rd-cut` +
  `rounded-tl-md`), resto recto (antes `rounded-md` en las 4 esquinas) y
  SURFACE `bg-brand-900/60` (antes `bg-brand-950/80`). Cubre las 14 páginas
  con encabezado (directorios, fichas, staff, 404, landing). Detalle en
  `design.md` (historial).

- **2026-10-18 (tiras de contexto de fichas)**: los chips de servidor/reino
  salen de los encabezados y viven en la tira de contexto tras el divisor
  final (`ui.contextStrip`: `hidden flex flex-wrap gap-2 mt-10`; el respiro
  divisor→tira sigue la relación divisor→contenido del directorio) en
  personaje, jugador, reino y portal de hermandad, con formato único
  (`serverRealmLinks` en `card.ts`) y guard de tira vacía. Se eliminan los
  `space-y` de `#profile` y `#portal`: su selector (0,3,0) pisaba el `mt-12`
  del divisor y añadía margen fantasma a la tira. Verificado con capturas
  headless en las 4 rutas. Detalle en `design.md` (historial).

- **2026-10-17 (auditoría general)**: fondo de página al **45%**
  (`--rd-img-opacity` en `.rd-atmosphere__image`; velo 0.3 intacto) y
  `prefers-reduced-motion` neutraliza delays inline. Póster extendido a
  staff (`login`, `upload`, `dashboard`, `admin`, `moderado`, `404` → placa
  + medallón) y a la landing (`GrandLogo`: h1 roto por `text-md` inexistente
  → escala hero en placa de marca; stats a `ui.statBlock`). Barrido F011
  COMPLETO (≈50 literales → `gray-400`; solo restos no textuales); fix del
  bug `class="${ui.badgeStat}"` (literal) ×11 del dashboard; superficies
  fantasma → `ui.panel`/`ui.surf.row` (upload/admin/moderado); código muerto
  borrado (`NewsSection`, `YoutubeBanner`, `RaidSection` + `raids.json`);
  copys corregidos contra el flujo real (claim sin moderador inexistente,
  pasos de hermandad, origen del SV, canal de pruebas) y Footer 2026.
  Fuera de alcance: refactor de tab bars a `createTabBar`, sección de
  conversión de la landing. Detalle en `design.md` (historial).

- **2026-10-17 (directorios)**: cabecera de los 5 directorios a placa de
  identidad con medallón (`PageHeader` gana prop `icon` + `ui.plaque`;
  `DirectoryPage` pasa `panelIcon` y `/bandas` `espadas`); captions de
  directorio a `gray-400` (AA, F011), placeholders, contador de filtros y
  `ui.text.caption` incluidos; `cardLink` con `focusRing`; grillas
  `gap-5 sm:gap-6` y divisor unificado. Detalle en `design.md` (historial).

- **2026-10-17 (póster de fichas)**: sistema de diseño "póster" (§12 de
  `design.md`): placa de identidad en el héroe (`ui.plaque` — el texto suelto
  se disolvía sobre la imagen), medallón héroe del sprite con halo de color
  de clase, tira de cifras (`ui.statBlock`), filas de dato con contenedor
  (`ui.surf.row`) y lenguaje del ítem (`ui.item` + `itemRow()`: el nombre es
  el protagonista, en color de calidad). Aplicado a la ficha de personaje
  (equipo en grilla de 2 columnas, metas/instancias/notas con superficie) y a
  los encabezados de jugador/banda/servidor/reino/portal de hermandad. La
  escala de iconos gana el tier `hero` (48→80px) y `xl` crece a 40→56px; el
  avatar de clase (JPG de 18px a 96px, `frallas.md` F023) se sustituye por
  medallón del sprite + miniatura de clase a 20px.

- **2026-10-17 (enlaces del juego)**: el parser ahora limpia el markup de
  chat de WoW en los textos del SV (`src/lib/wowLink.ts`; p. ej.
  `bands[].name` = enlace del logro: `|cffffff00|Hachievement:4608:…|h[ICC25N]|h|r`
  → `ICC25N`), con `Band.nameLink` en memoria para el tooltip del widget
  oficial de Wowhead (`src/lib/ui/wowhead.ts`, carga perezosa; también para
  metas de equipo con `itemID`). `PARSER_VERSION` → v3.4.0; migración de
  limpieza `20261017_bands_name_wow_markup_cleanup.sql` para bandas ya
  guardadas con markup (ver `parser.md` → «Markup de chat» y F022).

- **2026-10-17 (paleta y entrada)**: identidad azul/acero adoptada
  (Abismo/Acero/Hielo/Plata/Energía; §1b de `design.md`) sustituyendo la
  ámbar/dorada en tokens, `material.css` y 35 archivos; eliminado el
  `<style>` legacy de `GrandLogo` que sombreaba `@keyframes fadeIn` y
  desplazaba el layout 10px al entrar (F021); escala de prominencia
  responsiva de los iconos `lg`/`xl` y tokens `ui.iconTileMd/Lg` (§10).

- **2026-10-16 (iconos)**: adoptado el sistema de 65 iconos temáticos
  (`src/lib/ui/icons.ts` + `Icon.astro`/`iconEl` + `icons.css` +
  `scripts/icons-sheet.py`; sprite normalizado en `public/icons/`),
  integrado en toda la plataforma; añadido el contrato único de iconos a §7
  y los archivos a §6. Detalle visual en `design.md` §10.

- **2026-10-16**: agregada la prohibición absoluta de detener el servidor de
  Live Preview del usuario (puerto 4321): los agentes nunca lo matan ni lo
  reinician; pruebas propias en puerto alterno y kill solo por PID propio
  (§9). Agregada F013 del mismo tema en `frallas.md`.
- **2026-08-30 (rutas)**: canonicalización del mapa de rutas en español —
  portal de hermandad de raíz `/:slug` → **`/hermandad/:slug`** (shell
  `src/pages/hermandad/index.astro` + rewrite `/hermandad/*`; raíz legacy 301);
  directorio `guilds` → **`/hermandades`** (canónico, `guilds` legacy 301);
  fichas fuera del shell `/detalle` → páginas dedicadas
  `personaje.astro`/`servidor.astro`/`banda.astro` (+`DetailShell.astro`);
  perfil de jugador única ruta `/jugador/:slug` (se eliminó `/p/:slug` y el
  modo 'character' muerto de JugadorProfile). Eliminados `/detalle` y `/p`.
- **2026-08-30**: separadas las convenciones visuales a
  `AGENTS.sections/design.md` (antes mezcladas en `priorities.md`);
  documentado el modelo de sesión única (Zeus + servidor); formalizada la
  política de migraciones manuales sin CLI con checklist y ledger en
  `ciclos.json`; unificadas las rutas locales del addon en un solo archivo
  de referencia; agregado gate mínimo de accesibilidad a `qa.md`.
