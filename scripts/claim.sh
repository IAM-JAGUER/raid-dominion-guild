#!/usr/bin/env bash
# Lease de archivos entre sesiones paralelas: evita que dos sesiones editen el
# mismo archivo a la vez (radar de solape del watcher lo detecta después; este
# lease lo previene ANTES).
#
#   scripts/claim.sh list                      # leases activos
#   scripts/claim.sh claim <archivo> [<motivo>]# reclama un archivo (lease)
#   scripts/claim.sh release <archivo>         # libera un archivo
#   scripts/claim.sh check <archivo>           # ¿quién lo tiene? (exit 0 = libre)
#   scripts/claim.sh mine <archivo>            # ¿lo tengo yo? (exit 0 = sí)
#
# Los leases viven en .worktrees/.claims/<ruta> (FUERA de git, fuera del árbol
# de cada worktree) para que cualquier sesión los consulte por ruta absoluta.
# El "owner" se infiere de la branch del worktree actual (sesion/<nombre>).
set -euo pipefail

# Worktree principal del proyecto (desde CUALQUIER worktree). La primera
# entrada de `git worktree list --porcelain` es siempre el worktree principal,
# que contiene .worktrees/ compartido.
main_repo() {
  git worktree list --porcelain | awk '/^worktree /{print $2; exit}'
}

ROOT="$(main_repo)"
CLAIMS_DIR="$ROOT/.worktrees/.claims"
mkdir -p "$CLAIMS_DIR"

# Owner actual = nombre de la sesión (branch sesion/<nombre>) del worktree actual
session_name() {
  local b
  b="$(git branch --show-current 2>/dev/null)"
  case "$b" in
    sesion/*) echo "${b#sesion/}" ;;
    integracion) echo "integra" ;;
    *) echo "desconocida" ;;
  esac
}

claim_path() { printf '%s/%s' "$CLAIMS_DIR" "$1"; }

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

cmd="${1:-}"
case "$cmd" in
  list)
    if [[ ! -d "$CLAIMS_DIR" ]] || [[ -z "$(ls -A "$CLAIMS_DIR" 2>/dev/null)" ]]; then
      echo "✓ Sin leases activos."
      exit 0
    fi
    (cd "$CLAIMS_DIR" && find . -type f | sed 's|^\./||' | sort) | while IFS= read -r f; do
      read -r owner when why < "$CLAIMS_DIR/$f"
      echo "$f  →  $owner  ($when)${why:+ — $why}"
    done
    ;;
  claim)
    [[ $# -ge 2 ]] || { echo "✗ Uso: scripts/claim.sh claim <archivo> [<motivo>]" >&2; exit 2; }
    file="$2"; why="${3:-}"
    p="$(claim_path "$file")"
    mkdir -p "$(dirname "$p")"
    if [[ -f "$p" ]]; then
      read -r owner when _ < "$p"
      if [[ "$owner" == "$(session_name)" ]]; then
        echo "✓ Ya lo tenías tú: $file"
        exit 0
      fi
      echo "✗ $file está en lease de $owner ($when) — coordina con esa sesión o pide liberarlo." >&2
      exit 1
    fi
    printf '%s %s %s\n' "$(session_name)" "$(date '+%d/%m-%H:%M')" "$why" > "$p"
    echo "✓ Lease tomado: $file ${why:+($why)}"
    ;;
  release)
    [[ $# -ge 2 ]] || { echo "✗ Uso: scripts/claim.sh release <archivo>" >&2; exit 2; }
    file="$2"; p="$(claim_path "$file")"
    if [[ ! -f "$p" ]]; then
      echo "ℹ $file no tenía lease."
      exit 0
    fi
    read -r owner when _ < "$p"
    mine="$(session_name)"
    if [[ "$owner" != "$mine" ]]; then
      echo "✗ $file lo tiene $owner, no tú ($mine)." >&2
      exit 1
    fi
    rm -f "$p"
    echo "✓ Lease liberado: $file"
    ;;
  check)
    [[ $# -ge 2 ]] || { echo "✗ Uso: scripts/claim.sh check <archivo>" >&2; exit 2; }
    p="$CLAIMS_DIR/$2"
    if [[ -f "$p" ]]; then
      read -r owner when why < "$p"
      echo "$2 → en lease de $owner ($when)${why:+ — $why}"
      exit 1
    fi
    echo "$2 → libre"
    exit 0
    ;;
  mine)
    [[ $# -ge 2 ]] || { echo "✗ Uso: scripts/claim.sh mine <archivo>" >&2; exit 2; }
    p="$CLAIMS_DIR/$2"
    if [[ -f "$p" ]]; then
      read -r owner _ _ < "$p"
      [[ "$owner" == "$(session_name)" ]] && exit 0
    fi
    exit 1
    ;;
  -h|--help|*) usage; exit 0 ;;
esac