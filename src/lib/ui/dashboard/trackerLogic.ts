// Lógica pura del Task Tracker del dashboard (2026-10-23).
// Sin DOM ni Supabase: estados, progreso, orden, contadores y uso del catálogo.
// Base conceptual: C:\xampp\htdocs\wow-rd (grid + catálogo + leyenda), con la
// variante del portal: datos de las subidas SV y SIN GearScore.

import type { CharacterRow } from '@/lib/api';
import type { TrackerTaskState } from '@/types/database';
import type { AccountCurrency } from '@/types/parser';
import type { RichTextToken } from '@/lib/wowLink';

export interface TrackerProgress {
  done: number;
  active: number;
  pending: number;
  possible: number;
  percent: number;
}

export interface TrackerCharacter extends CharacterRow {
  trackerHidden: boolean;
  trackerNote: string;
  currencies: AccountCurrency[];
  money: number;
  firstSeen: number | null;
  lastSeen: number | null;
  svSavedAt: string | null;
  addonVersion: string | null;
  tasks: TrackerTaskState;
  // Nota del juego (raiddominion_character_notes), separada de trackerNote.
  gameNote: string | null;
  gameNoteRich: RichTextToken[] | null;
  progress: TrackerProgress;
}

export interface TrackerTaskItem {
  id: string;
  label: string;
  position: number;
  active: boolean;
  marked: boolean;
}

export type TrackerTaskTab = 'active' | 'marked' | 'inactive' | 'instancias' | 'monedas';

export interface TrackerTaskBuckets {
  active: TrackerTaskItem[];
  marked: TrackerTaskItem[];
  inactive: TrackerTaskItem[];
}

export type TrackerSortMode =
  | 'pending-desc'
  | 'pending-asc'
  | 'ilvl-desc'
  | 'ilvl-asc'
  | 'progress-desc'
  | 'seen-desc'
  | 'name';

export function emptyTasks(): TrackerTaskState {
  return { active: [], marked: [] };
}

export function computeProgress(catalogSize: number, tasks?: TrackerTaskState | null): TrackerProgress {
  const active = tasks?.active.length ?? 0;
  const done = tasks?.marked.length ?? 0;
  const possible = Math.max(0, catalogSize);
  return {
    done,
    active,
    pending: Math.max(0, active - done),
    possible,
    percent: possible > 0 ? Math.round((done * 100) / possible) : 0,
  };
}

// Clasifica cada tarea del catálogo en activa / marcada / inactiva.
export function resolveTrackerTasks(
  catalog: Array<{ id: string; label: string; position: number }>,
  tasks?: TrackerTaskState | null,
): TrackerTaskItem[] {
  const active = new Set(tasks?.active ?? []);
  const marked = new Set(tasks?.marked ?? []);
  return catalog.map((task) => ({
    id: task.id,
    label: task.label,
    position: task.position,
    active: active.has(task.id),
    marked: marked.has(task.id),
  }));
}

export function bucketTrackerTasks(items: TrackerTaskItem[]): TrackerTaskBuckets {
  const out: TrackerTaskBuckets = { active: [], marked: [], inactive: [] };
  items.forEach((task) => {
    if (!task.active) out.inactive.push(task);
    else if (task.marked) out.marked.push(task);
    else out.active.push(task);
  });
  return out;
}

// Estado inicial de la tarjeta: sin tareas activas o con todas marcadas.
export function shouldStartCollapsed(progress: TrackerProgress): boolean {
  return progress.active === 0 || progress.done >= progress.active;
}

export function pendingOf(character: TrackerCharacter): number {
  return character.progress.pending;
}

export function ilvlOf(character: TrackerCharacter): number {
  return typeof character.avg_ilvl === 'number' ? character.avg_ilvl : 0;
}

// "Visto": última conexión del SV; si no existe, última actualización del portal.
export function seenOf(character: TrackerCharacter): number {
  if (typeof character.lastSeen === 'number' && character.lastSeen > 0) return character.lastSeen;
  const updated = Date.parse(character.updated_at ?? '');
  return Number.isFinite(updated) ? Math.floor(updated / 1000) : 0;
}

// Orden del tracker local: expandidas primero y, dentro de cada grupo, el modo
// elegido. El GS se sustituye por iLvl (el portal no tiene GearScore).
export function sortTrackerCharacters(
  list: TrackerCharacter[],
  mode: TrackerSortMode,
  collapsedKeys: Set<string>,
): TrackerCharacter[] {
  const tie = (a: TrackerCharacter, b: TrackerCharacter): number => {
    const seen = seenOf(b) - seenOf(a);
    if (seen !== 0) return seen;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  };
  return list.slice().sort((a, b) => {
    const aCollapsed = collapsedKeys.has(a.id);
    const bCollapsed = collapsedKeys.has(b.id);
    if (aCollapsed !== bCollapsed) return aCollapsed ? 1 : -1;
    switch (mode) {
      case 'pending-asc':
        return pendingOf(a) - pendingOf(b) || tie(a, b);
      case 'ilvl-desc':
        return ilvlOf(b) - ilvlOf(a) || tie(a, b);
      case 'ilvl-asc':
        return ilvlOf(a) - ilvlOf(b) || tie(a, b);
      case 'progress-desc':
        return b.progress.percent - a.progress.percent || tie(a, b);
      case 'seen-desc':
        return seenOf(b) - seenOf(a) || tie(a, b);
      case 'name':
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      case 'pending-desc':
      default:
        return pendingOf(b) - pendingOf(a) || tie(a, b);
    }
  });
}

// Totales del pie de leyenda (todas las tarjetas, no solo la página/filtro).
export interface TrackerLegendCounts {
  active: number;
  marked: number;
  inactive: number;
  instancias: number;
  monedas: number;
}

export function legendCounts(characters: TrackerCharacter[], catalogSize: number): TrackerLegendCounts {
  let active = 0;
  let marked = 0;
  let instancias = 0;
  let monedas = 0;
  characters.forEach((character) => {
    active += character.tasks.active.length;
    marked += character.tasks.marked.length;
    instancias += Array.isArray(character.instances) ? character.instances.length : 0;
    monedas += Array.isArray(character.currencies) ? character.currencies.length : 0;
  });
  const inactive = Math.max(0, characters.length * catalogSize - active);
  return { active, marked, inactive, instancias, monedas };
}

// Uso de cada tarea del catálogo (para la vista Catálogo).
export function taskUsage(
  characters: TrackerCharacter[],
  taskIds: string[],
): Map<string, { active: number; marked: number }> {
  const map = new Map<string, { active: number; marked: number }>();
  taskIds.forEach((id) => map.set(id, { active: 0, marked: 0 }));
  characters.forEach((character) => {
    character.tasks.active.forEach((id) => {
      const row = map.get(id);
      if (row) row.active += 1;
    });
    character.tasks.marked.forEach((id) => {
      const row = map.get(id);
      if (row) row.marked += 1;
    });
  });
  return map;
}

// Icono y color de clase se resuelven fuera (classColors.ts); aquí solo la
// etiqueta de reino/nivel que comparten tarjeta y ficha.
export function characterSubtitle(character: TrackerCharacter): string {
  return [character.realm, character.class, character.talent_spec]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(' · ');
}

export function trackerIdOf(character: TrackerCharacter): string {
  return character.slug || character.id;
}
