import type { ParsedSavedVariables, GuildRank, BandPlayer } from '@/types/parser';
import type { MergePlayer } from '@/lib/bandMerge';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { resolveRankName, sortRanks } from '@/lib/ui/ranks';
import { roleLabel } from '@/lib/ui/itemQuality';
import { bandNameLink } from '@/lib/ui/bandName';
import { cardLink, card, cardTop, cardRow, cardTitle, arrowIcon } from '@/lib/ui/card';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { createPaginator } from '@/lib/ui/paginator';
import { iconEl, type IconName } from '@/lib/ui/icons';

export { el };

// Campos que el roster necesita para mostrarse (públicos; sin officerNote).
// `rankIndex` (opcional) permite ordenar/agrupar por jerarquía de rangos.
// `slug` (opcional) enlaza la ficha pública del personaje (/personaje/:slug).
export interface RosterMember {
  name: string;
  class?: string;
  rank?: string;
  rankIndex?: number;
  publicNote?: string;
  slug?: string;
}

function chip(text: string, extra = ''): HTMLElement {
  return el(
    'span',
    `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20` + (extra ? ` ${extra}` : ''),
    text,
  );
}

// Título de banda: si el SV guardó el nombre como enlace del juego (p. ej. el
// logro de la mazmorra: `|cffffff00|Hachievement:4608:…|h[ICC25N]|h|r`), se
// muestra la etiqueta limpia con el tooltip de UltimoWoW; si no, texto plano.
function bandTitle(band: ParsedSavedVariables['bands'][number]): HTMLElement {
  const title = cardTitle('', 'text-base');
  const name = bandNameLink(band.name, band.nameLink);
  if (name.anchor) title.appendChild(name.anchor);
  else title.textContent = name.label;
  return title;
}

export function renderBand(
  band: ParsedSavedVariables['bands'][number],
  opts?: { hidePlayers?: boolean },
): HTMLElement {
  const hidePlayers = opts?.hidePlayers ?? false;
  const cardEl = card('p-4');
  cardEl.appendChild(cardTop());
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  header.appendChild(bandTitle(band));

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20`, band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20`, `GS ${band.minGS}`));
  if (hidePlayers) {
    meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20`, 'jugadores ocultos'));
  } else {
    meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20`, `${band.players.length} jugadores`));
  }
  header.appendChild(meta);
  cardEl.appendChild(header);

  if (!hidePlayers && band.players.length > 0) {
    const roles = new Map<string, number>();
    band.players.forEach((p) => {
      const r = p.role || 'sin rol';
      roles.set(r, (roles.get(r) || 0) + 1);
    });
    const chips = el('div', 'flex flex-wrap gap-2');
    Array.from(roles.entries()).forEach(([role, count]) => {
      chips.appendChild(el('span', 'text-[10px] font-bold text-brand-300/90 bg-brand-900/20 border border-brand-600/20 rounded-md px-2 py-0.5', `${role}: ${count}`));
    });
    cardEl.appendChild(chips);

    const players = document.createElement('details');
    players.className = 'mt-3 group';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer select-none list-none text-xs font-black uppercase tracking-widest text-brand-300/80 hover:text-brand-200';
    summary.textContent = `Jugadores (${band.players.length})`;
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2');
    band.players.forEach((p) => {
      const row = el('div', 'text-xs text-gray-300 bg-brand-900/40 rounded px-2 py-1');
      const left = el('div', 'flex flex-wrap items-center gap-1.5');
      left.appendChild(classIconEl(p.class, undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
      left.appendChild(el('span', 'font-bold text-white', p.name));
      const badges = el('div', 'flex flex-wrap gap-1.5 mt-0.5');
      if (p.role) badges.appendChild(el('span', 'text-[10px] text-brand-300', p.role));
      if (p.dual) badges.appendChild(el('span', 'text-[10px] text-gray-400', `dual: ${p.dual}`));
      if (p.leader) badges.appendChild(el('span', 'text-[10px] text-emerald-300', `líder: ${p.leader}`));
      if (p.banned) badges.appendChild(el('span', 'text-[10px] text-red-300', 'baneado'));
      if (p.sanction) badges.appendChild(el('span', 'text-[10px] text-brand-300', `sanción: ${p.sanction}`));
      if (typeof p.points === 'number') badges.appendChild(el('span', 'text-[10px] text-gray-400', `${p.points} pts`));
      if (p.notes) badges.appendChild(el('span', 'text-[10px] text-gray-400 italic', p.notes));
      left.appendChild(badges);
      row.appendChild(left);
      if (p.class) row.appendChild(el('span', 'text-gray-400 whitespace-nowrap', p.class));
      grid.appendChild(row);
    });
    players.append(summary, grid);
    cardEl.appendChild(players);
  }

  if (band.spammer) {
    const spam = el('div', 'mt-3 text-xs text-gray-400 bg-brand-900/40 border border-gray-700/50 rounded-md px-3 py-2');
    let txt = 'Spammer';
    if (typeof band.spammer.duration === 'number') txt += ` · ${band.spammer.duration}s`;
    const channels = band.spammer.channels
      ? Object.entries(band.spammer.channels).filter(([, v]) => v).map(([c]) => c).join(', ')
      : '';
    if (channels) txt += ` · canales: ${channels}`;
    spam.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-brand-300/80', txt));
    if (band.spammer.message) spam.appendChild(el('p', 'mt-1 text-gray-400 italic', band.spammer.message));
    cardEl.appendChild(spam);
  }

  return cardEl;
}

// ── Vista expandida para el dashboard (Mis Bandas) ─────────────────────────
// Jugadores siempre visibles con todos sus campos + spammer completo.

function renderBandPlayerRow(p: BandPlayer): HTMLElement {
  const color = classColor(p.class);
  const row = cardRow('px-3 py-2 text-xs text-gray-300');
  const head = el('div', 'flex flex-wrap items-center gap-2');
  head.appendChild(classIconEl(p.class, undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
  const name = el('span', 'font-bold italic', p.name);
  name.style.color = color;
  head.appendChild(name);
  if (p.leader) head.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-emerald-300 bg-emerald-950/30 border-emerald-600/40`, 'Líder'));
  if (p.banned) head.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-red-300 bg-red-950/40 border-red-600/40`, 'Baneado'));
  row.appendChild(head);

  const meta = el('div', 'flex flex-wrap gap-1.5 mt-1');
  if (p.role) meta.appendChild(el('span', 'text-[10px] text-brand-300', p.role));
  if (p.dual) meta.appendChild(el('span', 'text-[10px] text-gray-400', `dual: ${p.dual}`));
  if (p.sanction) meta.appendChild(el('span', 'text-[10px] text-brand-300', `sanción: ${p.sanction}`));
  if (typeof p.points === 'number') meta.appendChild(el('span', 'text-[10px] text-gray-400', `${p.points} pts`));
  if (p.class) meta.appendChild(el('span', 'text-gray-400', p.class));
  row.appendChild(meta);
  if (p.notes) row.appendChild(el('p', 'mt-1 text-gray-400 italic', p.notes));
  return row;
}

function renderSpammer(spammer: NonNullable<ParsedSavedVariables['bands'][number]['spammer']>): HTMLElement {
  const box = el('div', 'mt-4 text-xs bg-brand-900/40 border border-brand-700/30 rounded-md px-4 py-3');
  box.appendChild(el('p', 'text-[10px] font-black uppercase tracking-widest text-brand-300/80 mb-1', 'Spammer de la banda'));
  const details = el('div', 'flex flex-wrap gap-2');
  if (typeof spammer.duration === 'number') details.appendChild(chip(`Ciclo ${spammer.duration}s`));
  const channels = spammer.channels ? Object.entries(spammer.channels) : [];
  const enabled = channels.filter(([, v]) => v).map(([c]) => c);
  const disabled = channels.filter(([, v]) => !v).map(([c]) => c);
  if (enabled.length > 0) details.appendChild(chip(`Canales: ${enabled.join(', ')}`, '!text-brand-300 !border-brand-500/40'));
  if (disabled.length > 0) details.appendChild(el('span', 'text-[10px] text-gray-400', `(inactivos: ${disabled.join(', ')})`));
  box.appendChild(details);
  if (spammer.message) box.appendChild(el('p', 'mt-2 text-gray-400 italic', spammer.message));
  return box;
}

// Banda expandida: nombre, horario, GS, distribución de roles, jugadores
// completos (siempre visibles) y spammer con su configuración.
export function renderBandExpanded(band: ParsedSavedVariables['bands'][number]): HTMLElement {
  const cardEl = card('p-5');
  cardEl.appendChild(cardTop());
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  const titleWrap = el('div', 'flex flex-wrap items-center gap-2');
  titleWrap.appendChild(bandTitle(band));
  if (band.icon) titleWrap.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-brand-900/60 border-brand-600/20`, `icon ${band.icon}`));
  header.appendChild(titleWrap);

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(chip(band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(chip(`GS mínimo ${band.minGS}`));
  meta.appendChild(chip(`${band.players.length} jugadores`));
  header.appendChild(meta);
  cardEl.appendChild(header);

  const roles = new Map<string, number>();
  band.players.forEach((p) => {
    const r = p.role || 'sin rol';
    roles.set(r, (roles.get(r) || 0) + 1);
  });
  if (roles.size > 0) {
    const chips = el('div', 'flex flex-wrap gap-2');
    Array.from(roles.entries()).forEach(([role, count]) => {
      chips.appendChild(el('span', 'text-[10px] font-bold text-brand-300/90 bg-brand-900/20 border border-brand-600/20 rounded-md px-2 py-0.5', `${role}: ${count}`));
    });
    cardEl.appendChild(chips);
  }

  if (band.players.length > 0) {
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4');
    band.players.forEach((p) => grid.appendChild(renderBandPlayerRow(p)));
    cardEl.appendChild(grid);
  } else {
    cardEl.appendChild(el('p', 'text-[11px] text-gray-400 italic mt-3', 'Sin jugadores en esta banda.'));
  }

  if (band.spammer) cardEl.appendChild(renderSpammer(band.spammer));

  return cardEl;
}

// ── Core de banda (estilo lista de asistencia de raids de guild-portal) ─────
// El roster de una banda se agrupa por rol (TANQUES/SANADORES/MELEE/RANGO) con
// cabeceras de color + ícono + conteo + chevron colapsable, y un grid de
// fichas con nombre coloreado por clase y badges SOLO-ICONO (integración/
// líder/baneado/dual/sanción/puntos): sus etiquetas se decodifican en el pie
// de leyenda fijo del contenido (renderCoreLegend).

// Icono temático por grupo de rol del core (contrato src/lib/ui/icons.ts).
const CORE_ICONS: Record<'tank' | 'healer' | 'melee' | 'rango', IconName> = {
  tank: 'escudo',
  healer: 'sanacion',
  melee: 'espadas',
  rango: 'arma',
};

// Etiquetas públicas de los grupos de rol del core (filtro + cabeceras).
export const CORE_ROLE_LABELS: Record<'tank' | 'healer' | 'melee' | 'rango', string> = {
  tank: 'Tanques',
  healer: 'Sanadores',
  melee: 'Melee',
  rango: 'Rango',
};

export function coreRoleGroup(p: { role?: string | null; class?: string | null }): 'tank' | 'healer' | 'melee' | 'rango' {
  const r = (p.role || '').trim().toLowerCase();
  if (r === 't' || r.includes('tanque') || r.includes('tank')) return 'tank';
  if (r === 'h' || r.includes('sanador') || r.includes('heal')) return 'healer';
  if (r === 'm' || r.includes('melee') || r.includes('cuerpo')) return 'melee';
  if (r === 'r' || r.includes('rango') || r.includes('ranged') || r.includes('range') || r.includes('distancia')) return 'rango';
  // DPS genérico sin precisión: se infiere por clase (cuerpo a cuerpo vs distancia).
  const cl = (p.class || '').trim().toLowerCase();
  const ranged = ['mage', 'warlock', 'priest', 'hunter', 'evoker'];
  return ranged.includes(cl) ? 'rango' : 'melee';
}

// Badge SOLO-ICONO del core: la etiqueta visible vive en el pie de leyenda
// (renderCoreLegend). El texto completo se conserva en title (tooltip) y
// sr-only para no perder el valor exacto (p. ej. "sanción: 2 días", "15 pts")
// ni la accesibilidad.
function coreBadge(label: string, extra: string, icon: IconName): HTMLElement {
  const badge = el('span', `${ui.badge} ${ui.badgeSm} ${extra}`);
  badge.title = label;
  badge.appendChild(iconEl(icon, { size: 'xs' }));
  badge.appendChild(el('span', 'sr-only', label));
  return badge;
}

// Leyenda FIJA del pie del core: mismos iconos/etiquetas que las placas.
const CORE_LEGEND: Array<{ icon: IconName; label: string }> = [
  { icon: 'enlace', label: 'Integración' },
  { icon: 'corona', label: 'Líder' },
  { icon: 'bloqueo', label: 'Baneado' },
  { icon: 'sincronizar', label: 'Dual' },
  { icon: 'balanza', label: 'Sanción' },
  { icon: 'dados', label: 'Puntos' },
];

// Pie del contenido del core: decodifica los badges solo-icono de las placas.
// Se monta SIEMPRE (aunque ningún jugador use un badge) como cierre del panel.
function renderCoreLegend(): HTMLElement {
  const footer = el('footer', `${ui.surf.row} mt-2 px-4 py-3`);
  footer.setAttribute('aria-label', 'Leyenda de iconos del core');
  footer.appendChild(el('p', 'text-[10px] font-black uppercase tracking-widest text-brand-300/80 mb-2', 'Leyenda'));
  const list = el('ul', 'flex flex-wrap gap-x-4 gap-y-2');
  CORE_LEGEND.forEach(({ icon, label }) => {
    const li = el('li', 'inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-400');
    li.appendChild(iconEl(icon, { size: 'xs', cls: 'shrink-0' }));
    li.appendChild(document.createTextNode(label));
    list.appendChild(li);
  });
  footer.appendChild(list);
  return footer;
}

function renderCoreSection(title: string, count: number, color: string, icon: IconName, rows: HTMLElement[]): HTMLElement {
  const section = el('div', 'mb-4');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'w-full flex items-center gap-2 px-1 py-1 cursor-pointer group/header select-none rounded-md hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';
  header.setAttribute('aria-expanded', 'true');

  header.appendChild(iconEl(icon, { size: 'sm', cls: 'shrink-0' }));
  header.appendChild(el('h4', `text-[10px] font-black tracking-widest uppercase ${color}`, title));
  header.appendChild(el('div', 'flex-1 h-[1px] bg-gradient-to-r from-white/10 to-transparent ml-2'));
  header.appendChild(el('span', 'text-[10px] font-bold text-white/40 mr-2', String(count)));
  const chevron = el('span', 'text-white/20 group-hover/header:text-white/50 transition-transform shrink-0', '');
  chevron.innerHTML = '<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
  header.appendChild(chevron);

  const grid = el('div', 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3');
  rows.forEach((r) => grid.appendChild(r));

  header.addEventListener('click', () => {
    const isHidden = grid.classList.toggle('hidden');
    header.setAttribute('aria-expanded', String(!isHidden));
    chevron.classList.toggle('-rotate-90', isHidden);
  });

  section.append(header, grid);
  return section;
}

function renderCorePlayer(p: MergePlayer, isSource: boolean, slug?: string): HTMLElement {
  const color = classColor(p.class);
  // Mismo lenguaje que la card de personaje (renderCharacterCard): la tarjeta
  // COMPLETA es el enlace a /personaje/:slug cuando existe; nombre como texto
  // plano y, a la derecha, el rol/cifras y la flecha indicadora.
  let row: HTMLElement;
  if (slug) {
    row = cardLink(`/personaje/${slug}`, 'px-4 py-3 flex items-center justify-between gap-3 group');
  } else {
    row = card('px-4 py-3 flex items-center justify-between gap-3');
  }

  // Borde izquierdo coloreado por clase (mismo lenguaje que renderCharacterCard).
  const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
  accent.style.backgroundColor = color;
  row.appendChild(accent);

  const left = el('div', 'flex items-center gap-2.5 min-w-0');
  // Identidad (icono + nombre + badges) y nota en columna: la nota es texto
  // largo y en horizontal robaría el ancho del nombre.
  const ident = el('div', 'flex flex-col min-w-0');
  const nameRow = el('div', 'flex items-center gap-2 min-w-0');
  nameRow.appendChild(classIconEl(p.class, undefined, 'w-7 h-7 rounded-md border border-gray-700/50 shrink-0 object-cover'));
  const name = el('span', 'font-black italic truncate text-sm');
  name.style.color = color;
  name.textContent = p.name || '?';
  nameRow.appendChild(name);
  if (isSource) nameRow.appendChild(coreBadge('integración', 'text-brand-300 bg-brand-950/40 border-brand-600/40', 'enlace'));
  if (p.leader) nameRow.appendChild(coreBadge('líder', 'text-emerald-300 bg-emerald-950/40 border-emerald-600/40', 'corona'));
  if (p.banned) nameRow.appendChild(coreBadge('baneado', 'text-red-300 bg-red-950/40 border-red-600/40', 'bloqueo'));
  ident.appendChild(nameRow);
  // Solo aparece si el líder publicó las notas: si no, ni siquiera viajan en el
  // row público (la DB las guarda aparte), así que aquí no hay nada que filtrar.
  if (p.notes) ident.appendChild(el('p', 'text-[10px] italic text-gray-400 truncate', p.notes));
  left.appendChild(ident);
  row.appendChild(left);

  const right = el('div', 'flex flex-wrap justify-end gap-1.5 text-[10px]');
  // El rol principal NO se repite en la card: lo comunica la cabecera del
  // grupo colapsable; en su lugar se muestra el dual cuando existe. Todos los
  // marcadores van SOLO-ICONO; el dato exacto vive en title/sr-only y la
  // etiqueta en el pie de leyenda.
  if (p.dual) right.appendChild(coreBadge(`dual: ${roleLabel(p.dual) || p.dual}`, 'text-brand-300 bg-brand-950/40 border-brand-600/40', 'sincronizar'));
  if (p.sanction) right.appendChild(coreBadge(`sanción: ${p.sanction}`, 'text-brand-300 bg-brand-950/40 border-brand-600/40', 'balanza'));
  if (typeof p.points === 'number') right.appendChild(coreBadge(`${p.points} pts`, 'text-brand-200 bg-brand-950/40 border-brand-600/40', 'dados'));
  if (slug) right.appendChild(arrowIcon());
  row.appendChild(right);
  return row;
}

export interface BandCoreOpts {
  // Nombres de las fuentes de integración (bandas de miembros): los jugadores
  // cuyo nombre coincide reciben el badge "integración".
  sourceNames?: string[];
  // Mapa lowercased(nombre) → slug público (/personaje/:slug) para enlazar
  // los miembros del core que tienen ficha pública.
  slugMap?: Record<string, string>;
}

export function renderBandCore(players: MergePlayer[], opts?: BandCoreOpts): HTMLElement {
  const sourceSet = new Set((opts?.sourceNames ?? []).map((n) => (n || '').trim().toLowerCase()));
  const slugMap = opts?.slugMap ?? {};
  const groups: Record<'tank' | 'healer' | 'melee' | 'rango', MergePlayer[]> = {
    tank: [],
    healer: [],
    melee: [],
    rango: [],
  };
  players.forEach((p) => {
    const key = coreRoleGroup(p);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const sections: Array<{ key: 'tank' | 'healer' | 'melee' | 'rango'; title: string; color: string }> = [
    { key: 'tank', title: 'Tanques', color: 'text-blue-400' },
    { key: 'healer', title: 'Sanadores', color: 'text-green-400' },
    { key: 'melee', title: 'Melee', color: 'text-red-400' },
    { key: 'rango', title: 'Rango', color: 'text-brand-400' },
  ];

  const wrap = el('div', '');
  let any = false;
  sections.forEach((cfg) => {
    const rows = (groups[cfg.key] ?? []).map((p) =>
      renderCorePlayer(
        p,
        sourceSet.has((p.name || '').trim().toLowerCase()),
        slugMap[(p.name || '').trim().toLowerCase()],
      ),
    );
    if (rows.length === 0) return;
    any = true;
    wrap.appendChild(renderCoreSection(cfg.title, rows.length, cfg.color, CORE_ICONS[cfg.key], rows));
  });

  if (!any) return el('p', 'text-sm text-gray-400 italic', 'Esta banda aún no tiene jugadores asignados.');
  wrap.appendChild(renderCoreLegend());
  return wrap;
}

// Lista única de jugadores a través de todas las bandas (con flags agregados)
export function renderBandPlayers(players: BandPlayer[]): HTMLElement {
  const unique = new Map<string, {
    name: string;
    classes: Set<string>;
    roles: Set<string>;
    bands: number;
    leader: boolean;
    banned: boolean;
  }>();
  players.forEach((p) => {
    const key = p.name.trim().toLowerCase();
    if (!key) return;
    const cur = unique.get(key) ?? {
      name: p.name.trim(), classes: new Set<string>(), roles: new Set<string>(),
      bands: 0, leader: false, banned: false,
    };
    if (p.class) cur.classes.add(p.class);
    if (p.role) cur.roles.add(p.role);
    cur.bands += 1;
    if (p.leader) cur.leader = true;
    if (p.banned) cur.banned = true;
    unique.set(key, cur);
  });

  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2');
  Array.from(unique.values()).forEach((u) => {
    const color = classColor(u.classes.size ? Array.from(u.classes).join(',') : undefined);
    const row = cardRow('px-3 py-2 text-xs text-gray-300 flex flex-wrap items-center justify-between gap-2');
    const left = el('div', 'flex flex-wrap items-center gap-2');
    left.appendChild(classIconEl(Array.from(u.classes)[0], undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
    const name = el('span', 'font-bold italic', u.name);
    name.style.color = color;
    left.appendChild(name);
    if (u.leader) left.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-emerald-300 bg-emerald-950/30 border-emerald-600/40`, 'Líder'));
    if (u.banned) left.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-red-300 bg-red-950/40 border-red-600/40`, 'Baneado'));
    row.appendChild(left);

    const meta = el('div', 'flex flex-wrap gap-1.5');
    if (u.roles.size) meta.appendChild(el('span', 'text-[10px] text-brand-300', Array.from(u.roles).join(', ')));
    if (u.classes.size) meta.appendChild(el('span', 'text-gray-400', Array.from(u.classes).join(', ')));
    meta.appendChild(el('span', 'text-[10px] text-gray-400', u.bands > 1 ? `${u.bands} bandas` : '1 banda'));
    row.appendChild(meta);
    grid.appendChild(row);
  });

  if (unique.size === 0) {
    return el('p', 'text-[11px] text-gray-400 italic', 'Sin jugadores en las bandas.');
  }
  return grid;
}

// Badge de rango según jerarquía (estilo ficha de roster)
function rankBadgeClass(rank: string | undefined): string {
  const r = (rank ?? '').toLowerCase();
  if (r.includes('maestro') || r.includes('admin')) return 'text-brand-300 border-brand-500/40 bg-brand-900/20';
  if (r.includes('oficial')) return 'text-brand-300 border-brand-600/30 bg-brand-950/30';
  return 'text-gray-300 border-gray-500/40 bg-brand-800/60';
}

// Roster en grid de fichas, paginado (estilo guild-portal): "Página [X] de Y
// • N miembros" (X = desplegable de salto directo a cualquier página) +
// controles prev/next. Cuando hay jerarquía de rangos (ranks) y
// los miembros traen rankIndex, el roster se ORGANIZA por rango (0 = líder
// arriba) con cabeceras de grupo; si no, queda plano como antes.
export function renderRoster(wrap: HTMLElement, members: RosterMember[], ranks?: GuildRank[]): void {
  if (!members || members.length === 0) {
    wrap.innerHTML = '<p class="text-sm text-gray-400 italic">Sin roster exportado.</p>';
    return;
  }

  interface Entry { m: RosterMember; groupStart: boolean; groupLabel: string }

  // Agrupar por jerarquía solo cuando hay rangos y al menos un miembro con
  // rankIndex (snapshots nuevos). Los legacy quedan planos.
  const hasRankData = (ranks?.length ?? 0) > 0 && members.some((m) => typeof m.rankIndex === 'number');
  let entries: Entry[] = [];
  if (hasRankData) {
    const sorted = sortRanks(ranks);
    // Número de orden jerárquico de cada rango (1 = líder, 2 = siguiente…):
    // posición en la jerarquía ordenada, usada para numerar las cabeceras.
    const rankNo = new Map<number, number>();
    sorted.forEach((r, i) => rankNo.set(r.index, i + 1));
    const groups = new Map<number, RosterMember[]>();
    members.forEach((m) => {
      const key = typeof m.rankIndex === 'number' ? m.rankIndex : Number.MAX_SAFE_INTEGER;
      const arr = groups.get(key) ?? [];
      arr.push(m);
      groups.set(key, arr);
    });
    Array.from(groups.keys())
      .sort((a, b) => a - b)
      .forEach((key) => {
        const group = groups.get(key) ?? [];
        const label = resolveRankName({
          rankIndex: key === Number.MAX_SAFE_INTEGER ? undefined : key,
          rank: group[0]?.rank,
          ranks: sorted,
        });
        // Numera la jerarquía: antepone el ordinal al nombre del rango
        // (p.ej. "1. Líder"). Los huérfanos sin rankIndex no llevan número.
        const no = typeof key === 'number' && rankNo.has(key) ? rankNo.get(key) : undefined;
        const labeled = no !== undefined ? `${no}. ${label}` : label;
        group.forEach((m, i) => entries.push({ m, groupStart: i === 0, groupLabel: labeled }));
      });
  } else {
    entries = members.map((m) => ({ m, groupStart: false, groupLabel: '' }));
  }

  const PAGE_SIZE = 9; // grid 3×3, como el roster de guild-portal

  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3');

  // Paginación vía módulo reutilizable (paginator.ts): barra
  // "Página [X] de Y • N miembros" (X = desplegable de salto directo) +
  // prev/next. El paginator renderiza en `grid` y aporta la barra solo
  // cuando hay más de una página (antes inline aquí, mismo markup).
  const paginator = createPaginator({
    pageSize: PAGE_SIZE,
    totalItems: entries.length,
    summary: `${members.length} miembros`,
    renderPage: (page) => {
      grid.innerHTML = '';
      const start = (page - 1) * PAGE_SIZE;
      entries.slice(start, start + PAGE_SIZE).forEach(({ m, groupStart, groupLabel }) => {
        if (groupStart && groupLabel) {
          const hdr = el('div', 'col-span-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-300 border-b border-brand-600/20 pb-1 mt-1');
          hdr.appendChild(el('span', 'w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0', ''));
          hdr.appendChild(el('span', '', groupLabel));
          grid.appendChild(hdr);
        }
        const color = classColor(m.class);
        // Toda la tarjeta es el enlace a /personaje/:slug (cuando existe): el
        // nombre queda como texto plano, sin subrayado ni icono de enlace.
        let cardEl: HTMLElement;
        if (m.slug) {
          cardEl = cardLink(`/personaje/${m.slug}`, 'p-4 pl-5 flex flex-col justify-center gap-2 group');
        } else {
          cardEl = card('p-4 pl-5 flex flex-col justify-center gap-2');
          cardEl.appendChild(cardTop());
        }
        const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
        accent.style.backgroundColor = color;
        cardEl.appendChild(accent);

        const row = el('div', 'flex items-center justify-between gap-2');
        const nameWrap = el('div', 'flex items-center gap-1.5 min-w-0');
        nameWrap.appendChild(classIconEl(m.class, undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
        const name = el('span', 'font-black italic leading-[1.3] text-sm');
        name.style.color = color;
        name.textContent = m.name;
        nameWrap.appendChild(name);
        row.appendChild(nameWrap);
        if (m.rank) {
          row.appendChild(el('span', `shrink-0 ${ui.badge} ${ui.badgeSm} ${rankBadgeClass(m.rank)}`, m.rank));
        }
        cardEl.appendChild(row);

        // La clase NO se repite como badge de texto: la ficha ya la comunica con
        // el ícono de clase y el acento/color de clase (decisión 2026-09-01).
        // La fila de nota solo se monta si hay contenido: un div vacío + gap-2
        // del contenedor descentra la fila (justify-center centra fila+gap+0).
        if (m.publicNote) {
          const meta = el('div', 'flex flex-wrap gap-1.5');
          meta.appendChild(el('span', 'text-[10px] text-gray-400 italic truncate', m.publicNote));
          cardEl.appendChild(meta);
        }

        grid.appendChild(cardEl);
      });
    },
  });

  wrap.innerHTML = '';
  wrap.appendChild(grid);
  if (paginator.bar) wrap.appendChild(paginator.bar);
  paginator.update();
}

// Renderiza bandas (con fallback a Core), reglas y roster dentro de contenedores.
// `data.ranks` (opcional) entrega la jerarquía de rangos para organizar el roster.
export function renderParsedSections(
  data: ParsedSavedVariables & { ranks?: GuildRank[] },
  containers: { bands: HTMLElement; rules: HTMLElement; rosterWrap: HTMLElement },
): void {
  // Bandas
  containers.bands.innerHTML = '';
  data.bands.forEach((b) => containers.bands.appendChild(renderBand(b)));

  // Reglas
  containers.rules.innerHTML = '';
  data.rules.slice(0, 20).forEach((r) => {
    const li = el('li', 'flex items-start text-sm text-gray-300');
    li.appendChild(el('span', 'text-brand-600 mr-2 mt-0.5', '›'));
    const inner = el('div', '');
    inner.appendChild(el('span', 'font-bold text-brand-200', r.title || 'Regla'));
    if (r.content) inner.appendChild(el('p', 'text-gray-400 text-xs mt-1', r.content));
    li.appendChild(inner);
    containers.rules.appendChild(li);
  });

  // Roster
  renderRoster(containers.rosterWrap, data.guild.members, data.ranks);
}
