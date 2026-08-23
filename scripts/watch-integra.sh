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

promover_oficial() {
  # Turno aprobado = branch con commits por delante de main y punta que NO es wip(
  local name="$1" b="sesion/$1"
  local ahead tip
  ahead=$(git rev-list --count "main..$b")
  [[ "$ahead" -eq 0 ]] && return 0
  tip=$(git log -1 --format=%s "$b")
  [[ "$tip" =~ ^wip\( ]] && return 0
  if git -C "$ROOT" merge --no-edit -q "$b" >/dev/null 2>&1; then
    log "✅ OFICIAL promovido a main: $name — \"$tip\" ($ahead commit(s)) · Netlify desplegará"
  else
    local err
    err=$(git -C "$ROOT" merge --no-edit "$b" 2>&1 >/dev/null)
    git -C "$ROOT" merge --abort 2>/dev/null
    log "🚨 NO se pudo promover $name a main:"
    log "$(echo "$err" | head -4)"
    return 0
  fi
}

fusionar_tele() {
  # Lleva los commits nuevos de la sesión a integracion (la tele los muestra)
  local name="$1" b="sesion/$1"
  git merge-base --is-ancestor "$b" integracion && return 0
  if git -C "$ROOT/.worktrees/integra" merge --no-edit -q "$b" >/dev/null 2>&1; then
    log "📺 tele actualizada: $name"
  else
    local err
    err=$(git -C "$ROOT/.worktrees/integra" merge --no-edit "$b" 2>&1 >/dev/null)
    git -C "$ROOT/.worktrees/integra" merge --abort 2>/dev/null
    log "🚨 NO se pudo fusionar $name a integracion (su turno sigue intacto):"
    log "$(echo "$err" | head -4)"
  fi
}

sincronizar_tele_con_main() {
  git -C "$ROOT" rev-parse main >/dev/null 2>&1 || return 0
  git -C "$ROOT/.worktrees/integra" merge-base --is-ancestor main integracion && return 0
  git -C "$ROOT/.worktrees/integra" merge --no-edit -q main >/dev/null 2>&1 \
    && log "📺 tele sincronizada con main" \
    || log "⚠ tele no pudo sincronizarse con main"
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
  done
  sincronizar_tele_con_main
  [[ "$ONCE" -eq 1 ]] && break
  sleep "$INTERVAL"
done
