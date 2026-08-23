---
description: >
  Ejecuta N rondas de mejora continua sobre el portal con un objetivo
  personalizado, recorriendo los 5 agentes (Producto → Desarrollo → UI/UX →
  Refactorización → QA) y validando con npx astro build. Ej: `/verifica 3
  "mejora el flujo de claim de hermandad"`.
agent: build
---

Ejecuta **N rondas de mejora continua** sobre el Portal Comunitario de
RaidDominion con un **objetivo personalizado**, aplicando las mejores prácticas
del contexto (AGENTS.md, PLAN_TRANSFORMACION.md y
`.opencode/improve/priorities.md`). Cada ronda recorre los **5 agentes** del
equipo y termina con el gate de QA. En cada paso se evalúa → corrige →
re-verifica con `npx astro build`.

## Uso

```
/verifica [N] "objetivo personalizado"
/verifica 3                                   → 3 rondas, objetivo por defecto
/verifica 3 "mejora el flujo de claim de hermandad"
/verifica 1 "audita RLS y reglas multi-app"
```

## Parámetros

- `$1` — Número de rondas (opcional, default: 3)
- `$ARGUMENTS` — Texto tras el comando. Si hay un string entre comillas, ese es
  el objetivo; si no, se usa el objetivo genérico del portal.

## Orden de agentes por ronda

Flujo documentado en AGENTS.md: `product` define → `development`/`ui-ux`
implementan → `refactorer` mantiene → `qa` aprueba.

| Orden | Agente | Cómo interpreta el objetivo |
|-------|--------|------------------------------|
| 1 | `@product` | Define/prioriza el objetivo desde la comunidad y la conversión member→guild_master |
| 2 | `@development` | Implementa el objetivo (Supabase, parser, dashboards, rutas) |
| 3 | `@ui-ux` | Aplica el objetivo priorizando accesibilidad, responsive y tema WoW |
| 4 | `@refactorer` | Refactor seguro que preserva comportamiento |
| 5 | `@qa` | Aprueba: build, types, RLS, reglas multi-app, límites del parser |

## Mecanismo (por ronda)

1. **CONTEXTO**: leer `AGENTS.md`, `PLAN_TRANSFORMACION.md` y
   `.opencode/improve/priorities.md`. Entender la fase actual del roadmap.
2. **RECORRER**: por cada agente en orden (product → development → ui-ux →
   refactorer → qa), invocarlo con `task` pasándole el objetivo, la ronda y su
   perspectiva. `qa` es solo lectura (no edita).
3. **CORREGIR**: aplicar cambios mínimos y quirúrgicos respetando las reglas
   absolutas (prefijo `raiddominion_`, no tocar otras apps, no redefinir
   `handle_new_user()`, no `any`, tema WoW).
4. **RE-VERIFICAR**: `npx astro build` después de cada agente.
   Si falla, revertir con `git checkout -- <file>` y ajustar.
5. **COMMIT DE SESIÓN** (solo si el usuario dijo "commitea"):
   - Preparar (NUNCA ejecutar sin su confirmación posterior) un squash del
     turno completo: `git reset --soft $(git merge-base HEAD main)` + mensaje
     convencional profesional con cuerpo detallado y trailers:
     `Session: <sesion>` · `Round: R<N> · "<objetivo>"` · `Agentes: a→b→c`.
   - Mostrar `git diff --stat` + el mensaje propuesto y esperar la palabra
     confirmatoria del usuario antes de crear el commit.
   - Jamás usar prefijo `wip(` en commits oficiales (reservado al watcher).

## Criterios de parada

- Si un agente completa 0 cambios, saltar al siguiente agente.
- Si el build falla 2 veces seguidas, detener esa ronda.
- Si el agente reporta "BLOQUEADO", saltar al siguiente.
- Máximo 5 cambios por ronda.

## Reglas (best practices del contexto)

- NUNCA commitear sin la orden explícita "commitea" del usuario; las fotos
  `wip(...)` las toma el watcher, no las sesiones (AGENTS.md §9 multi-sesión).
- NUNCA modificar `../supabase-shared/` fuera del bloque raiddominion coordinado.
- Toda tabla/columna/policy nueva con prefijo `raiddominion_`.
- NUNCA mostrar `officerNote` públicamente; solo `publicNote`.
- Parser: formato v3.0.0 prioritario, estructural, ≤2 MB; claim primario
  `registry.*.guild.isGM` (`generatedBy` solo fallback legacy v2).
- Contrato con el addon (AGENTS.md §11): cambios de claves del SV exigen
  sincronía parser↔`RD_Utils_Registry.lua`; guías fieles a `RD_Constants.lua`.

## Formato de respuesta

```
## Verifica — Rondas completadas (N)
- Objetivo: "…"
- Agentes recorridos por ronda: @product → @development → @ui-ux → @refactorer → @qa
- Cambios por ronda: (lista)
- Build: ✅ / ❌
- Veredicto final: APROBADO / APROBADO CON OBSERVACIONES / RECHAZADO
- Pendientes: (lista con archivo:línea)
```