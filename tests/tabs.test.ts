// Contrato de pestañas (src/lib/ui/tabs.ts): hashes, rutas del admin y
// coherencia id↔href. Sin DOM: solo helpers puros.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADMIN_PANELS,
  ADMIN_TABS,
  DASHBOARD_CONFIG,
  DASHBOARD_TABS,
  resolveAdminHash,
  tabFromHash,
  tabHash,
} from '../src/lib/ui/tabs.ts';

test('tabHash y tabFromHash son inversos', () => {
  assert.equal(tabHash('personajes'), '#personajes');
  assert.equal(tabFromHash('#personajes'), 'personajes');
  assert.equal(tabFromHash('#personajes/ficha/ana'), 'personajes/ficha/ana');
  assert.equal(tabFromHash(''), '');
});

test('resolveAdminHash distingue lista, detalle y hash desconocido', () => {
  assert.deepEqual(resolveAdminHash('#lista'), { kind: 'list' });
  assert.deepEqual(resolveAdminHash('#discord'), { kind: 'list' });
  assert.deepEqual(resolveAdminHash(''), { kind: 'list' });
  assert.deepEqual(resolveAdminHash('#usuario/abc-123'), { kind: 'user', id: 'abc-123' });
  assert.deepEqual(resolveAdminHash('#usuario/'), { kind: 'list' });
});

test('cada tab declara un href con su propio id como hash', () => {
  for (const tab of [...DASHBOARD_TABS, ...ADMIN_TABS]) {
    assert.ok(tab.id, 'todo tab necesita id');
    assert.ok(tab.label, `el tab ${tab.id} necesita label`);
    assert.ok(tab.icon, `el tab ${tab.id} necesita icono`);
    assert.equal(tab.href.split('#').pop(), tab.id);
  }
});

test('la configuración del dashboard no es una pestaña', () => {
  assert.equal(
    DASHBOARD_TABS.some((tab) => tab.id === DASHBOARD_CONFIG.id),
    false,
  );
  assert.equal(DASHBOARD_CONFIG.hash, '#cuenta');
  assert.equal(ADMIN_PANELS.LIST, 'lista');
});
