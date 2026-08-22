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
- Formato **oficial v3.0.0** priorizado; el dev del WoW client es fallback.
- Parser **estructural** (respetar anidación y strings escapadas), nunca regex
  de `{}` frágil.
- Archivos ≤ 2 MB; sanitizar; nunca volcar `raw` completo en la UI.
- `officerNote` es privada; en público solo `publicNote`.
- `generatedBy` + rank del personaje rigen el claim de maestro.

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