// Markup de chat de World of Warcraft dentro de cadenas del SavedVariables.
//
// El addon guarda ciertos textos tal como los maneja el cliente: códigos de
// color (`|cAARRGGBB…|r`), enlaces (`|Htipo:datos|h[Etiqueta]|h`), texturas
// (`|T…|t`) y el pipe literal escapado (`||`). Ejemplo real en `bands[].name`:
//
//   |cffffff00|Hachievement:4608:0000000000174C82:1:11:9:25:…|h[ICC25N]|h|r
//
// El portal NUNCA persiste ni muestra ese markup: guarda el texto visible
// (`ICC25N`) y, donde hace falta el tooltip, conserva el enlace estructurado
// (`WowLink`) para el widget de UltimoWoW (mismo método que wow-rd).
//
// Módulo puro (sin DOM ni red): lo consumen el parser y la capa de UI.

export type WowLinkType =
  | 'item'
  | 'spell'
  | 'achievement'
  | 'quest'
  | 'currency'
  | 'npc'
  | 'object'
  | 'itemset'
  | 'event'
  | 'enchant'
  | 'glyph'
  | 'talent'
  | 'unknown';

export interface WowLink {
  type: WowLinkType;
  // Primer campo numérico del enlace (ID del objeto/hechizo/logro…), si existe.
  id?: number;
  // Texto visible sin corchetes (p. ej. "ICC25N").
  label: string;
  // Cadena original del enlace (para depuración/atributos alternos).
  raw: string;
  // Color del código `|c` que precede al enlace, en hex de 6 (sin '#').
  color?: string;
}

export type WowToken =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; link: WowLink };

const COLOR_RE = /^\|c([0-9a-fA-F]{8})/;
const RESET_RE = /^\|r/;
const TEXTURE_RE = /^\|T[^|]*\|t/;
const LINK_DATA_RE = /^\|H([^|]*)\|h/;
const LINK_END_RE = /^\|h/;

const KNOWN_TYPES: Record<string, WowLinkType> = {
  item: 'item',
  spell: 'spell',
  achievement: 'achievement',
  quest: 'quest',
  currency: 'currency',
  npc: 'npc',
  object: 'object',
  itemset: 'itemset',
  event: 'event',
  enchant: 'enchant',
  glyph: 'glyph',
  talent: 'talent',
};

// Etiqueta visible de un texto de enlace: quita los corchetes que el cliente
// usa como decoración de enlace ("[ICC25N]" → "ICC25N").
function cleanLabel(value: string): string {
  let label = value.trim();
  if (label.startsWith('[') && label.endsWith(']')) label = label.slice(1, -1);
  return label.trim();
}

function buildLink(data: string, labelText: string, color?: string): WowLink {
  const fields = data.split(':');
  const type = KNOWN_TYPES[(fields[0] ?? '').toLowerCase()] ?? 'unknown';
  const rawId = (fields[1] ?? '').trim();
  const id = /^[0-9]+$/.test(rawId) ? Number(rawId) : undefined;
  const link: WowLink = {
    type,
    label: cleanLabel(labelText),
    raw: `|H${data}|h[${cleanLabel(labelText)}]|h`,
  };
  if (id !== undefined && Number.isSafeInteger(id)) link.id = id;
  if (color) link.color = color.slice(2); // AARRGGBB → RRGGBB (el alfa es 0xFF)
  return link;
}

// Divide una cadena del SV en tramos de texto visible y enlaces. El consumidor
// decide cómo pintar cada tramo; `stripWowMarkup` es el atajo de solo texto.
export function tokenizeWowText(input: string): WowToken[] {
  const tokens: WowToken[] = [];
  if (!input) return tokens;

  let i = 0;
  const n = input.length;
  let buf = '';
  let color: string | undefined;
  let linkData: string | null = null;
  let linkBuf = '';
  let linkColor: string | undefined;

  const flushText = (): void => {
    if (buf) {
      tokens.push({ kind: 'text', text: buf });
      buf = '';
    }
  };

  const closeLink = (): void => {
    if (linkData === null) return;
    flushText();
    const link = buildLink(linkData, linkBuf, linkColor);
    tokens.push({ kind: 'link', text: link.label, link });
    linkData = null;
    linkBuf = '';
    linkColor = undefined;
  };

  while (i < n) {
    const rest = input.slice(i);

    if (rest.startsWith('||')) {
      if (linkData !== null) linkBuf += '|';
      else buf += '|';
      i += 2;
      continue;
    }

    const colorMatch = COLOR_RE.exec(rest);
    if (colorMatch) {
      if (linkData !== null) linkColor = colorMatch[1];
      else color = colorMatch[1];
      i += colorMatch[0].length;
      continue;
    }

    if (RESET_RE.test(rest)) {
      if (linkData !== null) linkColor = undefined;
      else color = undefined;
      i += 2;
      continue;
    }

    const textureMatch = TEXTURE_RE.exec(rest);
    if (textureMatch) {
      i += textureMatch[0].length;
      continue;
    }

    const linkMatch = LINK_DATA_RE.exec(rest);
    if (linkMatch) {
      // Un enlace anterior sin cerrar (markup malformado) se descarta como texto.
      if (linkData !== null) closeLink();
      linkData = linkMatch[1];
      linkBuf = '';
      linkColor = color;
      i += linkMatch[0].length;
      continue;
    }

    if (LINK_END_RE.test(rest)) {
      if (linkData !== null) closeLink();
      i += 2;
      continue;
    }

    if (linkData !== null) linkBuf += rest[0];
    else buf += rest[0];
    i++;
  }

  if (linkData !== null) closeLink();
  flushText();
  return tokens;
}

// Texto visible: descarta markup y colores, deja la etiqueta de los enlaces.
export function stripWowMarkup(input: string): string {
  if (!isWowMarkup(input)) return input;
  return tokenizeWowText(input)
    .map((token) => token.text)
    .join('');
}

// Primer enlace de la cadena (o null si no trae ninguno).
export function parseWowLink(input: string): WowLink | null {
  for (const token of tokenizeWowText(input)) {
    if (token.kind === 'link') return token.link;
  }
  return null;
}

// ¿La cadena trae markup de chat? Evita tokenizar texto plano (caso común).
export function isWowMarkup(input: string): boolean {
  return typeof input === 'string' && /\|c[0-9a-fA-F]{8}|\|H[^|]*\|h|\|r|\|T[^|]*\|t|\|\|/.test(input);
}


// ── Texto rico serializable (notas/campos del SV) ───────────────────────
// Forma compatible con wow-rd: tokens planos para guardar en JSONB y renderizar
// con los mismos enlaces del juego. Nunca se guarda el markup crudo.

export type RichTextToken =
  | { type: 'text'; text: string }
  | { type: 'link'; kind: WowLinkType; id: number; label: string; color?: string };

function cleanTokenText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function trimRichEdges(tokens: RichTextToken[]): RichTextToken[] {
  if (tokens.length === 0) return tokens;
  if (tokens[0].type === 'text') tokens[0].text = tokens[0].text.replace(/^\s+/, '');
  const last = tokens[tokens.length - 1];
  if (last.type === 'text') last.text = last.text.replace(/\s+$/, '');
  return tokens.filter((token) => token.type !== 'text' || token.text !== '');
}

// Convierte una cadena del SV en tokens. Un enlace sin id válido se degrada a
// texto para no inventar tooltips.
export function richTextTokens(input: string): RichTextToken[] {
  if (!input) return [];
  const out: RichTextToken[] = [];
  tokenizeWowText(input).forEach((token) => {
    if (token.kind === 'text') {
      const text = cleanTokenText(token.text);
      if (text) out.push({ type: 'text', text });
      return;
    }
    const link = token.link;
    if (link.id !== undefined && link.id > 0 && link.type !== 'unknown' && link.label) {
      const item: RichTextToken = { type: 'link', kind: link.type, id: link.id, label: link.label };
      if (link.color) item.color = link.color;
      out.push(item);
      return;
    }
    if (link.label) out.push({ type: 'text', text: link.label });
  });
  return trimRichEdges(out);
}

// Normaliza un enlace de la DB (JSONB) a WowLink. Devuelve null si no es un
// enlace válido; la UI decide el fallback.
export function normalizeWowLink(value: unknown): WowLink | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = KNOWN_TYPES[String(raw.type ?? '').toLowerCase()];
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!type || type === 'unknown' || !Number.isSafeInteger(id) || id <= 0 || !label) return null;
  const link: WowLink = {
    type,
    id,
    label,
    raw: typeof raw.raw === 'string' ? raw.raw : `|H${type}:${id}|h[${label}]|h`,
  };
  const color = typeof raw.color === 'string' ? raw.color.replace(/^#/, '') : '';
  if (/^[0-9a-f]{6}$/i.test(color)) link.color = color;
  return link;
}

// Normaliza tokens ricos de la DB. Descarta formas inválidas y acota texto.
export function normalizeRichTokens(value: unknown): RichTextToken[] {
  if (!Array.isArray(value)) return [];
  const out: RichTextToken[] = [];
  value.slice(0, 200).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const token = entry as Record<string, unknown>;
    if (token.type === 'text') {
      const text = typeof token.text === 'string' ? cleanTokenText(token.text).slice(0, 2000) : '';
      if (text) out.push({ type: 'text', text });
      return;
    }
    if (token.type !== 'link') return;
    const link = normalizeWowLink({
      type: token.kind,
      id: token.id,
      label: token.label,
      color: token.color,
    });
    if (!link || link.id === undefined) return;
    const item: RichTextToken = { type: 'link', kind: link.type, id: link.id, label: link.label };
    if (link.color) item.color = link.color;
    out.push(item);
  });
  return trimRichEdges(out);
}
