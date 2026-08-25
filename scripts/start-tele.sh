#!/usr/bin/env bash
# Prende la tele: watcher de fotos + astro dev sobre el worktree integracion (:4321).
# Es el ÚNICO comando que necesita tu terminal sagrada (T1).
# Instancia única por flock: nunca arranca 2 teles a la vez, aunque la tarea
# de Windsurf se dispare dos veces al reabrir la carpeta rápido.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
INTEGRA="$ROOT/.worktrees/integra"
PORT=4321
LOCK="$ROOT/.worktrees/.tele.lock"

# Instancia única (mismo mecanismo que el watcher)
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "📺 La tele ya está arrancando o corriendo (lock $LOCK tomado). Nada que hacer."
  exit 0
fi

# Bootstrap: crear la tele si no existe todavía
if [[ ! -d "$INTEGRA" ]]; then
  git show-ref --verify --quiet refs/heads/integracion || git branch integracion main
  git worktree add "$INTEGRA" integracion
  echo "✓ Tele creada en $INTEGRA"
fi
ln -sfn "$ROOT/node_modules" "$INTEGRA/node_modules"
ln -sfn "$ROOT/.env" "$INTEGRA/.env"

# ¿La tele ya está activa? (astro dev de integra ocupando el puerto)
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  if pgrep -f "\.worktrees/integra/.*astro dev --port $PORT" >/dev/null 2>&1; then
    echo "📺 Tele ya activa en http://localhost:$PORT"
    if ! pgrep -f "$ROOT/scripts/watch-integra.sh" >/dev/null 2>&1; then
      "$ROOT/scripts/watch-integra.sh" > "$ROOT/.worktrees/.watcher.log" 2>&1 &
      echo "  watcher relanzado (PID $!)"
    else
      echo "  watcher OK (ya corriendo)"
    fi
    exit 0
  fi
  echo "✗ El puerto $PORT lo ocupa otro proceso que NO es la tele:" >&2
  lsof -iTCP:$PORT -sTCP:LISTEN >&2
  echo "  ciérralo antes (o averigua quién es) para no pisar servidores." >&2
  exit 1
fi

# Arranque limpio: watcher + astro dev
"$ROOT/scripts/watch-integra.sh" > "$ROOT/.worktrees/.watcher.log" 2>&1 &
WATCHER_PID=$!

cd "$INTEGRA"
trap 'kill "$WATCHER_PID" 2>/dev/null; flock -u 9 2>/dev/null' EXIT
echo "📺 Tele prendida — http://localhost:$PORT · watcher PID $WATCHER_PID"
echo "   Log del robot: tail -f .worktrees/.watcher.log"
npx astro dev --port $PORT
