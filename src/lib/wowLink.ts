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
// (`WowLink`) para el widget oficial de Wowhead.
//
// Módulo puro (sin DOM ni red): lo consumen el parser y la capa de UI.

export type WowLinkType =
  | 'item'
  | 'spell'
  | 'achievement'
  | 'quest'
  | 'enchant'
  | 'glyph'
  | 'talent'
  | 'currency'
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
  enchant: 'enchant',
  glyph: 'glyph',
  talent: 'talent',
  currency: 'currency',
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
