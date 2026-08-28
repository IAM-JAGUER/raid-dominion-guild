# Plan de Transformación — Portal Comunitario Oficial de RaidDominion

> Documento rector de la conversión del sitio actual (landing estática de la
> hermandad Colmillo de Acero) en el **portal comunitario oficial del addon
> RaidDominion** (WoW 3.3.5a, esMX).

## 1. Contexto y estado actual

| Ítem | Estado actual |
| --- | --- |
| Sitio | `raid-dominion-guild` — Astro 4 + Tailwind, landing estática de una página |
| Contenido | Secciones: Inicio, Raids, Comunidad, Addon, Donaciones |
| Datos | `public/players.json` (roster), `src/data/raids.json`, `public/guildList.py` (parser Lua→JSON) |
| Backend | Ninguno (estático, deploy Netlify) |
| Addon | RaidDominion v3.0.0 para WoW 3.3.5a — `D:\_DEV\RaidDominion - main` (git oficial de descarga) |
| Addon dev | `D:\WowClient esMX\Interface\AddOns\RaidDominion` (versión de desarrollo, más reciente) |
| SavedVariables | `RaidDominionDB` — contiene `Guild` (memberList, generatedBy, lastUpdate), `roles`, `Core` (bandas), `ui`, `general`, `assignments`, `rules`, `chat` |

## 2. Visión (SaaS contextualizado)

El portal es un **SaaS de comunidad** para usuarios del addon RaidDominion,
con analogía directa a agendalisto (`cliente → business_owner`):

1. **Cualquier usuario sube su SavedVariables** (`/upload`).
   - Si el SV **valida que es maestro de hermandad** (`generatedBy` con rango
     de liderazgo) → rol `guild_master` vía `raiddominion_claim_guild`.
   - Si no → rol `member`.
2. **`member`** (análogo al `client` de agendalisto): control básico de su
   cuenta — decide si sus datos y perfil son públicos o privados, ve su
   historial de análisis, gestiona su nombre visible.
3. **`member` → `guild_master`**: únicamente subiendo un SV que acredite
   liderazgo y reclamando su hermandad (RPC segura; sin atajos manuales).
4. **`guild_master`** (análogo al `business_owner`): además de su perfil
   personal, obtiene una **página pública de su hermandad, personalizable**
   (`/:slug`), donde presenta los datos de su RaidDominion (roster, bandas,
   horarios, reglas) con control total — como un negocio en agendalisto.
5. **Para la comunidad**: directorio público de hermandades registradas.

## 3. Arquitectura

- **Framework**: Astro 4 (existente) + Supabase (backend) — transformación progresiva.
- **Backend**: instancia Supabase **compartida del ecosistema** (agendalisto,
  lexigo, encuentrosvip, guild_portal). Nueva app `raiddominion`.
- **Prefijos**: TODAS las tablas nuevas con prefijo `raiddominion_`.
- **Auth**: `supabase.auth` estándar. `handle_new_user()` canónico en
  `../supabase-shared/handle_new_user.sql` (NO redefinir — coordinar cross-app).
- **Deploy**: Netlify (Node 20), como el sitio actual.

### 3.1 Modelo de roles (estilo agendalisto)

| Rol | Índice | Auto-asignable | Acceso principal |
| --- | --- | --- | --- |
| `member` | 0 | ✅ | Landing, directorio público, subir SV, dashboard personal, **perfil jugador público `/p/:slug`** |
| `guild_master` | 1 | ✅ (al reclamar hermandad) | Dashboard de su hermandad, **portal público en raíz `/:slug`**, editar/actualizar |
| `moderator` | 2 | ❌ (solo admin) | Revisar verificaciones, moderar directorio y portales públicos |
| `admin` | 3 | ❌ (solo admin) | Gestión de usuarios, moderación total, acceso total |

Helper en `src/lib/roles.ts`:
- `canAccessGuildDashboard(role)` → `guild_master`, `admin`, `moderator`
- `canManageGuild(role)` → `guild_master`, `admin`
- `isStaff(role)` → `admin`, `moderator`

**Seed del primer admin**: inserción manual en DB
(`UPDATE raiddominion_profiles SET role='admin' WHERE user_id = (SELECT id FROM auth.users WHERE email='…')`),
ejecutada por el operador; nunca desde el cliente ni RPC pública.

### 3.1.1 Walkthrough: perfil público → hermandad pública

```
member
  1. Registro → role=member (handle_new_user)
  2. Completa perfil (display_name, personaje, realm) en /dashboard
  3. Toggle "Perfil público" → página de jugador viva en /p/:slug
     (personajes, clase, hermandad si pertenece — sin datos privados)
  4. Sube SavedVariables → preview del roster/bandas
  5. Si el SV lo acredita como líder (generatedBy + rank):
     "Reclama tu hermandad" → RPC raiddominion_claim_guild
     → role=guild_master + raiddominion_guilds.slug autogenerado
     (si rank no confirmable → claim pending para moderador)
  6. Dashboard hermandad: edita ficha (nombre, logo, descripción,
     horarios, discord) → toggle "Hermandad pública"
     → portal vivo en /:slug con roster, bandas y reglas públicas
  7. Re-subir SV actualiza roster/bandas del portal sin tocar la ficha
```

El slug se genera desde el nombre de la hermandad (kebab-case, único,
validado contra lista de slugs reservados).

### 3.2 Flujo del usuario

```
Visitante anónimo → landing pública (descarga, directorio, info)
        │
        ├─ Registro → auth.users → handle_new_user() → raiddominion_profiles (role=member)
        │
        └─ Upload SavedVariables (requiere login, rol member)
              │
              ├─ Parser valida RaidDominionDB (v3.0.0 oficial)
              ├─ Detecta Guild (memberList, generatedBy, lastUpdate)
              ├─ Si generatedBy tiene rango de maestro → invita a registrar hermandad
              │      └─ createGuild() → raiddominion_guilds + updateProfileRole('guild_master')
              │             └─ Perfil/hermandad pública + dashboard de actualización
              └─ Si no → resultado parcial (stats de roster) + CTA "Reclama tu hermandad"
```

**Verificación de maestro**: se apoya en el dato `Guild.generatedBy`
(personaje que exportó la lista) y su `rank` dentro de `memberList`
(rango de liderazgo). Si el parser no puede confirmar rango de liderazgo,
el claim queda `pending` y un `moderator` lo revisa (manual, vía Discord).

### 3.3 URLs públicas y slugs (decisión validada)

| URL | Contenido | Acceso |
| --- | --- | --- |
| `/:slug` | **Portal público de hermandad en raíz** (como agendalisto): hero, roster, bandas, horarios, reglas públicas, Discord | público |
| `/p/:slug` | Perfil público de jugador: personajes, clase, hermandad | público |
| `/guilds` | Directorio con búsqueda y filtros | público |

- **Implementación (build estático)**: shells cliente `src/pages/portal.astro`
  y `src/pages/jugador.astro` + rewrites Netlify (`/:slug → /portal`,
  `/p/* → /jugador`); los archivos reales de `dist/` tienen prioridad sobre
  los rewrites, así el comportamiento equivale al catch-all sin adapter SSR.
- Resuelven client-side contra Supabase: guilds públicas o propias del owner
  (RLS), perfiles públicos si `is_public` (migración `20260103_public_pages.sql`),
  snapshot del portal en `raiddominion_guild_config.config_key='portal_snapshot'`.
- **Slugs reservados** (nunca asignables a hermandades): `upload`, `login`,
  `dashboard`, `admin`, `moderate`, `guilds`, `p`, `api`, `assets`, `_astro`,
  `portal`, `jugador`, además de archivos reales de `public/`.

### 3.4 Administración y moderación

- **`/admin`** (solo `admin`): búsqueda de usuarios, ver rol y membresía de
  apps, cambiar rol vía RPC SECURITY DEFINER admin-only, suspender/reactivar.
- **`/moderate`** (`admin` + `moderator`): cola de claims `pending`
  (verificación manual del rank), reportes sobre portales/perfiles públicos,
  takedown (`is_public=false`).
- **Auditoría**: tabla `raiddominion_audit_log` (actor, acción, objetivo,
  timestamp) para toda acción staff; solo lectura para staff, sin borrado.

### 3.5 Esquema Supabase (nuevas tablas, prefijo `raiddominion_`)

| Tabla | Propósito |
| --- | --- |
| `raiddominion_profiles` | Perfil del usuario: `role`, `display_name`, `character_name`, `realm` |
| `raiddominion_guilds` | Hermandad: `slug`, `name`, `realm`, `faction`, `discord_link`, `description`, `is_public`, `owner_id` |
| `raiddominion_guild_members` | Roster parseado del SV: `guild_id`, `name`, `class`, `rank`, `race`, `public_note`, `officer_note` |
| `raiddominion_saved_variables` | Uploads: `user_id`, `guild_id`, `addon_version`, `generated_by`, `status`, `raw` (JSONB), `parsed_at` |
| `raiddominion_guild_config` | Config extra del SV (bandas `Core`, roles, `ui`, reglas) en JSONB |
| `raiddominion_audit_log` | Auditoría de acciones staff: `actor_id`, `action`, `target`, `created_at` |

Reglas (ver AGENTS.md sección CRITICAL): RLS solo `auth.uid() = user_id`,
políticas con prefijo `raiddominion_`, `IF EXISTS/IF NOT EXISTS`, nunca
`DROP TABLE` sin verificar prefijo, no tocar tablas de otras apps.

## 4. Roadmap (fases)

### Fase 1 — Fundación (parser + upload + auth) ✅
- [x] Esquema Supabase (`supabase/migrations/20260101+`) con tablas `raiddominion_`
  (profiles, characters, roster_evidence, guilds, guild_members,
  saved_variables, guild_config, audit_log) + RPCs SECURITY DEFINER
- [x] App `raiddominion` registrada + bloque canónico compartido
- [x] `src/lib/supabase.ts` (cliente tipado + puente de env por SSR +
  headers Accept/Content-Profile), `src/lib/roles.ts` (5 roles),
  `src/lib/api.ts`
- [x] **Parser v3.1 dual-shape** (verificado contra IAMM/IAMM1/JUNGJX):
  registry plano o mapa por personaje, equipamiento completo,
  characters de cuenta, registry.guild (isGM), bandas reales sin
  attendance/gearScore; evidencia = memberList legacy + jugadores de banda
- [x] `/upload` con parseo cliente, preview ordenado y registro automático

### Fase 2 — Cuentas y dashboard ✅
- [x] Registro/login Supabase + perfiles; cuentas cross-app crean perfil al
  vuelo (migración 20260105); nuevas cuentas nacen `visitante` (trigger)
- [x] `/dashboard`: Resumen, Mi Perfil, Mis Personajes (visibilidad por
  personaje), Configuración Addon, Historial SV con visor, Mi Hermandad, Seguridad
- [x] Onboarding anti-falseo: visitante→member SOLO con evidencia cruzada
  de roster subido por otro usuario (`raiddominion_try_promote_member`);
  unicidad global (nombre, reino) por cuenta
- [x] Hermandad SIN formularios: `raiddominion_claim_from_sv` lee
  `registry.guild.isGM` del JSONB guardado → auto GM con datos exactos del SV;
  ficha de solo lectura que se actualiza re-subiendo
- [x] Logout en navegación (escritorio + móvil)

### Fase 3 — Perfil público y directorio
- [x] Portal de hermandad en raíz `/:slug` (shell `portal.astro` + rewrite,
  slugs reservados y estado "no encontrado" si no existe)
- [x] Perfil público de jugador `/p/:slug` (toggle desde `/dashboard`,
  slug vía RPC `raiddominion_ensure_profile_slug`)
- [x] Dashboard hermandad (pestaña "Mi Hermandad" en `/dashboard`): ficha
  editable + toggle `is_public` que publica el portal + snapshot sincronizado
- [x] Directorio `/guilds` con búsqueda y filtros

✅ Migraciones 20260103–20260108 aplicadas y verificadas vía API.

### Fase 3.5 — Administración y moderación
- [ ] Seed manual del primer admin por email (operación del operador):
  `UPDATE raiddominion_profiles SET role='admin' WHERE id=(SELECT id FROM auth.users WHERE email='…')`
- [x] `/admin`: gestión de usuarios (roles vía RPC `raiddominion_admin_set_role`,
  listado vía `raiddominion_admin_list_users`; sin auto-cambio de rol propio)
- [x] `/moderate`: cola de claims `pending` (aprobar/rechazar con
  `raiddominion_verify_guild_claim` v2, que sincroniza roster sin officer_note),
  takedown/republicación (`raiddominion_staff_set_guild_public`)
- [x] `raiddominion_audit_log` + registro automático en RPCs staff
  (lectura RLS solo staff)

> ⏳ Pendiente: ejecutar `20260109_guild_claim_sv.sql` (reclamo desde SV).

### Fase 4 — Comunidad y mantenimiento
- [x] Verificaciones por moderadores (`/moderate`)
- [ ] Feedback: stats de hermandades (miembros, clases, rangos)
- [x] Límites de tamaño (≤2 MB) y sanitización de uploads; los SV nunca
  tocan disco (cliente → Supabase), no aplica gitignore de SV subidos
- [ ] Migración de datos: `public/players.json` → `raiddominion_guild_members`

## 5. Equipo de agentes (implementado en `.opencode/`)

| Agente | Rol en este proyecto |
| --- | --- |
| `ui-ux` | Accesibilidad, responsive, consistencia del tema WoW (ámbar/dorado), i18n es |
| `product` | Features de comunidad, flujo member→guild_master, conversión del upload |
| `development` | Implementación: Supabase, parser SV, dashboards, rutas Astro |
| `refactorer` | Refactor seguro que preserva comportamiento; divide archivos grandes |
| `qa` | Revisión: types, build `astro check`, seguridad RLS, reglas multi-app, límites del parser |

Flujo recomendado: `product` define → `development`/`ui-ux` implementan →
`refactorer` mantiene → `qa` aprueba antes de commit.

## 6. Reglas de oro

- El parser prioriza el **formato oficial v3.0.0** (`RaidDominionDB` de
  `D:\_DEV\RaidDominion - main`); el formato dev del WoW client es secundario.
- Toda tabla/columna/política nueva lleva prefijo `raiddominion_`.
- `handle_new_user()`, `sanitize_signup_role()`, `ensure_user_app()` son
  canónicas en `../supabase-shared/` — no redefinir.
- `raiddominion_profiles.role` es la única fuente de verdad del rol del usuario.
- Nunca subir SV a `public/`; guardar parseos en Supabase.

## 7. Plan de skills (validado: plataforma + agentes)

### 7.1 Skills de la plataforma (features para excelencia)

| Skill | Propósito | Fase |
| --- | --- | --- |
| **SEO de portales** | OG/meta por hermandad, `sitemap.xml` dinámico con guilds públicas, `robots.txt` | 3 |
| **Compartir** | Botón copiar link, OG image por hermandad (nombre+logo) | 3 |
| **Notificaciones** | Email transaccional Supabase: claim aprobado/rechazado, SV procesado | 3.5 |
| **Reportes** | Botón "reportar" en portales públicos → cola `/moderate` | 3.5 |
| **Auditoría** | Registro automático de acciones staff en `raiddominion_audit_log` | 3.5 |
| **i18n esMX** | Textos consistentes en español mexicano, sin mezclas | transversal |
| **Accesibilidad AA** | aria-labels, contraste ámbar/oscuro, foco visible, teclado | transversal |
| **Límites y seguridad** | Upload ≤2 MB, rate-limit, sanitización, RLS estricta | transversal |

### 7.2 Skills de agentes opencode (`.opencode/skills/`)

Skills inyectables que codifican conocimiento crítico para los subagentes:

| Skill | La invocan | Contenido |
| --- | --- | --- |
| `wow-theme` | `ui-ux`, `product` | Tema WoW: ámbar/dorado sobre oscuro, `rounded-md` máx salvo círculos, patrones de componentes |
| `sv-parser-v3` | `development`, `qa` | Formato real RaidDominionDB v3.0.0 (perfiles JUNGJX/IAMM), parser estructural, casos borde, límite 2 MB |
| `supabase-multiapp` | `development`, `qa` | Ecosistema compartido: prefijos, RLS, `handle_new_user()`, RPCs SECURITY DEFINER |
| `public-slugs` | `development`, `qa` | Esquema `/:slug` + `/p/:slug`, slugs reservados, catch-all, SEO mínimo |

Creación incremental: cada skill nace cuando un agente repite el mismo error
dos veces o cuando el conocimiento crítico vive solo en la cabeza del operador.