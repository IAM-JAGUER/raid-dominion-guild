#!/usr/bin/env bash
# Verificación de build con sandbox nativo ext4.
#
# v3 (2026-08-26): simplificado — sin locks ni modo async (ya no hay
# sesiones paralelas). El build corre en ~/rd-build (FUERA de DrvFs),
# con su propio node_modules.
#
# Uso:
#   scripts/verifica.sh                  # rápido: build (sin astro check)
#   scripts/verifica.sh --check          # astro check && astro build
#   scripts/verifica.sh --no-dist-sync   # no copiar dist/ de vuelta
#   scripts/verifica.sh --sandbox-dir D  # default ~/rd-build (o env RD_BUILD_SANDBOX)
set -uo pipefail

main_repo() {
  git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}'
}

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

MODE=quick DIST_SYNC=1
SB="${RD_BUILD_SANDBOX:-$HOME/rd-build}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE=check ;;
    --no-dist-sync) DIST_SYNC=0 ;;
    --sandbox-dir)  SB="${2:?--sandbox-dir requiere ruta}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "✗ Argumento inválido: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(main_repo)"
if [[ -z "$ROOT" ]]; then
  echo "✗ No pude resolver el worktree principal del proyecto." >&2
  exit 1
fi
WT="$(pwd)"

sync_src() {
  local LIST
  LIST="$(mktemp)" || return 1
  git -C "$WT" -c core.quotePath=false ls-files -co --exclude-standard > "$LIST" 2>/dev/null
  rsync -a --delete --files-from="$LIST" "$WT/" "$SB/" \
    --exclude node_modules --exclude .env --exclude dist --exclude .astro
  local rc=$?
  rm -f "$LIST"
  return $rc
}

prep_sandbox() {
  local want cur
  want=$(sha1sum "$WT/package-lock.json" 2>/dev/null | cut -d' ' -f1)
  cur=$(cat "$SB/.rd-lock-sha" 2>/dev/null)
  if [[ ! -x "$SB/node_modules/.bin/astro" ]]; then
    echo "🛠  [$MODE] primer uso del sandbox nativo: npm install en $SB …"
    ( cd "$SB" && npm install --no-audit --no-fund ) || return 1
  elif [[ -n "$want" && "$want" != "$cur" ]]; then
    echo "🛠  [$MODE] dependencias cambiaron: npm install incremental …"
    ( cd "$SB" && npm install --no-audit --no-fund ) || return 1
  fi
  [[ -n "$want" ]] && printf '%s' "$want" > "$SB/.rd-lock-sha"
  [[ -f "$ROOT/.env" ]] && cp -f "$ROOT/.env" "$SB/.env"
  return 0
}

mkdir -p "$SB"
TB=$SECONDS
echo "🔨 [$MODE] build en sandbox ext4 ($SB) ← $(basename "$WT") — $(date +%H:%M:%S)"

if ! sync_src; then
  echo "✗ No pude sincronizar las fuentes hacia el sandbox." >&2
  exit 1
fi
if ! prep_sandbox; then
  echo "✗ Falló la preparación de dependencias del sandbox." >&2
  exit 1
fi

CODE=0
if [[ "$MODE" == "check" ]]; then
  ( cd "$SB" && ./node_modules/.bin/astro check ) || CODE=$?
fi
if [[ "$CODE" -eq 0 ]]; then
  ( cd "$SB" && ./node_modules/.bin/astro build ) || CODE=$?
fi
DUR=$(( SECONDS - TB ))

if [[ "$CODE" -eq 0 ]]; then
  echo "✅ [$MODE] build OK (${DUR}s) — $(date +%H:%M:%S)"
  if [[ "$DIST_SYNC" -eq 1 && -d "$SB/dist" ]]; then
    rsync -a --delete "$SB/dist/" "$WT/dist/"
  fi
else
  echo "❌ [$MODE] build FALLÓ (exit $CODE, ${DUR}s) — $(date +%H:%M:%S)" >&2
  echo "   log del sandbox: revisa la salida anterior o relanza sin --ci." >&2
fi
exit "$CODE"
