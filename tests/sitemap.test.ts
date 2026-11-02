// Constructor XML del sitemap: dedupe, lastmod válido, escape y slug de reinos.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSitemap, slugify } from '../netlify/functions/_shared/sitemap.ts';

test('buildSitemap deduplica URLs y conserva el primer lastmod', () => {
  const xml = buildSitemap([
    { loc: 'https://example.test/', lastmod: '2026-01-02T10:00:00Z' },
    { loc: 'https://example.test/', lastmod: '2026-02-03T10:00:00Z' },
    { loc: 'https://example.test/bandas' },
  ]);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 2);
  assert.match(xml, /<loc>https:\/\/example\.test\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-01-02T10:00:00\.000Z<\/lastmod>/);
});

test('buildSitemap escapa caracteres XML y descarta lastmod inválido', () => {
  const xml = buildSitemap([
    { loc: 'https://example.test/servidor/a&b', lastmod: 'no-es-fecha' },
  ]);
  assert.match(xml, /a&amp;b/);
  assert.doesNotMatch(xml, /<lastmod>/);
});

test('slugify normaliza reinos con acentos y espacios', () => {
  assert.equal(slugify('Ragnaros'), 'ragnaros');
  assert.equal(slugify('Reino Español'), 'reino-espanol');
  assert.equal(slugify('  --Área 52--  '), 'area-52');
});
