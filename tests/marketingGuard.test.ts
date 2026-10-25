// Guardián anti-alucinaciones del mercadeo: ningún mensaje puede publicar
// cifras o volúmenes de comunidad inventados (p. ej. "más de 500
// hermandades"). El texto generado por IA se valida y, si falla, el motor usa
// una plantilla determinista sin datos. Módulo puro: `npm test`.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasUnverifiedClaims, safeBodyFor } from '../netlify/functions/_shared/marketingGuard.ts';

test('rechaza cifras inventadas de hermandades', () => {
  assert.equal(hasUnverifiedClaims('📊 Más de 500 hermandades ya aparecen en el portal.'), true);
  assert.equal(hasUnverifiedClaims('Ya somos 1.200 jugadores'), true);
  assert.equal(hasUnverifiedClaims('500+ bandas registradas'), true);
});

test('rechaza volúmenes escritos con letras', () => {
  assert.equal(hasUnverifiedClaims('Miles de jugadores ya usan el portal.'), true);
  assert.equal(hasUnverifiedClaims('Quinientas hermandades confían en nosotros.'), true);
  assert.equal(hasUnverifiedClaims('Tres hermandades publicaron su portal.'), true);
  assert.equal(hasUnverifiedClaims('Muchas bandas buscan jugadores.'), true);
  assert.equal(hasUnverifiedClaims('Toda la comunidad ya está en el portal.'), true);
  assert.equal(hasUnverifiedClaims('Gran parte de los jugadores usan el addon.'), true);
  assert.equal(hasUnverifiedClaims('La comunidad más grande de WotLK.'), true);
  assert.equal(hasUnverifiedClaims('Somos la mejor hermandad del servidor.'), true);
});

test('permite constantes verdaderas del producto', () => {
  assert.equal(hasUnverifiedClaims('Compatible con World of Warcraft 3.3.5a.'), false);
  assert.equal(hasUnverifiedClaims('Valida al menos 2 personajes y activa tu perfil.'), false);
  assert.equal(hasUnverifiedClaims('Valida dos personajes y activa tu perfil.'), false);
  assert.equal(hasUnverifiedClaims('Disponible 24/7 en el portal.'), false);
  assert.equal(hasUnverifiedClaims('Una hermandad activa encuentra integrantes.'), false);
});

test('permite copy de conversión normal sin datos', () => {
  const body = [
    '¿Listo para que tu raid brille en el mapa?',
    '**Sube tu SavedVariables** y convierte tu roster en una ficha viva.',
    '**Publica tu perfil** y conecta con hermandades que buscan tu talento.',
    'Entra al portal y hazte visible ahora.',
  ].join('\n\n');
  assert.equal(hasUnverifiedClaims(body), false);
});

test('la plantilla segura no contiene cifras', () => {
  for (const eje of ['jugadores', 'hermandades', 'bandas'] as const) {
    const body = safeBodyFor(eje);
    assert.ok(body.length > 0);
    assert.equal(/\d/.test(body), false, `la plantilla de ${eje} no debe tener dígitos`);
  }
});
