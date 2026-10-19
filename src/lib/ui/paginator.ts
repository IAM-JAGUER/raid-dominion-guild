// Paginador reutilizable (barra "Página [X] de Y • N ítems").
// Extraído del roster de preview.ts (renderRoster) con markup y
// comportamiento idénticos (zero visual change, 2026-10-19): el número de
// página es un desplegable de salto directo + controles prev/next.
// Clases vía token único ui.pager (design.ts); el contenido lo renderiza el
// caller en su propio contenedor (grid, lista…).
//
// `packSections` (mismo módulo) resuelve las listas agrupadas en secciones
// (días de bandas, equipo/monedas de metas…): las secciones viajan enteras
// mientras quepan; una sección mayor que la página se parte y repite su
// cabecera (`continuation`). El paginador sigue siendo plano: el caller
// empaqueta y pasa `pageCount` + renderiza las rebanadas de cada página.
import { el } from '@/lib/ui/dom';
import { ui } from '@/lib/ui/design';

/** Ítems por página de una grilla de 3 columnas (4 filas). */
export const PAGE_SIZE_GRID = 12;
/** Ítems por página de una lista vertical de una columna. */
export const PAGE_SIZE_LIST = 20;

export interface PaginatorOptions {
  /** Ítems por página (p. ej. 9 para un grid 3×3). */
  pageSize: number;
  /** Total de ítems a paginar. */
  totalItems: number;
  /** Texto del resumen tras el desplegable, p. ej. "101 miembros". */
  summary: string;
  /** Rellena el contenedor del caller con los ítems de la página (1-based). */
  renderPage: (page: number) => void;
  /** Si se indica, fuerza el número de páginas (listas empaquetadas). */
  pageCount?: number;
}

export interface Paginator {
  /** Página actual (1-based). */
  readonly page: number;
  /** Total de páginas (mínimo 1). */
  readonly totalPages: number;
  /** Barra de control; `null` cuando hay una sola página (no se monta). */
  readonly bar: HTMLElement | null;
  /** Renderiza la página actual y sincroniza desplegable/disabled. */
  update(): void;
}

// Barra de paginación + estado de página. NO monta nada en el DOM: el
// caller decide dónde insertar `bar` y cuándo llamar `update()` por primera
// vez (tras insertar el contenedor, para no re-renderizar nodos huérfanos).
export function createPaginator(opts: PaginatorOptions): Paginator {
  const totalPages = Math.max(
    1,
    opts.pageCount !== undefined ? opts.pageCount : Math.ceil(opts.totalItems / opts.pageSize)
  );
  let page = 1;

  const prev = el('button', ui.pager.btn) as HTMLButtonElement;
  prev.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';
  prev.setAttribute('aria-label', 'Página anterior');
  const next = el('button', ui.pager.btn) as HTMLButtonElement;
  next.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
  next.setAttribute('aria-label', 'Página siguiente');

  const bar = el('div', ui.pager.bar);
  const info = el('p', ui.pager.info);
  const pageSel = document.createElement('select');
  pageSel.className = ui.pager.select;
  pageSel.setAttribute('aria-label', 'Ir a la página');
  for (let i = 1; i <= totalPages; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    pageSel.appendChild(opt);
  }
  info.append('Página ', pageSel, ` de ${totalPages} • ${opts.summary}`);
  const controls = el('div', 'flex items-center gap-2');
  controls.append(prev, next);
  bar.append(info, controls);

  const update = (): void => {
    opts.renderPage(page);
    pageSel.value = String(page);
    prev.disabled = page <= 1;
    next.disabled = page >= totalPages;
  };
  prev.addEventListener('click', () => { if (page > 1) { page -= 1; update(); } });
  next.addEventListener('click', () => { if (page < totalPages) { page += 1; update(); } });
  pageSel.addEventListener('change', () => { page = Number(pageSel.value); update(); });

  return {
    get page() { return page; },
    get totalPages() { return totalPages; },
    bar: totalPages > 1 ? bar : null,
    update,
  };
}

// ── Empaquetado por secciones ─────────────────────────────────────────────
// Entrada: secciones ordenadas con su cabecera (día, grupo…) y sus ítems.
export interface SectionInput<K, H> {
  /** Clave estable de la sección (día numérico, nombre de grupo…). */
  key: string;
  /** Cabecera opaca para el consumidor (no la interpreta el paginador). */
  header: H;
  items: K[];
}

// Rebanada de una sección dentro de una página. `total` es el total de la
// sección COMPLETA (no el de la rebanada) y `continuation` marca la rebanada
// que empieza después del índice 0 (la sección prosigue desde otra página).
export interface SectionSlice<K, H> {
  key: string;
  header: H;
  items: K[];
  total: number;
  continuation: boolean;
}

// Reparte secciones en páginas de hasta `size` ítems, en orden. Las secciones
// viajan enteras mientras quepan; una que no cabe se parte y la rebanada
// siguiente conserva su cabecera con `continuation: true`. Devuelve siempre
// al menos una página (vacía si no hay secciones con ítems).
export function packSections<K, H>(
  sections: Array<SectionInput<K, H>>,
  size: number,
): Array<Array<SectionSlice<K, H>>> {
  const pages: Array<Array<SectionSlice<K, H>>> = [];
  let page: Array<SectionSlice<K, H>> = [];
  let used = 0;

  const flush = (): void => {
    if (page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
  };

  sections.forEach((section) => {
    let offset = 0;
    while (offset < section.items.length) {
      if (used >= size) flush();
      const take = Math.min(size - used, section.items.length - offset);
      page.push({
        key: section.key,
        header: section.header,
        items: section.items.slice(offset, offset + take),
        total: section.items.length,
        continuation: offset > 0,
      });
      offset += take;
      used += take;
    }
  });
  flush();

  return pages.length > 0 ? pages : [[]];
}
