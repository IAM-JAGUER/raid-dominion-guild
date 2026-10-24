// Catálogo manual de tareas del Task Tracker (vista en línea del dashboard).
// Fiel al tracker wow-rd: buscar, añadir, renombrar, duplicar, eliminar,
// reordenar (drag & drop + botones accesibles) y acciones masivas por ámbito.

import type { TrackerCatalogRow } from '@/types/database';
import { taskUsage, type TrackerCharacter } from '@/lib/ui/dashboard/trackerLogic';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { iconEl } from '@/lib/ui/icons';

export type TrackerBulkAction = 'activate' | 'mark' | 'deactivate' | 'reset';
export type TrackerBulkScope = 'filtered' | 'character' | 'all';

export interface TrackerCatalogHandlers {
  onClose: () => void;
  onAdd: (label: string) => Promise<boolean>;
  onRename: (taskId: string, label: string) => Promise<boolean>;
  onDuplicate: (taskId: string) => Promise<boolean>;
  onDelete: (taskIds: string[]) => Promise<boolean>;
  onReorder: (order: string[]) => Promise<boolean>;
  onBulkApply: (action: TrackerBulkAction, taskIds: string[], scope: TrackerBulkScope) => Promise<boolean>;
}

export interface TrackerCatalogView {
  root: HTMLElement;
  update: (catalog: TrackerCatalogRow[], characters: TrackerCharacter[]) => void;
  setCurrentCharacter: (characterId: string | null) => void;
}

const ACTION_LABELS: Record<TrackerBulkAction, string> = {
  activate: 'Activar',
  mark: 'Marcar',
  deactivate: 'Desactivar',
  reset: 'Reiniciar',
};

const SCOPE_LABELS: Record<TrackerBulkScope, string> = {
  filtered: 'Personajes filtrados',
  character: 'Ficha abierta',
  all: 'Todos los personajes',
};

export function renderTrackerCatalog(handlers: TrackerCatalogHandlers): TrackerCatalogView {
  let catalog: TrackerCatalogRow[] = [];
  let characters: TrackerCharacter[] = [];
  let query = '';
  let currentCharacterId: string | null = null;
  let selected = new Set<string>();
  let scope: TrackerBulkScope = 'filtered';
  let confirmDelete = false;
  let confirmTaskId: string | null = null;

  const root = el('section', '');
  root.dataset.trackerCatalog = '';

  // ── Cabecera ────────────────────────────────────────────────────────────
  const head = el('div', `${ui.sectionHead} ${ui.cutTop} bg-gradient-to-br from-brand-900/20 to-transparent`);
  const headRow = el('div', 'flex flex-wrap items-start justify-between gap-3');
  const titleBox = el('div', 'min-w-0');
  titleBox.appendChild(el('p', ui.eyebrow, 'Task Tracker'));
  const title = el('h2', `${ui.gradientTitle} text-xl sm:text-2xl font-black italic`, 'Catálogo de tareas');
  titleBox.appendChild(title);
  titleBox.appendChild(el('p', `${ui.text.caption} mt-1`, 'Tareas manuales compartidas por todos tus personajes. No se importan del addon ni del WTF.'));
  headRow.appendChild(titleBox);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = `${ui.btnBase} ${ui.btnSecondary} px-3 py-2 text-[10px] font-black uppercase tracking-widest`;
  back.textContent = '← Volver a la lista';
  back.addEventListener('click', () => handlers.onClose());
  headRow.appendChild(back);
  head.appendChild(headRow);

  // ── Cuerpo ──────────────────────────────────────────────────────────────
  const body = el('div', `${ui.sectionBody} space-y-3`);

  const toolbar = el('div', 'flex flex-col gap-2 sm:flex-row sm:items-center');
  const search = document.createElement('input');
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = 'Buscar tarea…';
  search.className = `${ui.form.input} ${ui.focusRing} text-sm sm:max-w-xs`;
  search.setAttribute('aria-label', 'Buscar tarea en el catálogo');
  search.addEventListener('input', () => {
    query = search.value;
    renderList();
  });
  const addWrap = el('div', 'flex flex-1 items-center gap-2 min-w-0');
  const newLabel = document.createElement('input');
  newLabel.type = 'text';
  newLabel.autocomplete = 'off';
  newLabel.placeholder = 'Nueva tarea…';
  newLabel.className = `${ui.form.input} ${ui.focusRing} text-sm flex-1 min-w-0`;
  newLabel.setAttribute('aria-label', 'Etiqueta de la nueva tarea');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = `${ui.btnBase} ${ui.btnPrimary} px-3 py-2 text-[10px] font-black uppercase tracking-widest shrink-0`;
  addBtn.textContent = 'Añadir';
  const addTask = async (): Promise<void> => {
    const label = newLabel.value.trim();
    if (!label) {
      newLabel.focus();
      return;
    }
    addBtn.disabled = true;
    const ok = await handlers.onAdd(label);
    addBtn.disabled = false;
    if (ok) {
      newLabel.value = '';
      newLabel.focus();
    }
  };
  addBtn.addEventListener('click', () => void addTask());
  newLabel.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      void addTask();
    }
  });
  addWrap.append(newLabel, addBtn);
  toolbar.append(search, addWrap);
  body.appendChild(toolbar);

  // ── Barra masiva ────────────────────────────────────────────────────────
  const bulk = el('div', `${ui.tracker.dock} hidden`);
  const bulkInfo = el('span', 'text-[10px] font-black uppercase tracking-widest text-brand-200 mr-auto', '0 seleccionadas');
  const scopeSel = document.createElement('select');
  scopeSel.className = ui.tracker.select;
  scopeSel.setAttribute('aria-label', 'Ámbito de aplicación');
  (Object.keys(SCOPE_LABELS) as TrackerBulkScope[]).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = SCOPE_LABELS[key];
    scopeSel.appendChild(opt);
  });
  scopeSel.value = scope;
  const actionSel = document.createElement('select');
  actionSel.className = ui.tracker.select;
  actionSel.setAttribute('aria-label', 'Acción masiva');
  (Object.keys(ACTION_LABELS) as TrackerBulkAction[]).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ACTION_LABELS[key];
    actionSel.appendChild(opt);
  });
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = `${ui.btnBase} ${ui.btnPrimary} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
  applyBtn.textContent = 'Aplicar';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = `${ui.btnBase} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-red-600/50 bg-red-950/40 text-red-200 hover:bg-red-900/40`;
  deleteBtn.textContent = 'Eliminar';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = `${ui.btnBase} ${ui.btnGhost} px-3 py-1.5 text-[10px] font-black uppercase tracking-widest`;
  clearBtn.textContent = 'Limpiar';
  bulk.append(bulkInfo, scopeSel, actionSel, applyBtn, deleteBtn, clearBtn);
  body.appendChild(bulk);

  const list = el('div', 'space-y-1.5');
  body.appendChild(list);

  const empty = el('p', `${ui.text.bodyMuted} italic py-4`, 'El catálogo está vacío. Crea tu primera tarea para empezar a seguir personajes.');
  body.appendChild(empty);

  root.append(head, body);

  // ── Helpers ─────────────────────────────────────────────────────────────
  function filtered(): TrackerCatalogRow[] {
    const needle = query.trim().toLowerCase();
    return needle
      ? catalog.filter((task) => task.label.toLowerCase().includes(needle))
      : catalog.slice();
  }

  function refreshBulk(): void {
    const n = selected.size;
    bulk.classList.toggle('hidden', n === 0);
    bulkInfo.textContent = `${n} tarea${n === 1 ? '' : 's'} seleccionada${n === 1 ? '' : 's'}`;
    applyBtn.disabled = n === 0 && actionSel.value !== 'reset';
    deleteBtn.textContent = confirmDelete ? `Confirmar eliminación (${n})` : 'Eliminar';
    deleteBtn.classList.toggle('!border-red-400', confirmDelete);
    const opt = scopeSel.querySelector<HTMLOptionElement>('option[value="character"]');
    if (opt) {
      opt.disabled = !currentCharacterId;
      opt.textContent = currentCharacterId ? SCOPE_LABELS.character : 'Ficha abierta (ninguna)';
    }
    if (scope === 'character' && !currentCharacterId) {
      scope = 'filtered';
      scopeSel.value = 'filtered';
    }
  }

  function reorderFrom(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    const ids = catalog.map((task) => task.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    void handlers.onReorder(ids);
  }

  function row(task: TrackerCatalogRow, usage: Map<string, { active: number; marked: number }>): HTMLElement {
    const rowEl = el('div', `${ui.tracker.catalogRow} flex-wrap`);
    rowEl.dataset.taskId = task.id;
    rowEl.draggable = false;

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = selected.has(task.id);
    check.className = 'w-3.5 h-3.5 accent-brand-500 shrink-0';
    check.setAttribute('aria-label', `Seleccionar tarea ${task.label}`);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(task.id);
      else selected.delete(task.id);
      confirmDelete = false;
      confirmTaskId = null;
      refreshBulk();
    });

    const handle = el('span', 'cursor-grab text-gray-400 px-1 select-none shrink-0', '⋮⋮');
    handle.title = 'Arrastrar para reordenar';
    handle.draggable = true;
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('dragstart', (ev) => {
      (ev as DragEvent).dataTransfer?.setData('text/plain', task.id);
      rowEl.classList.add('opacity-50');
    });
    handle.addEventListener('dragend', () => rowEl.classList.remove('opacity-50'));

    const label = document.createElement('input');
    label.type = 'text';
    label.value = task.label;
    label.maxLength = 120;
    label.className = `${ui.form.input} ${ui.focusRing} text-sm flex-1 min-w-[8rem]`;
    label.setAttribute('aria-label', `Etiqueta de la tarea ${task.label}`);
    label.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        label.blur();
      }
    });
    label.addEventListener('change', async () => {
      const clean = label.value.trim();
      if (!clean || clean === task.label) {
        label.value = task.label;
        return;
      }
      label.disabled = true;
      const ok = await handlers.onRename(task.id, clean);
      label.disabled = false;
      if (!ok) label.value = task.label;
    });

    const used = usage.get(task.id) ?? { active: 0, marked: 0 };
    const usageEl = el('span', 'text-[10px] text-gray-400 shrink-0', `${used.active} activas · ${used.marked} marcadas`);
    usageEl.title = 'Personajes que usan esta tarea (activas · marcadas)';

    const controls = el('div', 'flex items-center gap-1 shrink-0 ml-auto');
    const up = document.createElement('button');
    up.type = 'button';
    up.className = `${ui.btnBase} ${ui.btnGhost} w-7 h-7 p-0 text-xs`;
    up.textContent = '↑';
    up.title = 'Subir tarea';
    up.setAttribute('aria-label', `Subir ${task.label}`);
    up.addEventListener('click', () => {
      const idx = catalog.findIndex((t) => t.id === task.id);
      if (idx <= 0) return;
      const ids = catalog.map((t) => t.id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      void handlers.onReorder(ids);
    });
    const down = document.createElement('button');
    down.type = 'button';
    down.className = `${ui.btnBase} ${ui.btnGhost} w-7 h-7 p-0 text-xs`;
    down.textContent = '↓';
    down.title = 'Bajar tarea';
    down.setAttribute('aria-label', `Bajar ${task.label}`);
    down.addEventListener('click', () => {
      const idx = catalog.findIndex((t) => t.id === task.id);
      if (idx === -1 || idx >= catalog.length - 1) return;
      const ids = catalog.map((t) => t.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      void handlers.onReorder(ids);
    });
    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = `${ui.btnBase} ${ui.btnGhost} w-7 h-7 p-0`;
    duplicate.title = 'Duplicar tarea';
    duplicate.setAttribute('aria-label', `Duplicar ${task.label}`);
    duplicate.appendChild(iconEl('editar', { size: 'xs' }));
    duplicate.addEventListener('click', () => void handlers.onDuplicate(task.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = `${ui.btnBase} w-7 h-7 p-0 border border-red-600/40 bg-red-950/30 text-red-200 hover:bg-red-900/40`;
    remove.title = 'Eliminar tarea';
    remove.setAttribute('aria-label', `Eliminar ${task.label}`);
    remove.appendChild(iconEl('eliminar', { size: 'xs' }));
    remove.addEventListener('click', () => {
      if (confirmTaskId !== task.id) {
        confirmTaskId = task.id;
        selected = new Set([task.id]);
        refreshBulk();
        renderList();
        window.setTimeout(() => {
          confirmTaskId = null;
          refreshBulk();
        }, 4000);
        return;
      }
      void handlers.onDelete([task.id]);
    });
    controls.append(up, down, duplicate, remove);

    rowEl.append(check, handle, label, usageEl, controls);

    rowEl.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      rowEl.classList.add('border-brand-400/60');
    });
    rowEl.addEventListener('dragleave', () => rowEl.classList.remove('border-brand-400/60'));
    rowEl.addEventListener('drop', (ev) => {
      ev.preventDefault();
      rowEl.classList.remove('border-brand-400/60');
      const sourceId = (ev as DragEvent).dataTransfer?.getData('text/plain') ?? '';
      if (sourceId) reorderFrom(sourceId, task.id);
    });
    return rowEl;
  }

  function renderList(): void {
    list.textContent = '';
    const tasks = filtered();
    const usage = taskUsage(characters, catalog.map((t) => t.id));
    if (catalog.length === 0) {
      empty.classList.remove('hidden');
    } else if (tasks.length === 0) {
      empty.classList.add('hidden');
      list.appendChild(el('p', `${ui.text.bodyMuted} italic py-4`, `Ninguna tarea coincide con "${query.trim()}".`));
    } else {
      empty.classList.add('hidden');
      tasks.forEach((task) => list.appendChild(row(task, usage)));
    }
    refreshBulk();
  }

  scopeSel.addEventListener('change', () => {
    scope = scopeSel.value as TrackerBulkScope;
    refreshBulk();
  });
  applyBtn.addEventListener('click', async () => {
    const taskIds = Array.from(selected);
    if (taskIds.length === 0 && actionSel.value !== 'reset') return;
    applyBtn.disabled = true;
    const ok = await handlers.onBulkApply(actionSel.value as TrackerBulkAction, taskIds, scope);
    applyBtn.disabled = false;
    if (ok) {
      selected.clear();
      confirmDelete = false;
      confirmTaskId = null;
      renderList();
    }
  });
  deleteBtn.addEventListener('click', async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirmDelete) {
      confirmDelete = true;
      refreshBulk();
      window.setTimeout(() => {
        confirmDelete = false;
        refreshBulk();
      }, 4000);
      return;
    }
    deleteBtn.disabled = true;
    const ok = await handlers.onDelete(ids);
    deleteBtn.disabled = false;
    if (ok) {
      selected.clear();
      confirmDelete = false;
      confirmTaskId = null;
      renderList();
    }
  });
  clearBtn.addEventListener('click', () => {
    selected.clear();
    confirmDelete = false;
    confirmTaskId = null;
    renderList();
  });

  return {
    root,
    update(nextCatalog, nextCharacters) {
      const ids = new Set(nextCatalog.map((t) => t.id));
      selected.forEach((id) => {
        if (!ids.has(id)) selected.delete(id);
      });
      catalog = nextCatalog;
      characters = nextCharacters;
      renderList();
    },
    setCurrentCharacter(characterId) {
      currentCharacterId = characterId;
      refreshBulk();
    },
  };
}
