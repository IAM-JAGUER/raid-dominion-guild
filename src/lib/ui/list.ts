import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { createFilterBar, type Facet, type FilterBarState, type FilterBarController } from '@/lib/ui/filterBar';
import { createPaginator } from '@/lib/ui/paginator';

// Contrato ÚNICO de LISTA ASÍNCRONA del portal (directorios y bandas): el paso
// spinner → contenido → vacío SIEMPRE se hace aquí, con los mismos estados y
// los mismos atributos en todas las páginas.
//
// Markup estándar (atributos auto-descriptivos; los ids siguen siendo el
// contrato particular de cada página):
//   data-rd-list-content  contenedor de ítems (lleva `data-rd-reveal-cards`;
//                         su valor es el selector CSS de los ítems si están
//                         anidados, p. ej. `".rd-card"`). El bloque de carga
//                         vive DENTRO, como único hijo mientras carga: al
//                         asentarse se RETIRA y los ítems ocupan su lugar
//                         (reemplazo in-place, sin salto de layout).
//   data-rd-list-status   bloque de carga (LoadingBlock) dentro del content.
//   data-rd-list-empty    EmptyState: visible SOLO en el estado vacío.
//   data-rd-list-frame    (opcional) marco que acompaña a la lista (el
//                         cuerpo hundido de la ficha de directorio): se
//                         oculta solo cuando manda el estado vacío.
//
// El REVELADO (fade del bloque + escalonado de ítems) no vive aquí: lo hace
// el motor `src/lib/ui/reveal.ts` al insertar ítems o desocultar bloques.

export type AsyncListState = 'ready' | 'empty' | 'notice';

export interface AsyncList {
  status: HTMLElement | null;
  content: HTMLElement | null;
  empty: HTMLElement | null;
  frame: HTMLElement | null;
}

// Resuelve las piezas de la lista dentro de `root` (documento por defecto;
// pasar un contenedor si la página tiene más de una lista).
export function resolveAsyncList(root: ParentNode = document): AsyncList {
  return {
    status: root.querySelector<HTMLElement>('[data-rd-list-status]'),
    content: root.querySelector<HTMLElement>('[data-rd-list-content]'),
    empty: root.querySelector<HTMLElement>('[data-rd-list-empty]'),
    frame: root.querySelector<HTMLElement>('[data-rd-list-frame]'),
  };
}

// Vacía los ítems del contenido SIN tocar el bloque de carga (que vive dentro
// y se reutiliza si la lista vuelve a un estado de aviso).
export function clearListItems(list: AsyncList): void {
  const { content, status } = list;
  if (!content) return;
  Array.from(content.children).forEach((child) => {
    if (child !== status) child.remove();
  });
}

// Aplica el estado estándar:
// - `ready`:  se retira el bloque de carga y los ítems (ya insertados) entran
//             fundidos escalonados en su lugar.
// - `empty`:  se retira el bloque de carga y se muestra el EmptyState.
// - `notice`: el bloque de carga queda visible con `message` (errores de red
//             o «sin resultados»), sin spinner.
export function settleAsyncList(list: AsyncList, state: AsyncListState, message?: string): void {
  const { status, content, empty, frame } = list;
  if (status) {
    if (state === 'notice') {
      status.classList.remove('hidden');
      status.textContent = message ?? 'No se pudo cargar el contenido.';
      if (content && status.parentElement !== content) content.prepend(status);
    } else {
      status.remove();
    }
  }
  frame?.classList.toggle('hidden', state === 'empty');
  empty?.classList.toggle('hidden', state !== 'empty');
}

// ── Lista filtrada + paginada ──────────────────────────────────────────────
// Une el motor de filtros (filterBar.ts) con el paginador (paginator.ts) para
// que cada panel no repita el cableado: limpiar → estado vacío → rebanada de
// página → montar barra. El consumidor solo aporta sus ítems y cómo pintarlos.
export interface PagedListOptions<T> {
  // Contenedor de la barra de filtros.
  mount: HTMLElement;
  items: T[];
  pageSize: number;
  // Contenedor de los ítems (render por defecto).
  container?: HTMLElement;
  renderItem?: (item: T) => Node;
  // Render alternativo de una página (sustituye a container + renderItem).
  renderPage?: (pageItems: T[], page: number, filtered: T[], state: FilterBarState) => void;
  // Fuerza el número de páginas (listas empaquetadas por secciones).
  pageCount?: (filtered: T[], state: FilterBarState) => number;
  // Contenedor de la barra del paginador.
  pager?: HTMLElement | null;
  // Limpieza previa a cada página y al estado vacío.
  clear?: () => void;
  // Mensaje del estado vacío (por defecto, según la búsqueda).
  emptyMessage?: (state: FilterBarState) => string;
  // Render propio del estado vacío (por defecto, párrafo en `container`).
  renderEmpty?: (message: string, state: FilterBarState) => void;
  // Callback tras pintar una página (p. ej. settleAsyncList ready).
  onReady?: () => void;
  // Resumen del paginador (por defecto, resultNoun).
  summary?: (n: number) => string;
  // Passthrough a createFilterBar.
  getSearchText?: (item: T) => string;
  searchPlaceholder?: string;
  searchLabel?: string;
  facets?: Array<Facet<T>>;
  resultNoun?: (n: number) => string;
  panel?: 'disclosure' | 'inline';
  open?: boolean;
  extra?: HTMLElement;
  minFacetValues?: number;
}

export function mountPagedList<T>(options: PagedListOptions<T>): FilterBarController<T> {
  const { mount, items, pageSize, pager = null, container } = options;
  // Limpieza por defecto: vacía los ítems pero CONSERVA el bloque de carga
  // (`data-rd-list-status`) si vive dentro del contenedor. Un `innerHTML = ''`
  // destruiría la referencia que `settleAsyncList` reutiliza para los avisos.
  const clear = options.clear ?? (container ? () => {
    Array.from(container.children).forEach((child) => {
      if (!child.hasAttribute('data-rd-list-status')) child.remove();
    });
  } : undefined);

  return createFilterBar<T>({
    mount,
    items,
    getSearchText: options.getSearchText,
    searchPlaceholder: options.searchPlaceholder,
    searchLabel: options.searchLabel,
    facets: options.facets,
    resultNoun: options.resultNoun,
    panel: options.panel,
    open: options.open,
    extra: options.extra,
    minFacetValues: options.minFacetValues,
    onChange: (filtered, state) => {
      if (pager) pager.textContent = '';
      if (filtered.length === 0) {
        clear?.();
        const message = options.emptyMessage?.(state) ?? (
          state.query.trim()
            ? `Ningún resultado coincide con "${state.query.trim()}".`
            : 'No hay resultados con los filtros aplicados.'
        );
        if (options.renderEmpty) options.renderEmpty(message, state);
        else if (container) {
          container.appendChild(el('p', `${ui.text.bodyMuted} italic col-span-full`, message));
        }
        return;
      }

      const paginator = createPaginator({
        pageSize,
        totalItems: filtered.length,
        pageCount: options.pageCount?.(filtered, state),
        summary: options.summary?.(filtered.length)
          ?? options.resultNoun?.(filtered.length)
          ?? `${filtered.length}`,
        renderPage: (page) => {
          const start = (page - 1) * pageSize;
          const pageItems = filtered.slice(start, start + pageSize);
          clear?.();
          if (options.renderPage) {
            options.renderPage(pageItems, page, filtered, state);
            return;
          }
          if (container && options.renderItem) {
            pageItems.forEach((item) => container.appendChild(options.renderItem!(item)));
          }
        },
      });
      if (pager && paginator.bar) pager.appendChild(paginator.bar);
      paginator.update();
      options.onReady?.();
    },
  });
}
