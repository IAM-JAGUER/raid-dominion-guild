// Helpers DOM para render JS (directorios, vistas, dashboard). ÚNICA fuente
// de `el`/`chip`/`statChip`/`setBreadcrumb` — no re-definirlos por archivo
// (ver AGENTS.sections/pagina-map.md §2). Cards vía src/lib/ui/card.ts.
import { ui } from '@/lib/ui/design';

// Crea un nodo con clase (y texto opcional).
export function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Chip/badge base del portal (rounded-md, uppercase). El color lo aporta
// `extra` (default: neutro gris). `size`: 'sm' (cards/directorios) o 'md'
// (headers de ficha/perfil).
export function chip(text: string, extra = '', size: 'sm' | 'md' = 'sm'): HTMLElement {
  return el(
    'span',
    `${ui.badge} ${size === 'md' ? ui.badgeMd : ui.badgeSm} text-gray-300 bg-gray-800/60 border-amber-600/20` + (extra ? ` ${extra}` : ''),
    text,
  );
}

// Chip de cifra clave-valor (etiqueta muted + valor con degradado ui.statValue).
export function statChip(label: string, value: string | number, extra = ''): HTMLElement {
  const c = el('span', `${ui.badge} ${ui.badgeMd} bg-gray-800/60 border-amber-600/20 flex items-baseline gap-1.5` + (extra ? ` ${extra}` : ''));
  c.appendChild(el('span', 'text-gray-400', label));
  c.appendChild(el('span', `${ui.statValue} text-sm`, String(value)));
  return c;
}

// Sustituye el label del crumb actual con el valor real (nombre de
// servidor/reino/personaje/banda/guild) tras cargar datos.
export function setBreadcrumb(label: string): void {
  (window as unknown as { __rdBreadcrumb?: { setLabel: (l: string) => void } }).__rdBreadcrumb?.setLabel(label);
}