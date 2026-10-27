/**
 * Motor ÚNICO de filtros del portal (modelo wow-rd): buscador + selector
 * dinámico "Añadir filtro" + chips removibles de filtros activos. Lo consumen
 * los directorios raíz, las pestañas de perfil/ficha y el tracker.
 *
 * Semántica:
 * - Los conteos de cada opción se computan sobre los ítems que pasan la
 *   búsqueda + los DEMÁS filtros activos (el propio facet se excluye).
 * - Faceta dinámica: una fila se pinta solo si aporta ≥2 valores distintos
 *   (`minFacetValues`); una faceta de bandera solo si algún ítem la cumple.
 * - El selector es la única vía para añadir filtros; los activos se muestran
 *   como chips removibles y el botón "Limpiar" los restablece.
 * - El input de búsqueda se crea UNA vez y sobrevive a los re-render de los
 *   chips (tipear no pierde el foco ni la posición del cursor).
 * - Devuelve un controlador (`update`/`getState`/`reset`) para datasets
 *   dinámicos: `update` recalcula opciones y conserva query/foco.
 * - `panel: 'inline'` permite montar la barra dentro de un panel propio (el
 *   tracker); por defecto la barra se pliega en un `<details>` "Filtros".
 */
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { iconEl, type IconName } from '@/lib/ui/icons';

// Faceta de valores: el ítem aporta 0..N valores (p. ej. una banda multi-día)
// y el filtro se aplica por pertenencia del valor seleccionado.
export interface ValueFacet<T> {
  kind?: 'values';
  id: string;
  // aria-label de la faceta ("Filtrar por clase").
  label: string;
  // Valores del ítem (vacío = no participa en la faceta).
  getValues: (item: T) => string[];
  // Etiqueta visible de un valor (default: el propio valor).
  labelOf?: (value: string) => string;
  // Nodo de icono del chip (NUEVO por llamada: un nodo no puede repetirse).
  iconOf?: (value: string) => Node | null;
  // Orden fijo de los valores (default: conteo desc, luego label alfabético).
  order?: (values: string[]) => string[];
  // Etiqueta del chip que limpia la fila (compatibilidad; el chip "Todas" ya
  // no se pinta).
  allLabel?: string;
  // Mínimo de valores distintos para pintar la faceta (default global: 2).
  minValues?: number;
}

// Faceta de bandera: una opción que filtra por un booleano del ítem.
export interface FlagFacet<T> {
  kind: 'flag';
  id: string;
  label: string;
  getFlag: (item: T) => boolean;
  // Texto visible de la opción/chip ("Maestro").
  chipLabel: string;
  // Icono temático de la opción/chip (contrato src/lib/ui/icons.ts).
  icon?: IconName;
}

// Faceta de orden: no filtra ítems; su valor vive en `state.selected[].`
// Permite compartir el mismo selector "Añadir filtro u orden" (tracker).
export interface SortFacet {
  kind: 'sort';
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
}

export type Facet<T> = ValueFacet<T> | FlagFacet<T> | SortFacet;

export interface FilterBarState {
  query: string;
  // Facetas de valores: id → valor seleccionado (null = sin filtro).
  // Orden: id → valor actual (el default también vive aquí).
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
  // `disclosure` (default): la barra se pliega en un <details> "Filtros".
  // `inline`: se monta directamente (el contenedor externo controla el panel).
  panel?: 'disclosure' | 'inline';
  // Controles extra del consumidor que deben vivir DENTRO de la misma caja
  // de filtros (p. ej. “Ocultos” + selección rápida del tracker).
  extra?: HTMLElement;
  // Re-render del consumidor con los ítems filtrados y el estado vigente.
  onChange: (filtered: T[], state: FilterBarState) => void;
}

// Controlador para consumidores con dataset dinámico (tracker) o que
// necesitan resetear la barra desde fuera.
export interface FilterBarController<T> {
  update(items: T[]): void;
  getState(): FilterBarState;
  reset(): void;
}

function cleanFacetLabel(label: string): string {
  let cleaned = label.replace(/^Filtrar\s+/i, '').trim();
  const by = cleaned.match(/\bpor\s+(.+)$/i);
  if (by) cleaned = by[1].trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : label;
}

function chevronEl(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', ui.filter.chevron);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 7.5 10 12.5 15 7.5');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

export function createFilterBar<T>(options: FilterBarOptions<T>): FilterBarController<T> {
  const { mount, getSearchText, onChange } = options;
  let items = options.items;
  const facets = (options.facets ?? []) as Array<Facet<T>>;
  const minFacetValues = options.minFacetValues ?? 2;
  const resultNoun = options.resultNoun;
  const panelMode = options.panel ?? 'disclosure';

  const state: FilterBarState = { query: '', selected: {}, flags: {}, active: false };
  const facetById = new Map(facets.map((facet) => [facet.id, facet]));
  const sortFacets = facets.filter((facet): facet is SortFacet => facet.kind === 'sort');
  sortFacets.forEach((facet) => { state.selected[facet.id] = facet.defaultValue; });

  // ── Filtrado ────────────────────────────────────────────────────────────
  function matchesQuery(item: T): boolean {
    const q = state.query.trim().toLowerCase();
    if (!q || !getSearchText) return true;
    return getSearchText(item).toLowerCase().includes(q);
  }

  function matchesFacet(item: T, facet: Facet<T>): boolean {
    if (facet.kind === 'sort') return true;
    if (facet.kind === 'flag') return !state.flags[facet.id] || facet.getFlag(item);
    const selected = state.selected[facet.id];
    if (!selected) return true;
    return facet.getValues(item).includes(selected);
  }

  // Ítems que pasan la búsqueda + todas las facetas (menos `except`, la
  // propia faceta cuyos conteos se están calculando).
  function apply(except?: string): T[] {
    return items.filter(
      (item) => matchesQuery(item) && facets.every((f) => f.id === except || matchesFacet(item, f)),
    );
  }

  function selectedIsActive(id: string, value: string | null): boolean {
    if (!value) return false;
    const facet = facetById.get(id);
    if (facet?.kind === 'sort') return value !== facet.defaultValue;
    return true;
  }

  function activeCount(): number {
    let count = state.query.trim() !== '' ? 1 : 0;
    Object.entries(state.selected).forEach(([id, value]) => {
      if (selectedIsActive(id, value)) count += 1;
    });
    Object.values(state.flags).forEach((active) => { if (active) count += 1; });
    return count;
  }

  function snapshot(): FilterBarState {
    return {
      query: state.query,
      selected: { ...state.selected },
      flags: { ...state.flags },
      active: activeCount() > 0,
    };
  }

  function emit(): void {
    onChange(apply(), snapshot());
  }

  // ── Facetas visibles + orden de sus valores ─────────────────────────────
  interface VisibleFacet {
    facet: Facet<T>;
    // Solo en facetas de valores/orden: opciones ordenadas.
    values?: string[];
  }

  function buildVisibleFacets(): VisibleFacet[] {
    const visible: VisibleFacet[] = [];
    for (const facet of facets) {
      if (facet.kind === 'sort') {
        visible.push({ facet, values: facet.options.map((option) => option.value) });
        continue;
      }
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

  let visibleFacets = buildVisibleFacets();

  // Descarta selecciones cuyo facet/valor ya no existe en el dataset actual.
  function pruneInvalidState(): void {
    const visibleById = new Map(visibleFacets.map((entry) => [entry.facet.id, entry]));
    Object.keys(state.selected).forEach((id) => {
      const entry = visibleById.get(id);
      if (!entry) {
        delete state.selected[id];
        return;
      }
      const facet = entry.facet;
      if (facet.kind === 'flag') {
        delete state.selected[id];
        return;
      }
      if (facet.kind === 'sort') {
        if (!entry.values?.includes(state.selected[id] ?? '')) state.selected[id] = facet.defaultValue;
        return;
      }
      if (!entry.values?.includes(state.selected[id] ?? '')) delete state.selected[id];
    });
    sortFacets.forEach((facet) => {
      if (!state.selected[facet.id]) state.selected[facet.id] = facet.defaultValue;
    });
    Object.keys(state.flags).forEach((id) => {
      const entry = visibleById.get(id);
      if (!entry || entry.facet.kind !== 'flag') delete state.flags[id];
    });
  }

  // ── DOM fijo: panel, buscador, selector y chips ─────────────────────────
  let details: HTMLDetailsElement | null = null;
  let filterBody: HTMLElement = mount;
  let summaryCount: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let resultEl: HTMLElement | null = null;
  let addSelect: HTMLSelectElement | null = null;
  let chipsBox: HTMLElement | null = null;
  let clearBtn: HTMLButtonElement | null = null;
  let emptyFacets: HTMLElement | null = null;

  const hasFacets = facets.length > 0;

  if (hasFacets && panelMode === 'disclosure') {
    details = document.createElement('details');
    details.className = ui.disclosure;
    details.open = true;
    const summary = document.createElement('summary');
    summary.className = ui.disclosureSummary;
    const summaryLeft = el('span', ui.filter.summaryLeft);
    summaryLeft.appendChild(iconEl('filtrar', { size: 'xs', cls: 'shrink-0' }));
    summaryLeft.appendChild(el('span', 'min-w-0', 'Filtros'));
    summaryCount = el('span', `${ui.filter.summaryCount} hidden`, '0');
    summaryLeft.appendChild(summaryCount);
    summary.append(summaryLeft, chevronEl());
    details.appendChild(summary);
    const body = el('div', `${ui.disclosureBody} ${ui.filter.panelBody}`);
    details.appendChild(body);
    mount.appendChild(details);
    filterBody = body;
  }

  const bar = el('div', ui.filter.bar);
  filterBody.appendChild(bar);

  if (getSearchText) {
    const row = el('div', options.extra ? ui.filter.searchRow : ui.filter.searchRowWide);
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
      renderPanel();
      emit();
    });
    wrap.appendChild(input);
    row.appendChild(wrap);

    if (resultNoun) {
      resultEl = el('p', ui.filter.result);
      resultEl.setAttribute('aria-live', 'polite');
    }
    bar.appendChild(row);
    if (resultEl) bar.appendChild(resultEl);
  }

  if (hasFacets) {
    const org = el('div', ui.filter.org);
    const head = el('div', ui.filter.orgHead);
    head.appendChild(el('span', ui.filter.orgLabel, 'Criterios'));

    addSelect = document.createElement('select');
    addSelect.className = `${ui.filter.select} ${ui.focusRing}`;
    addSelect.setAttribute('aria-label', 'Añadir filtro u orden');
    addSelect.addEventListener('change', () => {
      const raw = addSelect!.value;
      addSelect!.value = '';
      if (!raw) return;
      const sep = raw.indexOf(':');
      if (sep === -1) return;
      const kind = raw.slice(0, sep);
      const rest = raw.slice(sep + 1);
      if (kind === 'flag') {
        state.flags[rest] = !state.flags[rest];
      } else if (kind === 'sort') {
        const valueSep = rest.indexOf(':');
        if (valueSep === -1) return;
        const id = rest.slice(0, valueSep);
        const value = decodeURIComponent(rest.slice(valueSep + 1));
        const facet = facetById.get(id);
        if (facet?.kind === 'sort' && facet.options.some((option) => option.value === value)) {
          state.selected[facet.id] = value;
        }
      } else {
        const valueSep = rest.indexOf(':');
        if (valueSep === -1) return;
        const id = rest.slice(0, valueSep);
        const value = decodeURIComponent(rest.slice(valueSep + 1));
        const facet = facetById.get(id);
        if (facet && facet.kind !== 'flag' && facet.kind !== 'sort') {
          state.selected[id] = value;
        }
      }
      renderPanel();
      emit();
      addSelect?.focus({ preventScroll: true });
    });
    head.appendChild(addSelect);

    clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = `${ui.filter.clear} ${ui.focusRing}`;
    clearBtn.title = 'Limpiar todos los filtros';
    clearBtn.setAttribute('aria-label', 'Limpiar todos los filtros');
    clearBtn.appendChild(el('span', '', 'Limpiar'));
    clearBtn.addEventListener('click', () => {
      state.query = '';
      state.selected = {};
      state.flags = {};
      sortFacets.forEach((facet) => { state.selected[facet.id] = facet.defaultValue; });
      if (input) input.value = '';
      renderPanel();
      emit();
      input?.focus({ preventScroll: true });
    });
    org.appendChild(head);

    chipsBox = el('div', ui.filter.chips);
    chipsBox.setAttribute('role', 'list');
    chipsBox.setAttribute('aria-label', 'Filtros activos');
    chipsBox.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter-kind]');
      if (!btn) return;
      const kind = btn.dataset.filterKind;
      const id = btn.dataset.filterId ?? '';
      if (kind === 'flag') {
        state.flags[id] = false;
      } else if (kind === 'sort') {
        const facet = facetById.get(id);
        if (facet?.kind === 'sort') state.selected[id] = facet.defaultValue;
      } else {
        state.selected[id] = null;
      }
      renderPanel();
      emit();
      addSelect?.focus({ preventScroll: true });
    });
    org.appendChild(chipsBox);
    org.appendChild(clearBtn);

    emptyFacets = el('p', `${ui.filter.notice} hidden`, 'No hay filtros disponibles.');
    org.appendChild(emptyFacets);
    bar.appendChild(org);
  }

  if (options.extra) bar.appendChild(options.extra);

  function valueLabel(facet: ValueFacet<T> | SortFacet, value: string): string {
    if (facet.kind === 'sort') return facet.options.find((option) => option.value === value)?.label ?? value;
    return (facet.labelOf ?? ((v: string) => v))(value);
  }

  function chip(
    facet: Facet<T>,
    kind: 'value' | 'flag' | 'sort',
    value: string,
    label: string,
    icon?: Node | null,
  ): HTMLElement {
    const node = el('span', ui.filter.chip);
    node.setAttribute('role', 'listitem');
    const key = cleanFacetLabel(facet.label);
    node.title = kind === 'flag' ? label : `${key}: ${label}`;
    if (icon) node.appendChild(icon);
    node.appendChild(el('span', ui.filter.chipValue, label));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = ui.filter.chipRemove;
    remove.dataset.filterKind = kind;
    remove.dataset.filterId = facet.id;
    remove.dataset.filterValue = value;
    const title = kind === 'flag'
      ? `Quitar filtro ${label}`
      : `Quitar filtro de ${key.toLowerCase()}: ${label}`;
    remove.title = title;
    remove.setAttribute('aria-label', title);
    remove.textContent = '×';
    node.appendChild(remove);
    return node;
  }

  function focusedChip(): { kind: string; id: string; value: string } | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !mount.contains(active)) return null;
    const btn = active.closest<HTMLButtonElement>('button[data-filter-kind]');
    if (!btn) return null;
    return {
      kind: btn.dataset.filterKind ?? '',
      id: btn.dataset.filterId ?? '',
      value: btn.dataset.filterValue ?? '',
    };
  }

  function restoreChipFocus(target: { kind: string; id: string; value: string } | null): void {
    if (!target || !chipsBox) return;
    const buttons = Array.from(chipsBox.querySelectorAll<HTMLButtonElement>('button[data-filter-kind]'));
    const next = buttons.find(
      (btn) => btn.dataset.filterKind === target.kind
        && btn.dataset.filterId === target.id
        && btn.dataset.filterValue === target.value,
    );
    if (next) next.focus({ preventScroll: true });
  }

  function renderOptions(): void {
    if (!addSelect) return;
    addSelect.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = sortFacets.length > 0 ? 'Filtro u orden…' : 'Añadir filtro…';
    addSelect.appendChild(placeholder);

    visibleFacets.forEach((entry) => {
      const facet = entry.facet;
      const base = apply(facet.id);
      const optgroup = document.createElement('optgroup');
      optgroup.label = facet.kind === 'sort'
        ? 'Orden'
        : facet.kind === 'flag'
          ? 'Atributos'
          : cleanFacetLabel(facet.label);

      if (facet.kind === 'flag') {
        const count = base.filter((item) => facet.getFlag(item)).length;
        const option = document.createElement('option');
        option.value = `flag:${facet.id}`;
        option.textContent = `${facet.chipLabel}${count ? ` (${count})` : ''}`;
        optgroup.appendChild(option);
      } else if (facet.kind === 'sort') {
        facet.options.forEach((sortOption) => {
          const option = document.createElement('option');
          option.value = `sort:${facet.id}:${encodeURIComponent(sortOption.value)}`;
          option.textContent = sortOption.label;
          optgroup.appendChild(option);
        });
      } else {
        const counts = new Map<string, number>();
        base.forEach((item) => facet.getValues(item).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
        (entry.values ?? []).forEach((value) => {
          const option = document.createElement('option');
          option.value = `value:${facet.id}:${encodeURIComponent(value)}`;
          option.textContent = `${valueLabel(facet, value)}${(counts.get(value) ?? 0) > 0 ? ` (${counts.get(value)})` : ''}`;
          optgroup.appendChild(option);
        });
      }
      addSelect!.appendChild(optgroup);
    });
  }

  function renderChips(): void {
    if (!chipsBox) return;
    chipsBox.textContent = '';

    visibleFacets.forEach((entry) => {
      const facet = entry.facet;
      if (facet.kind === 'flag') {
        if (!state.flags[facet.id]) return;
        const icon = facet.icon ? iconEl(facet.icon, { size: 'xs', cls: 'shrink-0' }) : null;
        chipsBox!.appendChild(chip(facet, 'flag', facet.chipLabel, facet.chipLabel, icon));
        return;
      }
      if (facet.kind === 'sort') {
        const value = state.selected[facet.id] ?? facet.defaultValue;
        if (value === facet.defaultValue) return;
        chipsBox!.appendChild(chip(facet, 'sort', value, valueLabel(facet, value)));
        return;
      }
      const value = state.selected[facet.id];
      if (!value) return;
      chipsBox!.appendChild(chip(facet, 'value', value, valueLabel(facet, value), facet.iconOf?.(value) ?? null));
    });

    chipsBox.classList.toggle('hidden', chipsBox.childElementCount === 0);
  }

  function updateSummary(): void {
    const count = activeCount();
    if (summaryCount) {
      summaryCount.textContent = String(count);
      summaryCount.classList.toggle('hidden', count === 0);
    }
    if (clearBtn) clearBtn.classList.toggle('hidden', count === 0);
    if (emptyFacets) emptyFacets.classList.toggle('hidden', visibleFacets.length > 0);
    if (details) details.dataset.active = String(count > 0);
  }

  function renderPanel(): void {
    const focused = focusedChip();
    renderOptions();
    renderChips();
    if (resultEl && resultNoun) {
      const total = apply().length;
      resultEl.textContent = total > 0 ? resultNoun(total) : '';
    }
    updateSummary();
    restoreChipFocus(focused);
  }

  // Render inicial: la barra nace ya aplicada (sin filtros = todo visible).
  renderPanel();
  emit();

  return {
    update(nextItems: T[]): void {
      const focused = focusedChip();
      items = nextItems;
      visibleFacets = buildVisibleFacets();
      pruneInvalidState();
      renderPanel();
      restoreChipFocus(focused);
      emit();
    },
    getState(): FilterBarState {
      return snapshot();
    },
    reset(): void {
      state.query = '';
      state.selected = {};
      state.flags = {};
      sortFacets.forEach((facet) => { state.selected[facet.id] = facet.defaultValue; });
      if (input) input.value = '';
      renderPanel();
      emit();
    },
  };
}
