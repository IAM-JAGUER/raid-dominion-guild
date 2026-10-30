// Vínculo personaje↔banda (matchBandCharacter): la atribución del SV subido
// por el personaje cuenta aunque no esté en players[]; la membresía sigue
// valiendo. Sin dependencias: `npm test`.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchBandCharacter } from '../src/lib/bandMerge.ts';

function band(patch: {
  character_name?: string | null;
  character_realm?: string | null;
  players?: Array<{ name?: string; role?: string }> | null;
}) {
  return {
    character_name: patch.character_name ?? null,
    character_realm: patch.character_realm ?? null,
    players: patch.players ?? [],
  };
}

test('atribución: el personaje subió la banda aunque no esté en players[]', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Thrall', character_realm: 'Ragnaros', players: [] }),
    'Thrall',
    'Ragnaros',
  );
  assert.deepEqual(match, { attributed: true, member: false, role: undefined });
});

test('membresía: el personaje aparece en players[] con su rol', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Otro', players: [{ name: 'Jaina', role: 'Healer' }] }),
    'Jaina',
    'Ragnaros',
  );
  assert.deepEqual(match, { attributed: false, member: true, role: 'Healer' });
});

test('atribución y membresía a la vez (el organizador sí está enlistado)', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Sylvanas', players: [{ name: 'Sylvanas', role: 'DPS' }] }),
    'Sylvanas',
    'Ragnaros',
  );
  assert.deepEqual(match, { attributed: true, member: true, role: 'DPS' });
});

test('el reino acota la atribución: mismo nombre en otro reino no vincula', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Thrall', character_realm: 'Ragnaros' }),
    'Thrall',
    'Lordaeron',
  );
  assert.equal(match, null);
});

test('sin reino en la banda (legacy) la atribución cae al nombre', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Thrall', character_realm: null }),
    'Thrall',
    'Lordaeron',
  );
  assert.equal(match?.attributed, true);
});

test('sin reino en el personaje la atribución cae al nombre', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Thrall', character_realm: 'Ragnaros' }),
    'Thrall',
    null,
  );
  assert.equal(match?.attributed, true);
});

test('mayúsculas y espacios no afectan el vínculo', () => {
  const match = matchBandCharacter(
    band({ character_name: '  THRALL ', character_realm: ' RAGNAROS ' }),
    ' thrall ',
    'ragnaros',
  );
  assert.equal(match?.attributed, true);
});

test('sin vínculo por nombre ni membresía devuelve null', () => {
  const match = matchBandCharacter(
    band({ character_name: 'Thrall', players: [{ name: 'Jaina' }] }),
    'Arthas',
    'Ragnaros',
  );
  assert.equal(match, null);
});

test('nombre vacío o players inválido no rompe el match', () => {
  assert.equal(matchBandCharacter(band({ character_name: 'Thrall' }), '   ', 'Ragnaros'), null);
  assert.equal(matchBandCharacter(band({ players: null }), 'Thrall', 'Ragnaros'), null);
});
