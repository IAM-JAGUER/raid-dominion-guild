// Orquestador del Task Tracker dentro del dashboard (#personajes).
// Une datos de las subidas SV, catálogo manual, filtros, selección, ficha en
// línea y catálogo. Sin GearScore ni acceso al WTF (solo Supabase).

import {
  applyTrackerTasks,
  getMyBands,
  saveCharacterTracker,
  setCharacterNotesPublic,
  setCharacterVisibility,
  setTrackerTask,
  trackerCatalogOp,
} from '@/lib/api';
import type { BandRow, TrackerCatalogRow, TrackerTaskState } from '@/types/database';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { trackerFichaHash, trackerCatalogHash, trackerHashView } from '@/lib/ui/tabs';
import { toast } from '@/lib/ui/toast';
import { createFilterBar, type Facet } from '@/lib/ui/filterBar';
import { createPaginator, PAGE_SIZE_GRID } from '@/lib/ui/paginator';
import { setAllCardTabs, renderTrackerCard } from '@/lib/ui/dashboard/trackerCards';
import { renderTrackerCatalog, type TrackerBulkAction } from '@/lib/ui/dashboard/trackerCatalog';
import { renderTrackerFicha } from '@/lib/ui/dashboard/trackerFicha';
import {
  computeProgress,
  emptyTasks,
  legendCounts,
  sortTrackerCharacters,
  trackerIdOf,
  type TrackerCharacter,
  type TrackerLegendCounts,
  type TrackerSortMode,
  type TrackerTaskTab,
} from '@/lib/ui/dashboard/trackerLogic';
import { iconEl } from '@/lib/ui/icons';

export interface TrackerInitOptions {
  // Recarga los datos desde Supabase (botón Actualizar).
  onReload: () => void | Promise<void>;
  // Cambios en visibilidad/validación del dueño (refresca select principal y chips).
  onOwnerChange: () => void;
  // Gate de publicación vigente (visitante sin validar).
  getCanPublish: () => boolean;
  // Abre el upload (CTA del estado vacío del catálogo).
  onUpload?: () => void;
}

export interface TrackerController {
  setData: (characters: TrackerCharacter[], catalog: TrackerCatalogRow[]) => void;
  openCatalog: () => void;
  refresh: () => void;
}

type Action = 'mark' | 'unmark' | 'activate' | 'deactivate';

const LEGEND_TABS: Array<{ id: TrackerTaskTab; label: string; icon: Parameters<typeof iconEl>[0] }> = [
  { id: 'active', label: 'Activas', icon: 'energia' },
  { id: 'marked', label: 'Marcadas', icon: 'validado' },
  { id: 'inactive', label: 'Inactivas', icon: 'bloqueo' },
  { id: 'instancias', label: 'Instancias', icon: 'reloj' },
  { id: 'monedas', label: 'Monedas', icon: 'cristal' },
];

export function initTracker(options: TrackerInitOptions): TrackerController {
  const rootEl = document.getElementById('tracker-root') as HTMLElement | null;
  const listView = document.getElementById('tracker-list-view') as HTMLElement | null;
  const subView = document.getElementById('tracker-subview') as HTMLElement | null;
  const filterMount = document.getElementById('tracker-filtro') as HTMLElement | null;
  const controlsMount = document.getElementById('tracker-controls') as HTMLElement | null;
  const selectionMount = document.getElementById('tracker-selection') as HTMLElement | null;
  const grid = document.getElementById('tracker-grid') as HTMLElement | null;
  const pagerMount = document.getElementById('tracker-pager') as HTMLElement | null;
  const legendMount = document.getElementById('tracker-legend') as HTMLElement | null;
  const countEl = document.getElementById('tracker-catalog-count') as HTMLElement | null;
  const refreshBtn = document.getElementById('tracker-refresh') as HTMLButtonElement | null;
  const catalogBtn = document.getElementById('tracker-catalog-btn') as HTMLButtonElement | null;
  const emptyEl = document.getElementById('tracker-empty') as HTMLElement | null;
  const catalogEmptyEl = document.getElementById('tracker-catalog-empty') as HTMLElement | null;
  const catalogEmptyBtn = document.getElementById('tracker-catalog-empty-btn') as HTMLButtonElement | null;

  if (!rootEl || !listView || !subView || !filterMount || !controlsMount || !grid) {
    return { setData: () => undefined, openCatalog: () => undefined, refresh: () => undefined };
  }

  // ── Estado ──────────────────────────────────────────────────────────────
  let characters: TrackerCharacter[] = [];
  let catalog: TrackerCatalogRow[] = [];
  let filteredCharacters: TrackerCharacter[] = [];
  let selected = new Set<string>();
  let collapsed = new Set<string>();
  const seeded = new Set<string>();
  let showHidden = false;
  let sortMode: TrackerSortMode = 'pending-desc';
  let activeTab: TrackerTaskTab = 'active';
  let currentPage = 1;
  let ready = false;
  let fichaId: string | null = null;
  let fichaTab = 'detalle';
  let catalogOpen = false;
  let listScroll = 0;
  let bandsCache: BandRow[] | null = null;
  let bandsLoading = false;
  let catalogView: ReturnType<typeof renderTrackerCatalog> | null = null;
  let lastFocus: HTMLElement | null = null;
  let sortSelect: HTMLSelectElement | null = null;
  let selectAll: HTMLInputElement | null = null;
  let hiddenCheck: HTMLInputElement | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function canPublish(): boolean {
    return options.getCanPublish();
  }

  function updateCatalogLabel(): void {
    if (countEl) countEl.textContent = String(catalog.length);
    if (catalogBtn) {
      catalogBtn.title = catalog.length === 0
        ? 'Crea tu catálogo manual de tareas'
        : `${catalog.length} tarea${catalog.length === 1 ? '' : 's'} en tu catálogo`;
    }
    if (emptyEl) emptyEl.classList.toggle('hidden', characters.length === 0);
    if (catalogEmptyEl) {
      catalogEmptyEl.classList.toggle('hidden', !(characters.length > 0 && catalog.length === 0));
    }
  }

  function taskStateOf(character: TrackerCharacter): TrackerTaskState {
    return character.tasks ?? emptyTasks();
  }

  function setTasks(character: TrackerCharacter, tasks: TrackerTaskState): void {
    character.tasks = tasks;
    character.progress = computeProgress(catalog.length, tasks);
  }

  function findCharacter(id: string): TrackerCharacter | undefined {
    return characters.find((c) => c.id === id);
  }

  function findCharacterBySlug(slug: string): TrackerCharacter | undefined {
    return characters.find((c) => c.slug === slug || c.id === slug);
  }

  function setHash(hash: string): void {
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }

  function expandCard(id: string): void {
    collapsed.delete(id);
  }

  async function handleVisibility(id: string, visible: boolean): Promise<{ ok: boolean }> {
    const character = findCharacter(id);
    if (!character) return { ok: false };
    try {
      const res = await setCharacterVisibility(id, visible);
      if (res.ok) {
        character.is_public = visible;
        options.onOwnerChange();
        toast.success(
          visible ? 'Personaje publicado' : 'Personaje ocultado',
          visible
            ? `${character.name} ahora es visible en el directorio público.`
            : `${character.name} ya no aparece en el directorio público.`,
        );
      } else {
        toast.error('No se pudo actualizar la visibilidad', res.error || 'Reintenta o recarga el portal.');
      }
      return { ok: res.ok };
    } catch {
      toast.error('No se pudo actualizar la visibilidad', 'Reintenta o recarga el portal.');
      return { ok: false };
    }
  }

  async function handleNotesPublic(id: string, visible: boolean): Promise<{ ok: boolean }> {
    const character = findCharacter(id);
    if (!character) return { ok: false };
    try {
      const res = await setCharacterNotesPublic(id, visible);
      if (res.ok) {
        character.notes_public = visible;
        options.onOwnerChange();
        toast.success(
          visible ? 'Nota publicada' : 'Nota oculta',
          visible
            ? `La nota del juego de ${character.name} es visible en su ficha pública.`
            : `La nota del juego de ${character.name} ya no se muestra en su ficha pública.`,
        );
      } else {
        toast.error('No se pudo actualizar la nota del juego', res.error || 'Reintenta o recarga el portal.');
      }
      return { ok: res.ok };
    } catch {
      toast.error('No se pudo actualizar la nota del juego', 'Reintenta o recarga el portal.');
      return { ok: false };
    }
  }

  async function handleSaveLocalNote(id: string, note: string): Promise<boolean> {
    const character = findCharacter(id);
    if (!character) return false;
    try {
      const res = await saveCharacterTracker(id, { note });
      if (!res.ok) {
        toast.error('No se pudo guardar la nota local', res.error || 'Reintenta.');
        return false;
      }
      character.trackerNote = res.note ?? note;
      return true;
    } catch {
      toast.error('No se pudo guardar la nota local', 'Reintenta.');
      return false;
    }
  }

  async function handleHidden(id: string, hidden: boolean): Promise<boolean> {
    const character = findCharacter(id);
    if (!character) return false;
    try {
      const res = await saveCharacterTracker(id, { hidden });
      if (!res.ok) {
        toast.error('No se pudo ocultar el personaje', res.error || 'Reintenta.');
        return false;
      }
      character.trackerHidden = hidden;
      if (hidden) toast.info('Oculto del tracker', `${character.name} queda fuera de la lista; actívalo con "Mostrar ocultos".`);
      else toast.info('Visible en el tracker', `${character.name} vuelve a la lista.`);
      if (!hidden) collapsed.delete(id);
      return true;
    } catch {
      toast.error('No se pudo ocultar el personaje', 'Reintenta.');
      return false;
    }
  }

  function taskPayload(op: Action, character: TrackerCharacter, taskId: string): { active: boolean; marked: boolean } {
    const active = new Set(taskStateOf(character).active);
    const marked = new Set(taskStateOf(character).marked);
    switch (op) {
      case 'mark':
        return { active: true, marked: true };
      case 'unmark':
        return { active: active.has(taskId), marked: false };
      case 'activate':
        return { active: true, marked: false };
      case 'deactivate':
        return { active: false, marked: false };
      default:
        return { active: active.has(taskId), marked: marked.has(taskId) };
    }
  }

  async function handleTaskToggle(id: string, op: Action, taskId: string): Promise<void> {
    const character = findCharacter(id);
    if (!character) return;
    const payload = taskPayload(op, character, taskId);
    let res: Awaited<ReturnType<typeof setTrackerTask>>;
    try {
      res = await setTrackerTask(id, taskId, payload.active, payload.marked);
    } catch {
      toast.error('No se pudo actualizar la tarea', 'Reintenta o recarga el portal.');
      throw new Error('task');
    }
    if (!res.ok) {
      toast.error('No se pudo actualizar la tarea', res.error || 'Reintenta o recarga el portal.');
      throw new Error(res.error || 'task');
    }
    const tasks = taskStateOf(character);
    const activeSet = new Set(tasks.active);
    const markedSet = new Set(tasks.marked);
    if (payload.active) activeSet.add(taskId);
    else activeSet.delete(taskId);
    if (payload.marked) markedSet.add(taskId);
    else markedSet.delete(taskId);
    setTasks(character, { active: Array.from(activeSet), marked: Array.from(markedSet) });
    if (op === 'activate') expandCard(id);
    refreshGrid();
    refreshFicha();
  }

  function applyStates(states: Record<string, TrackerTaskState>): void {
    Object.entries(states).forEach(([id, tasks]) => {
      const character = findCharacter(id);
      if (!character) return;
      setTasks(character, { active: tasks.active ?? [], marked: tasks.marked ?? [] });
    });
    refreshLegend();
    refreshGrid();
    refreshFicha();
  }

  function replaceCard(character: TrackerCharacter): void {
    const old = grid?.querySelector(`[data-character-id="${CSS.escape(character.id)}"]`);
    if (!old) {
      refreshGrid();
      return;
    }
    const next = renderTrackerCard(character, cardHandlers());
    old.replaceWith(next);
    updateSelectionUi();
  }

  function cardHandlers() {
    return {
      catalog,
      selected,
      collapsed,
      canPublish: canPublish(),
      activeTab,
      onToggleSelect: (id: string, checked: boolean) => {
        if (checked) selected.add(id);
        else selected.delete(id);
        const character = findCharacter(id);
        if (character) replaceCard(character);
        else updateSelectionUi();
      },
      onToggleCollapse: (id: string, next: boolean) => {
        if (next) collapsed.add(id);
        else collapsed.delete(id);
        const card = grid?.querySelector(`[data-character-id="${CSS.escape(id)}"]`);
        if (card) {
          const content = card.querySelector<HTMLElement>('[data-tracker-content]');
          const chevron = card.querySelector<HTMLElement>('[data-tracker-chevron]');
          const btn = card.querySelector<HTMLElement>('[data-tracker-collapse]');
          if (content) {
            ui.tracker.contentClosed.split(/\s+/).forEach((cls) => content.classList.toggle(cls, next));
            ui.tracker.contentOpen.split(/\s+/).forEach((cls) => content.classList.toggle(cls, !next));
          }
          if (chevron) chevron.classList.toggle('-rotate-90', next);
          if (btn) btn.setAttribute('aria-expanded', String(!next));
        }
      },
      onOpenFicha: (id: string) => openFicha(id),
      onTaskToggle: handleTaskToggle,
      onSaveLocalNote: handleSaveLocalNote,
      setVisibility: handleVisibility,
      setNotesPublic: handleNotesPublic,
    };
  }

  // ── Leyenda ─────────────────────────────────────────────────────────────
  function refreshLegend(): void {
    if (!legendMount) return;
    legendMount.classList.toggle('hidden', characters.length === 0);
    const counts: TrackerLegendCounts = legendCounts(characters, catalog.length);
    legendMount.textContent = '';
    const label = el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-400 mr-1', 'Leyenda');
    legendMount.appendChild(label);
    LEGEND_TABS.forEach((tab) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${ui.tracker.legendBtn} ${activeTab === tab.id ? ui.tracker.legendActive : ''}`;
      btn.dataset.legendTab = tab.id;
      btn.setAttribute('aria-pressed', String(activeTab === tab.id));
      btn.title = `Mostrar ${tab.label} en todas las tarjetas`;
      btn.appendChild(iconEl(tab.icon, { size: 'xs' }));
      btn.appendChild(el('span', '', tab.label));
      btn.appendChild(el('span', ui.tracker.legendCount, String(counts[tab.id])));
      btn.addEventListener('click', () => {
        activeTab = tab.id;
        refreshLegend();
        if (grid) setAllCardTabs(grid, tab.id);
      });
      legendMount.appendChild(btn);
    });
  }

  // ── Selección masiva ────────────────────────────────────────────────────
  function updateSelectionUi(): void {
    if (!selectAll) return;
    const ids = filteredCharacters.map((c) => c.id);
    const selectedVisible = ids.filter((id) => selected.has(id)).length;
    selectAll.disabled = ids.length === 0;
    selectAll.checked = ids.length > 0 && selectedVisible === ids.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < ids.length;
    renderSelectionDock();
  }

  function renderSelectionDock(): void {
    if (!selectionMount) return;
    selectionMount.textContent = '';
    selectionMount.classList.toggle('hidden', selected.size === 0);
    if (selected.size === 0) return;

    const info = el('span', 'text-[10px] font-black uppercase tracking-widest text-brand-200 mr-auto', `${selected.size} personaje${selected.size === 1 ? '' : 's'} seleccionado${selected.size === 1 ? '' : 's'}`);
    const action = document.createElement('select');
    action.className = ui.tracker.select;
    action.setAttribute('aria-label', 'Acción para la selección');
    [
      ['activate', 'Activar'],
      ['mark', 'Marcar'],
      ['deactivate', 'Desactivar'],
      ['reset', 'Reiniciar'],
    ].forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      action.appendChild(opt);
    });
    const task = document.createElement('select');
    task.className = ui.tracker.select;
    task.setAttribute('aria-label', 'Tarea para la selección');
    catalog.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      task.appendChild(opt);
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = `${ui.btnBase} ${ui.btnPrimary} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
    apply.textContent = 'Aplicar';
    apply.disabled = selected.size === 0 || (action.value !== 'reset' && catalog.length === 0);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = `${ui.btnBase} ${ui.btnGhost} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
    clear.textContent = 'Limpiar';
    apply.addEventListener('click', async () => {
      const act = action.value as TrackerBulkAction;
      if (act !== 'reset' && !task.value) {
        toast.warning('Elige una tarea', 'Crea tareas en el catálogo antes de aplicarlas.');
        return;
      }
      apply.disabled = true;
      const res = await applyTrackerTasks(act, act === 'reset' ? [] : [task.value], Array.from(selected));
      apply.disabled = false;
      if (!res.ok) {
        toast.error('No se pudo aplicar la acción', res.error || 'Reintenta.');
        return;
      }
      if (act === 'activate') Array.from(selected).forEach(expandCard);
      applyStates(res.states ?? {});
      toast.success('Acción aplicada', `${selected.size} personaje${selected.size === 1 ? '' : 's'} actualizado${selected.size === 1 ? '' : 's'}.`);
      selected.clear();
      refreshGrid();
    });
    clear.addEventListener('click', () => {
      selected.clear();
      refreshGrid();
    });
    action.addEventListener('change', () => {
      apply.disabled = selected.size === 0 || (action.value !== 'reset' && catalog.length === 0);
    });
    selectionMount.append(info, action, task, apply, clear);
  }

  // ── Filtros y controles ─────────────────────────────────────────────────
  function buildControls(): void {
    if (!controlsMount || controlsMount.dataset.ready === '1') return;
    controlsMount.dataset.ready = '1';
    controlsMount.className = 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-3';

    const left = el('div', 'flex flex-wrap items-center gap-2');
    const sortLabel = document.createElement('label');
    sortLabel.className = 'flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400';
    sortLabel.textContent = 'Ordenar';
    sortSelect = document.createElement('select');
    sortSelect.className = ui.tracker.select;
    sortSelect.setAttribute('aria-label', 'Ordenar personajes');
    [
      ['pending-desc', 'Más pendientes'],
      ['pending-asc', 'Menos pendientes'],
      ['ilvl-desc', 'Mayor iLvl'],
      ['ilvl-asc', 'Menor iLvl'],
      ['progress-desc', 'Más completadas'],
      ['seen-desc', 'Visto hace poco'],
      ['name', 'Nombre (A-Z)'],
    ].forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      sortSelect!.appendChild(opt);
    });
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect!.value as TrackerSortMode;
      currentPage = 1;
      refreshGrid();
    });
    sortLabel.appendChild(sortSelect);
    left.appendChild(sortLabel);

    const hiddenLabel = document.createElement('label');
    hiddenLabel.className = 'flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer select-none';
    hiddenCheck = document.createElement('input');
    hiddenCheck.type = 'checkbox';
    hiddenCheck.className = 'w-3.5 h-3.5 accent-brand-500';
    hiddenCheck.checked = showHidden;
    hiddenCheck.setAttribute('aria-label', 'Mostrar personajes ocultos del tracker');
    hiddenCheck.addEventListener('change', () => {
      showHidden = hiddenCheck!.checked;
      currentPage = 1;
      rebuildFilterBar();
    });
    hiddenLabel.append(hiddenCheck, document.createTextNode('Mostrar ocultos'));
    left.appendChild(hiddenLabel);

    const allLabel = document.createElement('label');
    allLabel.className = 'flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer select-none';
    selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAll.className = 'w-3.5 h-3.5 accent-brand-500';
    selectAll.setAttribute('aria-label', 'Seleccionar todos los personajes filtrados');
    selectAll.addEventListener('change', () => {
      const ids = filteredCharacters.map((c) => c.id);
      ids.forEach((id) => {
        if (selectAll!.checked) selected.add(id);
        else selected.delete(id);
      });
      refreshGrid();
    });
    allLabel.append(selectAll, document.createTextNode('Seleccionar todos'));
    left.appendChild(allLabel);
    controlsMount.appendChild(left);
  }

  function rebuildFilterBar(): void {
    if (!filterMount) return;
    const previousQuery = filterMount.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? '';
    filterMount.textContent = '';
    const visible = characters.filter((c) => showHidden || !c.trackerHidden);
    const facets: Array<Facet<TrackerCharacter>> = [
      {
        id: 'clase',
        label: 'Filtrar personajes por clase',
        getValues: (c) => (c.class ? [c.class] : []),
      },
      {
        id: 'reino',
        label: 'Filtrar personajes por reino',
        getValues: (c) => [(c.realm ?? '').trim()].filter(Boolean),
      },
      {
        kind: 'flag',
        id: 'publico',
        label: 'Filtrar personajes públicos',
        getFlag: (c) => c.is_public,
        chipLabel: 'Público',
        icon: 'visibilidad',
      },
      {
        kind: 'flag',
        id: 'validado',
        label: 'Filtrar personajes validados',
        getFlag: (c) => c.member_verified,
        chipLabel: 'Validado',
        icon: 'validado',
      },
    ];
    createFilterBar<TrackerCharacter>({
      mount: filterMount,
      items: visible,
      getSearchText: (c) => `${c.name} ${c.realm ?? ''} ${c.class ?? ''} ${c.sv_guild_name ?? ''}`,
      searchPlaceholder: 'Buscar personaje…',
      searchLabel: 'Buscar personajes por nombre, clase o reino',
      facets,
      resultNoun: (n) => `${n} personaje${n === 1 ? '' : 's'}`,
      onChange: (filtered) => {
        filteredCharacters = filtered;
        currentPage = 1;
        refreshGrid();
      },
    });
    if (previousQuery) {
      const input = filterMount.querySelector<HTMLInputElement>('input[type="search"]');
      if (input) {
        input.value = previousQuery;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // ── Grid ────────────────────────────────────────────────────────────────
  function seedCollapsed(): void {
    characters.forEach((character) => {
      if (seeded.has(character.id)) return;
      seeded.add(character.id);
      if (character.progress.active === 0 || character.progress.done >= character.progress.active) {
        collapsed.add(character.id);
      }
    });
  }

  function refreshGrid(): void {
    if (!grid) return;
    seedCollapsed();
    grid.textContent = '';
    if (pagerMount) pagerMount.textContent = '';
    const sorted = sortTrackerCharacters(filteredCharacters, sortMode, collapsed);
    if (sorted.length === 0) {
      const message = characters.length === 0
        ? 'Sube tu SavedVariables para ver tus personajes aquí.'
        : !showHidden && characters.some((c) => c.trackerHidden)
          ? 'No hay personajes visibles. Activa "Mostrar ocultos" para ver los que ocultaste del tracker.'
          : 'No hay personajes que coincidan con los filtros.';
      grid.appendChild(el('p', `${ui.text.bodyMuted} italic col-span-full py-4`, message));
      updateSelectionUi();
      refreshLegend();
      updateCatalogLabel();
      return;
    }
    const paginator = createPaginator({
      pageSize: PAGE_SIZE_GRID,
      totalItems: sorted.length,
      initialPage: currentPage,
      summary: `${sorted.length} personaje${sorted.length === 1 ? '' : 's'}`,
      renderPage: (page) => {
        currentPage = page;
        grid.textContent = '';
        const start = (page - 1) * PAGE_SIZE_GRID;
        sorted.slice(start, start + PAGE_SIZE_GRID).forEach((character) => {
          grid.appendChild(renderTrackerCard(character, cardHandlers()));
        });
        if (activeTab) setAllCardTabs(grid, activeTab);
      },
    });
    if (pagerMount && paginator.bar) pagerMount.appendChild(paginator.bar);
    paginator.update();
    updateSelectionUi();
    refreshLegend();
    updateCatalogLabel();
  }

  // ── Ficha y catálogo ────────────────────────────────────────────────────
  async function ensureBands(): Promise<BandRow[]> {
    if (bandsCache) return bandsCache;
    if (bandsLoading) return [];
    bandsLoading = true;
    const res = await getMyBands();
    bandsCache = res.ok ? (res.items ?? []) : [];
    bandsLoading = false;
    return bandsCache;
  }

  function currentFichaTab(): string {
    return fichaTab || 'detalle';
  }

  function renderFichaNow(): void {
    if (!subView || !fichaId) return;
    const character = findCharacter(fichaId);
    if (!character) return;
    const view = renderTrackerFicha({
      character,
      catalog,
      bands: bandsCache ?? [],
      handlers: {
        onClose: () => closeSubview(),
        canPublish: canPublish(),
        onTaskToggle: (op, taskId) => handleTaskToggle(fichaId as string, op, taskId),
        onSaveLocalNote: (note) => handleSaveLocalNote(fichaId as string, note),
        onToggleHidden: (hidden) => handleHidden(fichaId as string, hidden),
        onSetVisibility: (visible) => handleVisibility(fichaId as string, visible),
        onSetNotesPublic: (visible) => handleNotesPublic(fichaId as string, visible),
        onTabChange: (tabId) => { fichaTab = tabId; },
      },
    });
    subView.textContent = '';
    subView.appendChild(view.root);
    view.setTab(currentFichaTab());
    if (!bandsCache && !bandsLoading) {
      void ensureBands().then((bands) => {
        if (bands.length === 0) return;
        bandsCache = bands;
        if (fichaId && !subView.classList.contains('hidden')) renderFichaNow();
      });
    }
  }

  function openFicha(id: string, fromHash = false): void {
    const character = findCharacter(id);
    if (!fromHash) lastFocus = document.activeElement as HTMLElement | null;
    catalogOpen = false;
    if (!character) {
      if (fromHash) {
        closeSubview(false);
        setHash('#personajes');
      }
      return;
    }
    if (!fromHash) listScroll = window.scrollY || 0;
    fichaId = id;
    fichaTab = 'detalle';
    listView?.classList.add('hidden');
    subView?.classList.remove('hidden');
    if (subView) subView.textContent = '';
    renderFichaNow();
    if (!fromHash) setHash(trackerFichaHash(trackerIdOf(character)));
    rootEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      subView?.querySelector<HTMLButtonElement>('button')?.focus();
    }, 120);
  }

  function openCatalog(fromHash = false): void {
    if (!subView) return;
    if (!fromHash) lastFocus = document.activeElement as HTMLElement | null;
    catalogOpen = true;
    fichaId = null;
    listScroll = window.scrollY || 0;
    listView?.classList.add('hidden');
    subView.classList.remove('hidden');
    subView.textContent = '';
    catalogView = renderTrackerCatalog({
      onClose: () => closeSubview(),
      onAdd: async (label) => {
        const res = await trackerCatalogOp('add', { label });
        if (!res.ok) {
          toast.error('No se pudo añadir la tarea', res.error || 'Reintenta.');
          return false;
        }
        catalog = res.catalog ?? catalog;
        refreshAll();
        return true;
      },
      onRename: async (taskId, label) => {
        const res = await trackerCatalogOp('rename', { taskId, label });
        if (!res.ok) {
          toast.error('No se pudo renombrar la tarea', res.error || 'Reintenta.');
          return false;
        }
        catalog = res.catalog ?? catalog;
        refreshAll();
        return true;
      },
      onDuplicate: async (taskId) => {
        const res = await trackerCatalogOp('duplicate', { taskId });
        if (!res.ok) {
          toast.error('No se pudo duplicar la tarea', res.error || 'Reintenta.');
          return false;
        }
        catalog = res.catalog ?? catalog;
        refreshAll();
        return true;
      },
      onDelete: async (taskIds) => {
        const res = await trackerCatalogOp('remove', { taskIds });
        if (!res.ok) {
          toast.error('No se pudieron eliminar las tareas', res.error || 'Reintenta.');
          return false;
        }
        catalog = res.catalog ?? catalog;
        const ids = new Set(catalog.map((t) => t.id));
        characters.forEach((character) => {
          const tasks = taskStateOf(character);
          setTasks(character, {
            active: tasks.active.filter((id) => ids.has(id)),
            marked: tasks.marked.filter((id) => ids.has(id)),
          });
        });
        refreshAll();
        toast.success('Catálogo actualizado', 'Tareas eliminadas del catálogo y de todos los personajes.');
        return true;
      },
      onReorder: async (order) => {
        const res = await trackerCatalogOp('reorder', { order });
        if (!res.ok) {
          toast.error('No se pudo reordenar el catálogo', res.error || 'Reintenta.');
          return false;
        }
        catalog = res.catalog ?? catalog;
        refreshAll();
        return true;
      },
      onBulkApply: async (action, taskIds, scope) => {
        const ids = scope === 'all'
          ? characters.map((c) => c.id)
          : scope === 'filtered'
            ? filteredCharacters.map((c) => c.id)
            : fichaId
              ? [fichaId]
              : [];
        if (ids.length === 0) {
          toast.warning('Sin personajes', 'No hay personajes en el ámbito elegido.');
          return false;
        }
        const res = await applyTrackerTasks(action, taskIds, ids);
        if (!res.ok) {
          toast.error('No se pudo aplicar la acción', res.error || 'Reintenta.');
          return false;
        }
        if (action === 'activate') ids.forEach(expandCard);
        applyStates(res.states ?? {});
        toast.success('Acción aplicada', `${ids.length} personaje${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}.`);
        return true;
      },
    });
    subView.appendChild(catalogView.root);
    catalogView.update(catalog, characters);
    catalogView.setCurrentCharacter(null);
    if (!fromHash) setHash(trackerCatalogHash());
    rootEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      catalogView?.root.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    }, 120);
  }

  function closeSubview(updateHash = true): void {
    catalogOpen = false;
    fichaId = null;
    if (subView) {
      subView.textContent = '';
      subView.classList.add('hidden');
    }
    listView?.classList.remove('hidden');
    refreshGrid();
    if (updateHash) setHash('#personajes');
    window.scrollTo({ top: listScroll || 0, behavior: 'smooth' });
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else (catalogBtn ?? refreshBtn)?.focus();
    lastFocus = null;
  }

  function refreshFicha(): void {
    if (!fichaId || !subView || subView.classList.contains('hidden')) return;
    renderFichaNow();
  }

  function refreshCatalog(): void {
    if (!catalogOpen || !catalogView) return;
    catalogView.update(catalog, characters);
    catalogView.setCurrentCharacter(null);
  }

  function refreshAll(): void {
    updateCatalogLabel();
    refreshLegend();
    refreshGrid();
    refreshFicha();
    refreshCatalog();
  }

  // ── Hash / deep links ───────────────────────────────────────────────────
  function syncFromHash(): void {
    if (!ready) return;
    const view = trackerHashView(window.location.hash);
    if (view.view === 'ficha' && view.slug) {
      openFichaBySlug(view.slug, true);
      return;
    }
    if (view.view === 'catalogo') {
      if (!catalogOpen) openCatalog(true);
      return;
    }
    if (catalogOpen || fichaId) closeSubview(false);
  }

  function openFichaBySlug(slug: string, fromHash: boolean): void {
    const character = findCharacterBySlug(slug);
    if (!character) {
      closeSubview(false);
      setHash('#personajes');
      return;
    }
    openFicha(character.id, fromHash);
  }

  // ── Eventos globales ────────────────────────────────────────────────────
  refreshBtn?.addEventListener('click', async () => {
    if (!refreshBtn) return;
    const label = refreshBtn.innerHTML;
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Actualizando…';
    try {
      await options.onReload();
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = label;
    }
  });
  catalogBtn?.addEventListener('click', () => openCatalog());
  document.getElementById('tracker-empty-upload')?.addEventListener('click', () => {
    if (options.onUpload) options.onUpload();
  });
  catalogEmptyBtn?.addEventListener('click', () => openCatalog());
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (catalogOpen || fichaId) {
      ev.preventDefault();
      closeSubview();
    }
  });
  window.addEventListener('hashchange', syncFromHash);

  buildControls();

  return {
    setData(nextCharacters, nextCatalog) {
      characters = nextCharacters;
      catalog = nextCatalog;
      const ids = new Set(nextCharacters.map((c) => c.id));
      Array.from(selected).forEach((id) => { if (!ids.has(id)) selected.delete(id); });
      Array.from(collapsed).forEach((id) => { if (!ids.has(id)) collapsed.delete(id); });
      Array.from(seeded).forEach((id) => { if (!ids.has(id)) seeded.delete(id); });
      bandsCache = null;
      currentPage = 1;
      ready = true;
      rebuildFilterBar();
      refreshAll();
      syncFromHash();
    },
    openCatalog: () => openCatalog(),
    refresh: () => refreshAll(),
  };
}
