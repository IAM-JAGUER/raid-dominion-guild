#!/usr/bin/env bash
# Verificación de diseño con el detector de Impeccable.
#
# Uso:
#   scripts/design-check.sh                 # archivos UI tocados (git diff + untracked)
#   scripts/design-check.sh --rendered URL  # detector sobre una URL renderizada
#   scripts/design-check.sh --json          # salida JSON del detector
#   scripts/design-check.sh --strict        # hallazgos => exit 2 (bloqueante)
#   scripts/design-check.sh --baseline FILE # comparar contra un baseline
#   scripts/design-check.sh --update-baseline # crear/actualizar el baseline
#   scripts/design-check.sh --fail-on-new   # exit 2 solo por hallazgos nuevos
#
# --rendered usa Chrome del sistema, el Chromium de Playwright o IMPECCABLE_BROWSER.
# Por defecto NO es bloqueante: informa hallazgos y devuelve 0. Un fallo de
# escaneo (target inaccesible) siempre devuelve 1. Complementa a
# scripts/verifica.sh; no lo sustituye.
#
# Baseline: sin FILE, usa .opencode/improve/impeccable-baseline.json (local,
# gitignored). La comparación usa la huella antipattern+archivo+línea+snippet.
# En modo baseline, --strict no aplica: el gate es --fail-on-new.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

UI_EXT_RE='\.(astro|ts|tsx|jsx|css|html)$'

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "✗ $*" >&2
  exit 2
}

MODE=source
RENDERED=""
JSON=0
STRICT=0
BASELINE=""
UPDATE_BASELINE=0
FAIL_ON_NEW=0
TARGETS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rendered)
      [[ $# -ge 2 && -n "${2:-}" ]] || die "--rendered requiere una URL"
      MODE=rendered
      RENDERED="$2"
      shift
      ;;
    --baseline)
      [[ $# -ge 2 && -n "${2:-}" ]] || die "--baseline requiere un archivo"
      BASELINE="$2"
      shift
      ;;
    --update-baseline) UPDATE_BASELINE=1 ;;
    --fail-on-new) FAIL_ON_NEW=1 ;;
    --json) JSON=1 ;;
    --strict) STRICT=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Argumento inválido: $1 (usa --help)" ;;
    *) TARGETS+=("$1") ;;
  esac
  shift
done

BASELINE_MODE=0
if [[ -n "$BASELINE" || "$UPDATE_BASELINE" -eq 1 || "$FAIL_ON_NEW" -eq 1 ]]; then
  BASELINE_MODE=1
  [[ -z "$BASELINE" ]] && BASELINE="$ROOT/.opencode/improve/impeccable-baseline.json"
  [[ "$BASELINE" != /* ]] && BASELINE="$ROOT/$BASELINE"
  command -v node >/dev/null 2>&1 || die "El modo baseline requiere node en PATH."
fi

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
if [[ "$JSON" -eq 1 || "$BASELINE_MODE" -eq 1 ]]; then
  DETECT_ARGS+=(--json)
fi

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
  if [[ "${#TARGETS[@]}" -gt 0 ]]; then
    FILES=("${TARGETS[@]}")
  else
    while IFS= read -r f; do
      [[ -n "$f" ]] && FILES+=("$f")
    done < <(
      {
        git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null || true
        git diff --name-only --diff-filter=ACMR --cached 2>/dev/null || true
        git ls-files --others --exclude-standard 2>/dev/null || true
      } | grep -E "$UI_EXT_RE" | sort -u
    )
  fi

  if [[ "${#FILES[@]}" -eq 0 && "$UPDATE_BASELINE" -eq 1 && "${#TARGETS[@]}" -eq 0 ]]; then
    FILES=(src)
  fi

  if [[ "${#FILES[@]}" -eq 0 ]]; then
    echo "✅ [source] sin archivos de UI modificados (.astro/.ts/.tsx/.jsx/.css/.html)." >&2
    exit 0
  fi

  echo "🔍 [source] detector Impeccable sobre ${#FILES[@]} target(s):" >&2
  printf '   • %s\n' "${FILES[@]}" >&2
  DETECT_ARGS+=("${FILES[@]}")
fi

if [[ "$BASELINE_MODE" -eq 1 ]]; then
  TMP_JSON="$(mktemp)"
  TMP_ERR="$(mktemp)"
  trap 'rm -f "$TMP_JSON" "$TMP_ERR"' EXIT

  "${BIN[@]}" "${DETECT_ARGS[@]}" >"$TMP_JSON" 2>"$TMP_ERR"
  CODE=$?

  if [[ "$CODE" -eq 1 ]]; then
    cat "$TMP_ERR" >&2 2>/dev/null || true
    echo "✗ El detector no pudo escanear uno o más targets." >&2
    exit 1
  fi

  node - "$TMP_JSON" "$BASELINE" "$UPDATE_BASELINE" "$FAIL_ON_NEW" "$JSON" "$ROOT" <<'NODE'
const fs = require("fs")
const path = require("path")

const [, , currentPath, baselinePath, updateArg, failArg, jsonArg, root] = process.argv
const update = updateArg === "1"
const failOnNew = failArg === "1"
const wantJson = jsonArg === "1"

const readFindings = (file) => {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"))
  return Array.isArray(raw) ? raw : raw.findings || []
}

const rel = (file) => {
  if (typeof file !== "string") return ""
  return root && file.startsWith(root + "/") ? file.slice(root.length + 1) : file
}

const fp = (f) => [f.antipattern || "", rel(f.file || ""), String(f.line ?? ""), f.snippet || ""].join("\u0000")

const current = readFindings(currentPath)

let baseline = []
let baselineExists = false
try {
  baseline = readFindings(baselinePath)
  baselineExists = true
} catch {
  baselineExists = false
}

if (update) {
  const data = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: "scripts/design-check.sh",
    findings: current.map((f) => ({
      antipattern: f.antipattern,
      file: rel(f.file || ""),
      line: f.line,
      snippet: f.snippet,
      severity: f.severity,
    })),
  }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, JSON.stringify(data, null, 2) + "\n")
  console.error(`✅ baseline actualizado: ${rel(baselinePath) || baselinePath} (${current.length} hallazgo(s))`)
  if (wantJson) {
    console.log(JSON.stringify({ baseline: baselinePath, updated: true, count: current.length }, null, 2))
  }
  process.exit(0)
}

const currentFps = new Set(current.map(fp))
const baselineFps = new Set(baseline.map(fp))
const newFindings = current.filter((f) => !baselineFps.has(fp(f)))
const resolvedFindings = baseline.filter((f) => !currentFps.has(fp(f)))

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        baseline: baselinePath,
        baselineExists,
        baselineCount: baseline.length,
        currentCount: current.length,
        newCount: newFindings.length,
        resolvedCount: resolvedFindings.length,
        newFindings,
        resolvedFindings,
      },
      null,
      2,
    ),
  )
} else {
  console.error(
    `🔎 baseline: ${baselineExists ? `${baseline.length} hallazgo(s)` : "no existe"} | actual: ${current.length} | nuevos: ${newFindings.length} | resueltos: ${resolvedFindings.length}`,
  )
  for (const f of newFindings) {
    console.error(`   ✗ NUEVO ${f.antipattern} ${rel(f.file || "")}:${f.line ?? ""} ${f.snippet || ""}`)
  }
}

if (failOnNew) {
  if (!baselineExists) {
    console.error(`✗ No existe baseline (${rel(baselinePath) || baselinePath}); corre --update-baseline primero.`)
    process.exit(2)
  }
  if (newFindings.length > 0) {
    console.error("✗ Hallazgos de diseño NUEVOS respecto al baseline (--fail-on-new).")
    process.exit(2)
  }
}

process.exit(0)
NODE
  exit $?
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
