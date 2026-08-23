import type { ParsedSavedVariables } from '@/types/parser';

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
  }

  return card;
}

export function renderRoster(wrap: HTMLElement, members: ParsedSavedVariables['guild']['members']): void {
  if (!members || members.length === 0) {
    wrap.innerHTML = '<p class="text-sm text-gray-400 italic">Sin roster exportado.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'w-full text-left text-sm';
  table.innerHTML = `
    <thead>
      <tr class="border-b border-amber-600/20">
        <th class="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">Nombre</th>
        <th class="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">Clase</th>
        <th class="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">Rango</th>
        <th class="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">Nota pública</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-amber-600/5';

  // Mostrar hasta 50 para el preview
  const slice = members.slice(0, 50);
  slice.forEach((m) => {
    const row = document.createElement('tr');
    row.className = 'hover:bg-amber-600/5 transition-colors';
    const cellCls = (extra: string) => `px-3 py-2 text-gray-300 ${extra}`;
    const td = (text: string | undefined, extra = ''): HTMLElement =>
      el('td', cellCls(extra), text || '—');
    row.append(
      td(m.name, 'font-bold text-white'),
      td(m.class),
      td(m.rank, 'text-amber-300'),
      td(m.publicNote),
    );
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  wrap.innerHTML = '';
  wrap.appendChild(table);

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
