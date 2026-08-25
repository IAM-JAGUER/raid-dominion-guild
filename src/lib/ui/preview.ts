import type { ParsedSavedVariables, GuildMember } from '@/types/parser';
import { classColor } from '@/lib/ui/classColors';

// Campos que el roster necesita para mostrarse (públicos; sin officerNote).
export type RosterMember = Pick<GuildMember, 'name' | 'class' | 'rank' | 'publicNote'>;

export function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderBand(band: ParsedSavedVariables['bands'][number]): HTMLElement {
  const card = el('div', 'bg-gray-800/50 border border-amber-700/40 rounded-lg p-4');
  const header = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-3');
  header.appendChild(el('h3', 'text-base font-bold text-amber-200', band.name || 'Sin nombre'));

  const meta = el('div', 'flex flex-wrap gap-2');
  if (band.schedule) meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-lg px-3 py-1', band.schedule));
  if (typeof band.minGS === 'number' && band.minGS > 0) meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-lg px-3 py-1', `GS ${band.minGS}`));
  meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/20 rounded-lg px-3 py-1', `${band.players.length} jugadores`));
  header.appendChild(meta);
  card.appendChild(header);

  if (band.players.length > 0) {
    const roles = new Map<string, number>();
    band.players.forEach((p) => {
      const r = p.role || 'sin rol';
      roles.set(r, (roles.get(r) || 0) + 1);
    });
    const chips = el('div', 'flex flex-wrap gap-2');
    Array.from(roles.entries()).forEach(([role, count]) => {
      chips.appendChild(el('span', 'text-[10px] font-bold text-amber-300/90 bg-amber-900/20 border border-amber-600/20 rounded-lg px-2 py-0.5', `${role}: ${count}`));
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
    const spam = el('div', 'mt-3 text-xs text-gray-400 bg-gray-900/40 border border-gray-700/50 rounded-lg px-3 py-2');
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

// Badge de rango según jerarquía (estilo ficha de roster)
function rankBadgeClass(rank: string | undefined): string {
  const r = (rank ?? '').toLowerCase();
  if (r.includes('maestro') || r.includes('admin')) return 'text-amber-300 border-amber-500/40 bg-amber-900/20';
  if (r.includes('oficial')) return 'text-sky-300 border-sky-600/30 bg-sky-950/30';
  return 'text-gray-300 border-gray-500/40 bg-gray-800/60';
}

export function renderRoster(wrap: HTMLElement, members: RosterMember[]): void {
  if (!members || members.length === 0) {
    wrap.innerHTML = '<p class="text-sm text-gray-400 italic">Sin roster exportado.</p>';
    return;
  }

  wrap.innerHTML = '';
  const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3');

  // Mostrar hasta 50 para el preview
  const slice = members.slice(0, 50);
  slice.forEach((m) => {
    const color = classColor(m.class);
    const card = el('div', 'relative bg-gray-900/60 border border-amber-600/25 hover:border-amber-500/40 rounded-lg p-4 pl-5 overflow-hidden transition-colors duration-200');
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
    if (m.class) meta.appendChild(el('span', 'px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border text-gray-300 bg-gray-800/60 border-amber-600/20', m.class));
    if (m.publicNote) meta.appendChild(el('span', 'text-[10px] text-gray-400 italic truncate', m.publicNote));
    card.appendChild(meta);

    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  if (members.length > 50) {
    wrap.appendChild(el('p', 'mt-2 text-xs text-gray-500 italic', `Mostrando 50 de ${members.length} miembros.`));
  }
}

// Renderiza bandas (con fallback a Core), reglas y roster dentro de contenedores
export function renderParsedSections(
  data: ParsedSavedVariables,
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
  renderRoster(containers.rosterWrap, data.guild.members);
}
