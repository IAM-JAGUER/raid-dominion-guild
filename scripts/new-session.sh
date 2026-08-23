#!/usr/bin/env bash
# Crea el worktree privado de una sesión paralela: .worktrees/<nombre> + branch sesion/<nombre>
# Uso: scripts/new-session.sh <nombre>     (ej: scripts/new-session.sh guias)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
NAME="${1:-}"

if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "✗ Uso: scripts/new-session.sh <nombre>" >&2
  echo "  nombre: minúsculas, números y guiones (ej: guias, dashboard-4p)" >&2
  exit 1
fi

BRANCH="sesion/$NAME"
WT="$ROOT/.worktrees/$NAME"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "✗ Ya existe la branch $BRANCH." >&2
  echo "  ¿Reusarla?  git worktree add \"$WT\" \"$BRANCH\"" >&2
  exit 1
fi
if [[ -e "$WT" ]]; then
  echo "✗ Ya existe el directorio $WT" >&2
  exit 1
fi

git worktree add "$WT" -b "$BRANCH" main

# Recursos compartidos del proyecto principal (deps y variables de entorno)
ln -sfn "$ROOT/node_modules" "$WT/node_modules"
ln -sfn "$ROOT/.env" "$WT/.env"

echo ""
echo "✓ Sesión '$NAME' creada"
echo "  Copia privada : $WT"
echo "  Branch        : $BRANCH (base: main)"
echo ""
echo "Siguientes pasos:"
echo "  1. Abre una terminal nueva:  cd $WT"
echo "  2. Lanza opencode ahí y dale su objetivo"
echo "  3. La tele (:4321) mostrará su avance en vivo automáticamente"
