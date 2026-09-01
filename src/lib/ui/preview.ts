import type { ParsedSavedVariables, GuildRank, BandPlayer } from '@/types/parser';
import type { MergePlayer } from '@/lib/bandMerge';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { resolveRankName, sortRanks } from '@/lib/ui/ranks';
import { roleLabel } from '@/lib/ui/itemQuality';
import { cardLink, card, cardTop, cardRow, iconTile, cardTitle } from '@/lib/ui/card';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';

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
    `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/20` + (extra ? ` ${extra}` : ''),
    text,
  );
}

export function renderBand(
  band: ParsedSavedVariables['bands'][number],
  opts?: { hidePlayers?: boolean },
): HTMLElement {
  const hidePlayers = opts?.hidePlayers ?? false;
  const cardEl = card('p-4');
  cardEl.appendChild(cardTop());
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  header.appendChild(cardTitle(band.name || 'Sin nombre', 'text-base'));

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/20`, band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/20`, `GS ${band.minGS}`));
  if (hidePlayers) {
    meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/20`, 'jugadores ocultos'));
  } else {
    meta.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/20`, `${band.players.length} jugadores`));
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
      chips.appendChild(el('span', 'text-[10px] font-bold text-amber-300/90 bg-amber-900/20 border border-amber-600/20 rounded-md px-2 py-0.5', `${role}: ${count}`));
    });
    cardEl.appendChild(chips);

    const players = document.createElement('details');
    players.className = 'mt-3 group';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer select-none list-none text-xs font-black uppercase tracking-widest text-amber-300/80 hover:text-amber-200';
    summary.textContent = `Jugadores (${band.players.length})`;
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2');
    band.players.forEach((p) => {
      const row = el('div', 'text-xs text-gray-300 bg-gray-900/40 rounded px-2 py-1');
      const left = el('div', 'flex flex-wrap items-center gap-1.5');
      left.appendChild(classIconEl(p.class, undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
      left.appendChild(el('span', 'font-bold text-white', p.name));
      const badges = el('div', 'flex flex-wrap gap-1.5 mt-0.5');
      if (p.role) badges.appendChild(el('span', 'text-[10px] text-amber-300', p.role));
      if (p.dual) badges.appendChild(el('span', 'text-[10px] text-gray-400', `dual: ${p.dual}`));
      if (p.leader) badges.appendChild(el('span', 'text-[10px] text-emerald-300', `líder: ${p.leader}`));
      if (p.banned) badges.appendChild(el('span', 'text-[10px] text-red-300', 'baneado'));
      if (p.sanction) badges.appendChild(el('span', 'text-[10px] text-orange-300', `sanción: ${p.sanction}`));
      if (typeof p.points === 'number') badges.appendChild(el('span', 'text-[10px] text-gray-400', `${p.points} pts`));
      if (p.notes) badges.appendChild(el('span', 'text-[10px] text-gray-500 italic', p.notes));
      left.appendChild(badges);
      row.appendChild(left);
      if (p.class) row.appendChild(el('span', 'text-gray-500 whitespace-nowrap', p.class));
      grid.appendChild(row);
    });
    players.append(summary, grid);
    cardEl.appendChild(players);
  }

  if (band.spammer) {
    const spam = el('div', 'mt-3 text-xs text-gray-400 bg-gray-900/40 border border-gray-700/50 rounded-md px-3 py-2');
    let txt = 'Spammer';
    if (typeof band.spammer.duration === 'number') txt += ` · ${band.spammer.duration}s`;
    const channels = band.spammer.channels
      ? Object.entries(band.spammer.channels).filter(([, v]) => v).map(([c]) => c).join(', ')
      : '';
    if (channels) txt += ` · canales: ${channels}`;
    spam.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-amber-300/80', txt));
    if (band.spammer.message) spam.appendChild(el('p', 'mt-1 text-gray-500 italic', band.spammer.message));
    cardEl.appendChild(spam);
  }

  return cardEl;
}

// ── Card compacta de banda (portal de hermandad y directorios) ──────────────
// Mismo lenguaje que la card del directorio /bandas: ícono + nombre, chips de
// horario/GS/jugadores, badge de integración y footer "Ver banda →" hacia la
// vista de banda (/banda/:slug). NUNCA muestra la lista de jugadores inline.

export interface BandCardInput {
  slug: string;
  name: string;
  schedule?: string | null;
  min_gs?: number | null;
  hide_players?: boolean;
}

export interface BandCardOpts {
  // Fuente de la integración (character_name de un miembro): activa el badge
  // "Integrada" cuando la banda del GM fue integrada por un miembro.
  source?: string | null;
  // Conteo de jugadores YA fusionado (unión del grupo); si viene undefined se
  // omite el chip (banda con hide_players).
  playerCount?: number;
}

export function renderBandCard(band: BandCardInput, opts?: BandCardOpts): HTMLElement {
  const link = cardLink(`/banda/${encodeURIComponent(band.slug)}`, 'p-5');

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(iconTile((band.name[0] || '?').toUpperCase(), 'w-10 h-10', 'text-lg'));
  head.appendChild(el('h3', 'font-black italic text-base leading-[1.3] text-white group-hover:text-amber-200 transition-colors', band.name));
  link.appendChild(head);

  const meta = el('div', 'flex flex-wrap gap-1.5');
  if (band.schedule) meta.appendChild(chip(band.schedule));
  if (typeof band.min_gs === 'number' && band.min_gs > 0) meta.appendChild(chip(`GS ${band.min_gs}`, '!text-amber-300 !border-amber-500/40'));
  if (band.hide_players) {
    meta.appendChild(chip('jugadores ocultos', '!text-gray-500'));
  } else if (typeof opts?.playerCount === 'number') {
    meta.appendChild(chip(`${opts.playerCount} jugador${opts.playerCount === 1 ? '' : 'es'}`));
  }
  if (opts?.source) {
    meta.appendChild(chip('Integrada', '!text-emerald-300 !border-emerald-500/40'));
  }
  link.appendChild(meta);

  const foot = el('p', 'text-xs text-gray-500 mt-4 flex items-center justify-between');
  foot.appendChild(el('span', 'text-amber-300/80 group-hover:text-amber-200 transition-colors', 'Ver banda →'));
  link.appendChild(foot);

  return link;
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
  if (p.role) meta.appendChild(el('span', 'text-[10px] text-amber-300', p.role));
  if (p.dual) meta.appendChild(el('span', 'text-[10px] text-gray-400', `dual: ${p.dual}`));
  if (p.sanction) meta.appendChild(el('span', 'text-[10px] text-orange-300', `sanción: ${p.sanction}`));
  if (typeof p.points === 'number') meta.appendChild(el('span', 'text-[10px] text-gray-400', `${p.points} pts`));
  if (p.class) meta.appendChild(el('span', 'text-gray-500', p.class));
  row.appendChild(meta);
  if (p.notes) row.appendChild(el('p', 'mt-1 text-gray-500 italic', p.notes));
  return row;
}

function renderSpammer(spammer: NonNullable<ParsedSavedVariables['bands'][number]['spammer']>): HTMLElement {
  const box = el('div', 'mt-4 text-xs bg-gray-900/40 border border-amber-700/30 rounded-md px-4 py-3');
  box.appendChild(el('p', 'text-[10px] font-black uppercase tracking-widest text-amber-300/80 mb-1', 'Spammer de la banda'));
  const details = el('div', 'flex flex-wrap gap-2');
  if (typeof spammer.duration === 'number') details.appendChild(chip(`Ciclo ${spammer.duration}s`));
  const channels = spammer.channels ? Object.entries(spammer.channels) : [];
  const enabled = channels.filter(([, v]) => v).map(([c]) => c);
  const disabled = channels.filter(([, v]) => !v).map(([c]) => c);
  if (enabled.length > 0) details.appendChild(chip(`Canales: ${enabled.join(', ')}`, '!text-amber-300 !border-amber-500/40'));
  if (disabled.length > 0) details.appendChild(el('span', 'text-[10px] text-gray-600', `(inactivos: ${disabled.join(', ')})`));
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
  titleWrap.appendChild(cardTitle(band.name || 'Sin nombre', 'text-base'));
  if (band.icon) titleWrap.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-gray-500 bg-gray-900/60 border-amber-600/20`, `icon ${band.icon}`));
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
      chips.appendChild(el('span', 'text-[10px] font-bold text-amber-300/90 bg-amber-900/20 border border-amber-600/20 rounded-md px-2 py-0.5', `${role}: ${count}`));
    });
    cardEl.appendChild(chips);
  }

  if (band.players.length > 0) {
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4');
    band.players.forEach((p) => grid.appendChild(renderBandPlayerRow(p)));
    cardEl.appendChild(grid);
  } else {
    cardEl.appendChild(el('p', 'text-[11px] text-gray-600 italic mt-3', 'Sin jugadores en esta banda.'));
  }

  if (band.spammer) cardEl.appendChild(renderSpammer(band.spammer));

  return cardEl;
}

// ── Core de banda (estilo lista de asistencia de raids de guild-portal) ─────
// El roster de una banda se agrupa por rol (TANQUES/SANADORES/DPS/OTROS) con
// cabeceras de color + ícono + conteo + chevron colapsable, y un grid de
// fichas con nombre coloreado por clase y badges (líder/baneado/sanción/
// integración/puntos/dual). Mismo lenguaje visual que el Core de guild-portal.

const CORE_ICONS: Record<string, string> = {
  tank: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>',
  healer: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  dps: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.37 15.83L11.5 8 10 9.5l7.83 7.87-1.42 1.42L8.54 11 7.13 12.41 15 20.28l-1.41 1.41L5.72 13.83l-1.41 1.41L2.89 13.83l1.41-1.41L2.89 11l1.41-1.41L5.72 8.17l1.41 1.41L15 1.72l1.41 1.41-7.87 7.87 1.42 1.42 7.83-7.83 1.42 1.42-7.83 7.83 1.41 1.41 1.41-1.41z"/></svg>',
  other: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
};

function coreRoleGroup(p: MergePlayer): 'tank' | 'healer' | 'dps' | 'other' {
  const r = (p.role || '').trim().toLowerCase();
  if (r === 't' || r.includes('tanque') || r.includes('tank')) return 'tank';
  if (r === 'h' || r.includes('sanador') || r.includes('heal')) return 'healer';
  if (r === 'd' || r.includes('dps') || r.includes('melee') || r.includes('ranged') || r.includes('cuerpo') || r.includes('distancia')) return 'dps';
  return 'other';
}

function coreBadge(text: string, extra: string): HTMLElement {
  return el('span', `${ui.badge} ${ui.badgeSm} ${extra}`, text);
}

// Indicador de ficha pública: enlace a /personaje/:slug con icono de enlace
// externo. Acompaña al nombre de personajes del roster/core con página
// pública; el nombre ya enlaza, el icono lo hace explícito.
function publicProfileLink(slug: string): HTMLElement {
  const a = el('a', 'ml-1 shrink-0 inline-flex text-amber-400/90 hover:text-amber-300 transition-colors') as HTMLAnchorElement;
  a.href = `/personaje/${slug}`;
  a.setAttribute('aria-label', 'Ver ficha pública');
  a.setAttribute('title', 'Ver ficha pública');
  const svg = el('svg', 'w-3.5 h-3.5');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<rect x="3" y="11" width="14" height="10" rx="2"/><path d="M10 14h11M17 10l3-3M21 13v-2h-2"/>';
  a.appendChild(svg);
  return a;
}

function renderCoreSection(title: string, count: number, color: string, iconSvg: string, rows: HTMLElement[]): HTMLElement {
  const section = el('div', 'mb-4');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'w-full flex items-center gap-2 px-1 py-1 cursor-pointer group/header select-none rounded-md hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';
  header.setAttribute('aria-expanded', 'true');

  const icon = el('span', `shrink-0 ${color}`);
  icon.innerHTML = iconSvg;
  header.appendChild(icon);
  header.appendChild(el('h4', `text-[10px] font-black tracking-widest uppercase ${color}`, title));
  header.appendChild(el('div', 'flex-1 h-[1px] bg-gradient-to-r from-white/10 to-transparent ml-2'));
  header.appendChild(el('span', 'text-[10px] font-bold text-white/40 mr-2', String(count)));
  const chevron = el('span', 'text-white/20 group-hover/header:text-white/50 transition-transform shrink-0', '');
  chevron.innerHTML = '<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
  header.appendChild(chevron);

  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2');
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
  const row = cardRow('px-3 py-2 flex items-center justify-between gap-2');
  const left = el('div', 'flex items-center gap-2 min-w-0');
  left.appendChild(classIconEl(p.class, undefined, 'w-6 h-6 rounded-md border border-gray-700/50 shrink-0 object-cover'));
  const name = el(slug ? 'a' : 'span', 'font-bold italic truncate text-sm');
  name.style.color = color;
  name.textContent = p.name || '?';
  if (slug) {
    (name as HTMLAnchorElement).href = `/personaje/${slug}`;
    name.classList.add('underline', 'decoration-amber-600/50', 'underline-offset-2', 'hover:decoration-amber-400');
  }
  left.appendChild(name);
  if (slug) left.appendChild(publicProfileLink(slug));
  if (isSource) left.appendChild(coreBadge('integración', 'text-sky-300 bg-sky-950/40 border-sky-600/40'));
  if (p.leader) left.appendChild(coreBadge('líder', 'text-emerald-300 bg-emerald-950/40 border-emerald-600/40'));
  if (p.banned) left.appendChild(coreBadge('baneado', 'text-red-300 bg-red-950/40 border-red-600/40'));
  row.appendChild(left);

  const right = el('div', 'flex flex-wrap justify-end gap-1.5 text-[10px]');
  if (p.role) right.appendChild(el('span', 'text-amber-300', roleLabel(p.role) || p.role));
  if (p.dual) right.appendChild(el('span', 'text-gray-400', `dual: ${p.dual}`));
  if (p.sanction) right.appendChild(el('span', 'text-orange-300', `sanción: ${p.sanction}`));
  if (typeof p.points === 'number') right.appendChild(el('span', 'text-amber-200', `${p.points} pts`));
  if (p.class) right.appendChild(el('span', 'text-gray-500', p.class));
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
  const groups: Record<'tank' | 'healer' | 'dps' | 'other', MergePlayer[]> = {
    tank: [],
    healer: [],
    dps: [],
    other: [],
  };
  players.forEach((p) => {
    const key = coreRoleGroup(p);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const sections: Array<{ key: 'tank' | 'healer' | 'dps' | 'other'; title: string; color: string }> = [
    { key: 'tank', title: 'Tanques', color: 'text-blue-400' },
    { key: 'healer', title: 'Sanadores', color: 'text-green-400' },
    { key: 'dps', title: 'DPS', color: 'text-red-400' },
    { key: 'other', title: 'Otros', color: 'text-gray-400' },
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

  if (!any) return el('p', 'text-sm text-gray-500 italic', 'Esta banda aún no tiene jugadores asignados.');
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
    if (u.roles.size) meta.appendChild(el('span', 'text-[10px] text-amber-300', Array.from(u.roles).join(', ')));
    if (u.classes.size) meta.appendChild(el('span', 'text-gray-500', Array.from(u.classes).join(', ')));
    meta.appendChild(el('span', 'text-[10px] text-gray-500', u.bands > 1 ? `${u.bands} bandas` : '1 banda'));
    row.appendChild(meta);
    grid.appendChild(row);
  });

  if (unique.size === 0) {
    return el('p', 'text-[11px] text-gray-600 italic', 'Sin jugadores en las bandas.');
  }
  return grid;
}

// Badge de rango según jerarquía (estilo ficha de roster)
function rankBadgeClass(rank: string | undefined): string {
  const r = (rank ?? '').toLowerCase();
  if (r.includes('maestro') || r.includes('admin')) return 'text-amber-300 border-amber-500/40 bg-amber-900/20';
  if (r.includes('oficial')) return 'text-sky-300 border-sky-600/30 bg-sky-950/30';
  return 'text-gray-300 border-gray-500/40 bg-gray-800/60';
}

// Roster en grid de fichas, paginado (estilo guild-portal): "Página X de Y •
// N miembros" + controles prev/next. Cuando hay jerarquía de rangos (ranks) y
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
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  let page = 1;

  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3');

  const renderPage = (): void => {
    grid.innerHTML = '';
    const start = (page - 1) * PAGE_SIZE;
    entries.slice(start, start + PAGE_SIZE).forEach(({ m, groupStart, groupLabel }) => {
      if (groupStart && groupLabel) {
        const hdr = el('div', 'col-span-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-300 border-b border-amber-600/20 pb-1 mt-1');
        hdr.appendChild(el('span', 'w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0', ''));
        hdr.appendChild(el('span', '', groupLabel));
        grid.appendChild(hdr);
      }
      const color = classColor(m.class);
      const cardEl = card('p-4 pl-5');
      cardEl.appendChild(cardTop());
      const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
      accent.style.backgroundColor = color;
      cardEl.appendChild(accent);

      const row = el('div', 'flex items-center justify-between gap-2 mb-2');
      const nameWrap = el('div', 'flex items-center gap-1.5 min-w-0');
      nameWrap.appendChild(classIconEl(m.class, undefined, 'w-5 h-5 rounded border border-gray-700/50 shrink-0 object-cover'));
      const name = el(m.slug ? 'a' : 'div', 'font-black italic leading-[1.3] text-sm');
      name.style.color = color;
      name.textContent = m.name;
      if (m.slug) {
        (name as HTMLAnchorElement).href = `/personaje/${m.slug}`;
        name.classList.add('underline', 'decoration-amber-600/50', 'underline-offset-2', 'hover:decoration-amber-400');
      }
      nameWrap.appendChild(name);
      if (m.slug) nameWrap.appendChild(publicProfileLink(m.slug));
      row.appendChild(nameWrap);
      if (m.rank) {
        row.appendChild(el('span', `shrink-0 ${ui.badge} ${ui.badgeSm} ${rankBadgeClass(m.rank)}`, m.rank));
      }
      cardEl.appendChild(row);

      const meta = el('div', 'flex flex-wrap gap-1.5');
      if (m.class) meta.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-gray-300 bg-gray-800/60 border-amber-600/20`, m.class));
      if (m.publicNote) meta.appendChild(el('span', 'text-[10px] text-gray-400 italic truncate', m.publicNote));
      cardEl.appendChild(meta);

      grid.appendChild(cardEl);
    });
  };

  const btnCls = 'w-8 h-8 flex items-center justify-center rounded-md border border-amber-600/30 bg-amber-900/20 text-amber-200 hover:bg-amber-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200';
  const prev = el('button', btnCls) as HTMLButtonElement;
  prev.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';
  prev.setAttribute('aria-label', 'Página anterior');
  const next = el('button', btnCls) as HTMLButtonElement;
  next.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
  next.setAttribute('aria-label', 'Página siguiente');

  const bar = el('div', 'mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-amber-600/15 pt-3');
  const info = el('p', 'text-xs text-gray-400 italic', `Página ${page} de ${totalPages} • ${members.length} miembros`);
  const controls = el('div', 'flex items-center gap-2');
  controls.append(prev, next);
  bar.append(info, controls);

  const update = (): void => {
    renderPage();
    info.textContent = `Página ${page} de ${totalPages} • ${members.length} miembros`;
    prev.disabled = page <= 1;
    next.disabled = page >= totalPages;
  };
  prev.addEventListener('click', () => { if (page > 1) { page -= 1; update(); } });
  next.addEventListener('click', () => { if (page < totalPages) { page += 1; update(); } });

  wrap.innerHTML = '';
  wrap.appendChild(grid);
  if (totalPages > 1) wrap.appendChild(bar);
  update();
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
    li.appendChild(el('span', 'text-amber-600 mr-2 mt-0.5', '›'));
    const inner = el('div', '');
    inner.appendChild(el('span', 'font-bold text-amber-200', r.title || 'Regla'));
    if (r.content) inner.appendChild(el('p', 'text-gray-400 text-xs mt-1', r.content));
    li.appendChild(inner);
    containers.rules.appendChild(li);
  });

  // Roster
  renderRoster(containers.rosterWrap, data.guild.members, data.ranks);
}
