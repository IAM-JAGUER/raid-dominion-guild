// Lógica pura del Task Tracker del dashboard: progreso, buckets, orden,
// contadores de leyenda y uso del catálogo. Sin DOM ni Supabase.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bucketTrackerTasks,
  computeProgress,
  legendCounts,
  resolveTrackerTasks,
  shouldStartCollapsed,
  sortTrackerCharacters,
  taskUsage,
  type TrackerCharacter,
} from '../src/lib/ui/dashboard/trackerLogic.ts';
import {
  dashboardTabHead,
  trackerCatalogHash,
  trackerFichaHash,
  trackerHashView,
} from '../src/lib/ui/tabs.ts';

function character(patch: Partial<TrackerCharacter> & { id: string; name: string }): TrackerCharacter {
  const tasks = patch.tasks ?? { active: [], marked: [] };
  return {
    user_id: 'user',
    sv_upload_id: null,
    slug: patch.id,
    name: patch.name,
    realm: 'Bennu',
    server: null,
    class: 'Mago',
    class_file: 'MAGE',
    race: 'Humano',
    race_file: 'Human',
    level: 80,
    talent_spec: 'Fuego',
    avg_ilvl: 264,
    equipment: [],
    objectives: { equipment: [], currencies: [] },
    instances: [],
    notes_public: false,
    is_public: true,
    member_verified: true,
    sv_guild_name: null,
    sv_guild_rank: null,
    sv_is_gm: false,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-20T00:00:00.000Z',
    trackerHidden: false,
    trackerNote: '',
    currencies: [],
    money: 0,
    firstSeen: null,
    lastSeen: null,
    svSavedAt: null,
    addonVersion: null,
    gameNote: null,
    gameNoteRich: null,
    ...patch,
    tasks,
    progress: patch.progress ?? computeProgress(4, tasks),
  };
}

test('computeProgress usa marcadas/activas/catálogo', () => {
  assert.deepEqual(computeProgress(4, { active: ['a', 'b', 'c'], marked: ['a', 'b'] }), {
    done: 2,
    active: 3,
    pending: 1,
    possible: 4,
    percent: 50,
  });
  assert.deepEqual(computeProgress(0, null), {
    done: 0,
    active: 0,
    pending: 0,
    possible: 0,
    percent: 0,
  });
});

test('resolve y bucket clasifican activa/marcada/inactiva', () => {
  const catalog = [
    { id: 'a', label: 'A', position: 1 },
    { id: 'b', label: 'B', position: 2 },
    { id: 'c', label: 'C', position: 3 },
  ];
  const items = resolveTrackerTasks(catalog, { active: ['a', 'b'], marked: ['a'] });
  assert.deepEqual(items.map((i) => [i.id, i.active, i.marked]), [
    ['a', true, true],
    ['b', true, false],
    ['c', false, false],
  ]);
  const buckets = bucketTrackerTasks(items);
  assert.deepEqual(buckets.active.map((i) => i.id), ['b']);
  assert.deepEqual(buckets.marked.map((i) => i.id), ['a']);
  assert.deepEqual(buckets.inactive.map((i) => i.id), ['c']);
});

test('shouldStartCollapsed: sin activas o todas marcadas', () => {
  assert.equal(shouldStartCollapsed({ done: 0, active: 0, pending: 0, possible: 3, percent: 0 }), true);
  assert.equal(shouldStartCollapsed({ done: 2, active: 2, pending: 0, possible: 3, percent: 66 }), true);
  assert.equal(shouldStartCollapsed({ done: 1, active: 2, pending: 1, possible: 3, percent: 33 }), false);
});

test('el orden coloca expandidas primero y respeta el modo', () => {
  const a = character({ id: 'a', name: 'Ana', tasks: { active: ['t'], marked: [] }, progress: { done: 0, active: 1, pending: 1, possible: 2, percent: 0 } });
  const b = character({ id: 'b', name: 'Beto', tasks: { active: ['t'], marked: ['t'] }, progress: { done: 1, active: 1, pending: 0, possible: 2, percent: 50 } });
  const c = character({ id: 'c', name: 'Cora', tasks: { active: [], marked: [] }, progress: { done: 0, active: 0, pending: 0, possible: 2, percent: 0 } });
  const sorted = sortTrackerCharacters([a, b, c], 'pending-desc', new Set(['b']));
  assert.deepEqual(sorted.map((x) => x.id), ['a', 'c', 'b']);
});

test('la leyenda suma todas las tarjetas y calcula inactivas', () => {
  const a = character({ id: 'a', name: 'Ana', tasks: { active: ['a', 'b'], marked: ['a'] }, instances: [{ name: 'ICC' }], currencies: [{ name: 'Oro', quantity: 1, money: true }] });
  const b = character({ id: 'b', name: 'Beto', tasks: { active: ['a'], marked: [] }, instances: [], currencies: [] });
  assert.deepEqual(legendCounts([a, b], 3), {
    active: 3,
    marked: 1,
    inactive: 3,
    instancias: 1,
    monedas: 1,
  });
});

test('taskUsage cuenta activas y marcadas por tarea', () => {
  const a = character({ id: 'a', name: 'Ana', tasks: { active: ['t1', 't2'], marked: ['t1'] } });
  const b = character({ id: 'b', name: 'Beto', tasks: { active: ['t1'], marked: ['t1'] } });
  const usage = taskUsage([a, b], ['t1', 't2', 't3']);
  assert.deepEqual(usage.get('t1'), { active: 2, marked: 2 });
  assert.deepEqual(usage.get('t2'), { active: 1, marked: 0 });
  assert.deepEqual(usage.get('t3'), { active: 0, marked: 0 });
});


test('los hashes del tracker no rompen la pestaña Personajes', () => {
  assert.equal(dashboardTabHead('#personajes'), 'personajes');
  assert.equal(dashboardTabHead('#personajes/ficha/ana-bennu'), 'personajes');
  assert.equal(dashboardTabHead('#bandas'), 'bandas');
  assert.equal(trackerFichaHash('ana-bennu'), '#personajes/ficha/ana-bennu');
  assert.equal(trackerCatalogHash(), '#personajes/catalogo');
  assert.deepEqual(trackerHashView('#personajes/ficha/ana-bennu'), { view: 'ficha', slug: 'ana-bennu' });
  assert.deepEqual(trackerHashView('#personajes/catalogo'), { view: 'catalogo', slug: '' });
  assert.deepEqual(trackerHashView('#personajes'), { view: '', slug: '' });
  assert.deepEqual(trackerHashView('#bandas'), { view: '', slug: '' });
});
