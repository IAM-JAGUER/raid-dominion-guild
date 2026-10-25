// Guardián anti-alucinaciones del motor de mercadeo.
//
// Regla dura: el copy de Discord NUNCA presume datos de la comunidad. El
// modelo puede inventar cifras aunque no reciba estadísticas (p. ej. "más de
// 500 hermandades"), así que tras generar se valida el texto y, si contiene
// cualquier cifra o cuantificador no verificable, se descarta. Solo se
// permiten constantes verdaderas del producto: la versión 3.3.5a, "2
// personajes" (regla real de validación) y la disponibilidad 24/7.
//
// Módulo puro (sin imports) para poder probarlo con `npm test`.

export type GuardEje = 'bandas' | 'hermandades' | 'jugadores';

const ALLOWED_NUMERIC_PATTERNS: RegExp[] = [
  /\b3\.3\.5a\b/gi,
  /\b2\s*(?:personajes?|chars?)\b/gi,
  /\b24\s*\/\s*7\b/g,
];

// Cuantificadores de volumen escritos con letras ("miles", "quinientas"…).
const UNVERIFIED_QUANTIFIERS =
  /\b(?:cien|ciento|centenares?|cientos?|doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s|mil(?:es)?|millar(?:es)?|mill[oó]n(?:es)?|decenas?|docenas?)\b/i;

const COMMUNITY_NOUN =
  '(?:hermandades?|guilds?|bandas?|jugadores?|personajes?|miembros?|usuarios?|perfiles?|portales?|raids?|visitas?|cuentas?|comunidad(?:es)?|servidor(?:es)?|reino(?:s)?)';

// Cantidad concreta + sustantivo de comunidad ("tres hermandades").
const NUMBER_WORD_BEFORE_COMMUNITY = new RegExp(
  `\\b(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\\s+${COMMUNITY_NOUN}\\b`,
  'i',
);

// Volumen vago pero medible ("muchas hermandades", "toda la comunidad").
const VAGUE_COMMUNITY_VOLUME = new RegExp(
  `\\b(?:much[oa]s|demasiad[oa]s|varias?|algun[oa]s|montones?|un mont[oó]n|gran cantidad|gran parte|la mayor[ií]a|la mayor parte|el doble|el triple|el cu[aá]druple|la mitad|un tercio|casi tod[oa]s?|pr[aá]cticamente tod[oa]s?|un sinf[ií]n|infinidad|sin n[uú]mero|tod[oa]s?)\\s+(?:de\\s+)?(?:la |el |las |los )?${COMMUNITY_NOUN}\\b`,
  'i',
);

// Superlativos de comunidad no demostrables.
const UNVERIFIED_SUPERLATIVES =
  /\b(?:la|el)\s+(?:comunidad|portal|directorio|servidor|server|hermandad|guild|banda|raid)\s+m[aá]s\s+\S+|\b(?:el|la)\s+mejor\s+(?:comunidad|portal|directorio|servidor|server|hermandad|guild|banda|raid)\b|\bn[uú]mero uno\b/i;

// true = el texto contiene datos no verificables y NO debe publicarse.
export function hasUnverifiedClaims(body: string): boolean {
  if (UNVERIFIED_QUANTIFIERS.test(body)) return true;
  if (UNVERIFIED_SUPERLATIVES.test(body)) return true;
  if (VAGUE_COMMUNITY_VOLUME.test(body)) return true;

  let text = body;
  for (const pattern of ALLOWED_NUMERIC_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  if (/\p{N}/u.test(text)) return true;

  const wordQuantity = text.match(NUMBER_WORD_BEFORE_COMMUNITY);
  // "dos personajes" es la regla real del portal; el resto de cantidades
  // comunitarias se consideran no verificadas.
  if (wordQuantity && !/^dos personajes?$/i.test(wordQuantity[0])) return true;
  return false;
}

// Copy determinista, sin cifras ni nombres, para cuando el modelo inventa
// datos. Mantiene el tono y el beneficio, pero no presume nada.
const SAFE_BODIES: Record<GuardEje, string> = {
  jugadores: [
    'Tu personaje merece ser visto.',
    '**Sube tu SavedVariables** y convierte tu roster en una ficha viva con equipo, avance e instancias.',
    '**Activa tu perfil público** para que hermandades y bandas te encuentren.',
    'Entra al portal y hazte visible ahora.',
  ].join('\n\n'),
  hermandades: [
    'Tu hermandad merece un portal a la altura.',
    '**Publica el portal de tu hermandad** con roster, horarios y reglas para que nuevos integrantes te encuentren.',
    '**Mantén tus personajes al día** y muestra una comunidad activa.',
    'Entra al portal y presenta tu hermandad.',
  ].join('\n\n'),
  bandas: [
    'Tu banda merece que la comunidad la encuentre.',
    '**Registra tu banda** con horarios, reglas y roster para atraer jugadores al raid.',
    '**Mantén la información al día** para que tu convocatoria inspire confianza.',
    'Entra al portal y publica tu raid.',
  ].join('\n\n'),
};

export function safeBodyFor(eje: GuardEje): string {
  return SAFE_BODIES[eje];
}
