/**
 * Motor ÚNICO de filtros de directorio (modelo /bandas): buscador de texto +
 * filas de chips de facetas dinámicas con conteo. Lo consumen los 5
 * directorios raíz y `bandasPanel.ts` (pestañas Bandas de perfil, personaje,
 * reino y portal de hermandad) — no dupliques buscadores ni chips de filtro.
 *
 * Semántica:
 * - Los conteos de cada chip se computan sobre los ítems que pasan la
 *   búsqueda + los DEMÁS filtros activos (el propio facet se excluye): un
 *   chip nunca muestra un conteo que al seleccionarlo dé 0 por combinación.
 * - Faceta dinámica: una fila se pinta solo si aporta ≥2 valores distintos
 *   (`minFacetValues`); una faceta de bandera solo si algún ítem la cumple.
 * - Chips: `<button>` con `aria-pressed`; clic en el activo limpia el filtro.
 * - El input de búsqueda se crea UNA vez y sobrevive a los re-render de los
 *   chips (tipear no pierde el foco ni la posición del cursor).
 * - El orden de los chips se fija al crear la barra (estable al tipear).
 */
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { iconEl, type IconName } from '@/lib/ui/icons';

// Valor del chip "Todas" (limpia la selección de la fila).
const ALL = '__all__';

// Faceta de valores: el ítem aporta 0..N valores (p. ej. una banda multi-día)
// y el chip filtra por pertenencia de la selección a esos valores.
export interface ValueFacet<T> {
  kind?: 'values';
  id: string;
  // aria-label de la fila ("Filtrar por clase").
  label: string;
  // Valores del ítem (vacío = no participa en la faceta).
  getValues: (item: T) => string[];
  // Etiqueta visible de un valor (default: el propio valor).
  labelOf?: (value: string) => string;
  // Nodo de icono del chip (NUEVO por llamada: un nodo no puede repetirse).
  iconOf?: (value: string) => Node | null;
  // Orden fijo de los chips (default: conteo desc sobre el dataset completo,
  // luego label alfabético).
  order?: (values: string[]) => string[];
  // Etiqueta del chip que limpia la fila (default "Todas").
  allLabel?: string;
  // Mínimo de valores distintos para pintar la fila (default: el global,
  // 2). Facetas núcleo de una lista (p. ej. el día de /bandas) pasan 1.
  minValues?: number;
}

// Faceta de bandera: un único chip que filtra por un booleano del ítem.
export interface FlagFacet<T> {
  kind: 'flag';
  id: string;
  label: string;
  getFlag: (item: T) => boolean;
  // Texto visible del chip ("Maestro").
  chipLabel: string;
  // Icono temático del chip (contrato src/lib/ui/icons.ts).
  icon?: IconName;
}

export type Facet<T> = ValueFacet<T> | FlagFacet<T>;

export interface FilterBarState {
  query: string;
  // Facetas de valores: id → valor seleccionado (null = sin filtro).
  selected: Record<string, string | null>;
  // Facetas de bandera: id → activa.
  flags: Record<string, boolean>;
  // ¿Hay búsqueda o algún filtro activo?
  active: boolean;
}

export interface FilterBarOptions<T> {
  // Contenedor de la barra (la cabecera del panel en los directorios).
  mount: HTMLElement;
  items: T[];
  // Texto searchable de cada ítem; sin él no se pinta buscador.
  getSearchText?: (item: T) => string;
  searchPlaceholder?: string;
  searchLabel?: string;
  facets?: Array<Facet<T>>;
  // Mínimo de valores distintos de una faceta para pintarla.
  minFacetValues?: number;
  // Texto del contador de resultados ("12 bandas"); sin él no se pinta.
  resultNoun?: (n: number) => string;
  // Re-render del consumidor con los ítems filtrados y el estado vigente.
  onChange: (filtered: T[], state: FilterBarState) => void;
}

export function createFilterBar<T>(options: FilterBarOptions<T>): void {
  const { mount, items, getSearchText, onChange } = options;
  const facets = (options.facets ?? []) as Array<Facet<T>>;
  const minFacetValues = options.minFacetValues ?? 2;
  const resultNoun = options.resultNoun;

  const state: FilterBarState = { query: '', selected: {}, flags: {}, active: false };

  // ── Filtrado ────────────────────────────────────────────────────────────
  function matchesQuery(item: T): boolean {
    const q = state.query.trim().toLowerCase();
    if (!q || !getSearchText) return true;
    return getSearchText(item).toLowerCase().includes(q);
  }

  function matchesFacet(item: T, facet: Facet<T>): boolean {
    if (facet.kind === 'flag') return !state.flags[facet.id] || facet.getFlag(item);
    const selected = state.selected[facet.id];
    if (!selected) return true;
    return facet.getValues(item).includes(selected);
  }

  // Ítems que pasan la búsqueda + todas las facetas (menos `except`, el
  // propio facet cuyos conteos se están calculando).
  function apply(except?: string): T[] {
    return items.filter(
      (item) => matchesQuery(item) && facets.every((f) => f.id === except || matchesFacet(item, f)),
    );
  }

  function snapshot(): FilterBarState {
    return {
      query: state.query,
      selected: { ...state.selected },
      flags: { ...state.flags },
      active:
        state.query.trim() !== '' ||
        Object.values(state.selected).some((v) => v !== null) ||
        Object.values(state.flags).some(Boolean),
    };
  }

  function emit(): void {
    onChange(apply(), snapshot());
  }

  // ── Dataset fijo: facetas visibles + orden de sus valores ───────────────
  interface VisibleFacet {
    facet: Facet<T>;
    // Solo en facetas de valores: chips ordenados (estable al tipear).
    values?: string[];
  }

  function buildVisibleFacets(): VisibleFacet[] {
    const visible: VisibleFacet[] = [];
    for (const facet of facets) {
      if (facet.kind === 'flag') {
        if (items.some((item) => facet.getFlag(item))) visible.push({ facet });
        continue;
      }
      const counts = new Map<string, number>();
      items.forEach((item) => facet.getValues(item).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
      if (counts.size < (facet.minValues ?? minFacetValues)) continue;
      const values = facet.order
        ? facet.order([...counts.keys()])
        : [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
      visible.push({ facet, values });
    }
    return visible;
  }

  const visibleFacets = buildVisibleFacets();

  // ── DOM ─────────────────────────────────────────────────────────────────
  let input: HTMLInputElement | null = null;
  let resultEl: HTMLElement | null = null;

  if (getSearchText) {
    const row = el('div', ui.filter.searchRow);
    const wrap = el('div', ui.filter.searchWrap);
    wrap.appendChild(iconEl('buscar', { size: 'sm', cls: ui.filter.searchIcon }));

    input = document.createElement('input');
    input.type = 'search';
    input.autocomplete = 'off';
    input.className = `${ui.form.input} ${ui.focusRing} pl-9 pr-3`;
    input.placeholder = options.searchPlaceholder ?? 'Buscar…';
    input.setAttribute('aria-label', options.searchLabel ?? 'Buscar');
    input.addEventListener('input', () => {
      state.query = input!.value;
      renderChips();
      emit();
    });
    wrap.appendChild(input);
    row.appendChild(wrap);

    if (resultNoun) {
      resultEl = el('p', ui.filter.result);
      resultEl.setAttribute('aria-live', 'polite');
      row.appendChild(resultEl);
    }
    mount.appendChild(row);
  }

  const facetsBox = el('div', ui.filter.facets);
  if (visibleFacets.length > 0) mount.appendChild(facetsBox);

  // Chip de filtro: botón con aria-pressed sobre los tokens ui.filter.*.
  function chipButton(o: {
    label: string;
    count: number;
    active: boolean;
    icon?: Node | null;
    facet: string;
    value: string;
  }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${ui.filter.chip} ${o.active ? ui.filter.chipActive : ui.filter.chipIdle}`;
    if (o.icon) btn.appendChild(o.icon);
    btn.appendChild(el('span', 'min-w-0', o.label));
    const count = el('span', ui.filter.count, `· ${o.count}`);
    btn.appendChild(count);
    btn.dataset.facet = o.facet;
    btn.dataset.value = o.value;
    btn.setAttribute('aria-pressed', String(o.active));
    return btn;
  }

  function renderChips(): void {
    facetsBox.textContent = '';
    let firstRow = true;
    for (const entry of visibleFacets) {
      const { facet } = entry;
      const row = el('div', ui.filter.row);
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', facet.label);
      // Marca visual de la zona de facetas: embudo temático al inicio de la
      // primera fila (decorativo; cada fila ya lleva su aria-label).
      if (firstRow) {
        row.appendChild(iconEl('filtrar', { size: 'xs', cls: ui.filter.facetLead }));
        firstRow = false;
      }

      // Conteos por chip: ítems con búsqueda + los DEMÁS filtros activos.
      const base = apply(facet.id);

      if (facet.kind === 'flag') {
        const count = base.filter((item) => facet.getFlag(item)).length;
        row.appendChild(chipButton({
          label: facet.chipLabel,
          count,
          active: !!state.flags[facet.id],
          icon: facet.icon ? iconEl(facet.icon, { size: 'xs', cls: 'shrink-0' }) : null,
          facet: facet.id,
          value: ALL,
        }));
        facetsBox.appendChild(row);
        continue;
      }

      const counts = new Map<string, number>();
      base.forEach((item) => facet.getValues(item).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
      const labelOf = facet.labelOf ?? ((v: string) => v);
      const allLabel = facet.allLabel ?? 'Todas';
      const selected = state.selected[facet.id] ?? null;

      row.appendChild(chipButton({
        label: allLabel,
        count: base.length,
        active: selected === null,
        facet: facet.id,
        value: ALL,
      }));
      for (const value of entry.values ?? []) {
        row.appendChild(chipButton({
          label: labelOf(value),
          count: counts.get(value) ?? 0,
          active: selected === value,
          icon: facet.iconOf?.(value) ?? null,
          facet: facet.id,
          value,
        }));
      }
      facetsBox.appendChild(row);
    }

    if (resultEl && resultNoun) {
      const total = apply().length;
      resultEl.textContent = total > 0 ? resultNoun(total) : '';
    }
  }

  // Clic en chips: delegación única (los re-render no acumulan listeners).
  facetsBox.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-facet]');
    if (!btn) return;
    const id = btn.dataset.facet ?? '';
    const facet = facets.find((f) => f.id === id);
    if (!facet) return;
    if (facet.kind === 'flag') {
      state.flags[id] = !state.flags[id];
    } else {
      const value = btn.dataset.value ?? ALL;
      if (value === ALL || state.selected[id] === value) state.selected[id] = null;
      else state.selected[id] = value;
    }
    renderChips();
    emit();
  });

  // Render inicial: la barra nace ya aplicada (sin filtros = todo visible).
  renderChips();
  emit();
}
