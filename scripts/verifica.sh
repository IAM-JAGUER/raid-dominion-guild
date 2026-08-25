#!/usr/bin/env bash
# Verificación de build SERIALIZADA entre todas las sesiones paralelas.
#
# El problema que resuelve: con N sesiones corriendo `astro build` a la vez
# sobre DrvFs, la CPU/I/O se saturan y los builds se vuelven lentísimos (o
# se cuelgan). Este wrapper toma un flock GLOBAL del proyecto: el primer
# proceso construye y los demás esperan en cola. Un solo build a la vez.
#
#   scripts/verifica.sh            # rápido: astro build (sin astro check)
#   scripts/verifica.sh --check    # completo: astro check && astro build
#   scripts/verifica.sh --ci       # gate del watcher (build silencioso)
#   scripts/verifica.sh --help
set -uo pipefail

# Worktree principal del proyecto (desde CUALQUIER worktree). La primera
# entrada de `git worktree list --porcelain` es siempre el worktree principal.
main_repo() {
  git worktree list --porcelain | awk '/^worktree /{print $2; exit}'
}

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

MODE=quick
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --ci)    MODE=ci ;;
    -h|--help) usage; exit 0 ;;
    *) echo "✗ Argumento inválido: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(main_repo)"
LOCK="$ROOT/.worktrees/.build.lock"

# Lock global: nunca dos builds del proyecto a la vez. El timeout evita
# quedarse esperando para siempre si un build quedó colgado.
WAIT=900
[[ "$MODE" == "ci" ]] && WAIT=600
exec 9>"$LOCK" || exit 1
if ! flock -w "$WAIT" 9; then
  echo "✗ Timeout esperando el lock global de build (¿otro build colgado?)." >&2
  exit 1
fi

if [[ "$MODE" != "ci" ]]; then
  echo "🔨 [$MODE] build en $(pwd) — $(date +%H:%M:%S)"
fi

case "$MODE" in
  quick) npx astro build ;;
  check) npx astro check && npx astro build ;;
  ci)    npx astro build ;;
esac
code=$?

if [[ $code -eq 0 ]]; then
  [[ "$MODE" != "ci" ]] && echo "✅ [$MODE] build OK — $(date +%H:%M:%S)"
else
  echo "❌ [$MODE] build FALLÓ — $(date +%H:%M:%S)" >&2
fi
exit $code