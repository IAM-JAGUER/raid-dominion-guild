#!/usr/bin/env bash
# Prende la tele: watcher de fotos + astro dev sobre el worktree integracion (:4321).
# Es el ÚNICO comando que necesita tu terminal sagrada (T1).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
INTEGRA="$ROOT/.worktrees/integra"

# Bootstrap: crear la tele si no existe todavía
if [[ ! -d "$INTEGRA" ]]; then
  git show-ref --verify --quiet refs/heads/integracion || git branch integracion main
  git worktree add "$INTEGRA" integracion
  echo "✓ Tele creada en $INTEGRA"
fi
ln -sfn "$ROOT/node_modules" "$INTEGRA/node_modules"
ln -sfn "$ROOT/.env" "$INTEGRA/.env"

if lsof -iTCP:4321 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ El puerto 4321 ya está ocupado. Ese server NO es la tele:" >&2
  echo "  ciérralo antes (o averigua quién es) para no pisar servidores." >&2
  exit 1
fi

"$ROOT/scripts/watch-integra.sh" > "$ROOT/.worktrees/.watcher.log" 2>&1 &
WATCHER_PID=$!

cd "$INTEGRA"
trap 'kill "$WATCHER_PID" 2>/dev/null' EXIT
echo "📺 Tele prendida — http://localhost:4321 · watcher PID $WATCHER_PID"
echo "   Log del robot: tail -f .worktrees/.watcher.log"
exec npx astro dev --port 4321
