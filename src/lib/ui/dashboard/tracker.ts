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
  type TrackerApplyState,
} from '@/lib/api';
import type { BandRow, TrackerCatalogRow, TrackerTaskState } from '@/types/database';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { trackerFichaHash, trackerCatalogHash, trackerHashView } from '@/lib/ui/tabs';
import { toast } from '@/lib/ui/toast';
import {
  createFilterBar,
  type Facet,
  type FilterBarController,
  type FilterBarState,
} from '@/lib/ui/filterBar';
import { createPaginator, PAGE_SIZE_GRID } from '@/lib/ui/paginator';
import { setAllCardTabs, renderTrackerCard } from '@/lib/ui/dashboard/trackerCards';
import { renderTrackerCatalog } from '@/lib/ui/dashboard/trackerCatalog';
import { renderTrackerFicha } from '@/lib/ui/dashboard/trackerFicha';
import {
  compareTrackerCharacters,
  computeProgress,
  emptyTasks,
  justCompleted,
  justPending,
  legendCounts,
  matchesTrackerCriterion,
  splitTrackerPage,
  trackerIdOf,
  TRACKER_ACTION_CRITERIA,
  TRACKER_TASK_CRITERIA,
  type TrackerCharacter,
  type TrackerLegendCounts,
  type TrackerProgress,
  type TrackerQuickCriterion,
  type TrackerSortMode,
  type TrackerTaskTab,
} from '@/lib/ui/dashboard/trackerLogic';
import { iconEl } from '@/lib/ui/icons';
import { revealCards, revealEl } from '@/lib/ui/reveal';

export interface TrackerInitOptions {
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
}

type Action = 'mark' | 'unmark' | 'activate' | 'deactivate';
type DockAction = Action | 'reset' | 'expand' | 'collapse' | 'hide' | 'show';

const SORT_OPTIONS: Array<[TrackerSortMode, string]> = [
  ['pending-desc', 'Más pendientes'],
  ['pending-asc', 'Menos pendientes'],
  ['ilvl-desc', 'Mayor iLvl'],
  ['ilvl-asc', 'Menor iLvl'],
  ['progress-desc', 'Más completadas'],
  ['seen-desc', 'Visto hace poco'],
  ['name', 'Nombre'],
];

const TASK_ACTIONS: DockAction[] = ['activate', 'mark', 'unmark', 'deactivate'];

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
  const filterToggle = document.getElementById('tracker-filters-toggle') as HTMLButtonElement | null;
  const filterCount = document.getElementById('tracker-filters-count') as HTMLElement | null;
  const selectionMount = document.getElementById('tracker-selection') as HTMLElement | null;
  const grid = document.getElementById('tracker-grid') as HTMLElement | null;
  const pagerMount = document.getElementById('tracker-pager') as HTMLElement | null;
  const legendMount = document.getElementById('tracker-legend') as HTMLElement | null;
  const characterCountEl = document.getElementById('tracker-personajes-count') as HTMLElement | null;
  const catalogBtn = document.getElementById('tracker-catalog-btn') as HTMLButtonElement | null;
  const emptyEl = document.getElementById('tracker-empty') as HTMLElement | null;
  const catalogEmptyEl = document.getElementById('tracker-catalog-empty') as HTMLElement | null;
  const catalogEmptyBtn = document.getElementById('tracker-catalog-empty-btn') as HTMLButtonElement | null;

  if (!rootEl || !listView || !subView || !filterMount || !grid) {
    return { setData: () => undefined, openCatalog: () => undefined };
  }

  const filterHost = filterMount;
  const groupExpanded =
    grid.querySelector<HTMLElement>('[data-tracker-group="expanded"]') ??
    el('div', ui.tracker.group);
  const groupCollapsed =
    grid.querySelector<HTMLElement>('[data-tracker-group="collapsed"]') ??
    el('div', ui.tracker.group);
  if (!groupExpanded.parentElement) grid.appendChild(groupExpanded);
  if (!groupCollapsed.parentElement) grid.appendChild(groupCollapsed);

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
  let hiddenCheck: HTMLInputElement | null = null;
  let filterBar: FilterBarController<TrackerCharacter> | null = null;
  let filterExtras: HTMLElement | null = null;
  let filterState: FilterBarState = { query: '', selected: {}, flags: {}, active: false };
  let quickCriteria: HTMLSelectElement | null = null;
  let quickTask: HTMLSelectElement | null = null;
  let quickAdditive: HTMLInputElement | null = null;
  let quickApply: HTMLButtonElement | null = null;
  let dockCount: HTMLElement | null = null;
  let dockAction: HTMLSelectElement | null = null;
  let dockTask: HTMLSelectElement | null = null;
  let dockApply: HTMLButtonElement | null = null;
  let revealedCards = false;
  let dockVisible = false;
  const moveAnimations = new WeakMap<HTMLElement, Animation>();

  // ── Helpers ─────────────────────────────────────────────────────────────
  function canPublish(): boolean {
    return options.getCanPublish();
  }

  function updateCharacterCount(total: number): void {
    if (characterCountEl) characterCountEl.textContent = String(total);
  }

  function updateCatalogLabel(): void {
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

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function cardById(id: string): HTMLElement | null {
    return grid?.querySelector<HTMLElement>(`[data-character-id="${CSS.escape(id)}"]`) ?? null;
  }

  // Rectángulos actuales por id: sirven para FLIP incluso si la página se
  // re-renderiza (las tarjetas nuevas heredan la posición anterior).
  function cardRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    if (!grid) return rects;
    grid.querySelectorAll<HTMLElement>('[data-character-id]').forEach((card) => {
      const id = card.dataset.characterId;
      if (id) rects.set(id, card.getBoundingClientRect());
    });
    return rects;
  }

  // FLIP con Web Animations API (~320 ms). Cancela la animación previa de
  // cada tarjeta y respeta reduced-motion.
  function animateCardMoves(firstRects: Map<string, DOMRect>): void {
    if (!grid || firstRects.size === 0 || prefersReducedMotion()) return;
    grid.querySelectorAll<HTMLElement>('[data-character-id]').forEach((card) => {
      const id = card.dataset.characterId;
      const first = id ? firstRects.get(id) : undefined;
      if (!first) return;
      const last = card.getBoundingClientRect();
      if (last.width === 0 || last.height === 0) return;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const previous = moveAnimations.get(card);
      if (previous) previous.cancel();
      card.style.willChange = 'transform';
      card.style.zIndex = '2';
      const anim = card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
      moveAnimations.set(card, anim);
      const done = (): void => {
        if (moveAnimations.get(card) !== anim) return;
        moveAnimations.delete(card);
        card.style.willChange = '';
        card.style.zIndex = '';
      };
      anim.addEventListener('finish', done);
      anim.addEventListener('cancel', done);
    });
  }

  function syncGroupVisibility(): void {
    groupExpanded.classList.toggle('hidden', groupExpanded.childElementCount === 0);
    groupCollapsed.classList.toggle('hidden', groupCollapsed.childElementCount === 0);
  }

  function applyCardCollapsed(card: HTMLElement, next: boolean): void {
    const content = card.querySelector<HTMLElement>('[data-tracker-content]');
    const inner = content?.firstElementChild as HTMLElement | null;
    const chevron = card.querySelector<HTMLElement>('[data-tracker-chevron]');
    const btn = card.querySelector<HTMLElement>('[data-tracker-collapse]');
    if (content) {
      ui.tracker.contentClosed.split(/\s+/).forEach((cls) => content.classList.toggle(cls, next));
      ui.tracker.contentOpen.split(/\s+/).forEach((cls) => content.classList.toggle(cls, !next));
    }
    if (inner) {
      ui.tracker.contentInnerClosed.split(/\s+/).forEach((cls) => inner.classList.toggle(cls, next));
    }
    if (chevron) chevron.classList.toggle('-rotate-90', next);
    if (btn) {
      btn.setAttribute('aria-expanded', String(!next));
      btn.title = next ? 'Expandir personaje' : 'Contraer personaje';
    }
  }

  // Inserta la tarjeta en su grupo respetando el orden activo (sin sesgo de
  // colapso: dentro del grupo manda compareTrackerCharacters).
  function placeCardInGroup(card: HTMLElement, group: HTMLElement, character: TrackerCharacter): void {
    if (card.parentElement === group) return;
    const siblings = Array.from(group.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== card,
    );
    for (const sibling of siblings) {
      const otherId = sibling.dataset.characterId;
      const other = otherId ? findCharacter(otherId) : undefined;
      if (other && compareTrackerCharacters(character, other, sortMode) < 0) {
        group.insertBefore(card, sibling);
        return;
      }
    }
    group.appendChild(card);
  }

  function setCollapsedMany(ids: string[], next: boolean, animate = true): void {
    if (ids.length === 0) return;
    const rects = animate ? cardRects() : null;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ids.forEach((id) => {
      if (next) collapsed.add(id);
      else collapsed.delete(id);
      const character = findCharacter(id);
      const card = cardById(id);
      if (!character || !card) return;
      applyCardCollapsed(card, next);
      placeCardInGroup(card, next ? groupCollapsed : groupExpanded, character);
    });
    syncGroupVisibility();
    if (focused && document.contains(focused)) focused.focus({ preventScroll: true });
    if (rects) animateCardMoves(rects);
  }

  function collapseCards(ids: string[]): void {
    setCollapsedMany(ids, true);
  }

  function expandCards(ids: string[]): void {
    setCollapsedMany(ids, false);
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
      if (!hidden) collapsed.delete(id);
      // El filtro debe ver el nuevo estado: si "Mostrar ocultos" está apagado,
      // la tarjeta desaparece del grid y de filteredCharacters.
      syncFilterBar();
      refreshLegend();
      refreshFicha();
      if (hidden) toast.info('Oculto del tracker', `${character.name} queda fuera de la lista; actívalo con "Ocultos".`);
      else toast.info('Visible en el tracker', `${character.name} vuelve a la lista.`);
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
    const before: TrackerProgress = { ...character.progress };
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
    if (justCompleted(before, character.progress)) collapsed.add(id);
    else if (op === 'activate' || justPending(before, character.progress)) collapsed.delete(id);
    const rects = cardRects();
    refreshGrid();
    animateCardMoves(rects);
    refreshFicha();
  }

  function applyStates(states: Record<string, TrackerApplyState>): void {
    const hasTaskState = (state: TrackerApplyState | undefined): boolean =>
      !!state && (state.active !== undefined || state.marked !== undefined);
    const before = new Map<string, TrackerProgress>();
    Object.entries(states).forEach(([id, state]) => {
      if (!hasTaskState(state)) return;
      const character = findCharacter(id);
      if (character) before.set(id, { ...character.progress });
    });

    const rects = cardRects();
    let hiddenChanged = false;
    Object.entries(states).forEach(([id, state]) => {
      const character = findCharacter(id);
      if (!character) return;
      if (typeof state.hidden === 'boolean') {
        character.trackerHidden = state.hidden;
        hiddenChanged = true;
      }
      // Una respuesta de solo visibilidad NO trae active/marked: conservar las
      // tareas existentes en vez de borrarlas con arrays vacíos.
      if (!hasTaskState(state)) return;
      setTasks(character, {
        active: state.active ?? [],
        marked: state.marked ?? [],
      });
    });

    before.forEach((previous, id) => {
      const character = findCharacter(id);
      if (!character) return;
      if (justCompleted(previous, character.progress)) collapsed.add(id);
      else if (justPending(previous, character.progress)) collapsed.delete(id);
    });

    // syncFilterBar emite onChange y refresca el grid con el nuevo set visible.
    if (hiddenChanged) syncFilterBar();
    else refreshGrid();
    animateCardMoves(rects);
    refreshLegend();
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
        setCollapsedMany([id], next);
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
    updateSelectionDock();
  }

  function syncDockTaskOptions(): void {
    if (!dockTask) return;
    const previous = dockTask.value;
    const key = catalog.map((task) => `${task.id}\u0000${task.label}`).join('|');
    if (dockTask.dataset.catalogKey === key) return;
    dockTask.dataset.catalogKey = key;
    dockTask.textContent = '';
    catalog.forEach((task) => {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.label;
      dockTask!.appendChild(option);
    });
    if (catalog.some((task) => task.id === previous)) dockTask.value = previous;
  }

  function syncDockControls(): void {
    if (!dockAction) return;
    const action = dockAction.value as DockAction;
    const isTask = TASK_ACTIONS.includes(action);
    if (dockTask) {
      dockTask.hidden = !isTask;
      dockTask.disabled = !isTask || catalog.length === 0;
      dockTask.setAttribute('aria-hidden', String(!isTask));
    }
    if (dockApply) {
      dockApply.disabled = selected.size === 0 || (isTask && catalog.length === 0);
    }
  }

  function buildSelectionDock(): void {
    if (!selectionMount || selectionMount.dataset.ready === '1') return;
    selectionMount.dataset.ready = '1';
    selectionMount.textContent = '';

    dockCount = el('span', ui.tracker.dockCount, '');
    dockCount.setAttribute('role', 'status');
    dockCount.setAttribute('aria-live', 'polite');
    dockCount.setAttribute('aria-atomic', 'true');

    dockAction = document.createElement('select');
    dockAction.className = `${ui.tracker.select} max-w-[12rem]`;
    dockAction.setAttribute('aria-label', 'Acción para la selección');
    const groups: Array<{ label: string; options: Array<[DockAction, string]> }> = [
      {
        label: 'Tareas',
        options: [
          ['activate', 'Activar'],
          ['mark', 'Marcar'],
          ['unmark', 'Desmarcar'],
          ['deactivate', 'Desactivar'],
          ['reset', 'Reiniciar'],
        ],
      },
      {
        label: 'Tarjetas',
        options: [
          ['expand', 'Desplegar'],
          ['collapse', 'Colapsar'],
        ],
      },
      {
        label: 'Visibilidad',
        options: [
          ['hide', 'Ocultar'],
          ['show', 'Mostrar'],
        ],
      },
    ];
    groups.forEach((group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.options.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        optgroup.appendChild(option);
      });
      dockAction!.appendChild(optgroup);
    });

    dockTask = document.createElement('select');
    dockTask.className = `${ui.tracker.select} min-w-0 max-w-[12rem]`;
    dockTask.setAttribute('aria-label', 'Tarea para la selección');

    dockApply = document.createElement('button');
    dockApply.type = 'button';
    dockApply.className = `${ui.btnBase} ${ui.btnPrimary} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
    dockApply.textContent = 'Aplicar';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = `${ui.btnBase} ${ui.btnGhost} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
    clear.textContent = 'Limpiar';

    dockAction.addEventListener('change', syncDockControls);
    dockApply.addEventListener('click', () => { void handleDockApply(); });
    clear.addEventListener('click', clearSelection);
    selectionMount.append(dockCount, dockAction, dockTask, dockApply, clear);
    syncDockTaskOptions();
    syncDockControls();
  }

  function clearSelection(): void {
    selected.clear();
    refreshGrid();
    (filterToggle ?? catalogBtn)?.focus({ preventScroll: true });
  }

  function updateSelectionDock(): void {
    if (!selectionMount) return;
    buildSelectionDock();
    const count = selected.size;
    if (count === 0) {
      selectionMount.classList.add('hidden');
      dockVisible = false;
      return;
    }
    if (!dockVisible) {
      selectionMount.classList.remove('hidden');
      revealEl(selectionMount);
      dockVisible = true;
    } else {
      selectionMount.classList.remove('hidden');
    }
    if (dockCount) {
      dockCount.textContent = `${count} personaje${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}`;
    }
    syncDockTaskOptions();
    syncDockControls();
  }

  function visibilityErrorMessage(error?: string): string {
    const message = error ?? '';
    if (
      /could not find the function|function .* does not exist|schema cache|Acción no soportada/i.test(message) ||
      /raiddominion_tracker_apply/i.test(message)
    ) {
      return 'La migración 20261026_tracker_apply_visibility.sql aún no está aplicada. Aplícala en Supabase y reintenta.';
    }
    return message || 'Reintenta o recarga el portal.';
  }

  async function handleDockApply(): Promise<void> {
    if (!dockAction) return;
    const action = dockAction.value as DockAction;
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    if (action === 'expand' || action === 'collapse') {
      if (action === 'expand') expandCards(ids);
      else collapseCards(ids);
      syncDockControls();
      toast.success(
        action === 'expand' ? 'Tarjetas desplegadas' : 'Tarjetas colapsadas',
        `${ids.length} personaje${ids.length === 1 ? '' : 's'} · la selección se mantiene.`,
      );
      return;
    }

    if (!dockApply) return;
    dockApply.disabled = true;
    try {
      if (action === 'hide' || action === 'show') {
        const res = await applyTrackerTasks(action, [], ids);
        if (!res.ok) {
          toast.error('No se pudo cambiar la visibilidad', visibilityErrorMessage(res.error));
          return;
        }
        const states = res.states ?? {};
        if (Object.keys(states).length === 0) {
          toast.error(
            'No se pudo cambiar la visibilidad',
            'La RPC no devolvió el estado de los personajes. Revisa que la migración 20261026 esté aplicada.',
          );
          return;
        }
        applyStates(states);
        // La selección se conserva a propósito para poder mostrar/ocultar en lote.
        toast.success(
          action === 'hide' ? 'Personajes ocultos' : 'Personajes visibles',
          `${ids.length} personaje${ids.length === 1 ? '' : 's'} · la selección se mantiene.`,
        );
        return;
      }

      const taskAction = action as Action | 'reset';
      const isReset = taskAction === 'reset';
      const taskId = isReset ? '' : (dockTask?.value ?? '');
      if (!isReset && !taskId) {
        toast.warning('Elige una tarea', 'Crea tareas en el catálogo antes de aplicarlas.');
        return;
      }
      const res = await applyTrackerTasks(taskAction, isReset ? [] : [taskId], ids);
      if (!res.ok) {
        toast.error('No se pudo aplicar la acción', res.error || 'Reintenta.');
        return;
      }
      applyStates(res.states ?? {});
      if (taskAction === 'activate') expandCards(ids);
      toast.success('Acción aplicada', `${ids.length} personaje${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}.`);
      clearSelection();
    } finally {
      syncDockControls();
    }
  }

  // ── Filtros y selección rápida (modelo wow-rd) ──────────────────────────
  function activeFilterCount(state: FilterBarState): number {
    let count = state.query.trim() ? 1 : 0;
    Object.entries(state.selected).forEach(([id, value]) => {
      if (!value) return;
      if (id === 'orden') {
        if (value !== SORT_OPTIONS[0][0]) count += 1;
      } else {
        count += 1;
      }
    });
    Object.values(state.flags).forEach((active) => { if (active) count += 1; });
    return count;
  }

  function updateFilterBadge(state = filterState): void {
    const count = activeFilterCount(state);
    if (filterCount) {
      filterCount.textContent = String(count);
      filterCount.classList.toggle('hidden', count === 0);
    }
    if (filterToggle) {
      filterToggle.setAttribute('aria-expanded', String(!filterHost.classList.contains('hidden')));
      filterToggle.title = filterHost.classList.contains('hidden')
        ? 'Mostrar filtros y selección rápida'
        : 'Ocultar filtros y selección rápida';
    }
  }

  function setFilterPanelOpen(open: boolean): void {
    filterHost.classList.toggle('hidden', !open);
    if (filterToggle) {
      filterToggle.setAttribute('aria-expanded', String(open));
      filterToggle.title = open ? 'Ocultar filtros y selección rápida' : 'Mostrar filtros y selección rápida';
    }
    if (open) revealEl(filterHost);
    else if (filterHost.contains(document.activeElement)) filterToggle?.focus({ preventScroll: true });
  }

  function buildQuickTaskOptions(): void {
    if (!quickTask) return;
    const previous = quickTask.value;
    const key = catalog.map((task) => `${task.id}\u0000${task.label}`).join('|');
    if (quickTask.dataset.catalogKey === key) return;
    quickTask.dataset.catalogKey = key;
    quickTask.textContent = '';
    catalog.forEach((task) => {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.label;
      quickTask!.appendChild(option);
    });
    if (catalog.some((task) => task.id === previous)) quickTask.value = previous;
  }

  function syncQuickSelection(): void {
    if (!quickCriteria) return;
    const criterion = quickCriteria.value as TrackerQuickCriterion | '';
    const wantsTask = criterion !== '' && TRACKER_TASK_CRITERIA.has(criterion);
    const isAction = criterion !== '' && TRACKER_ACTION_CRITERIA.has(criterion);
    if (quickTask) {
      if (wantsTask) buildQuickTaskOptions();
      quickTask.hidden = !wantsTask;
      quickTask.disabled = !wantsTask || catalog.length === 0;
      quickTask.setAttribute('aria-hidden', String(!wantsTask));
    }
    if (quickAdditive) quickAdditive.disabled = !criterion || isAction;
    if (quickApply) {
      quickApply.disabled = !criterion
        || (wantsTask && (catalog.length === 0 || !quickTask?.value));
    }
  }

  function applyQuickSelection(): void {
    if (!quickCriteria) return;
    const criterion = quickCriteria.value as TrackerQuickCriterion | '';
    if (!criterion) return;

    if (criterion === 'clear') {
      selected.clear();
      refreshGrid();
      toast.info('Selección vacía');
      return;
    }

    if (criterion === 'none') {
      const total = filteredCharacters.length;
      filteredCharacters.forEach((character) => selected.delete(character.id));
      refreshGrid();
      toast.info(`Quitados ${total} personaje${total === 1 ? '' : 's'} de la selección`);
      return;
    }

    if (criterion === 'invert') {
      filteredCharacters.forEach((character) => {
        if (selected.has(character.id)) selected.delete(character.id);
        else selected.add(character.id);
      });
      refreshGrid();
      toast.info(`Selección invertida · ${filteredCharacters.length} visible${filteredCharacters.length === 1 ? '' : 'es'}`);
      return;
    }

    const wantsTask = TRACKER_TASK_CRITERIA.has(criterion);
    const taskId = wantsTask ? (quickTask?.value ?? '') : '';
    if (wantsTask && !taskId) {
      toast.warning('Elige una tarea', 'Selecciona la tarea del criterio antes de aplicar.');
      return;
    }
    const additive = quickAdditive?.checked ?? true;
    const ids = filteredCharacters
      .filter((character) => matchesTrackerCriterion(character, criterion, taskId, collapsed))
      .map((character) => character.id);
    if (!additive) selected.clear();
    ids.forEach((id) => selected.add(id));
    refreshGrid();
    if (ids.length === 0) {
      toast.info(additive ? 'Ningún personaje visible cumple el criterio' : 'Ningún personaje visible cumple el criterio; selección vacía');
    } else {
      toast.success('Selección aplicada', `${ids.length} personaje${ids.length === 1 ? '' : 's'} seleccionado${ids.length === 1 ? '' : 's'}.`);
    }
  }

  function buildFilterExtras(): void {
    const mount = filterExtras;
    if (!mount || mount.dataset.ready === '1') return;
    mount.dataset.ready = '1';

    const hiddenLabel = document.createElement('label');
    hiddenLabel.className = ui.tracker.filterOptionLabel;
    hiddenCheck = document.createElement('input');
    hiddenCheck.type = 'checkbox';
    hiddenCheck.className = ui.tracker.filterCheckbox;
    hiddenCheck.checked = showHidden;
    hiddenCheck.setAttribute('aria-label', 'Mostrar personajes ocultos del tracker');
    hiddenCheck.addEventListener('change', () => {
      showHidden = hiddenCheck!.checked;
      currentPage = 1;
      syncFilterBar();
    });
    hiddenLabel.title = 'Incluir en la lista los personajes ocultos';
    hiddenLabel.append(hiddenCheck, document.createTextNode('Ocultos'));
    mount.appendChild(hiddenLabel);

    quickCriteria = document.createElement('select');
    quickCriteria.className = `${ui.filter.select} ${ui.focusRing}`;
    quickCriteria.setAttribute('aria-label', 'Criterio de selección rápida');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Criterio…';
    quickCriteria.appendChild(placeholder);
    const criteriaGroups: Array<{ label: string; options: Array<[TrackerQuickCriterion, string]> }> = [
      {
        label: 'Visibles',
        options: [
          ['all', 'Todos los visibles'],
          ['none', 'Quitar visibles'],
        ],
      },
      {
        label: 'Tarjeta',
        options: [
          ['expanded', 'Desplegadas'],
          ['collapsed', 'Colapsadas'],
        ],
      },
      {
        label: 'Progreso',
        options: [
          ['pending', 'Con pendientes'],
          ['done', 'Sin pendientes'],
          ['empty', 'Sin tareas activas'],
        ],
      },
      {
        label: 'Datos',
        options: [
          ['notes', 'Con notas'],
          ['no-notes', 'Sin notas'],
          ['ilvl', 'Con iLvl'],
          ['no-ilvl', 'Sin iLvl'],
          ['instances', 'Con instancias'],
          ['no-instances', 'Sin instancias'],
        ],
      },
      {
        label: 'Visibilidad',
        options: [
          ['public', 'Públicos'],
          ['private', 'Privados'],
          ['validated', 'Validados'],
          ['unvalidated', 'Sin validar'],
        ],
      },
      {
        label: 'Tareas',
        options: [
          ['task-active', 'Con tarea activa…'],
          ['task-pending', 'Con tarea pendiente…'],
          ['task-marked', 'Con tarea marcada…'],
          ['task-inactive', 'Sin tarea activa…'],
        ],
      },
      {
        label: 'Selección actual',
        options: [
          ['invert', 'Invertir visibles'],
          ['clear', 'Limpiar selección'],
        ],
      },
    ];
    criteriaGroups.forEach((group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.options.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        optgroup.appendChild(option);
      });
      quickCriteria!.appendChild(optgroup);
    });
    mount.appendChild(quickCriteria);

    quickTask = document.createElement('select');
    quickTask.className = `${ui.filter.select} ${ui.focusRing}`;
    quickTask.setAttribute('aria-label', 'Tarea del criterio de selección');
    quickTask.hidden = true;
    quickTask.disabled = true;
    quickTask.setAttribute('aria-hidden', 'true');
    mount.appendChild(quickTask);

    const additiveLabel = document.createElement('label');
    additiveLabel.className = ui.tracker.filterOptionLabel;
    additiveLabel.title = 'Sumar a la selección actual; desmarca para reemplazarla';
    quickAdditive = document.createElement('input');
    quickAdditive.type = 'checkbox';
    quickAdditive.className = ui.tracker.filterCheckbox;
    quickAdditive.checked = true;
    quickAdditive.disabled = true;
    additiveLabel.append(quickAdditive, document.createTextNode('Sumar'));
    mount.appendChild(additiveLabel);

    quickApply = document.createElement('button');
    quickApply.type = 'button';
    quickApply.className = `${ui.btnBase} ${ui.btnPrimary} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
    quickApply.textContent = 'Aplicar';
    quickApply.disabled = true;
    mount.appendChild(quickApply);

    quickCriteria.addEventListener('change', syncQuickSelection);
    quickTask.addEventListener('change', syncQuickSelection);
    quickApply.addEventListener('click', applyQuickSelection);
    buildQuickTaskOptions();
    syncQuickSelection();
    updateSelectionUi();
  }

  function buildFilterShell(): void {
    filterHost.classList.add('hidden');
    if (filterToggle && filterToggle.dataset.ready !== '1') {
      filterToggle.dataset.ready = '1';
      filterToggle.addEventListener('click', () => setFilterPanelOpen(filterHost.classList.contains('hidden')));
    }
    filterHost.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || filterHost.classList.contains('hidden')) return;
      event.preventDefault();
      setFilterPanelOpen(false);
    });
    updateFilterBadge();
  }

  function visibleCharacters(): TrackerCharacter[] {
    return characters.filter((c) => showHidden || !c.trackerHidden);
  }

  // Controlador creado UNA vez: update() recalcula facetas y conserva query,
  // selección, flags, orden y el input (foco incluido).
  function syncFilterBar(): void {
    const visible = visibleCharacters();
    if (!filterBar) {
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
          id: 'hermandad',
          label: 'Filtrar personajes por hermandad',
          getValues: (c) => [(c.sv_guild_name ?? '').trim()].filter(Boolean),
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
        {
          kind: 'sort',
          id: 'orden',
          label: 'Orden',
          options: SORT_OPTIONS.map(([value, label]) => ({ value, label })),
          defaultValue: SORT_OPTIONS[0][0],
        },
      ];
      const extras = el('div', ui.filter.extraGroup);
      filterExtras = extras;
      filterBar = createFilterBar<TrackerCharacter>({
        mount: filterHost,
        items: visible,
        panel: 'inline',
        extra: extras,
        getSearchText: (c) => `${c.name} ${c.realm ?? ''} ${c.class ?? ''} ${c.sv_guild_name ?? ''}`,
        searchPlaceholder: 'Buscar personaje…',
        searchLabel: 'Buscar personajes por nombre, clase o reino',
        facets,
        onChange: (filtered, state) => {
          filteredCharacters = filtered;
          filterState = state;
          sortMode = (state.selected.orden as TrackerSortMode) ?? SORT_OPTIONS[0][0];
          currentPage = 1;
          updateFilterBadge(state);
          refreshGrid();
        },
      });
      buildFilterExtras();
    } else {
      filterBar.update(visible);
      buildQuickTaskOptions();
      syncQuickSelection();
    }
    updateFilterBadge();
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
    if (pagerMount) pagerMount.textContent = '';
    groupExpanded.textContent = '';
    groupCollapsed.textContent = '';
    grid.querySelector('[data-tracker-empty]')?.remove();

    // Primero se pagina por modo (sin sesgo de colapso); después cada página
    // se reparte en sus dos grupos. Colapsar no cambia de página.
    const sorted = filteredCharacters
      .slice()
      .sort((a, b) => compareTrackerCharacters(a, b, sortMode));

    updateCharacterCount(sorted.length);

    if (sorted.length === 0) {
      syncGroupVisibility();
      const message = characters.length === 0
        ? 'Sube tu SavedVariables para ver tus personajes aquí.'
        : !showHidden && characters.some((c) => c.trackerHidden)
          ? 'No hay personajes visibles. Activa "Ocultos" para ver los que ocultaste del tracker.'
          : 'No hay personajes que coincidan con los filtros.';
      const empty = el('p', `${ui.text.bodyMuted} italic py-4`, message);
      empty.dataset.trackerEmpty = '';
      grid.appendChild(empty);
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
        groupExpanded.textContent = '';
        groupCollapsed.textContent = '';
        grid.querySelector('[data-tracker-empty]')?.remove();
        const start = (page - 1) * PAGE_SIZE_GRID;
        const pageItems = sorted.slice(start, start + PAGE_SIZE_GRID);
        const groups = splitTrackerPage(pageItems, collapsed);
        groups.expanded.forEach((character) => {
          groupExpanded.appendChild(renderTrackerCard(character, cardHandlers()));
        });
        groups.collapsed.forEach((character) => {
          groupCollapsed.appendChild(renderTrackerCard(character, cardHandlers()));
        });
        syncGroupVisibility();
        if (activeTab) setAllCardTabs(grid, activeTab);
        // Reveal inicial UNA sola vez; teclado/filtros/re-render no re-animan.
        if (!revealedCards && pageItems.length > 0) {
          revealedCards = true;
          revealCards(grid);
        }
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
        applyStates(res.states ?? {});
        if (action === 'activate') expandCards(ids);
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
    else catalogBtn?.focus();
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
    syncQuickSelection();
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

  buildFilterShell();

  return {
    setData(nextCharacters, nextCatalog) {
      // Progreso previo por id: los cambios hechos fuera de la web (rescaneo
      // o recarga) también colapsan al completar y expanden al reabrir.
      const previous = new Map<string, TrackerProgress>();
      characters.forEach((character) => previous.set(character.id, { ...character.progress }));

      characters = nextCharacters;
      catalog = nextCatalog;
      const ids = new Set(nextCharacters.map((c) => c.id));
      Array.from(selected).forEach((id) => { if (!ids.has(id)) selected.delete(id); });
      Array.from(collapsed).forEach((id) => { if (!ids.has(id)) collapsed.delete(id); });
      Array.from(seeded).forEach((id) => { if (!ids.has(id)) seeded.delete(id); });

      nextCharacters.forEach((character) => {
        const before = previous.get(character.id);
        if (!before) return;
        if (justCompleted(before, character.progress)) collapsed.add(character.id);
        else if (justPending(before, character.progress)) collapsed.delete(character.id);
      });

      bandsCache = null;
      currentPage = 1;
      ready = true;
      // El controlador conserva búsqueda/facetas/flags/foco y emite el grid.
      syncFilterBar();
      updateCatalogLabel();
      refreshLegend();
      refreshFicha();
      refreshCatalog();
      syncFromHash();
    },
    openCatalog: () => openCatalog(),
  };
}
