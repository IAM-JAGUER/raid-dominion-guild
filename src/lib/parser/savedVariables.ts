// Parser estructural de SavedVariables de RaidDominion (RaidDominionDB v3.0.0).
// Alineado al formato REAL del addon v3 (ver el dev en
// D:\WowClient esMX\Interface\AddOns\RaidDominion y perfiles como JUNGJX):
//
//   RaidDominionDB = {
//     Guild = { lastUpdate, generatedBy, memberList = { {name, class, rank, race, publicNote, officerNote} } },
//     Core = { { name, schedule, minGS, withNote, members = { {name, class, role, isLeader, isSanctioned} } } },
//     bands = { { name, icon, schedule, minGS, attendance, players = { {name, class, role, dual, gearScore, leader, banned, sanction, notes, points} }, spammer } },
//     roles / buffs / auras / abilities = { { name, icon } },
//     mechanics / rules = { { title, content, icon } },
//     assignments = { roles = { nombre = jugador }, buffs, abilities, auras },
//     ui / chat / loot / general / ...
//   }
//
// NOTA: la v2 guardaba Guild.memberList como strings planos y bandas en Core;
// la v3 mantiene Guild/Core PERO la fuente principal de bandas vivas es `bands`
// (con players y attendance). Este parser prioriza el formato v3.
//
// NO usa regex de `{}` (el de guildList.py): tokeniza el Lua respetando
// anidación y strings con comillas escapadas.

import {
  type GuildMember,
  type Band,
  type BandPlayer,
  type CoreBand,
  type ConfigListItem,
  type ContentItem,
  type Assignments,
  type ParsedSavedVariables,
  type ParseResult,
  LEADER_RANKS,
  MAX_SV_BYTES,
  PARSER_VERSION,
} from '@/types/parser';

// ─── Tokenizador Lua mínimo ────────────────────────────────────────────────

interface Token {
  type: 'lbrace' | 'rbrace' | 'bracket' | 'string' | 'number' | 'boolean' | 'name';
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const isNameStart = (ch: string): boolean => /[A-Za-z_]/.test(ch);
  const isNameChar = (ch: string): boolean => /[A-Za-z0-9_]/.test(ch);

  while (i < n) {
    const ch = input[i];

    if (ch === '-' && input[i + 1] === '-') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '{') {
      tokens.push({ type: 'lbrace', value: '{' });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'rbrace', value: '}' });
      i++;
      continue;
    }

    if (ch === '[') {
      tokens.push({ type: 'bracket', value: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'bracket', value: ']' });
      i++;
      continue;
    }

    // String (comillas simples o dobles) con escapes
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let value = '';
      while (i < n) {
        if (input[i] === '\\' && i + 1 < n) {
          const next = input[i + 1];
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else if (next === 'r') value += '\r';
          else value += next;
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          i++;
          break;
        }
        value += input[i];
        i++;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    // Número (incluye negativos, decimales y exponente)
    if (/[0-9.-]/.test(ch) && !isNameStart(ch)) {
      let value = '';
      while (i < n && /[0-9.eE+-]/.test(input[i])) {
        value += input[i];
        i++;
      }
      tokens.push({ type: 'number', value });
      continue;
    }

    // Booleano / palabra
    if (isNameStart(ch)) {
      let value = '';
      while (i < n && isNameChar(input[i])) {
        value += input[i];
        i++;
      }
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value });
      } else {
        tokens.push({ type: 'name', value });
      }
      continue;
    }

    // Otros separadores (= , ;) se ignoran
    i++;
  }

  return tokens;
}

// ─── Parser de tabla Lua ───────────────────────────────────────────────────

type LuaValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface ParseCtx {
  tokens: Token[];
  pos: number;
  warnings: string[];
}

function peek(ctx: ParseCtx): Token | undefined {
  return ctx.tokens[ctx.pos];
}

function next(ctx: ParseCtx): Token | undefined {
  return ctx.tokens[ctx.pos++];
}

function parseValue(ctx: ParseCtx): LuaValue {
  const tok = peek(ctx);
  if (!tok) return null;

  if (tok.type === 'string') {
    next(ctx);
    return tok.value;
  }
  if (tok.type === 'number') {
    next(ctx);
    const num = Number(tok.value);
    return Number.isNaN(num) ? null : num;
  }
  if (tok.type === 'boolean') {
    next(ctx);
    return tok.value === 'true';
  }
  if (tok.type === 'name') {
    next(ctx);
    return null;
  }
  if (tok.type === 'lbrace') {
    return parseTable(ctx);
  }
  return null;
}

function parseTable(ctx: ParseCtx): LuaValue {
  next(ctx); // consume '{'

  const strKeys: Record<string, unknown> = {};
  const arrKeys: unknown[] = [];

  while (peek(ctx) && peek(ctx)!.type !== 'rbrace') {
    const tok = peek(ctx)!;

    // Campo con clave explícita: ["name"] = value | [1] = value
    if (tok.type === 'bracket') {
      next(ctx); // consume '['
      const keyTok = peek(ctx);
      next(ctx); // consume la clave
      if (peek(ctx)?.type === 'bracket') next(ctx); // consume ']'
      if (peek(ctx)?.type === 'name' && peek(ctx)!.value === '=') next(ctx);
      const value = parseValue(ctx);
      if (keyTok) {
        const key = keyTok.value;
        if (keyTok.type === 'number') {
          const idx = Number(key);
          arrKeys[idx - 1] = value;
        } else {
          strKeys[key] = value;
        }
      }
      continue;
    }

    // Elemento sin clave explícita (array)
    if (tok.type === 'string' || tok.type === 'number' || tok.type === 'boolean' || tok.type === 'lbrace') {
      const value = parseValue(ctx);
      arrKeys.push(value);
      continue;
    }

    if (tok.type === 'name') {
      next(ctx); // consume la clave
      if (peek(ctx)?.type === 'name' && peek(ctx)!.value === '=') next(ctx);
      const value = parseValue(ctx);
      strKeys[tok.value] = value;
      continue;
    }

    // Token inesperado: avanzar para no colgar
    next(ctx);
    ctx.warnings.push('Token inesperado en tabla: ' + tok.value);
  }

  next(ctx); // consume '}'

  const hasStr = Object.keys(strKeys).length > 0;
  const hasArr = arrKeys.length > 0;

  if (hasArr && !hasStr) {
    for (let i = 0; i < arrKeys.length; i++) {
      if (arrKeys[i] === undefined) arrKeys[i] = null;
    }
    return arrKeys;
  }
  if (hasStr && !hasArr) return strKeys;

  if (hasStr && hasArr) {
    const mixed: Record<string, unknown> = {};
    arrKeys.forEach((v, i) => {
      mixed[String(i + 1)] = v;
    });
    Object.assign(mixed, strKeys);
    return mixed;
  }

  return strKeys;
}

// ─── Extracción de la tabla RaidDominionDB ────────────────────────────────

function extractRoot(input: string): Record<string, unknown> | null {
  const idx = input.indexOf('RaidDominionDB');
  if (idx === -1) return null;

  const after = input.slice(idx + 'RaidDominionDB'.length);
  const braceIdx = after.indexOf('{');
  if (braceIdx === -1) return null;

  const tokens = tokenize(after.slice(braceIdx));
  const ctx: ParseCtx = { tokens, pos: 0, warnings: [] };
  const root = parseTable(ctx);

  if (root === null || Array.isArray(root)) {
    return root as unknown as Record<string, unknown> | null;
  }
  return root as Record<string, unknown>;
}

// ─── Helpers de dominio ───────────────────────────────────────────────────

function toStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

function toNum(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function toBool(v: unknown): boolean {
  return v === true || v === 1;
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringArray(v: unknown): string[] {
  return asArray(v)
    .map((x) => toStr(x).trim())
    .filter(Boolean);
}

function asGuildMembers(raw: unknown): GuildMember[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      const name = toStr(e['name']).trim();
      if (!name) return null;
      return {
        name,
        class: toStr(e['class']),
        rank: toStr(e['rank']),
        race: toStr(e['race']),
        publicNote: toStr(e['publicNote']),
        officerNote: toStr(e['officerNote']),
      };
    })
    .filter((m): m is GuildMember => m !== null);
}

function asConfigList(raw: unknown): ConfigListItem[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      const name = toStr(e['name']).trim();
      if (!name) return null;
      return { name, icon: toStr(e['icon']) || undefined };
    })
    .filter((m): m is ConfigListItem => m !== null);
}

function asContentItems(raw: unknown): ContentItem[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      return {
        title: toStr(e['title']) || undefined,
        content: toStr(e['content']) || undefined,
        icon: toStr(e['icon']) || undefined,
      };
    })
    .filter((m): m is ContentItem => m !== null);
}

function asBandPlayers(raw: unknown): BandPlayer[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      const name = toStr(e['name']).trim();
      if (!name) return null;
      return {
        name,
        class: toStr(e['class']) || undefined,
        role: toStr(e['role']) || undefined,
        dual: toStr(e['dual']) || undefined,
        gearScore: toNum(e['gearScore']),
        leader: toStr(e['leader']) || undefined,
        isLeader: toBool(e['isLeader']),
        isSanctioned: toBool(e['isSanctioned']),
        banned: toBool(e['banned']),
        sanction: toStr(e['sanction']) || undefined,
        notes: toStr(e['notes']) || undefined,
        points: toNum(e['points']),
      };
    })
    .filter((p): p is BandPlayer => p !== null);
}

function asAttendance(raw: unknown): Band['attendance'] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      return {
        date: toStr(e['date']) || undefined,
        present: asStringArray(e['present']),
        absent: asStringArray(e['absent']),
      };
    })
    .filter((a): a is NonNullable<Band['attendance']>[number] => a !== null);
}

function asBands(raw: unknown): Band[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      const name = toStr(e['name']).trim();
      if (!name) return null;
      const spammer = asObj(e['spammer']);
      return {
        name,
        icon: toStr(e['icon']) || undefined,
        schedule: toStr(e['schedule']) || undefined,
        minGS: toNum(e['minGS']),
        players: asBandPlayers(e['players']),
        attendance: asAttendance(e['attendance']),
        spammer: spammer
          ? {
              channels:
                asObj(spammer['channels']) as Record<string, boolean> | undefined,
              duration: toNum(spammer['duration']),
              message: toStr(spammer['message']) || undefined,
            }
          : undefined,
      };
    })
    .filter((b): b is Band => b !== null);
}

function asCoreBands(raw: unknown): CoreBand[] {
  return asArray(raw)
    .map((entry) => {
      const e = asObj(entry);
      if (!e) return null;
      const name = toStr(e['name']).trim();
      if (!name) return null;
      return {
        name,
        schedule: toStr(e['schedule']) || undefined,
        minGS: toNum(e['minGS']),
        withNote: toBool(e['withNote']),
        members: asBandPlayers(e['members']),
      };
    })
    .filter((b): b is CoreBand => b !== null);
}

function asAssignments(raw: unknown): Assignments {
  const obj = asObj(raw);
  const toMap = (v: unknown): Record<string, string> => {
    const o = asObj(v);
    if (!o) return {};
    const out: Record<string, string> = {};
    Object.entries(o).forEach(([k, val]) => {
      out[k] = toStr(val);
    });
    return out;
  };
  return {
    roles: toMap(obj?.['roles']),
    buffs: toMap(obj?.['buffs']),
    abilities: toMap(obj?.['abilities']),
    auras: toMap(obj?.['auras']),
  };
}

function isLeaderRank(rank: string): boolean {
  const r = rank.toLowerCase().trim();
  return LEADER_RANKS.some((leader) => r.includes(leader));
}

// ─── API pública ───────────────────────────────────────────────────────────

export function parseSavedVariables(rawText: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawText || rawText.trim().length === 0) {
    return { ok: false, data: null, errors: ['El archivo está vacío.'], warnings };
  }

  const bytes = new TextEncoder().encode(rawText).length;
  if (bytes > MAX_SV_BYTES) {
    return {
      ok: false,
      data: null,
      errors: [`El archivo supera el límite de 2 MB (${Math.round(bytes / 1024 / 1024)} MB).`],
      warnings,
    };
  }

  const root = extractRoot(rawText);
  if (!root) {
    return {
      ok: false,
      data: null,
      errors: ['No se encontró RaidDominionDB en el archivo. ¿Es un SavedVariables del addon RaidDominion?'],
      warnings,
    };
  }

  const guildRaw = asObj(root['Guild']) ?? {};
  const members = asGuildMembers(guildRaw['memberList']);
  const generatedBy = toStr(guildRaw['generatedBy']).trim() || null;
  const lastUpdate = toNum(guildRaw['lastUpdate']) ?? null;

  if (members.length === 0) {
    warnings.push('No se encontró memberList válido en Guild; el addon aún no ha exportado la hermandad.');
  }

  // Claim de maestro: el personaje que generó + su rango en memberList
  let leaderCandidate: string | null = generatedBy;
  let confirmedLeaderRank = false;
  if (generatedBy) {
    const entry = members.find((m) => m.name.toLowerCase() === generatedBy.toLowerCase());
    confirmedLeaderRank = entry ? isLeaderRank(entry.rank) : false;
    if (!entry) warnings.push(`generatedBy "${generatedBy}" no está en memberList; no se puede verificar el rango.`);
  }

  const coreBands = asCoreBands(root['Core']);
  const bands = asBands(root['bands']);

  const data: ParsedSavedVariables = {
    version: PARSER_VERSION,
    generatedBy,
    lastUpdate,
    guild: {
      members,
      leaderCandidate,
      isLeaderRank: confirmedLeaderRank,
    },
    coreBands,
    bands,
    roles: asConfigList(root['roles']),
    buffs: asConfigList(root['buffs']),
    abilities: asConfigList(root['abilities']),
    auras: asConfigList(root['auras']),
    mechanics: asContentItems(root['mechanics']),
    rules: asContentItems(root['rules']),
    assignments: asAssignments(root['assignments']),
    chat: {
      channel: toStr(asObj(root['chat'])?.['channel']) || undefined,
      discordLink: toStr(asObj(root['chat'])?.['discordLink']) || undefined,
    },
    raw: {
      guildSize: members.length,
      hasCore: coreBands.length > 0,
      hasBands: bands.length > 0,
      hasUi: Boolean(root['ui']),
    },
  };

  return { ok: true, data, errors, warnings };
}