// Widget de UltimoWoW (power.js) para los enlaces del juego, MISMO método que
// el tracker local wow-rd: `data-wowhead="kind=id"`, URL
// `https://wotlk.ultimowow.com/es/?kind=id` y `refreshLinks()` tras montar
// datos async. El script de terceros se carga PEREZOSAMENTE, una sola vez por
// sesión y SOLO cuando la página monta un enlace con id soportado.

import type { RichTextToken, WowLink, WowLinkType } from '@/lib/wowLink';
import { normalizeRichTokens } from '@/lib/wowLink';
import { el } from '@/lib/ui/dom';

const GAME_DB_ORIGIN = 'https://wotlk.ultimowow.com/es/';
const POWER_JS = 'https://wotlk.ultimowow.com/static/widgets/power.js?lang=es';

// Tipos de enlace que power.js sabe enriquecer (segmento de URL = atributo).
const SUPPORTED: Partial<Record<WowLinkType, string>> = {
  item: 'item',
  spell: 'spell',
  achievement: 'achievement',
  quest: 'quest',
  currency: 'currency',
  npc: 'npc',
  object: 'object',
  itemset: 'itemset',
  event: 'event',
};

type WowheadPower = { refreshLinks?: () => void };
type WowheadGlobals = {
  $WowheadPower?: WowheadPower;
  $WH?: { Tooltip?: unknown };
  aowow_tooltips?: Record<string, unknown>;
};

let loader: Promise<void> | null = null;
let refreshTimer: number | null = null;
let refreshTries = 0;

// Inyecta power.js una sola vez. Al cargar, UltimoWoW procesa los enlaces ya
// presentes; `refreshWowhead` cubre los que se montan después (datos async).
export function ensureWowhead(): void {
  if (typeof document === 'undefined') return;
  const win = window as unknown as WowheadGlobals;
  // Misma configuración que wow-rd antes de cargar power.js.
  if (!win.aowow_tooltips) {
    win.aowow_tooltips = { colorlinks: true, iconizelinks: false, renamelinks: false };
  }
  if (loader) {
    void loader.then(refreshWowhead);
    return;
  }
  loader = new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = POWER_JS;
    script.async = true;
    script.dataset.rdWowhead = 'true';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => resolve());
    document.head.appendChild(script);
  });
  void loader.then(refreshWowhead);
}

// Reprocesa enlaces montados dinámicamente (API pública de power.js).
// power.js carga basic.js de forma asíncrona; refreshLinks antes de que exista
// `$WH.Tooltip` lanza un TypeError. Se reintenta brevemente hasta que el core
// de UltimoWoW esté listo.
export function refreshWowhead(): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as WowheadGlobals;
  const power = win.$WowheadPower;
  if (!power?.refreshLinks) return;
  if (!win.$WH?.Tooltip) {
    if (refreshTries >= 20) return;
    refreshTries += 1;
    if (refreshTimer === null) {
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshWowhead();
      }, 100);
    }
    return;
  }
  refreshTries = 0;
  try {
    power.refreshLinks();
  } catch {
    /* sin tooltip: los enlaces siguen funcionando */
  }
}

// URL canónica de UltimoWoW para un enlace soportado (o null).
export function wowheadUrl(link: WowLink): string | null {
  const segment = SUPPORTED[link.type];
  if (!segment || link.id === undefined || !Number.isSafeInteger(link.id) || link.id <= 0) return null;
  return `${GAME_DB_ORIGIN}?${segment}=${link.id}`;
}

// Configura un <a> como enlace enriquecido de UltimoWoW. Devuelve false si el
// tipo no está soportado (el caller decide el fallback) sin tocar el nodo.
export function applyWowhead(anchor: HTMLAnchorElement, link: WowLink): boolean {
  const segment = SUPPORTED[link.type];
  if (!segment || link.id === undefined) return false;
  const url = wowheadUrl(link);
  if (!url) return false;
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  // El tooltip sustituye al title nativo (wow-rd tampoco lo usa).
  anchor.removeAttribute('title');
  anchor.dataset.wowhead = `${segment}=${link.id}`;
  ensureWowhead();
  return true;
}

// Enlace del juego con su etiqueta visible. Con id soportado usa el widget de
// UltimoWoW (tooltip + descripción); sin id queda texto plano. El color del
// código `|c` del SV se respeta (es la señal del juego, p. ej. logro = dorado).
export function wowLinkEl(link: WowLink, cls = ''): HTMLElement {
  const label = link.label || link.raw;
  if (wowheadUrl(link)) {
    // Color explícito SIEMPRE: el enlace puede vivir dentro de un contenedor
    // con `text-transparent` (ui.gradientTitle) y heredaría invisibilidad.
    const anchor = el('a', ('hover:underline ' + cls).trim(), label) as HTMLAnchorElement;
    applyWowhead(anchor, link);
    if (link.color) anchor.style.color = `#${link.color}`;
    else anchor.classList.add('text-brand-200');
    return anchor;
  }
  // Sin id no hay tooltip posible: se degrada a texto con el color original.
  const span = el('span', cls, label);
  if (link.color) span.style.color = `#${link.color}`;
  return span;
}


// Render de tokens ricos (notas/campos del SV) con el MISMO widget de enlaces.
// Si no hay tokens útiles, cae al texto plano recibido.
export function richTextEl(tokens: RichTextToken[] | null | undefined, fallback = '', cls = ''): HTMLElement {
  const wrap = el('div', cls);
  const list = normalizeRichTokens(tokens);
  if (list.length === 0) {
    wrap.textContent = fallback;
    return wrap;
  }
  list.forEach((token) => {
    if (token.type === 'text') {
      wrap.appendChild(document.createTextNode(token.text));
      return;
    }
    wrap.appendChild(wowLinkEl({
      type: token.kind,
      id: token.id,
      label: token.label,
      raw: `|H${token.kind}:${token.id}|h[${token.label}]|h`,
      ...(token.color ? { color: token.color } : {}),
    }));
  });
  return wrap;
}
