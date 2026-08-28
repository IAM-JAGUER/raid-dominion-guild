import type { ParsedSavedVariables, GuildMember, GuildRank, BandPlayer } from '@/types/parser';
import { classColor } from '@/lib/ui/classColors';
import { resolveRankName, sortRanks } from '@/lib/ui/ranks';

// Campos que el roster necesita para mostrarse (públicos; sin officerNote).
// `rankIndex` (opcional) permite ordenar/agrupar por jerarquía de rangos.
export interface RosterMember {
  name: string;
  class?: string;
  rank?: string;
  rankIndex?: number;
  publicNote?: string;
}

export function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chip(text: string, extra = ''): HTMLElement {
  return el(
    'span',
    'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-md px-2.5 py-1' + (extra ? ` ${extra}` : ''),
    text,
  );
}

export function renderBand(
  band: ParsedSavedVariables['bands'][number],
  opts?: { hidePlayers?: boolean },
): HTMLElement {
  const hidePlayers = opts?.hidePlayers ?? false;
  const card = el('div', 'bg-gray-800/50 border border-amber-700/40 rounded-md p-4');
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  header.appendChild(el('h3', 'text-base font-bold text-amber-200', band.name || 'Sin nombre'));

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-md px-3 py-1', band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-md px-3 py-1', `GS ${band.minGS}`));
  if (hidePlayers) {
    meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-md px-3 py-1', 'jugadores ocultos'));
  } else {
    meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-md px-3 py-1', `${band.players.length} jugadores`));
  }
  header.appendChild(meta);
  card.appendChild(header);

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
    card.appendChild(chips);

    const players = document.createElement('details');
    players.className = 'mt-3 group';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer select-none list-none text-xs font-black uppercase tracking-widest text-amber-300/80 hover:text-amber-200';
    summary.textContent = `Jugadores (${band.players.length})`;
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2');
    band.players.forEach((p) => {
      const row = el('div', 'text-xs text-gray-300 bg-gray-900/40 rounded px-2 py-1');
      const left = el('div', '');
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
    card.appendChild(players);
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
    card.appendChild(spam);
  }

  return card;
}

// ── Vista expandida para el dashboard (Mis Bandas) ─────────────────────────
// Jugadores siempre visibles con todos sus campos + spammer completo.

function renderBandPlayerRow(p: BandPlayer): HTMLElement {
  const color = classColor(p.class);
  const row = el('div', 'text-xs text-gray-300 bg-gray-800/50 border border-gray-700/40 rounded-md px-3 py-2');
  const head = el('div', 'flex flex-wrap items-center gap-2');
  const name = el('span', 'font-bold italic', p.name);
  name.style.color = color;
  head.appendChild(name);
  if (p.leader) head.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-950/30 border border-emerald-600/40 rounded px-1.5 py-0.5', 'Líder'));
  if (p.banned) head.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-red-300 bg-red-950/40 border border-red-600/40 rounded px-1.5 py-0.5', 'Baneado'));
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
  const card = el('div', 'bg-gray-900/60 border border-amber-700/40 rounded-md p-5');
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  const titleWrap = el('div', 'flex flex-wrap items-center gap-2');
  titleWrap.appendChild(el('h3', 'text-base font-bold text-amber-200', band.name || 'Sin nombre'));
  if (band.icon) titleWrap.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-900/60 border border-amber-600/20 rounded-md px-2.5 py-1', `icon ${band.icon}`));
  header.appendChild(titleWrap);

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(chip(band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(chip(`GS mínimo ${band.minGS}`));
  meta.appendChild(chip(`${band.players.length} jugadores`));
  header.appendChild(meta);
  card.appendChild(header);

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
    card.appendChild(chips);
  }

  if (band.players.length > 0) {
    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4');
    band.players.forEach((p) => grid.appendChild(renderBandPlayerRow(p)));
    card.appendChild(grid);
  } else {
    card.appendChild(el('p', 'text-[11px] text-gray-600 italic mt-3', 'Sin jugadores en esta banda.'));
  }

  if (band.spammer) card.appendChild(renderSpammer(band.spammer));

  return card;
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
    const row = el('div', 'text-xs text-gray-300 bg-gray-800/50 border border-gray-700/40 rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2');
    const left = el('div', 'flex flex-wrap items-center gap-2');
    const name = el('span', 'font-bold italic', u.name);
    name.style.color = color;
    left.appendChild(name);
    if (u.leader) left.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-950/30 border border-emerald-600/40 rounded px-1.5 py-0.5', 'Líder'));
    if (u.banned) left.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-red-300 bg-red-950/40 border border-red-600/40 rounded px-1.5 py-0.5', 'Baneado'));
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
        group.forEach((m, i) => entries.push({ m, groupStart: i === 0, groupLabel: label }));
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
      const card = el('div', 'relative bg-gray-900/60 border border-amber-600/25 hover:border-amber-500/40 rounded-md p-4 pl-5 overflow-hidden transition-colors duration-200');
      const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
      accent.style.backgroundColor = color;
      card.appendChild(accent);

      const row = el('div', 'flex items-center justify-between gap-2 mb-2');
      const name = el('div', 'font-black italic truncate text-sm');
      name.style.color = color;
      name.textContent = m.name;
      row.appendChild(name);
      if (m.rank) {
        row.appendChild(el('span', `shrink-0 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${rankBadgeClass(m.rank)}`, m.rank));
      }
      card.appendChild(row);

      const meta = el('div', 'flex flex-wrap gap-1.5');
      if (m.class) meta.appendChild(el('span', 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border text-gray-300 bg-gray-800/60 border-amber-600/20', m.class));
      if (m.publicNote) meta.appendChild(el('span', 'text-[10px] text-gray-400 italic truncate', m.publicNote));
      card.appendChild(meta);

      grid.appendChild(card);
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

// Cifras del roster: distribuciones de clase y rango (estilo guild-portal).
export function renderRosterStats(wrap: HTMLElement, members: RosterMember[]): void {
  const total = members.length;
  if (total === 0) return;

  const distribute = (key: 'class' | 'rank'): Array<{ name: string; count: number; pct: number }> => {
    const map = new Map<string, number>();
    members.forEach((m) => {
      const value = (m[key] as string | undefined)?.trim() || 'Sin dato';
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  };

  const card = (title: string, dist: Array<{ name: string; count: number; pct: number }>): HTMLElement => {
    const box = el('div', 'bg-gray-900/50 border border-amber-600/20 rounded-md p-4');
    box.appendChild(el('p', 'text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2', `${title} · ${dist.length}`));
    const chips = el('div', 'flex flex-wrap gap-2');
    dist.forEach((d) => {
      chips.appendChild(el('span', 'text-[10px] font-bold text-amber-300/90 bg-amber-900/20 border border-amber-600/20 rounded-md px-2 py-0.5', `${d.name}: ${d.count} (${d.pct}%)`));
    });
    box.appendChild(chips);
    return box;
  };

  wrap.innerHTML = '';
  wrap.append(card('Clases', distribute('class')), card('Rangos', distribute('rank')));
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
