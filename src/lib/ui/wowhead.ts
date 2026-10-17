// Widget oficial de Wowhead (power.js) para los enlaces del juego que el SV
// guarda con markup de chat (logros, hechizos, objetos). El script de terceros
// se carga PEREZOSAMENTE, una sola vez por sesión y SOLO cuando la página
// monta un enlace con id soportado: la landing y las páginas sin enlaces no
// lo descargan.
//
// El id del enlace sale del propio markup del SV (p. ej. logro 4608 de
// `bands[].name`); los nombres limpios que vienen de la DB no lo conservan,
// así que ahí no hay tooltip rico (decisión 2026-10-17).

import type { WowLink, WowLinkType } from '@/lib/wowLink';
import { el } from '@/lib/ui/dom';

const WOWHEAD_ORIGIN = 'https://www.wowhead.com';
const WOWHEAD_VERSION = 'wotlk';
const POWER_JS = 'https://wow.zamimg.com/widgets/power.js';

// Tipos de enlace que power.js sabe enriquecer (segmento de URL = atributo).
const SUPPORTED: Partial<Record<WowLinkType, string>> = {
  item: 'item',
  spell: 'spell',
  achievement: 'achievement',
  quest: 'quest',
};

type WowheadPower = { refreshLinks?: () => void };

let loader: Promise<void> | null = null;

// Inyecta power.js una sola vez. Al cargar, Wowhead procesa los enlaces ya
// presentes; `refreshWowhead` cubre los que se montan después (datos async).
export function ensureWowhead(): void {
  if (typeof document === 'undefined') return;
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
export function refreshWowhead(): void {
  if (typeof window === 'undefined') return;
  const power = (window as unknown as { $WowheadPower?: WowheadPower }).$WowheadPower;
  power?.refreshLinks?.();
}

// URL canónica de Wowhead para un enlace soportado (o null).
export function wowheadUrl(link: WowLink): string | null {
  const segment = SUPPORTED[link.type];
  if (!segment || link.id === undefined) return null;
  return `${WOWHEAD_ORIGIN}/${WOWHEAD_VERSION}/${segment}=${link.id}`;
}

// Configura un <a> como enlace enriquecido de Wowhead. Devuelve false si el
// tipo no está soportado (el caller decide el fallback) sin tocar el nodo.
export function applyWowhead(anchor: HTMLAnchorElement, link: WowLink): boolean {
  const segment = SUPPORTED[link.type];
  if (!segment || link.id === undefined) return false;
  const url = wowheadUrl(link);
  if (!url) return false;
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.dataset.wowhead = `${segment}=${link.id}&domain=${WOWHEAD_VERSION}`;
  ensureWowhead();
  return true;
}

// Enlace del juego con su etiqueta visible. Con id soportado usa el widget de
// Wowhead (tooltip + descripción); sin id queda texto plano. El color del
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
