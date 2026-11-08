// Paleta espectral del equipamiento: colores de calidad del juego en el
// orden de la jerarquía (gris → blanco → verde → azul → morado → …). Sin DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ITEM_QUALITY_COLORS, equipmentQualityPalette } from '../src/lib/ui/itemQuality.ts';

test('equipmentQualityPalette sigue la jerarquía de calidad del juego', () => {
  const pieces = [
    { quality: 4 },
    { quality: 4 },
    { quality: 3 },
    { quality: 2 },
    { quality: 3 },
    { quality: 4 },
  ];
  assert.deepEqual(equipmentQualityPalette(pieces), [
    ITEM_QUALITY_COLORS[2],
    ITEM_QUALITY_COLORS[3],
    ITEM_QUALITY_COLORS[4],
  ]);
});

test('equipmentQualityPalette recorre toda la escala canónica', () => {
  const pieces = [7, 5, 3, 1, 4, 0, 6, 2].map((quality) => ({ quality }));
  assert.deepEqual(equipmentQualityPalette(pieces), [
    ITEM_QUALITY_COLORS[0],
    ITEM_QUALITY_COLORS[1],
    ITEM_QUALITY_COLORS[2],
    ITEM_QUALITY_COLORS[3],
    ITEM_QUALITY_COLORS[4],
    ITEM_QUALITY_COLORS[5],
    ITEM_QUALITY_COLORS[6],
    ITEM_QUALITY_COLORS[7],
  ]);
});

test('equipmentQualityPalette respeta el límite y descarta calidades ausentes', () => {
  const pieces = [{ quality: 3 }, { quality: null }, {}, { quality: 2 }];
  assert.deepEqual(equipmentQualityPalette(pieces, 1), [ITEM_QUALITY_COLORS[2]]);
  assert.deepEqual(equipmentQualityPalette([], 3), []);
});
