// Contrato del módulo de markup de chat de WoW (src/lib/wowLink.ts): los SV
// del addon guardan textos con códigos del cliente (colores, enlaces, texturas)
// y el portal debe mostrar/persistir el texto visible, conservando el enlace
// estructurado para el tooltip. Sin dependencias: `npm test`.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isWowMarkup,
  parseWowLink,
  stripWowMarkup,
  tokenizeWowText,
} from '../src/lib/wowLink.ts';

const ACHIEVEMENT =
  '|cffffff00|Hachievement:4608:0000000000174C82:1:11:9:25:4294967295:4294967295:4294967295:4294967295|h[ICC25N]|h|r';
const SPELL = '|cff71d5ff|Hspell:48945|h[AURA RES ESCARCHA]|h|r';
const ITEM = '|cffffffff|Hitem:36895:0:0:0:0:0:0:0:80|h[PIEDRA DE ALMA]|h|r';

test('stripWowMarkup deja el texto visible de un enlace de logro', () => {
  assert.equal(stripWowMarkup(ACHIEVEMENT), 'ICC25N');
});

test('parseWowLink extrae tipo, id, etiqueta y color del logro real', () => {
  const link = parseWowLink(ACHIEVEMENT);
  assert.ok(link, 'debe encontrar el enlace');
  assert.equal(link.type, 'achievement');
  assert.equal(link.id, 4608);
  assert.equal(link.label, 'ICC25N');
  assert.equal(link.color, 'ffff00');
});

test('parseWowLink reconoce hechizos y objetos con su id', () => {
  const spell = parseWowLink(SPELL);
  assert.equal(spell?.type, 'spell');
  assert.equal(spell?.id, 48945);
  assert.equal(spell?.label, 'AURA RES ESCARCHA');

  const item = parseWowLink(ITEM);
  assert.equal(item?.type, 'item');
  assert.equal(item?.id, 36895);
  assert.equal(item?.label, 'PIEDRA DE ALMA');
});

test('stripWowMarkup quita colores aunque no haya enlace', () => {
  assert.equal(stripWowMarkup('Hola |cffff0000rojo|r mundo'), 'Hola rojo mundo');
});

test('stripWowMarkup respeta el pipe escapado (||) y quita texturas', () => {
  assert.equal(stripWowMarkup('a||b'), 'a|b');
  assert.equal(stripWowMarkup('x|TInterface\\\\Icons\\\\Foo:0|t y'), 'x y');
});

test('el texto plano se devuelve intacto', () => {
  for (const plain of ['Los Caballeros', 'GS {gs}+, Wisp Func', '', 'T1 · 25H']) {
    assert.equal(stripWowMarkup(plain), plain, plain);
    assert.equal(parseWowLink(plain), null, plain);
    assert.equal(isWowMarkup(plain), false, plain);
  }
});

test('un enlace sin cerrar no rompe: se degrada a su etiqueta', () => {
  const broken = '|cffffff00|Hachievement:4608:abc|h[ICC25N]';
  assert.equal(stripWowMarkup(broken), 'ICC25N');
});

test('los tipos desconocidos se marcan como unknown y conservan la etiqueta', () => {
  const link = parseWowLink('|cff00ff00|Hgarrfollower:123|h[Seguidor]|h|r');
  assert.equal(link?.type, 'unknown');
  assert.equal(link?.id, 123);
  assert.equal(link?.label, 'Seguidor');
});

test('tokenize conserva el orden texto↔enlace', () => {
  const tokens = tokenizeWowText(`pre ${ACHIEVEMENT} post`);
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0]?.kind, 'text');
  assert.equal(tokens[0]?.text, 'pre ');
  assert.equal(tokens[1]?.kind, 'link');
  assert.equal(tokens[1]?.text, 'ICC25N');
  assert.equal(tokens[2]?.kind, 'text');
  assert.equal(tokens[2]?.text, ' post');
});

test('un id no numérico se omite sin perder la etiqueta', () => {
  const link = parseWowLink('|cffffffff|Hitem:ABC|h[Objeto raro]|h|r');
  assert.equal(link?.type, 'item');
  assert.equal(link?.id, undefined);
  assert.equal(link?.label, 'Objeto raro');
});
