# Frallas conocidas — RaidDominion Portal

Problemas encontrados y cómo evitarlos. Cada entrada tiene **estado**
(vigente = puede volver a pasar / mitigada = blindada por lint o script) y
**fecha** de detección, para saber si sigue siendo un riesgo activo.

## F001: Build falla por Browser API en SSR
- **Estado**: vigente (2026-08-23)
- **Error**: `document` o `window` en componente server-side
- **Solución**: Usar `client:only` o lifecycle methods
- **Detección**: verifica.sh falla con "Browser APIs are not available on the server"

## F002: RLS policies sin prefijo
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: CREATE POLICY sin raiddominion_
- **Solución**: Siempre prefijo raiddominion_
- **Detección**: audita-ecosistema.sh

## F003: handle_new_user() modificado
- **Estado**: vigente — requiere disciplina humana, no hay blindaje automático (2026-08-23)
- **Error**: Editar la función canónica en supabase-shared
- **Solución**: Coordinar con las 5 apps
- **Detección**: audita-ecosistema.sh

## F004: officerNote expuesta
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: Mostrar officerNote en páginas públicas
- **Solución**: Solo publicNote en público
- **Detección**: audita-ecosistema.sh

## F005: Contrato SV roto
- **Estado**: vigente (2026-08-23)
- **Error**: Cambiar claves del parser sin actualizar addon
- **Solución**: Coordinar addon↔portal en mismo ciclo
- **Detección**: contract-test.sh

## F006: any en TypeScript
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: Usar `: any` o `as any`
- **Solución**: Tipar correctamente
- **Detección**: audita-ecosistema.sh

## F007: Build paralelo en DrvFs
- **Estado**: mitigada por lock global de `verifica.sh` (2026-08-23)
- **Error**: Múltiples builds simultáneos
- **Solución**: usa scripts/verifica.sh (lock global)
- **Consecuencia**: Corrupción de dist/

## F008: Tablas compartidas modificadas
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: ALTER TABLE en apps o user_apps
- **Solución**: NO modificar tablas sin prefijo
- **Detección**: audita-ecosistema.sh

## F009: Inconsistencia tipográfica
- **Estado**: vigente — parcialmente mitigada (2026-08-30)
- **Error**: Tamaños Tailwind (`text-2xl`, `text-sm`, etc.) hardcodeados en
  componentes en vez de usar `ui.text.*` de `design.ts`
- **Solución**: Migrar a `ui.text.hero/h1/h2/h3/body/bodyMuted/caption`
- **Progreso**: tokens `ui.text.*` creados en `design.ts`; migrados login,
  upload, admin, moderate, portal, listados y el HTML estático del dashboard.
  Pendiente: render JS dinámico del dashboard (cards/chips) tras el split.
- **Detección**: manual/QA §7 — sin script automatizado todavía

## F010: Operación async sin feedback visual
- **Estado**: vigente — parcialmente mitigada (2026-08-30)
- **Error**: Upload/parseo/submit sin spinner, skeleton ni `aria-live`,
  dejando al usuario sin saber si algo está pasando
- **Solución**: `ui.loading.spinner`/`ui.loading.skeleton` +
  `aria-live="polite"` con `ui.loading.liveText` (ver `patrones.md` P010)
- **Progreso**: tokens `ui.loading.*` creados; login con spinner + `aria-busy`
  en submit y reset; `#status` aria-live de upload migrado a `ui.loading.liveText`;
  admin/moderate/portal/listados usan `ui.loading.liveText` en sus status.
  Pendiente: skeletons para las 5 cargas iniciales del dashboard y `aria-busy`
  en toggles por fila (card de personaje ya lo maneja vía texto de estado).
- **Detección**: QA §7 (gate mínimo) / revisión completa de `@ui-ux`

## F011: Contraste insuficiente en texto secundario
- **Estado**: vigente — tokens calibrados, sweep pendiente (2026-08-30)
- **Error**: `text-gray-400`/`text-amber-200` sobre fondo `#111` sin
  verificar WCAG AA
- **Solución**: Auditar con herramienta de contraste; consolidar en
  `ui.text.bodyMuted`/`ui.text.caption` ya calibrados una vez verificados
- **Progreso**: `ui.text.bodyMuted` (gray-400 ≈7.5:1) y `ui.text.caption`
  (gray-500 ≈4.9:1) sobre `#111` pasan WCAG AA; `ui.status.*` también
  (red-300 ≈8.4:1, emerald-300 ≈9.7:1, amber-300 ≈12:1, sky-200 ≈10.5:1).
  Pendiente: barrer los usos sueltos restantes (`placeholder:text-gray-600`
  ≈3:1 NO pasa — corregir con placeholder más claro) en componentes no migrados.
- **Detección**: manual — pendiente incorporar a `verifica.sh` o CI

## F012: Migración aplicada sin registrar en el ledger
- **Estado**: mitigada (2026-08-30)
- **Error**: Se aplica una migración a mano vía dashboard de Supabase pero no
  se registra en `ciclos.json` → `migraciones_aplicadas`, generando drift
  entre lo que dicen los archivos `.sql` locales y lo que realmente corrió
  en producción
- **Solución**: Registrar SIEMPRE en `ciclos.json` inmediatamente después de
  aplicar, antes de cerrar el ciclo de trabajo
- **Resolución 2026-08-30**: el usuario confirmó que las 40 migraciones de
  `supabase/migrations/` fueron aplicadas; todas quedaron registradas en
  `ciclos.json` → `migraciones_aplicadas` con `project_ref_verificado: true`.
- **Detección**: manual — sin CLI de Supabase no hay tracking automático,
  ver `AGENTS.md` §8
