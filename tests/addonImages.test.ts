// Catálogo de capturas del addon para los embeds de Discord: cada key debe
// tener su archivo real en public/images/addon y no puede repetirse. Evita
// que una captura reubicada/renombrada rompa la rotación de mercadeo.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ADDON_IMAGES } from '../netlify/functions/_shared/addonImages.ts';

const IMAGES_DIR = join('public', 'images', 'addon');

test('todas las capturas del catálogo existen en public/images/addon', () => {
  for (const img of ADDON_IMAGES) {
    assert.ok(existsSync(join(IMAGES_DIR, img.file)), `falta la captura ${img.file}`);
  }
});

test('keys y archivos del catálogo son únicos', () => {
  const keys = new Set(ADDON_IMAGES.map((img) => img.key));
  const files = new Set(ADDON_IMAGES.map((img) => img.file));
  assert.equal(keys.size, ADDON_IMAGES.length, 'hay keys duplicadas');
  assert.equal(files.size, ADDON_IMAGES.length, 'hay archivos duplicados');
});

test('las capturas reubicadas (PNG) entran en la rotación', () => {
  const png = ADDON_IMAGES.filter((img) => img.file.endsWith('.png')).map((img) => img.key);
  for (const key of [
    'menu-habilidades-roles',
    'menu-reglas-mecanicas',
    'roster-roles-banda',
    'buffs-banda',
    'habilidades-utilidad',
    'habilidades-duales',
  ]) {
    assert.ok(png.includes(key), `la captura ${key} no está en el catálogo`);
  }
});
