#!/usr/bin/env bash
# Verificación de diseño con el detector de Impeccable.
#
# Uso:
#   scripts/design-check.sh                 # archivos UI tocados (git diff + untracked)
#   scripts/design-check.sh --rendered URL  # detector sobre una URL renderizada
#   scripts/design-check.sh --json          # salida JSON del detector
#   scripts/design-check.sh --strict        # hallazgos => exit 2 (bloqueante)
#
# --rendered usa Chrome del sistema, el Chromium de Playwright o IMPECCABLE_BROWSER.
# Por defecto NO es bloqueante: informa hallazgos y devuelve 0. Un fallo de
# escaneo (target inaccesible) siempre devuelve 1. Complementa a
# scripts/verifica.sh; no lo sustituye.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

UI_EXT_RE='\.(astro|ts|tsx|jsx|css|html)$'

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "✗ $*" >&2
  exit 2
}

MODE=source
RENDERED=""
JSON=0
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rendered)
      [[ $# -ge 2 && -n "${2:-}" ]] || die "--rendered requiere una URL"
      MODE=rendered
      RENDERED="$2"
      shift
      ;;
    --json) JSON=1 ;;
    --strict) STRICT=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Argumento inválido: $1 (usa --help)" ;;
  esac
  shift
done

# Resolución del binario: IMPECCABLE_BIN → launcher global → impeccable en PATH → npx.
BIN=()
resolve_bin() {
  if [[ -n "${IMPECCABLE_BIN:-}" ]]; then
    if [[ -x "$IMPECCABLE_BIN" ]]; then
      BIN=("$IMPECCABLE_BIN")
      return 0
    fi
    if command -v "$IMPECCABLE_BIN" >/dev/null 2>&1; then
      BIN=("$(command -v "$IMPECCABLE_BIN")")
      return 0
    fi
    die "IMPECCABLE_BIN no es ejecutable ni está en PATH: $IMPECCABLE_BIN"
  fi

  local candidate
  for candidate in \
    "$HOME/.config/opencode/skills/impeccable/scripts/impeccable" \
    "$HOME/.claude/skills/impeccable/scripts/impeccable" \
    "$HOME/.codex/skills/impeccable/scripts/impeccable" \
    "$HOME/.cursor/skills/impeccable/scripts/impeccable" \
    "$HOME/.gemini/skills/impeccable/scripts/impeccable"; do
    if [[ -x "$candidate" ]]; then
      BIN=("$candidate")
      return 0
    fi
  done

  if command -v impeccable >/dev/null 2>&1; then
    BIN=("$(command -v impeccable)")
    return 0
  fi

  if command -v npx >/dev/null 2>&1; then
    BIN=(npx --yes impeccable)
    return 0
  fi

  die "No encontré Impeccable. Instala la skill global o define IMPECCABLE_BIN."
}

setup_rendered_browser() {
  [[ -n "${IMPECCABLE_BROWSER:-}" ]] && return 0

  local candidate
  candidate="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -z "$candidate" ]]; then
    candidate="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | sort -V | tail -1 || true)"
  fi
  [[ -z "$candidate" ]] && return 0

  local missing
  missing="$(ldd "$candidate" 2>/dev/null | grep 'not found' || true)"
  if [[ -n "$missing" ]]; then
    local libdir="$ROOT/.impeccable/browser-libs/usr/lib/x86_64-linux-gnu"
    if [[ -d "$libdir" ]]; then
      export LD_LIBRARY_PATH="$libdir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
      missing="$(ldd "$candidate" 2>/dev/null | grep 'not found' || true)"
    fi
  fi

  if [[ -z "$missing" ]]; then
    export IMPECCABLE_BROWSER="$candidate"
    echo "🌐 [rendered] navegador: $candidate" >&2
  else
    echo "⚠️  [rendered] Chromium de Playwright con librerías faltantes; define IMPECCABLE_BROWSER." >&2
  fi
}

resolve_bin
[[ "$MODE" == "rendered" ]] && setup_rendered_browser

DETECT_ARGS=(detect)
[[ "$JSON" -eq 1 ]] && DETECT_ARGS+=(--json)

if [[ "$MODE" == "rendered" ]]; then
  case "$RENDERED" in
    http://*|https://*|file://*) ;;
    *) die "--rendered espera una URL http(s) o file:// (recibido: $RENDERED)" ;;
  esac
  DETECT_ARGS+=("$RENDERED")
  echo "🔍 [rendered] detector Impeccable sobre $RENDERED" >&2
else
  cd "$ROOT" || die "No pude entrar al proyecto: $ROOT"

  FILES=()
  while IFS= read -r f; do
    [[ -n "$f" ]] && FILES+=("$f")
  done < <(
    {
      git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null || true
      git diff --name-only --diff-filter=ACMR --cached 2>/dev/null || true
      git ls-files --others --exclude-standard 2>/dev/null || true
    } | grep -E "$UI_EXT_RE" | sort -u
  )

  if [[ "${#FILES[@]}" -eq 0 ]]; then
    echo "✅ [source] sin archivos de UI modificados (.astro/.ts/.tsx/.jsx/.css/.html)." >&2
    exit 0
  fi

  echo "🔍 [source] detector Impeccable sobre ${#FILES[@]} archivo(s):" >&2
  printf '   • %s\n' "${FILES[@]}" >&2
  DETECT_ARGS+=("${FILES[@]}")
fi

"${BIN[@]}" "${DETECT_ARGS[@]}"
CODE=$?

if [[ "$CODE" -eq 1 ]]; then
  echo "✗ El detector no pudo escanear uno o más targets." >&2
  exit 1
fi

if [[ "$CODE" -eq 2 ]]; then
  if [[ "$STRICT" -eq 1 ]]; then
    echo "✗ Hallazgos de diseño detectados (--strict)." >&2
    exit 2
  fi
  echo "⚠️  Hallazgos de diseño informativos (no bloqueantes; usa --strict para fallar)." >&2
fi

exit 0
