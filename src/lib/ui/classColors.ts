// Colores de clase WoW 3.3.5a (estilo ficha de roster de guild-portal).
// Clave primaria: class_file (MAGE, WARRIOR, …); fallback por nombre de clase
// localizado esMX (lo que guarda el addon en "class") y por nombre en inglés.
// El fallback por defecto es el ámbar del tema RaidDominion.

const CLASS_COLORS: Record<string, string> = {
  WARRIOR: '#C79C6E',
  PALADIN: '#F58CBA',
  HUNTER: '#ABD473',
  ROGUE: '#FFF569',
  PRIEST: '#FFFFFF',
  DEATHKNIGHT: '#C41F3B',
  SHAMAN: '#0070DE',
  MAGE: '#69CCF0',
  WARLOCK: '#9482C9',
  DRUID: '#FF7D0A',
};

export const CLASS_ALIASES: Record<string, string> = {
  WARRIOR: 'WARRIOR',
  PALADIN: 'PALADIN',
  HUNTER: 'HUNTER',
  ROGUE: 'ROGUE',
  PRIEST: 'PRIEST',
  DEATHKNIGHT: 'DEATHKNIGHT',
  'DEATH KNIGHT': 'DEATHKNIGHT',
  SHAMAN: 'SHAMAN',
  MAGE: 'MAGE',
  WARLOCK: 'WARLOCK',
  DRUID: 'DRUID',
  // Español esMX (addon RaidDominion)
  Guerrero: 'WARRIOR',
  Paladín: 'PALADIN',
  Paladin: 'PALADIN',
  Cazador: 'HUNTER',
  Pícaro: 'ROGUE',
  Picaro: 'ROGUE',
  Sacerdote: 'PRIEST',
  'Caballero de la Muerte': 'DEATHKNIGHT',
  Chamán: 'SHAMAN',
  Chaman: 'SHAMAN',
  Mago: 'MAGE',
  Brujo: 'WARLOCK',
  Druida: 'DRUID',
};

export const DEFAULT_CLASS_COLOR = '#f59e0b'; // amber-500 (tema)

// Clave canónica de clase (WARRIOR, MAGE, ...) a partir de class_file
// (file ID) o del nombre localizado esMX/inglés que guarda el addon.
export function classKey(className?: string | null, classFile?: string | null): string | undefined {
  const raw = [classFile, className].find((v) => v && v.trim());
  const key = (raw ?? '').trim().toUpperCase();
  return CLASS_ALIASES[key] ?? CLASS_ALIASES[(className ?? '').trim()];
}

export function classColor(className?: string | null, classFile?: string | null): string {
  const file = classKey(className, classFile);
  const color = file ? CLASS_COLORS[file] : undefined;
  return color ?? DEFAULT_CLASS_COLOR;
}