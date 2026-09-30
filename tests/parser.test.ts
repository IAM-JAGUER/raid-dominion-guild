// Contrato del parser de SavedVariables contra el addon (RaidDominionDB v3).
// Sin dependencias: `npm test`.
//
// Estos casos cubren lo que NO se ve en un type check:
//   * objetivos normalizados bajo `player` (no como hermano del registry),
//   * facción inferida de la raza, con el marcador "?" descartado,
//   * notas de jugadores que llegan en `bands[].players[]`.
//
// OJO: `npm test` usa `--experimental-strip-types`, que pide Node 22 aunque
// `engines` siga en Node 20 (el de deploy). Es solo una herramienta de dev:
// no afecta al build ni a Netlify.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inferFactionFromRace, parseSavedVariables } from '../src/lib/parser/savedVariables.ts';
import type { ParsedSavedVariables } from '../src/types/parser.ts';

/** Envuelve una estructura Lua-ish como SavedVariables y devuelve el resultado. */
function parseLua(body: string) {
  return parseSavedVariables(`RaidDominionDB = {\n${body}\n}`);
}

/** Igual, pero solo el payload (lanza si el SV no se pudo parsear). */
function parseData(body: string): ParsedSavedVariables {
  const res = parseLua(body);
  assert.ok(res.data, `el parser no devolvió datos: ${res.errors.join('; ')}`);
  return res.data;
}

// ─── Facción ────────────────────────────────────────────────────────────────

test('inferFactionFromRace cubre las 11 razas de WotLK (es/en)', () => {
  const alliance = ['Human', 'Humano', 'Dwarf', 'Enano', 'NightElf', 'Elfo de la noche', 'Gnome', 'Gnomo', 'Draenei'];
  const horde = ['Orc', 'Orco', 'Undead', 'No muerto', 'Scourge', 'Necro', 'Tauren', 'Troll', 'Trol', 'BloodElf', 'Elfo de la Sangre'];
  for (const race of alliance) assert.equal(inferFactionFromRace(race), 'Alliance', race);
  for (const race of horde) assert.equal(inferFactionFromRace(race), 'Horde', race);
});

test('inferFactionFromRace devuelve undefined si la raza no se reconoce', () => {
  for (const race of ['?', '', undefined, null, 'Worgen', 'Gargoyle']) {
    assert.equal(inferFactionFromRace(race), undefined, String(race));
  }
});

// ─── Facción en el roster de personajes ────────────────────────────────────

test('characters[] con faction="?" deduce la facción por la raza', () => {
  const res = parseData(`
    characters = {
      ["Orco-Serena"] = { name = "Orco", realm = "Serena", faction = "?",
                          raceName = "Orco", level = 80 },
    },
  `);
  assert.equal(res.characters?.[0]?.faction, 'Horde');
});

test('la raza manda sobre un faction declarado contradictorio', () => {
  const res = parseData(`
    characters = {
      ["Chaman-Serena"] = { name = "Chaman", realm = "Serena", faction = "Alianza",
                            raceName = "Troll", level = 80 },
    },
  `);
  // La raza manda: un Troll es de la Horda aunque el SV diga "Alianza".
  assert.equal(res.characters?.[0]?.faction, 'Horde');
});

// ─── Objetivos ──────────────────────────────────────────────────────────────

const REGISTRY_WITH_OBJECTIVES = `
  registry = {
    ["Ana-Serena"] = {
      savedAt = 1750000000,
      player = { name = "Ana", realm = "Serena", raceFile = "NightElf",
                 classFile = "MAGE", level = 80, avgIlvl = 245 },
      objectives = {
        equipment = {
          { slot = 15, name = "T10 Leyenda", ilvl = 258, quality = 4, done = true },
          { slot = 16, name = "Anillo de目标任务", ilvl = 264, done = false },
        },
        currencies = { { name = "Marca de Honor", target = 1000, reached = false } },
      },
    },
  },
`;

test('los objetivos se anidan en player.objectives, no en el registry', () => {
  const res = parseData(REGISTRY_WITH_OBJECTIVES);
  const registry = res.registries?.[0];
  assert.ok(registry?.player, 'debe parsear registry.player');
  assert.equal((registry as Record<string, unknown>).objectives, undefined, 'registry ya NO lleva objectives');
  const objectives = registry.player.objectives;
  assert.equal(objectives?.equipment.length, 2);
  assert.equal(objectives?.currencies.length, 1);
});

test('los objetivos descartan iconos y flags de seguimiento', () => {
  const res = parseData(`
    registry = {
      ["Ana-Serena"] = {
        player = { name = "Ana", realm = "Serena" },
        objectives = {
          equipment = { { slot = 15, name = "Cinturón", ilvl = 258, done = false,
                           icon = "INV_Belt_01", itemTracked = true } },
          currencies = { { name = "Oro", target = 100, reached = false,
                           icon = "INV_Misc_Coin_01", currencyTracked = true } },
        },
      },
    },
  `);
  const piece = res.registries?.[0]?.player.objectives?.equipment[0] as Record<string, unknown>;
  assert.equal(piece.icon, undefined);
  assert.equal(piece.itemTracked, undefined);
  const currency = res.registries?.[0]?.player.objectives?.currencies[0] as Record<string, unknown>;
  assert.equal(currency.icon, undefined);
  assert.equal(currency.currencyTracked, undefined);
});

test('un snapshot sin objectives avisa y no rompe', () => {
  const res = parseLua(`
    registry = { ["Ana-Serena"] = { player = { name = "Ana", realm = "Serena" } } },
  `);
  assert.equal(res.data?.registries?.[0]?.player.objectives, undefined);
  assert.ok(res.warnings.some((w) => /objetivos|Registrar/i.test(w)), `esperaba aviso, hubo: ${res.warnings}`);
});

// ─── Notas de jugadores de banda ────────────────────────────────────────────

test('las notas de players[] llegan intactas al payload de bandas', () => {
  const res = parseData(`
    registry = { ["Ana-Serena"] = { player = { name = "Ana", realm = "Serena" } } },
    bands = {
      { name = "Los Caballeros", schedule = "Mar", minGS = 6000,
        players = {
          { name = "Ana", notes = "Lleva consumibles", role = "TANK" },
          { name = "Boz", notes = "", role = "HEAL" },
        } },
    },
  `);
  const band = res.bands?.[0];
  assert.equal(band?.players.length, 2);
  assert.equal(band?.players[0]?.notes, 'Lleva consumibles');
  // El parser omite `notes` cuando viene vacía: no inventa la clave.
  assert.equal(band?.players[1]?.notes, undefined);
});
