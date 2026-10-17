/**
 * Panel "Bandas" reutilizable (modelo del directorio /bandas): buscador +
 * filtro por día (y tipo, opcional) en el encabezado con el MOTOR ÚNICO
 * `src/lib/ui/filterBar.ts`; contenido agrupado por día (lunes → domingo, por
 * hora) en grilla responsive de hasta 3 columnas de día.
 * ÚNICA fuente del modelo; /bandas y las pestañas Bandas de perfil, personaje,
 * reino y portal de hermandad pasan por aquí. Nada de esto toca el dashboard.
 */
import { WEEKDAY_LABELS, parseSchedule, groupBandsByDay } from '@/lib/bandSchedule';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { createFilterBar, type Facet, type FilterBarState } from '@/lib/ui/filterBar';
import { settleAsyncList, type AsyncList } from '@/lib/ui/list';

// Tipo de banda para el filtro: personal (sin hermandad) o de hermandad.
export type BandType = 'personal' | 'guild';

export interface BandasPanelOptions<T> {
  // Contenedor de la barra de filtros (slot `head` del panel).
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
  // Texto searchable de cada banda (nombre de banda, jugador, personaje,
  // hermandad). Si se provee, se pinta el buscador del motor.
  getSearchText?: (item: T) => string;
  // Tipo de cada banda: sin esto no se pinta la fila de tipo.
  getType?: (item: T) => BandType | null | undefined;
  // Contrato de lista del directorio (src/lib/ui/list.ts): el "sin
  // resultados" del filtro va a su bloque de estado (notice) y el ready se
  // asienta al pintar; sin él (pestañas) el aviso va como párrafo interno.
  list?: AsyncList;
}

export function renderBandasPanel<T>(options: BandasPanelOptions<T>): void {
  const { filtro, content, items, getSchedule, renderCard, list } = options;
  const emptyText = options.emptyText ?? 'Aún no hay bandas publicadas.';

  const facets: Array<Facet<T>> = [
    {
      id: 'dia',
      label: 'Filtrar bandas por día',
      // Una banda multi-día participa en cada uno de sus días (conteo por día).
      getValues: (item) => parseSchedule(getSchedule(item)).days.map(String),
      labelOf: (v) => WEEKDAY_LABELS[Number(v)] ?? v,
      order: (values) => [...values].sort((a, b) => Number(a) - Number(b)),
      // Dimensión núcleo del modelo: la fila se muestra aunque todos los
      // horarios caigan en un solo día (con el chip de ese día).
      minValues: 1,
    },
  ];
  const getType = options.getType;
  if (getType) {
    facets.push({
      id: 'tipo',
      label: 'Filtrar bandas por tipo',
      getValues: (item) => {
        const t = getType(item);
        return t ? [t] : [];
      },
      labelOf: (v) => (v === 'guild' ? 'De hermandad' : 'Personal'),
      order: () => ['personal', 'guild'],
    });
  }

  createFilterBar<T>({
    mount: filtro,
    items,
    getSearchText: options.getSearchText,
    searchPlaceholder: 'Buscar banda, jugador, personaje o hermandad…',
    searchLabel: 'Buscar bandas por nombre de banda, jugador, personaje o hermandad',
    facets,
    resultNoun: (n) => `${n} banda${n === 1 ? '' : 's'}`,
    onChange: renderContent,
  });

  // Contenido del cuerpo: los días (lunes → domingo, y "Sin día fijado") en
  // grilla responsive de hasta 3 días por fila (1 en móvil, 2 desde sm,
  // 3 desde lg). Con un solo día visible ocupa toda la fila (full-width).
  function renderContent(filtered: T[], state: FilterBarState): void {
    content.innerHTML = '';
    if (filtered.length === 0) {
      const query = state.query.trim();
      // Con búsqueda → mensaje literal; sin búsqueda pero con facetas activas
      // → aviso genérico (un chip de día sin bandas no es "sin publicar").
      const msg = query
        ? `Ninguna banda coincide con "${query}".`
        : state.active
          ? 'No hay bandas que coincidan con los filtros.'
          : emptyText;
      if (list) settleAsyncList(list, 'notice', msg);
      else content.appendChild(el('p', `${ui.text.bodyMuted} italic text-center bg-gray-900/40 border border-amber-600/20 rounded-md p-4`, msg));
      return;
    }

    const selectedDay = state.selected.dia ?? null;
    const { groups, undated } = groupBandsByDay(filtered, getSchedule);
    const groupsShown = selectedDay === null ? groups : groups.filter((g) => String(g.day) === selectedDay);
    const undatedShown = selectedDay === null ? undated : [];

    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start');
    const totalShown = groupsShown.length + (undatedShown.length > 0 ? 1 : 0);
    groupsShown.forEach((g) => grid.appendChild(daySection(g.day, g.bands, totalShown === 1)));
    if (undatedShown.length > 0) grid.appendChild(daySection(-1, undatedShown, totalShown === 1));
    content.appendChild(grid);

    if (list) settleAsyncList(list, 'ready');
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
}
