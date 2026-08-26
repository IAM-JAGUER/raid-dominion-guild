#!/usr/bin/env bash
# Verificación de build SERIALIZADA + ACELERADA entre sesiones paralelas.
#
# v2 (2026-08-25):
#   • Sandbox nativo ext4: el build corre en ~/rd-build (FUERA de DrvFs),
#     con su propio node_modules. El árbol de la sesión se sincroniza ahí,
#     se construye rápido y dist/ vuelve al worktree al terminar (OK).
#   • --async: lanza la verificación en background y retorna AL INSTANTE;
#     la sesión consulta el resultado sin quemar timeouts gigantes:
#       cat .worktrees/.build-status/<sesion>.state
#   • Visibilidad de cola: mientras se espera el lock global se informa
#     quién lo tiene y cuántos segundos lleva la espera.
#   • --wait N: tiempo máximo esperando el lock (default 900; --ci 600).
#
# Uso:
#   scripts/verifica.sh                  # rápido: build (sin astro check)
#   scripts/verifica.sh --check          # astro check && astro build
#   scripts/verifica.sh --ci             # gate del watcher (silencioso)
#   scripts/verifica.sh --async          # en background, sin bloquear
#   scripts/verifica.sh --wait 120       # máx 120s esperando el lock
#   scripts/verifica.sh --no-dist-sync   # no copiar dist/ de vuelta
#   scripts/verifica.sh --sandbox-dir D  # default ~/rd-build (o env RD_BUILD_SANDBOX)
set -uo pipefail

main_repo() {
  git worktree list --porcelain | awk '/^worktree /{print $2; exit}'
}

usage() {
  sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
}

MODE=quick ASYNC=0 DIST_SYNC=1 WAIT=900
SB="${RD_BUILD_SANDBOX:-$HOME/rd-build}"
WORKER_STATE="" WORKER_LOG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE=check ;;
    --ci)    MODE=ci ;;
    --async) ASYNC=1 ;;
    --wait)  WAIT="${2:?--wait requiere segundos}"; shift ;;
    --no-dist-sync) DIST_SYNC=0 ;;
    --sandbox-dir)  SB="${2:?--sandbox-dir requiere ruta}"; shift ;;
    # Interno: worker del modo --async (no usar a mano).
    --_worker) WORKER_STATE="${2:?}"; WORKER_LOG="${3:?}"; MODE="${4:?}"; WAIT="${5:?}"; DIST_SYNC="${6:?}"; SB="${7:?}"; shift 7 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "✗ Argumento inválido: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ "$MODE" == "ci" && "$WAIT" -eq 900 ]]; then WAIT=600; fi

write_state() {
  [[ -n "$WORKER_STATE" ]] && printf '%s\n' "$1" > "$WORKER_STATE"
  return 0
}

ROOT="$(main_repo)"
if [[ -z "$ROOT" ]]; then
  echo "✗ No pude resolver el worktree principal del proyecto." >&2
  exit 1
fi
WT="$(pwd)"
LOCK="$ROOT/.worktrees/.build.lock"
STDIR="$ROOT/.worktrees/.build-status"

# ─── Modo async: delegar en un worker desacoplado y salir YA ────────────────
if [[ "$ASYNC" -eq 1 ]]; then
  NAME="$(basename "$WT")"
  mkdir -p "$STDIR"
  STATE="$STDIR/$NAME.state" LOG="$STDIR/$NAME.log"
  : > "$LOG"
  printf 'QUEUED %s\n' "$(date +%H:%M:%S)" > "$STATE"
  nohup setsid bash "$0" --_worker "$STATE" "$LOG" "$MODE" "$WAIT" "$DIST_SYNC" "$SB" >>"$LOG" 2>&1 &
  disown
  echo "🚀 verificación ($MODE) lanzada en background para «$NAME»."
  echo "   consulta el resultado con: cat $STATE"
  echo "   (log completo: $LOG)"
  exit 0
fi

# ─── Lock global con visibilidad de cola ─────────────────────────────────────
# En DrvFs/9p lslocks/fuser NO distinguen holder de esperantes; lo accionable
# para quien espera es saber QUÉ build corre ahora y desde cuándo.
active_builds() {
  ps -eo pid,etime,args --no-headers 2>/dev/null \
    | grep -E 'node_modules/[.]bin/astro (build|check)|npm exec astro (build|check)' \
    | grep -v grep \
    | awk '{pid=$1; et=$2; $1=""; $2=""; printf "%s (%s) %s · ", pid, et, substr($0,3,70)}' \
    | sed 's/ · $//'
}

exec 9>"$LOCK" || exit 1
T0=$SECONDS
GOT=0
while :; do
  if flock -w 3 9; then GOT=1; break; fi
  EL=$(( SECONDS - T0 ))
  (( EL >= WAIT )) && break
  if [[ "$MODE" != "ci" ]]; then
    echo "⏳ [${EL}s] cola de build — activo ahora: $(active_builds)" >&2
  fi
done
if [[ "$GOT" -ne 1 ]]; then
  write_state "TIMEOUT espera-lock ${WAIT}s"
  echo "✗ Timeout (${WAIT}s) esperando el lock global de build." >&2
  echo "  Tip: usa --async para no bloquear tu sesión." >&2
  exit 1
fi

# ─── Sandbox ext4: preparar y sincronizar el árbol de la sesión ──────────────
sync_src() {
  local LIST
  LIST="$(mktemp)" || return 1
  # core.quotePath=false: sin escapar UTF-8 (p.ej. class_Chamán.jpg), que
  # rsync buscaría literal y fallaría con "No such file or directory".
  git -C "$WT" -c core.quotePath=false ls-files -co --exclude-standard > "$LIST" 2>/dev/null
  # --files-from solo copia archivos versionados/no-ignorados; los excludes
  # protegen del --delete los artefactos que viven SOLO en el sandbox.
  rsync -a --delete --files-from="$LIST" "$WT/" "$SB/" \
    --exclude node_modules --exclude .env --exclude dist \
    --exclude .astro --exclude .worktrees
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
  # .env para que Vite resuelva VITE_* en build (igual que en cada worktree).
  [[ -f "$ROOT/.env" ]] && cp -f "$ROOT/.env" "$SB/.env"
  return 0
}

mkdir -p "$SB"
TB=$SECONDS
write_state "RUNNING $(date +%H:%M:%S)"

if [[ "$MODE" != "ci" ]]; then
  echo "🔨 [$MODE] build en sandbox ext4 ($SB) ← $(basename "$WT") — $(date +%H:%M:%S)"
fi

if ! sync_src; then
  write_state "FAIL sync-fuentes"
  echo "✗ No pude sincronizar las fuentes hacia el sandbox." >&2
  exit 1
fi
if ! prep_sandbox; then
  write_state "FAIL npm-install"
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
  write_state "OK ${DUR}s"
  [[ "$MODE" != "ci" ]] && echo "✅ [$MODE] build OK (${DUR}s) — $(date +%H:%M:%S)"
  # El dist útil vive de vuelta en el worktree (Windows lo ve como siempre);
  # solo tras éxito, para no dejar artefactos de builds rotos.
  if [[ "$DIST_SYNC" -eq 1 && "$MODE" != "ci" && -d "$SB/dist" ]]; then
    rsync -a --delete "$SB/dist/" "$WT/dist/"
  fi
else
  write_state "FAIL exit-$CODE ${DUR}s"
  echo "❌ [$MODE] build FALLÓ (exit $CODE, ${DUR}s) — $(date +%H:%M:%S)" >&2
  echo "   log del sandbox: revisa la salida anterior o relanza sin --ci." >&2
fi
exit "$CODE"
