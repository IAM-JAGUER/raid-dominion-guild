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

## 2. Visión

Convertir el sitio en la **casa de la comunidad del addon**:

1. **Para el jugador común**: descargar el addon (versión oficial v3.0.0),
   subir su archivo `SavedVariables` y obtener valor inmediato (stats de su
   hermandad, roster, bandas, roles).
2. **Para el maestro de hermandad**: si el upload se verifica como maestro,
   se le invita a registrar su hermandad y recibe **un portal web gratuito
   para su guild** (perfil público + dashboard de actualización).
3. **Para la comunidad**: un directorio público de hermandades registradas
   con RaidDominion, con roles de usuario progresivos (estilo agendalisto).

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
| `member` | 0 | ✅ | Landing, directorio público, subir SV, dashboard personal |
| `guild_master` | 1 | ✅ (al reclamar hermandad) | Dashboard de su hermandad, perfil público de la guild, editar/actualizar |
| `moderator` | 2 | ❌ (solo admin) | Revisar verificaciones, moderar directorio |
| `admin` | 3 | ❌ (solo admin) | Acceso total |

Helper en `src/lib/roles.ts`:
- `canAccessGuildDashboard(role)` → `guild_master`, `admin`, `moderator`
- `canManageGuild(role)` → `guild_master`, `admin`
- `isStaff(role)` → `admin`, `moderator`

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

### 3.3 Esquema Supabase (nuevas tablas, prefijo `raiddominion_`)

| Tabla | Propósito |
| --- | --- |
| `raiddominion_profiles` | Perfil del usuario: `role`, `display_name`, `character_name`, `realm` |
| `raiddominion_guilds` | Hermandad: `slug`, `name`, `realm`, `faction`, `discord_link`, `description`, `is_public`, `owner_id` |
| `raiddominion_guild_members` | Roster parseado del SV: `guild_id`, `name`, `class`, `rank`, `race`, `public_note`, `officer_note` |
| `raiddominion_saved_variables` | Uploads: `user_id`, `guild_id`, `addon_version`, `generated_by`, `status`, `raw` (JSONB), `parsed_at` |
| `raiddominion_guild_config` | Config extra del SV (bandas `Core`, roles, `ui`, reglas) en JSONB |

Reglas (ver AGENTS.md sección CRITICAL): RLS solo `auth.uid() = user_id`,
políticas con prefijo `raiddominion_`, `IF EXISTS/IF NOT EXISTS`, nunca
`DROP TABLE` sin verificar prefijo, no tocar tablas de otras apps.

## 4. Roadmap (fases)

### Fase 1 — Fundación (parser + upload + auth)
- [ ] Crear esquema Supabase (`supabase/migrations/`) con las 5 tablas `raiddominion_`
- [ ] Registrar app `raiddominion` en `public.apps` y añadir bloque en `handle_new_user()`
- [ ] `src/lib/supabase.ts` (cliente tipado), `src/lib/roles.ts`, `src/lib/api.ts`
- [ ] **Parser de SavedVariables v3.0.0** en `src/lib/parser/savedVariables.ts`
  (reemplaza/mejora `public/guildList.py`): valida `RaidDominionDB`,
  extrae `Guild`, `Core`, `roles`, `assignments`, `ui`; tolerante a errores
- [ ] Ruta `/upload` (subida del archivo `.lua`) con parseo en cliente y preview

### Fase 2 — Cuentas y dashboard
- [ ] Registro/login (Supabase auth) + `raiddominion_profiles`
- [ ] `/dashboard` (usuario): subir SV, ver parseos, reclamar hermandad
- [ ] Flujo maestro: `createGuild()` + rol `guild_master` + verificación moderador
- [ ] `/dashboard/guild`: editar perfil público (descripción, discord, roster,
  bandas, roles) y re-subir SV para actualizar

### Fase 3 — Perfil público y directorio
- [ ] Perfil público de hermandad `/g/:slug` (público, sin login)
- [ ] Directorio `/guilds` con búsqueda y filtros
- [ ] Landing actualizada: la hermandad Colmillo de Acero se muestra como
  hermandad registrada de ejemplo (sus datos ya viven en `public/players.json`)

### Fase 4 — Comunidad y mantenimiento
- [ ] Verificaciones por moderadores (`/moderate`)
- [ ] Feedback: stats de hermandades (miembros, clases, rangos)
- [ ] Gitignore de SV subidos, límites de tamaño, sanitización de uploads
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