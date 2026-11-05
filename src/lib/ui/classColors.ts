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

export const DEFAULT_CLASS_COLOR = '#00BFFF'; // Energía (tema azul/acero)

// Nombre de clase en esMX (lo que muestra el addon) por clave canónica.
// ÚNICA fuente del label de clase para chips/filtros: no escribas los
// nombres de clase sueltos en páginas.
export const CLASS_LABELS: Record<string, string> = {
  WARRIOR: 'Guerrero',
  PALADIN: 'Paladín',
  HUNTER: 'Cazador',
  ROGUE: 'Pícaro',
  PRIEST: 'Sacerdote',
  DEATHKNIGHT: 'Caballero de la Muerte',
  SHAMAN: 'Chamán',
  MAGE: 'Mago',
  WARLOCK: 'Brujo',
  DRUID: 'Druida',
};

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

// Convierte un color de clase a rgba con alfa (hero halo, velo de card).
export function hexToRgba(hex: string, alpha: number): string {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const r = parseInt(n.substring(0, 2), 16) || 0;
  const g = parseInt(n.substring(2, 4), 16) || 0;
  const b = parseInt(n.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function relativeLuminance(hex: string): number {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const channel = (offset: number): number => {
    const v = (parseInt(n.substring(offset, offset + 2), 16) || 0) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

// Color de clase para TEXTO sobre superficie Abismo: si el color puro no
// alcanza contraste AA (DK, brujo), se aclara hacia blanco. El riel/halo
// conserva el color puro; solo el texto se ajusta.
export function classTextColor(className?: string | null, classFile?: string | null): string {
  const base = classColor(className, classFile);
  const target = 0.42;
  if (relativeLuminance(base) >= target) return base;
  const h = base.replace('#', '');
  const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const rgb = [0, 2, 4].map((offset) => parseInt(n.substring(offset, offset + 2), 16) || 0);
  for (let step = 1; step <= 12; step++) {
    const t = (step / 12) * 0.6;
    const mixed = rgb.map((v) => Math.round(v + (255 - v) * t));
    const hex = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (relativeLuminance(hex) >= target) return hex;
  }
  return '#E8F4FF';
}
