// Retratos de raza de WoW 3.3.5a: recortes 64×64 WebP del sheet
// `public/images/races/racespng.png` (4 filas × 5 columnas; masculino arriba,
// femenino abajo). La raza localizada permite inferir el género cuando el SV
// no lo trae; sin coincidencia se usa el retrato masculino.
export const RACE_PORTRAIT_BASE = '/images/races/';

type RaceKey =
  | 'humano'
  | 'enano'
  | 'gnomo'
  | 'elfo-noche'
  | 'draenei'
  | 'tauren'
  | 'no-muerto'
  | 'trol'
  | 'orco'
  | 'elfo-sangre';

const RACE_FILES: Record<RaceKey, { m: string; f: string }> = {
  humano: { m: 'race-humano-m.webp', f: 'race-humano-f.webp' },
  enano: { m: 'race-enano-m.webp', f: 'race-enano-f.webp' },
  gnomo: { m: 'race-gnomo-m.webp', f: 'race-gnomo-f.webp' },
  'elfo-noche': { m: 'race-elfo-noche-m.webp', f: 'race-elfo-noche-f.webp' },
  draenei: { m: 'race-draenei-m.webp', f: 'race-draenei-f.webp' },
  tauren: { m: 'race-tauren-m.webp', f: 'race-tauren-f.webp' },
  'no-muerto': { m: 'race-no-muerto-m.webp', f: 'race-no-muerto-f.webp' },
  trol: { m: 'race-trol-m.webp', f: 'race-trol-f.webp' },
  orco: { m: 'race-orco-m.webp', f: 'race-orco-f.webp' },
  'elfo-sangre': { m: 'race-elfo-sangre-m.webp', f: 'race-elfo-sangre-f.webp' },
};

function norm(value?: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function raceKeyFrom(value?: string | null): RaceKey | null {
  const s = norm(value);
  if (!s) return null;
  if (/night ?elf|elf[oa] de la noche|noche/.test(s)) return 'elfo-noche';
  if (/blood ?elf|elf[oa] de sangre|sangre/.test(s)) return 'elfo-sangre';
  if (/no[- ]?muert|renegad|undead|forsaken|scourge/.test(s)) return 'no-muerto';
  if (/humano|humana|human/.test(s)) return 'humano';
  if (/enano|enana|dwarf/.test(s)) return 'enano';
  if (/gnomo|gnoma|gnome/.test(s)) return 'gnomo';
  if (/draenei/.test(s)) return 'draenei';
  if (/tauren/.test(s)) return 'tauren';
  if (/trol|troll/.test(s)) return 'trol';
  if (/orco|orca|\borc\b/.test(s)) return 'orco';
  return null;
}

export function raceGenderFrom(value?: string | null): 'm' | 'f' {
  const s = norm(value);
  if (/(humana|enana|gnoma|elfa|no[- ]?muerta|renegada|orca|trol(?:esa)?)\b/.test(s)) return 'f';
  if (/\b(femenin[oa]|mujer)\b/.test(s)) return 'f';
  return 'm';
}

// Sexo real del addon (`registry.player.sex`, v3.3.0). Devuelve null cuando
// el SV es antiguo o el token no es válido para caer en la inferencia.
export function sexToGender(value?: string | null): 'm' | 'f' | null {
  const s = norm(value);
  if (!s) return null;
  if (s === 'female' || s === 'f' || s === 'femenino' || s === 'femenina') return 'f';
  if (s === 'male' || s === 'm' || s === 'masculino') return 'm';
  return null;
}

export function racePortraitUrl(
  race?: string | null,
  raceFile?: string | null,
  sex?: string | null,
): string | null {
  const key = raceKeyFrom(raceFile) ?? raceKeyFrom(race);
  if (!key) return null;
  const gender = sexToGender(sex) ?? raceGenderFrom(race);
  return `${RACE_PORTRAIT_BASE}${RACE_FILES[key][gender]}`;
}

export function racePortraitEl(
  race?: string | null,
  raceFile?: string | null,
  imgClass = 'w-5 h-5 rounded-[3px] border border-brand-600/30 object-cover shrink-0',
  sex?: string | null,
): HTMLImageElement | null {
  const src = racePortraitUrl(race, raceFile, sex);
  if (!src) return null;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.className = imgClass;
  return img;
}
