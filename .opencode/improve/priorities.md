# Prioridades de Mejora — RaidDominion Portal

Este documento define las divisiones, prioridades y reglas absolutas para todos
los agentes de mejora del portal comunitario del addon RaidDominion.

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

## Reglas ABSOLUTAS (aplican a TODOS los agentes)

### Ecosistema multi-app Supabase
- `../supabase-shared/` está FUERA del proyecto — NO modificarlo salvo el bloque
  `raiddominion` coordinado con las 5 apps.
- `handle_new_user()`, `sanitize_signup_role()`, `ensure_user_app()` — canónicas
  en supabase-shared; nunca redefinirlas.
- Tablas sin prefijo `raiddominion_` — NO tocarlas.
- `raiddominion_profiles.role` es la única fuente de verdad del rol.
- No hacer `DROP TRIGGER on_auth_user_created`.

### Validación obligatoria post-cambio
```bash
npx astro build    # Sin errores NUEVOS (verificación rápida en DrvFs)
```
Si falla: revertir con `git checkout -- <file>` y reportar en el log.

### Límite por ronda
Máximo **5 cambios por ronda**. Después de 5, cerrar la ronda y reportar.

### Límite de steps por agente
Cada agente tiene un máximo de **12 steps** definido en `opencode.json`. Si se
alcanza el límite, el agente cierra la ronda y reporta lo logrado.

### Database Migrations (aplica a @development, @product, @refactorer)
1. **Archivo en `supabase/migrations/`** con formato `YYYYMMDD_descripcion.sql`.
2. **Toda tabla nueva: prefijo `raiddominion_`** — jamás sin prefijo.
3. **Funciones DB**: prefijo `raiddominion_`, `SECURITY DEFINER`,
   `SET search_path = ''`, `GRANT EXECUTE TO authenticated`.
4. **RLS policies**: prefijo `raiddominion_`, limpiar anteriores con
   `DO $$ DROP ALL`, solo `auth.uid() = user_id`.
5. **NO modificar tablas de otras apps** (sin prefijo `raiddominion_`).
6. **NO reescribir `handle_new_user()`** (canónica en `../supabase-shared/`).

### Parser de SavedVariables (aplica a @development, @qa)
- Formato **oficial v3.0.0** priorizado; fuente de verdad dual: AGENTS.md §5 +
  `RD_Utils_Registry.lua` del addon dev (contrato entre repos, AGENTS.md §11).
- Parser **estructural** (respetar anidación y strings escapadas), nunca regex
  de `{}` frágil.
- Archivos ≤ 2 MB; sanitizar; nunca volcar `raw` completo en la UI.
- `officerNote` es privada; en público solo `publicNote`.
- Claim de maestro: primario `registry.*.guild.isGM=true`
  (`raiddominion_claim_from_sv`); `generatedBy`+rank SOLO fallback legacy v2.

---

## Backlog priorizado (estado 2026-08-23)

Derivado de la auditoría portal↔addon. Atender EN ORDEN; marcar al completar.

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
2026-08-23); hoy sobreviven huérfanos vía perfil creado al vuelo (policy
INSERT propia, 20260105). Coordinar con las otras apps antes de editarlo.
NO editar supabase-shared sin ese consenso.

### 🟡 P1 — Guías fieles al addon real
- Documentar el ítem "Registrar" (menú > RaidDominion) y su rol en /upload.
- Quitar `/rdminimap` (no existe en RD_Init.lua) o añadirlo al addon.
- Reemplazar "Bandas Core" por bandas vivas reales (`bands[]`).
- Añadir test fixture golden-file del SV real para el parser.

### 🟡 P1 — Capturar `characters[].version` del SV
Permitirá advertir al usuario si su archivo es anterior a 3.0.0.

---

## Prohibiciones explícitas

- No modificar `astro.config.mjs` sin necesidad justificada.
- No cambiar colores de marca del tema WoW (ámbar/dorado, fondo oscuro).
- No eliminar exports públicos de `src/lib/api.ts` sin migrar importadores.
- No dejar `console.log` en producción.
- No usar `any` en código nuevo.
- No volcar SavedVariables crudas en páginas públicas.

---

## Flujo de trabajo recomendado

```
product define → development / ui-ux implementan → refactorer mantiene → qa aprueba
```

1. Leer `AGENTS.md` y `PLAN_TRANSFORMACION.md` (roadmap por fases).
2. Implementar con cambios mínimos y quirúrgicos.
3. Verificar con `npx astro build`.
4. QA revisa antes de commit (agente `@qa`, modo solo lectura).
5. Commit solo con autorización explícita (resumen + checklist).

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