// Retratos de raza: resolución de clave y género desde el nombre localizado.
// Sin DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { racePortraitUrl, sexToGender } from '../src/lib/ui/racePortrait.ts';

test('racePortraitUrl resuelve raza y género masculino', () => {
  assert.equal(racePortraitUrl('Humano', 'Human'), '/images/races/race-humano-m.webp');
  assert.equal(racePortraitUrl('Gnomo', 'Gnome'), '/images/races/race-gnomo-m.webp');
  assert.equal(racePortraitUrl('Draenei', 'Draenei'), '/images/races/race-draenei-m.webp');
});

test('racePortraitUrl infiere el género femenino del nombre localizado', () => {
  assert.equal(racePortraitUrl('Elfa de la noche', 'NightElf'), '/images/races/race-elfo-noche-f.webp');
  assert.equal(racePortraitUrl('No-muerta', 'Scourge'), '/images/races/race-no-muerto-f.webp');
  assert.equal(racePortraitUrl('Orca', 'Orc'), '/images/races/race-orco-f.webp');
});

test('racePortraitUrl devuelve null para una raza desconocida', () => {
  assert.equal(racePortraitUrl('Desconocida', null), null);
  assert.equal(racePortraitUrl(null, null), null);
});

test('racePortraitUrl prioriza el sexo real del addon sobre el nombre de raza', () => {
  assert.equal(racePortraitUrl('Humano', 'Human', 'Female'), '/images/races/race-humano-f.webp');
  assert.equal(racePortraitUrl('Elfa de la noche', 'NightElf', 'Male'), '/images/races/race-elfo-noche-m.webp');
});

test('sexToGender ignora tokens desconocidos y deja actuar al fallback', () => {
  assert.equal(sexToGender('Male'), 'm');
  assert.equal(sexToGender('Female'), 'f');
  assert.equal(sexToGender('?'), null);
  assert.equal(sexToGender(undefined), null);
  assert.equal(racePortraitUrl('No-muerta', 'Scourge', '?'), '/images/races/race-no-muerto-f.webp');
});
