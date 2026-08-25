#!/usr/bin/env bash
# Robot cartero de la tele: fotos borrador → integracion, y promoción de turnos aprobados → main.
#   scripts/watch-integra.sh              corre para siempre (intervalo 30s por defecto)
#   scripts/watch-integra.sh 10           intervalo personalizado en segundos
#   scripts/watch-integra.sh --once       un solo ciclo (para pruebas)
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
INTERVAL=30
ONCE=0
for arg in "$@"; do
  case "$arg" in
    --once) ONCE=1 ;;
    *[!0-9]*|"") echo "✗ Argumento inválido: $arg" >&2; exit 1 ;;
    *) INTERVAL="$arg" ;;
  esac
done

# Instancia única
exec 9>"$ROOT/.worktrees/.watcher.lock" || exit 1
flock -n 9 || { echo "✗ Ya hay un watcher corriendo." >&2; exit 1; }

log() { echo "[$(date +%H:%M:%S)] $*"; }

# Segundos de espera antes de reintentar el gate de build de un mismo tip que
# ya falló. Evita martillar un build caro cada ciclo de 30s mientras el agente
# no ha corregido nada.
GATE_COOLDOWN=180
# Cooldown para reintentar fusionar a la tele un tip que ya dio conflicto.
# Evita que un merge divergente spammee el log cada ciclo mientras la sesión
# no rebasa main.
TELE_COOLDOWN=300

# Lista las sesiones activas: directorios .worktrees/* salvo integra
sessions() {
  local d b
  for d in "$ROOT"/.worktrees/*/; do
    d="${d%/}"
    [[ "$d" == "$ROOT/.worktrees/integra" ]] && continue
    b="sesion/$(basename "$d")"
    git show-ref --verify --quiet "refs/heads/$b" || continue
    echo "$(basename "$d")"
  done
}

foto_wip() {
  local name="$1" wt="$ROOT/.worktrees/$1"
  git -C "$wt" add -A 2>/dev/null || { log "⚠ $name: índice ocupado, foto reintentará"; return 0; }
  git -C "$wt" diff --cached --quiet && return 0
  local stat
  stat=$(git -C "$wt" diff --cached --stat | tail -1)
  if git -C "$wt" commit -q -m "wip($name): foto automática $(date +%H:%M)" 2>/dev/null; then
    log "📷 foto $name (${stat:-sin delta})"
  fi
}

# GATE de build: verifica que el commit tip de la sesión COMPILA antes de
# permitir la promoción a main. Construye en un worktree temporal DETACHED
# (nunca toca el árbol de trabajo del agente) y usa el lock global de
# scripts/verifica.sh, así nunca compite con los builds de otras sesiones.
# La salida de npx astro build (lenta en DrvFs) se captura; solo se muestran
# las últimas líneas si falla.
gate_build() {
  local name="$1" tip="$2" path="$ROOT/.worktrees/.verify-$name" out code
  if [[ -d "$path" ]]; then
    git -C "$ROOT" worktree remove --force "$path" >/dev/null 2>&1 || true
  fi
  if ! git -C "$ROOT" worktree add --detach -q "$path" "$tip" 2>/dev/null; then
    log "🚨 gate $name: no pude montar el worktree de verificación para $tip"
    return 1
  fi
  ln -sfn "$ROOT/node_modules" "$path/node_modules" 2>/dev/null || true
  ln -sfn "$ROOT/.env" "$path/.env" 2>/dev/null || true
  out=$(cd "$path" && "$ROOT/scripts/verifica.sh" --ci 2>&1)
  code=$?
  git -C "$ROOT" worktree remove --force "$path" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree prune
  if [[ $code -eq 0 ]]; then
    log "✅ gate $name: build OK ($tip)"
  else
    log "🚨 gate $name: build FALLÓ ($tip) — la sesión debe corregir y re-commitea:"
    log "$(echo "$out" | tail -6)"
  fi
  return $code
}

promover_oficial() {
  # Turno aprobado = branch con commits por delante de main y punta que NO es wip(
  local name="$1" b="sesion/$1"
  local ahead tip tipmsg passfile failfile
  ahead=$(git rev-list --count "main..$b")
  [[ "$ahead" -eq 0 ]] && return 0
  tip=$(git log -1 --format=%H "$b")
  tipmsg=$(git log -1 --format=%s "$b")
  [[ "$tipmsg" =~ ^wip\( ]] && return 0

  # 1) GATE de build (solo se re-ejecuta si cambió el tip o pasó el cooldown)
  passfile="$ROOT/.worktrees/.gate-$name.pass"
  failfile="$ROOT/.worktrees/.gate-$name.fail"
  if [[ -f "$passfile" && "$(cat "$passfile")" == "$tip" ]]; then
    : # este tip ya pasó el gate
  else
    local last_fail_tip="" last_fail_ts=0 now
    if [[ -f "$failfile" ]]; then
      read -r last_fail_tip last_fail_ts < "$failfile"
      now=$(date +%s)
      if [[ "$last_fail_tip" == "$tip" ]] && (( now - last_fail_ts < GATE_COOLDOWN )); then
        log "⏳ $name: gate aún en cooldown tras fallo de $tip — reintentaré pronto"
        return 0
      fi
    fi
    if gate_build "$name" "$tip"; then
      echo "$tip" > "$passfile"
      rm -f "$failfile"
    else
      echo "$tip $(date +%s)" > "$failfile"
      rm -f "$passfile"
      return 0
    fi
  fi

  # 2) Promoción real a main
  if git -C "$ROOT" merge --no-edit -q "$b" >/dev/null 2>&1; then
    log "✅ OFICIAL promovido a main: $name — \"$tipmsg\" ($ahead commit(s)) · Netlify desplegará"
    rm -f "$passfile" "$failfile"
    # La tele debe reflejar EXACTAMENTE el estado oficial limpio: si solo
    # fusionamos la branch de la sesión (wips intermedios + squash final)
    # sobre integracion, git puede dejar duplicados cuando el squash cambió
    # archivos que los wips ya tocaron. Realinear a main lo previene.
    realinear_tele
  else
    local err
    err=$(git -C "$ROOT" merge --no-edit "$b" 2>&1 >/dev/null)
    git -C "$ROOT" merge --abort 2>/dev/null
    log "🚨 NO se pudo promover $name a main:"
    log "$(echo "$err" | head -4)"
  fi
}

fusionar_tele() {
  # Lleva los commits nuevos de la sesión a integracion (la tele los muestra)
  local name="$1" b="sesion/$1" files tip last_tip last_ts now
  git merge-base --is-ancestor "$b" integracion && return 0
  tip=$(git rev-parse "$b")
  # Cooldown: si el mismo tip ya dio conflicto hace poco, no martillamos.
  local cooldown_file="$ROOT/.worktrees/.telefail-$name"
  now=$(date +%s)
  if [[ -f "$cooldown_file" ]]; then
    read -r last_tip last_ts < "$cooldown_file"
    if [[ "$last_tip" == "$tip" ]] && (( now - last_ts < TELE_COOLDOWN )); then
      return 0
    fi
  fi
  if git -C "$ROOT/.worktrees/integra" merge --no-edit -q "$b" >/dev/null 2>&1; then
    log "📺 tele actualizada: $name"
    rm -f "$cooldown_file"
  else
    # Reportar los ARCHIVOS REALES en conflicto (no el error engañoso del abort)
    files=$(git -C "$ROOT/.worktrees/integra" diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')
    git -C "$ROOT/.worktrees/integra" merge --abort 2>/dev/null
    echo "$tip $(date +%s)" > "$cooldown_file"
    log "🚨 NO se pudo fusionar $name a integracion (su turno sigue intacto):"
    log "   conflicto en: ${files:-?} → la sesión debe rebasar main y resolver (git -C .worktrees/$name rebase main)"
  fi
}

# Tras un turno oficial promovido, la tele se realinea a main para que
# integracion no acumule wips intermedios + squash (evita duplicados).
realinear_tele() {
  if git -C "$ROOT/.worktrees/integra" reset --hard main >/dev/null 2>&1; then
    log "📺 tele realineada con main (estado oficial limpio)"
  else
    log "⚠ tele no pudo realinearse con main (reintentará en el próximo ciclo)"
  fi
}

sincronizar_tele_con_main() {
  git -C "$ROOT" rev-parse main >/dev/null 2>&1 || return 0
  git -C "$ROOT/.worktrees/integra" merge-base --is-ancestor main integracion && return 0
  if git -C "$ROOT/.worktrees/integra" merge --no-edit -q main >/dev/null 2>&1; then
    log "📺 tele sincronizada con main"
  else
    git -C "$ROOT/.worktrees/integra" merge --abort 2>/dev/null
    log "⚠ tele no pudo sincronizarse con main (merge abortado; integra queda limpio)"
  fi
}

log "👀 watcher iniciado (intervalo ${INTERVAL}s) — Ctrl+C para detener"
while true; do
  for name in $(sessions); do
    wt="$ROOT/.worktrees/$name"
    b="sesion/$name"

    # 1) Foto borrador si hay cambios sin commitear (incluye untracked)
    if [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]]; then
      foto_wip "$name"
    fi

    # 2) ¿Turno aprobado esperando promoción?
    promover_oficial "$name"

    # 3) Llevar novedades a la tele
    fusionar_tele "$name"

    # 4) Aviso de base desactualizada: una sesión detrás de main arriesga
    #    conflictos de merge tardío. Solo se loguea una vez por cambio.
    behind=$(git rev-list --count "$b..main" 2>/dev/null || echo 0)
    behindfile="$ROOT/.worktrees/.behind-$name"
    if [[ "$behind" -gt 0 && "$(cat "$behindfile" 2>/dev/null)" != "$behind" ]]; then
      log "ℹ $name: $behind commit(s) detrás de main — rebase sugerido: git -C .worktrees/$name rebase main"
      echo "$behind" > "$behindfile"
    elif [[ "$behind" -eq 0 ]]; then
      rm -f "$behindfile"
    fi
  done
  sincronizar_tele_con_main
  [[ "$ONCE" -eq 1 ]] && break
  sleep "$INTERVAL"
done
