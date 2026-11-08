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
import { itemQualityColor, itemQualityTextColor } from '@/lib/ui/itemQuality';
import { classColor, hexToRgba } from '@/lib/ui/classColors';
import { itemIconEl } from '@/lib/ui/itemIcon';
import { slugify } from '@/lib/routes';

function node(tag: string, cls: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ID de objeto a partir del enlace de UltimoWoW (`?item=123`). Permite que
// itemRow resuelva el icono sin exigir el dato a cada caller.
function itemIdFromHref(href?: string): number | null {
  if (!href) return null;
  const match = /[?&]item=(\d+)/.exec(href);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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
  return node('h3', `${ui.gradientTitle} ${sizeCls} ${cls}`.trim(), text);
}

// Fila de card (roster/núcleos): superficie tenue con hover de borde.
export function cardRow(cls = ''): HTMLElement {
  return node('div', `${ui.cardRow} ${cls}`.trim());
}

// Indicador "→" (flecha derecha) para el extremo de cards enlazables. El
// enlace ya está en la card; el icono lo hace explícito (aria-hidden, el
// texto del enlace lleva la accesibilidad).
export function arrowIcon(): HTMLElement {
  const span = node('span', 'shrink-0 inline-flex items-center justify-center text-valor-300 group-hover:text-valor-200 transition-colors');
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

// Enlaces de contexto de una ficha (servidor realmlist + reino → jerarquía
// del directorio). Fila de badges que va DESPUÉS del separador final, en la
// tira de contexto que libera el encabezado (patrón del portal de hermandad).
// Fuente única de los chips de jugador y personaje.
export interface ServerRealmRef {
  server: string | null;
  realm: string | null;
}

export function serverRealmLinks(c: ServerRealmRef): HTMLElement {
  const row = node('div', 'flex flex-wrap gap-2');
  if (c.server) {
    const s = node('a', `${ui.badge} ${ui.badgeMd} text-parchment-200 bg-brand-950/70 border-brand-600/40 hover:bg-brand-900/50 hover:border-valor-400/60 transition-all`) as HTMLAnchorElement;
    s.href = `/servidor/${encodeURIComponent(c.server)}`;
    s.appendChild(iconEl('servidor', { size: 'sm', cls: 'shrink-0' }));
    s.appendChild(document.createTextNode(c.server));
    row.appendChild(s);
  }
  if (c.realm) {
    const cls = `${ui.badge} ${ui.badgeMd} text-gray-300 bg-brand-950/70 border-brand-600/25`;
    const r = node(
      c.server ? 'a' : 'span',
      c.server ? `${cls} hover:bg-brand-900/50 hover:border-valor-400/60 transition-all` : cls
    );
    if (c.server) {
      (r as HTMLAnchorElement).href = `/servidor/${encodeURIComponent(c.server)}/reino/${encodeURIComponent(slugify(c.realm))}`;
    }
    r.appendChild(iconEl('vientos', { size: 'sm', cls: 'shrink-0' }));
    r.appendChild(document.createTextNode(c.realm));
    row.appendChild(r);
  }
  return row;
}

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

// Acento de clase en un anfitrión: fija `--class-color` y `--class-tint`
// (alfa precalculado para el velo). Devuelve el color puro de la clase.
export function applyClassAccent(
  host: HTMLElement,
  className?: string | null,
  classFile?: string | null,
): string {
  const color = classColor(className, classFile);
  host.style.setProperty('--class-color', color);
  host.style.setProperty('--class-tint', hexToRgba(color, 0.10));
  return color;
}

export interface GaugeMilestone {
  value: number;
  label: string;
}

export interface ClassGaugeOptions {
  // Etiqueta corta (omitir en barras de progreso compactas).
  label?: string;
  // Texto de la cifra a la derecha (p. ej. «12/18»).
  valueText?: string;
  value: number;
  max: number;
  // Descripción accesible; por defecto etiqueta + cifra.
  ariaLabel?: string;
  // Texto del tooltip visible al pasar el cursor o enfocar el gauge.
  tooltip?: string;
  // Hitos de progresión (iLvl, rangos…): marcas dentro de la pista. Los ya
  // alcanzados se pintan con el acento de clase.
  milestones?: GaugeMilestone[];
  // Marcas segmentadas genéricas (por defecto true). El gauge de iLvl usa
  // hitos en su lugar para no duplicar líneas.
  ticks?: boolean;
  // Hace el gauge enfocable y muestra el tooltip (hover/focus).
  interactive?: boolean;
  // Paleta de calidad del equipamiento (colores del juego). Si se pasa, el
  // relleno/brillo del gauge usa un gradiente espectral en vez de la clase.
  spectralPalette?: string[];
}

let gaugeTipSeq = 0;

// Gauge de energía (design.md §12): pista oscura con relleno de clase (o
// paleta espectral de equipamiento), glow, marcas segmentadas e hitos.
// SIEMPRE expone role="progressbar" con rango; con `interactive` es
// enfocable y describe el valor en un tooltip.
export function classGauge(o: ClassGaugeOptions): HTMLElement {
  const wrap = node('div', 'min-w-0');
  const max = Math.max(1, o.max);
  const value = Math.max(0, Math.min(max, o.value));
  const pct = Math.round((value / max) * 100);
  const valueText = o.valueText ?? `${value}/${max}`;

  if (o.label || o.valueText) {
    const head = node('div', 'flex items-baseline justify-between gap-3 mb-1.5');
    if (o.label) head.appendChild(node('span', ui.statBlock.label, o.label));
    if (o.valueText) head.appendChild(node('span', 'text-xs font-bold text-brand-200 tabular-nums shrink-0', valueText));
    wrap.appendChild(head);
  }

  const trackWrap = node('div', ui.character.gauge.wrap);
  const track = node(
    'div',
    `${ui.character.gauge.track}${o.interactive ? ' rd-beast-gauge--interactive' : ''}`,
  );
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(max));
  track.setAttribute('aria-valuenow', String(value));
  track.setAttribute('aria-valuetext', o.tooltip ?? o.ariaLabel ?? valueText);
  track.setAttribute('aria-label', o.ariaLabel ?? `${o.label ?? 'Progreso'}: ${valueText}`);
  if (o.interactive) track.tabIndex = 0;

  const spectral = (o.spectralPalette ?? []).filter(Boolean);
  if (spectral.length > 0) {
    track.classList.add('rd-beast-gauge--spectral');
    const last = spectral.length - 1;
    const middle = spectral[Math.floor(last / 2)];
    track.style.setProperty('--rd-gauge-1', spectral[0]);
    track.style.setProperty('--rd-gauge-2', middle);
    track.style.setProperty('--rd-gauge-3', spectral[last]);
    const stops = spectral
      .map((color, index) => `${color} ${Math.round((index / Math.max(1, last)) * 100)}%`)
      .join(', ');
    track.style.setProperty('--rd-gauge-gradient', `linear-gradient(90deg, ${stops})`);
  }

  const fill = node('span', ui.character.gauge.fill);
  fill.style.width = `${pct}%`;
  track.appendChild(fill);

  if (o.ticks !== false) {
    const ticks = node('span', ui.character.gauge.ticks);
    ticks.setAttribute('aria-hidden', 'true');
    track.appendChild(ticks);
  }

  (o.milestones ?? []).forEach((milestone) => {
    if (milestone.value <= 0 || milestone.value >= max) return;
    const reached = milestone.value <= value;
    const mark = node(
      'span',
      `${ui.character.gauge.milestone}${reached ? ' is-passed' : ''}`,
    );
    mark.style.left = `${(milestone.value / max) * 100}%`;
    mark.title = `${milestone.value} · ${milestone.label}`;
    mark.setAttribute('aria-hidden', 'true');
    track.appendChild(mark);
  });

  trackWrap.appendChild(track);

  if (o.tooltip) {
    gaugeTipSeq += 1;
    const tip = node('span', ui.character.gauge.tip, o.tooltip);
    tip.id = `rd-gauge-tip-${gaugeTipSeq}`;
    tip.setAttribute('role', 'tooltip');
    trackWrap.appendChild(tip);
    track.setAttribute('aria-describedby', tip.id);
  }

  wrap.appendChild(trackWrap);
  return wrap;
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
  // ID del objeto (si se conoce): alimenta el icono nativo del tooltip.
  itemID?: number | null;
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
  const icon = itemIconEl(o.itemID ?? itemIdFromHref(o.href));
  if (icon) row.appendChild(icon);
  if (o.leading) row.appendChild(o.leading);
  const content = node('div', 'min-w-0 flex-1');
  if (o.slot) content.appendChild(node('p', ui.item.slot, o.slot));
  const name = node('p', `${ui.item.name}${o.done ? ' line-through opacity-60' : ''}`, o.name);
  if (o.quality !== null && o.quality !== undefined) name.style.color = itemQualityTextColor(o.quality);
  content.appendChild(name);
  row.appendChild(content);
  if (o.valueEl) row.appendChild(o.valueEl);
  else if (o.value) row.appendChild(node('span', `${ui.statValue} ${ui.item.value}`, o.value));
  return row;
}