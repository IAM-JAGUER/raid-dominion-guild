/**
 * Helpers de cards impactantes para renderers JS (directorios, portal,
 * roster, dashboard, fichas). Todas comparten la superficie de marca
 * (ui.card) y añaden: línea de acento superior (ui.cardTop), glow/lift al
 * hover (ui.cardHover), medallón (ui.iconTile), eyebrow y cifra (ui.statValue).
 *
 * Estos helpers son la fuente ÚNICA del literal de card en el render dinámico:
 * no dupliques bg-brand-900/60 + borde ámbar sueltos fuera de aquí (R5).
 */
import { ui } from '@/lib/ui/design';
import { iconEl, type IconName, type IconSize } from '@/lib/ui/icons';
import { itemQualityColor } from '@/lib/ui/itemQuality';

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

// Card enlace: superficie de card + hover de marca + línea de acento +
// foco de teclado visible (ui.focusRing).
export function cardLink(href: string, cls = ''): HTMLAnchorElement {
  const a = node('a', `${ui.card} ${ui.cardHover} ${ui.focusRing} relative overflow-hidden block ${cls}`.trim()) as HTMLAnchorElement;
  a.href = href;
  a.appendChild(cardTop());
  return a;
}

// Medallón de icono/inicial (un glifo, R1). size: 'w-10 h-10' por defecto.
export function iconTile(text: string, size = 'w-10 h-10', textCls = 'text-lg'): HTMLElement {
  return node('div', `${ui.iconTile} ${size} ${textCls}`, text);
}

// Medallón con icono TEMÁTICO (arte a color del sprite) sobre ui.iconTile.
// El tamaño por defecto es el token responsivo de card/lista (crece en sm).
export function iconTileEl(name: IconName, size = ui.iconTileMd, iconSize: IconSize = 'lg'): HTMLElement {
  const tile = node('div', `${ui.iconTile} ${size}`);
  tile.appendChild(iconEl(name, { size: iconSize }));
  return tile;
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
  const span = node('span', 'shrink-0 inline-flex items-center justify-center text-brand-400 group-hover:text-brand-300 transition-colors');
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

// ── Póster: piezas de ficha (design.md §12, 2026-10-17) ───────────────────

// Medallón héroe de ficha: el sprite a tamaño protagonista (hero) sobre el
// medallón, con halo del color de contexto (`tint`: color de clase o acento
// de la zona). El halo ilumina por fuera; el arte no se recolorea (§10).
export function heroMedallion(name: IconName, tint?: string | null): HTMLElement {
  const tile = node('div', `${ui.iconTile} rd-medallion-hero ${ui.iconTileHero}`);
  if (tint) {
    tile.style.setProperty('--rd-hero-tint', tint);
    tile.style.borderColor = tint;
  }
  tile.appendChild(iconEl(name, { size: 'hero' }));
  return tile;
}

// Celda de la tira de cifras del héroe: etiqueta + valor grande (statValue).
export function statCell(label: string, value: string | number): HTMLElement {
  const cell = node('div', ui.statBlock.cell);
  cell.appendChild(node('p', ui.statBlock.label, label));
  cell.appendChild(node('p', `${ui.statValue} ${ui.statBlock.value}`, String(value)));
  return cell;
}

export interface ItemRowOptions {
  // Etiqueta superior (slot del equipo, tipo de meta…).
  slot?: string;
  // Contenido protagonista de la fila.
  name: string;
  // Calidad del juego (0-7): pinta el nombre y el riel con su color.
  quality?: number | null;
  // Cifra a la derecha (ilvl, objetivo, cuenta atrás).
  value?: string;
  // Cifra como nodo propio (estados que no son statValue, p. ej. «Reiniciado»).
  valueEl?: HTMLElement;
  // Marcador inicial (check/reloj/icono de tipo).
  leading?: HTMLElement;
  // Enlace externo (ficha del ítem): abre en pestaña nueva.
  href?: string;
  hrefTitle?: string;
  // Estado completado: nombre tachado y atenuado.
  done?: boolean;
  // Color del riel cuando no hay calidad (acento de la zona).
  rail?: string;
}

// Fila de ÍTEM/meta (design.md §12): slot como etiqueta, nombre como
// protagonista (color de calidad vía `--rd-q`) y cifra a la derecha. Siempre
// con contenedor real — sustituye el patrón fantasma que se disolvía sobre
// la atmósfera (bg-brand-900/40 + border-l-2).
export function itemRow(o: ItemRowOptions): HTMLElement {
  const row = node(o.href ? 'a' : 'div', `${ui.item.row} ${ui.item.rowHover}`);
  if (o.href) {
    const a = row as HTMLAnchorElement;
    a.href = o.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (o.hrefTitle) a.title = o.hrefTitle;
  }
  const qc = o.quality !== null && o.quality !== undefined
    ? itemQualityColor(o.quality)
    : (o.rail ?? null);
  if (qc) row.style.setProperty('--rd-q', qc);
  const rail = node('span', 'rd-quality-rail');
  rail.setAttribute('aria-hidden', 'true');
  row.appendChild(rail);
  if (o.leading) row.appendChild(o.leading);
  const content = node('div', 'min-w-0 flex-1');
  if (o.slot) content.appendChild(node('p', ui.item.slot, o.slot));
  const name = node('p', `${ui.item.name}${o.done ? ' line-through opacity-60' : ''}`, o.name);
  if (o.quality !== null && o.quality !== undefined) name.style.color = itemQualityColor(o.quality);
  content.appendChild(name);
  row.appendChild(content);
  if (o.valueEl) row.appendChild(o.valueEl);
  else if (o.value) row.appendChild(node('span', `${ui.statValue} ${ui.item.value}`, o.value));
  return row;
}