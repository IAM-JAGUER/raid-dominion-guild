/**
 * Helpers de cards impactantes para renderers JS (directorios, portal,
 * roster, dashboard, fichas). Todas comparten la superficie de marca
 * (ui.card) y añaden: línea de acento superior (ui.cardTop), glow/lift al
 * hover (ui.cardHover), medallón (ui.iconTile), eyebrow y cifra (ui.statValue).
 *
 * Estos helpers son la fuente ÚNICA del literal de card en el render dinámico:
 * no dupliques bg-gray-900/60 + borde ámbar sueltos fuera de aquí (R5).
 */
import { ui } from '@/lib/ui/design';

function node(tag: string, cls: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Línea de acento superior (decorativa, aria-hidden). La card anfitriona debe
// tener `relative overflow-hidden`.
export function cardTop(): HTMLElement {
  const line = node('span', ui.cardTop);
  line.setAttribute('aria-hidden', 'true');
  return line;
}

// Card base no interactiva (contenedor de contenido).
export function card(cls = ''): HTMLElement {
  return node('div', `${ui.card} relative overflow-hidden ${cls}`.trim());
}

// Card enlace: superficie de card + hover de marca + línea de acento.
export function cardLink(href: string, cls = ''): HTMLAnchorElement {
  const a = node('a', `${ui.card} ${ui.cardHover} relative overflow-hidden block ${cls}`.trim()) as HTMLAnchorElement;
  a.href = href;
  a.appendChild(cardTop());
  return a;
}

// Medallón de icono/inicial (un glifo, R1). size: 'w-10 h-10' por defecto.
export function iconTile(text: string, size = 'w-10 h-10', textCls = 'text-lg'): HTMLElement {
  return node('div', `${ui.iconTile} ${size} ${textCls}`, text);
}

// Eyebrow: etiqueta superior de sección/card.
export function eyebrow(text: string, cls = ''): HTMLElement {
  return node('p', `${ui.eyebrow} ${cls}`.trim(), text);
}

// Cifra destacada (stats, contadores).
export function stat(value: string | number, sizeCls = 'text-lg', cls = ''): HTMLElement {
  return node('span', `${ui.statValue} ${sizeCls} ${cls}`.trim(), String(value));
}

// Título de card con degradado de marca (h2/h3).
export function cardTitle(text: string, sizeCls = 'text-base', cls = ''): HTMLElement {
  return node('h3', `${ui.gradientTitle} ${sizeCls} font-black italic ${cls}`.trim(), text);
}

// Fila de card (roster/núcleos): superficie tenue con hover de borde.
export function cardRow(cls = ''): HTMLElement {
  return node('div', `${ui.cardRow} ${cls}`.trim());
}

// Separador interno sutil de card.
export function divider(): HTMLElement {
  return node('div', ui.divider);
}

// Indicador "→" (flecha derecha) para el extremo de cards enlazables. El
// enlace ya está en la card; el icono lo hace explícito (aria-hidden, el
// texto del enlace lleva la accesibilidad).
export function arrowIcon(): HTMLElement {
  const span = node('span', 'shrink-0 inline-flex items-center justify-center text-amber-400 group-hover:text-amber-300 transition-colors');
  span.setAttribute('aria-hidden', 'true');
  const svg = node('svg', 'w-4 h-4');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M17 8l4 4m0 0l-4 4m4-4H3"/>';
  span.appendChild(svg);
  return span;
}