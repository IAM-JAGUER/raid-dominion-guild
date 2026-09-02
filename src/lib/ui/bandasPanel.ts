/**
 * Panel "Bandas" reutilizable (modelo del directorio /bandas):
 * filtro por día en el encabezado (chips sin overflow: grilla 4×2 móvil,
 * una fila desde sm) + contenido agrupado por día (lunes → domingo, por hora)
 * en grilla responsive de hasta 3 columnas de día.
 * ÚNICA fuente del modelo; /bandas y las pestañas Bandas de perfil, personaje,
 * reino y portal de hermandad pasan por aquí. Nada de esto toca el dashboard.
 */
import { WEEKDAY_LABELS, parseSchedule, groupBandsByDay } from '@/lib/bandSchedule';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';

export interface BandasPanelOptions<T> {
  // Contenedor de los chips de filtro (living en el slot `head` del panel).
  filtro: HTMLElement;
  // Contenedor del contenido agrupado por día (body del panel).
  content: HTMLElement;
  // Bandas a listar (ya fusionadas/atribuidas por el contexto).
  items: T[];
  // Extrae el horario de cada banda (string libre del addon).
  getSchedule: (item: T) => string | null | undefined;
  // Card de cada banda (el contexto aporta renderBandCard y su atribución).
  renderCard: (item: T) => HTMLElement;
  // Mensaje cuando no hay bandas (solo si se llama sin items).
  emptyText?: string;
  // Texto searchable de cada banda (nombre de banda, jugador, personaje, hermandad).
  // Si se provee, se renderiza un campo de búsqueda que filtra los items.
  getSearchText?: (item: T) => string;
}

export function renderBandasPanel<T>(options: BandasPanelOptions<T>): void {
  const { filtro, content, items, getSchedule, renderCard } = options;
  const emptyText = options.emptyText ?? 'Aún no hay bandas publicadas.';
  const getSearchText = options.getSearchText;
  const state: { day: number; query: string } = { day: -1, query: '' };

  // Bandas visibles: filtradas primero por el texto de búsqueda (si existe) y
  // luego por día. Los chips de día cuentan SOLO sobre el subconjunto que pasa
  // el filtro de texto, para que el conteo sea coherente con lo que se ve.
  function filteredByQuery(): T[] {
    const q = state.query.trim().toLowerCase();
    if (!q || !getSearchText) return items;
    return items.filter((item) => getSearchText(item).toLowerCase().includes(q));
  }

  // Control de búsqueda por texto (nombre de banda/jugador/personaje/hermandad).
  // Se crea UNA vez y se mantiene persistente en `filtro`: al tipear solo se
  // re-renderizan los chips de día (renderFilter) sin recrear el input, así el
  // campo de texto conserva el foco y la posición del cursor.
  let searchInput: HTMLInputElement | null = null;
  function ensureSearchInput(): void {
    if (!getSearchText || searchInput) return;
    const wrap = el('div', 'mb-3');
    const box = el('div', 'relative');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'w-4 h-4 text-amber-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/>';
    box.appendChild(icon);
    const input = document.createElement('input');
    input.type = 'search';
    input.autocomplete = 'off';
    input.className = `${ui.form.input} ${ui.focusRing} pl-9 pr-3`;
    input.placeholder = 'Buscar banda, jugador, personaje o hermandad…';
    input.setAttribute('aria-label', 'Buscar bandas por nombre de banda, jugador, personaje o hermandad');
    input.addEventListener('input', () => {
      state.query = input.value;
      renderFilter();
      renderContent();
    });
    box.appendChild(input);
    wrap.appendChild(box);
    filtro.insertBefore(wrap, filtro.firstChild);
    searchInput = input;
  }

  // Chips del filtro: "Todas" (conteo total) + cada día de la semana con su
  // conteo. Una banda multi-día cuenta en cada día donde aparece. Matriz sin
  // overflow: 4×2 en móvil con celdas uniformes; desde sm una sola fila.
  // Re-renderiza solo el grupo de chips de día, preservando el input de
  // búsqueda ya montado (y su foco).
  let dayGroup: HTMLElement | null = null;
  function renderFilter(): void {
    const searchable = filteredByQuery();
    if (!dayGroup) {
      dayGroup = el('div', 'w-full grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap');
      filtro.appendChild(dayGroup);
    }
    dayGroup.innerHTML = '';
    dayGroup.appendChild(dayChip('Todas', searchable.length, state.day === -1, -1));

    const counts = new Array<number>(7).fill(0);
    searchable.forEach((item) => parseSchedule(getSchedule(item)).days.forEach((d) => { counts[d] += 1; }));
    WEEKDAY_LABELS.forEach((label, i) => dayGroup!.appendChild(dayChip(label, counts[i], state.day === i, i)));
  }

  function dayChip(label: string, count: number, active: boolean, day: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex items-center justify-center gap-1 shrink-0 w-full sm:w-auto whitespace-nowrap px-1.5 sm:px-3 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ' +
      (active
        ? 'bg-gradient-to-b from-amber-900/50 to-amber-950/50 text-amber-200 border-amber-500/50'
        : 'bg-gradient-to-b from-gray-900/90 to-gray-950/90 text-gray-400 border-amber-600/25 hover:from-amber-900/40 hover:to-amber-950/40 hover:text-amber-200 hover:border-amber-500/40');
    const labelSpan = el('span', 'truncate text-center min-w-0');
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);
    // El conteo solo aparece desde sm: en la grilla 4×2 móvil el número no
    // cabe por celda; en móvil se expone igualmente vía aria-label.
    if (count > 0) {
      const badge = el('span', 'hidden sm:inline');
      badge.textContent = `· ${count}`;
      btn.appendChild(badge);
    }
    btn.setAttribute('aria-label', count > 0 ? `${label}, ${count} banda${count === 1 ? '' : 's'}` : label);
    btn.setAttribute('aria-pressed', String(active));
    btn.dataset.day = String(day);
    return btn;
  }

  // Contenido del cuerpo: los días (lunes → domingo, y "Sin día fijado") en
  // grilla responsive de hasta 3 días por fila (1 en móvil, 2 desde sm,
  // 3 desde lg). Con un solo día visible ocupa toda la fila (full-width).
  function renderContent(): void {
    content.innerHTML = '';
    const searchable = filteredByQuery();
    if (searchable.length === 0) {
      const msg = state.query.trim()
        ? `Ninguna banda coincide con "${state.query.trim()}".`
        : emptyText;
      content.appendChild(el('p', `${ui.text.bodyMuted} italic text-center bg-gray-900/40 border border-amber-600/20 rounded-md p-4`, msg));
      return;
    }

    const { groups, undated } = groupBandsByDay(searchable, getSchedule);
    const groupsShown = state.day === -1 ? groups : groups.filter((g) => g.day === state.day);
    const undatedShown = state.day === -1 ? undated : [];

    if (groupsShown.length === 0 && undatedShown.length === 0) {
      content.appendChild(el('p', `${ui.text.bodyMuted} italic text-center bg-gray-900/40 border border-amber-600/20 rounded-md p-4`, 'No hay bandas este día.'));
      return;
    }

    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start');
    const totalShown = groupsShown.length + (undatedShown.length > 0 ? 1 : 0);
    groupsShown.forEach((g) => grid.appendChild(daySection(g.day, g.bands, totalShown === 1)));
    if (undatedShown.length > 0) grid.appendChild(daySection(-1, undatedShown, totalShown === 1));
    content.appendChild(grid);
  }

  function daySection(day: number, bands: T[], fullWidth: boolean): HTMLElement {
    // fullWidth → el día ocupa las 3 columnas (vista de un solo día).
    const section = el('section', fullWidth ? 'sm:col-span-2 lg:col-span-3' : '');
    const head = el('div', 'flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3');
    const title = day === -1 ? 'Sin día fijado' : WEEKDAY_LABELS[day];
    head.appendChild(el('h3', `${ui.subTitle} !mb-0`, title));
    head.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500', `· ${bands.length} banda${bands.length === 1 ? '' : 's'}`));
    section.appendChild(head);

    // En columna de día: cards apiladas; en full-width: grilla de cards.
    const grid = el('div', fullWidth ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5' : 'grid grid-cols-1 gap-4');
    bands.forEach((item) => grid.appendChild(renderCard(item)));
    section.appendChild(grid);
    return section;
  }

  // Click en el día activo vuelve a "Todas" (toggle); otro día lo selecciona.
  filtro.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-day]');
    if (!btn) return;
    const d = Number(btn.dataset.day);
    state.day = state.day === d ? -1 : d;
    renderFilter();
    renderContent();
  });

  ensureSearchInput();
  renderFilter();
  renderContent();
}