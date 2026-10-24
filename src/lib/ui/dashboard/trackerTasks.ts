// Render compartido de tareas del Task Tracker (tarjeta y ficha).
// Estructura y comportamiento del tracker wow-rd: pestañas
// Activas / Marcadas / Inactivas + extras Instancias / Monedas, con checkbox
// para marcar y switch para activar. Adaptado a los tokens del portal.

import type { TrackerTaskBuckets, TrackerTaskItem, TrackerTaskTab } from '@/lib/ui/dashboard/trackerLogic';
import { bucketTrackerTasks, resolveTrackerTasks } from '@/lib/ui/dashboard/trackerLogic';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { iconEl, type IconName } from '@/lib/ui/icons';
import type { TrackerTaskState } from '@/types/database';

export interface TrackerTaskExtra {
  count: number;
  content: HTMLElement;
}

export interface TrackerTasksOptions {
  catalog: Array<{ id: string; label: string; position: number }>;
  tasks: TrackerTaskState;
  onToggle: (op: 'mark' | 'unmark' | 'activate' | 'deactivate', taskId: string) => Promise<void>;
  extra?: {
    instancias?: TrackerTaskExtra;
    monedas?: TrackerTaskExtra;
  };
  defaultTab?: TrackerTaskTab;
  // Tarjeta: pestañas solo-icono (con tooltip/aria). Ficha: icono + label.
  showLabels?: boolean;
  // La ficha tiene pestañas propias de Instancias/Monedas: no las dupliques.
  showExtras?: boolean;
}

interface TabDef {
  id: TrackerTaskTab;
  label: string;
  icon: IconName;
  count: number;
}

const TAB_ICONS: Record<TrackerTaskTab, IconName> = {
  active: 'energia',
  marked: 'validado',
  inactive: 'bloqueo',
  instancias: 'reloj',
  monedas: 'cristal',
};

const TAB_LABELS: Record<TrackerTaskTab, string> = {
  active: 'Activas',
  marked: 'Marcadas',
  inactive: 'Inactivas',
  instancias: 'Instancias',
  monedas: 'Monedas',
};

function setTabActive(root: HTMLElement, tabId: TrackerTaskTab): void {
  root.querySelectorAll<HTMLButtonElement>('[data-tracker-tab]').forEach((btn) => {
    const active = btn.dataset.trackerTab === tabId;
    ui.tracker.tabActive.split(/\s+/).forEach((cls) => btn.classList.toggle(cls, active));
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  root.querySelectorAll<HTMLElement>('[data-tracker-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.trackerPanel !== tabId);
  });
}

export function setTrackerTab(root: HTMLElement, tabId: TrackerTaskTab): void {
  if (!root) return;
  setTabActive(root, tabId);
}

export function trackerTabsOf(
  tasks: TrackerTaskBuckets,
  extra?: TrackerTasksOptions['extra'],
  showExtras = true,
): TabDef[] {
  const tabs: TabDef[] = [
    { id: 'active', label: TAB_LABELS.active, icon: TAB_ICONS.active, count: tasks.active.length },
    { id: 'marked', label: TAB_LABELS.marked, icon: TAB_ICONS.marked, count: tasks.marked.length },
    { id: 'inactive', label: TAB_LABELS.inactive, icon: TAB_ICONS.inactive, count: tasks.inactive.length },
  ];
  if (showExtras) {
    tabs.push(
      { id: 'instancias', label: TAB_LABELS.instancias, icon: TAB_ICONS.instancias, count: extra?.instancias?.count ?? 0 },
      { id: 'monedas', label: TAB_LABELS.monedas, icon: TAB_ICONS.monedas, count: extra?.monedas?.count ?? 0 },
    );
  }
  return tabs;
}

function emptyList(label: string): HTMLElement {
  return el('p', 'px-2 py-2 text-[11px] italic text-gray-400', label);
}

function taskRow(
  task: TrackerTaskItem,
  opts: TrackerTasksOptions,
): HTMLElement {
  const row = el('div', `${ui.tracker.task} ${task.marked ? ui.tracker.taskDone : ''}`);
  row.dataset.taskId = task.id;

  const name = el('span', `${ui.tracker.taskName} ${task.marked ? ui.tracker.taskDoneName : ''}`, task.label);
  name.title = task.label;

  const controls = el('div', 'flex items-center gap-2 shrink-0');
  const mark = document.createElement('input');
  mark.type = 'checkbox';
  mark.checked = task.marked;
  mark.disabled = !task.active;
  mark.className = 'w-3.5 h-3.5 accent-brand-500 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed';
  mark.setAttribute('aria-label', `${task.marked ? 'Desmarcar' : 'Marcar'} tarea ${task.label}`);
  mark.title = task.active ? 'Marcar como completada' : 'Activa la tarea para poder marcarla';
  mark.addEventListener('change', async () => {
    const next = mark.checked;
    mark.disabled = true;
    try {
      await opts.onToggle(next ? 'mark' : 'unmark', task.id);
    } catch {
      mark.checked = !next;
    } finally {
      mark.disabled = !task.active;
    }
  });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `${ui.tracker.switch} ${task.active ? ui.tracker.switchOn : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`;
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(task.active));
  toggle.setAttribute('aria-label', `${task.active ? 'Desactivar' : 'Activar'} tarea ${task.label}`);
  toggle.title = task.active ? 'Desactivar tarea' : 'Activar tarea';
  const knob = el('span', `${ui.tracker.switchKnob} ${task.active ? ui.tracker.switchKnobOn : ''}`);
  knob.setAttribute('aria-hidden', 'true');
  toggle.appendChild(knob);
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await opts.onToggle(task.active ? 'deactivate' : 'activate', task.id);
    } catch {
      // El orquestador ya avisó del error; el estado visual lo fija el re-render.
    } finally {
      toggle.disabled = false;
    }
  });

  controls.append(mark, toggle);
  row.append(name, controls);
  return row;
}

function listPanel(items: TrackerTaskItem[], opts: TrackerTasksOptions, emptyLabel: string): HTMLElement {
  const panel = el('div', `${ui.tracker.list} hidden`);
  panel.dataset.trackerPanel = '';
  if (items.length === 0) panel.appendChild(emptyList(emptyLabel));
  else items.forEach((task) => panel.appendChild(taskRow(task, opts)));
  return panel;
}

// Construye el bloque completo de tareas (tabs + paneles).
export function renderTrackerTasks(opts: TrackerTasksOptions): HTMLElement {
  const items = resolveTrackerTasks(opts.catalog, opts.tasks);
  const buckets = bucketTrackerTasks(items);
  const showExtras = opts.showExtras !== false;
  const tabs = trackerTabsOf(buckets, opts.extra, showExtras);
  const showLabels = opts.showLabels === true;
  const defaultTab: TrackerTaskTab = opts.defaultTab ?? 'active';

  const root = el('div', '');
  root.dataset.trackerTasks = '';
  const tabBar = el('div', ui.tracker.tabs);
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Tareas del personaje');

  tabs.forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${ui.tracker.tab} ${tab.id === defaultTab ? ui.tracker.tabActive : ''}`;
    btn.dataset.trackerTab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(tab.id === defaultTab));
    btn.tabIndex = tab.id === defaultTab ? 0 : -1;
    btn.title = `${tab.label} (${tab.count})`;
    btn.setAttribute('aria-label', `${tab.label} (${tab.count})`);
    btn.appendChild(iconEl(tab.icon, { size: 'xs', cls: 'shrink-0' }));
    if (showLabels) btn.appendChild(document.createTextNode(tab.label));
    btn.appendChild(el('span', ui.tracker.tabCount, String(tab.count)));
    btn.addEventListener('click', () => setTabActive(root, tab.id));
    tabBar.appendChild(btn);
  });
  root.appendChild(tabBar);

  const lists = el('div', '');
  const panels: Array<{ id: TrackerTaskTab; node: HTMLElement }> = [
    { id: 'active', node: listPanel(buckets.active, opts, 'Sin tareas activas.') },
    { id: 'marked', node: listPanel(buckets.marked, opts, 'Sin tareas marcadas.') },
    { id: 'inactive', node: listPanel(buckets.inactive, opts, 'Sin tareas inactivas.') },
  ];
  if (showExtras && opts.extra?.instancias) {
    const panel = el('div', `${ui.tracker.list} hidden`);
    panel.dataset.trackerPanel = 'instancias';
    if (opts.extra.instancias.count === 0) panel.appendChild(emptyList('Sin instancias registradas.'));
    else panel.appendChild(opts.extra.instancias.content);
    panels.push({ id: 'instancias', node: panel });
  }
  if (showExtras && opts.extra?.monedas) {
    const panel = el('div', `${ui.tracker.list} hidden`);
    panel.dataset.trackerPanel = 'monedas';
    if (opts.extra.monedas.count === 0) panel.appendChild(emptyList('Sin monedas registradas.'));
    else panel.appendChild(opts.extra.monedas.content);
    panels.push({ id: 'monedas', node: panel });
  }
  panels.forEach(({ id, node }) => {
    node.dataset.trackerPanel = id;
    node.classList.toggle('hidden', id !== defaultTab);
    lists.appendChild(node);
  });
  root.appendChild(lists);
  return root;
}
