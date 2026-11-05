// Calidad de objeto y slots de equipamiento de WoW 3.3.5a.
// Usado para colorear las fichas de equipo en el perfil de jugador.

export const ITEM_QUALITY_COLORS: Record<number, string> = {
  0: '#9d9d9d', // Pobre
  1: '#ffffff', // Común
  2: '#1eff00', // Poco común
  3: '#0070dd', // Raro
  4: '#a335ee', // Épico
  5: '#ff8000', // Legendario
  6: '#e6cc80', // Artefacto
  7: '#00ccff', // Reliquia
};

// Variantes ACCESIBLES para texto sobre superficie oscura (#071321).
// El riel y los puntos conservan el color canónico del juego; solo el nombre
// del ítem usa esta variante para cumplir AA (raro 6.8:1, épico 7.1:1).
const ITEM_QUALITY_TEXT_COLORS: Record<number, string> = {
  3: '#4a9eff',
  4: '#c084fc',
};

export function itemQualityColor(quality?: number | null): string {
  if (quality === null || quality === undefined) return '#ffffff';
  return ITEM_QUALITY_COLORS[quality] ?? '#ffffff';
}

export function itemQualityTextColor(quality?: number | null): string {
  if (quality === null || quality === undefined) return '#ffffff';
  return ITEM_QUALITY_TEXT_COLORS[quality] ?? itemQualityColor(quality);
}

// Nombre de calidad en plural para resúmenes de equipo ("4 épicas", "12 raras").
const ITEM_QUALITY_LABELS_PLURAL: Record<number, string> = {
  0: 'pobres',
  1: 'comunes',
  2: 'poco comunes',
  3: 'raros',
  4: 'épicos',
  5: 'legendarios',
  6: 'artefactos',
  7: 'reliquias',
};

// Nombre de calidad en singular y minúscula ("1 épico").
const ITEM_QUALITY_LABELS: Record<number, string> = {
  0: 'pobre',
  1: 'común',
  2: 'poco común',
  3: 'raro',
  4: 'épico',
  5: 'legendario',
  6: 'artefacto',
  7: 'reliquia',
};

export function itemQualityLabelPlural(quality?: number | null): string {
  if (quality === null || quality === undefined) return '';
  return ITEM_QUALITY_LABELS_PLURAL[quality] ?? '';
}

// Nombre de calidad en singular y minúscula ("épico"), para chips de filtro.
export function itemQualityLabel(quality?: number | null): string {
  if (quality === null || quality === undefined) return '';
  return ITEM_QUALITY_LABELS[quality] ?? '';
}

// Etiqueta de recuento con concordancia: "1 épico" / "4 épicos".
export function itemQualityCountLabel(quality: number, count: number): string {
  const label = count === 1 ? ITEM_QUALITY_LABELS[quality] : ITEM_QUALITY_LABELS_PLURAL[quality];
  return `${count} ${label ?? ''}`.trim();
}

// iLvl máximo de World of Warcraft 3.3.5a (Ruby Sanctum 25H / Shadowmourne).
// Fuente única del denominador del gauge de nivel de objeto.
export const WOTLK_MAX_ILVL = 284;

export interface IlvlTier {
  value: number;
  label: string;
}

// Hitos de progresión de equipo en WotLK (el gauge marca los alcanzados).
export const WOTLK_ILVL_TIERS: IlvlTier[] = [
  { value: 200, label: 'Naxxramas 10' },
  { value: 213, label: 'Naxxramas 25' },
  { value: 226, label: 'Ulduar 25' },
  { value: 245, label: 'Prueba del Cruzado 25' },
  { value: 264, label: 'ICC 25 normal / ICC 10 heroico' },
  { value: 277, label: 'ICC 25 heroico' },
  { value: 284, label: 'Ruby Sanctum 25 heroico' },
];

// Tier alcanzado por un iLvl (el hito más alto que no lo supera).
export function ilvlTierFor(ilvl?: number | null): IlvlTier | undefined {
  if (typeof ilvl !== 'number' || ilvl <= 0) return undefined;
  return [...WOTLK_ILVL_TIERS].reverse().find((tier) => ilvl >= tier.value);
}

const EQUIPMENT_SLOTS: Record<number, string> = {
  1: 'Cabeza',
  2: 'Cuello',
  3: 'Hombros',
  4: 'Camisa',
  5: 'Pecho',
  6: 'Cintura',
  7: 'Piernas',
  8: 'Pies',
  9: 'Muñecas',
  10: 'Manos',
  11: 'Anillo 1',
  12: 'Anillo 2',
  13: 'Abalorio 1',
  14: 'Abalorio 2',
  15: 'Espalda',
  16: 'Mano principal',
  17: 'Mano secundaria',
  18: 'A distancia',
  19: 'Tabardo',
};

export function equipmentSlotLabel(slot?: number | null): string {
  if (slot === null || slot === undefined) return '—';
  return EQUIPMENT_SLOTS[slot] ?? `Slot ${slot}`;
}

const ROLE_LABELS: Record<string, string> = {
  T: 'Tanque',
  H: 'Sanador',
  D: 'DPS',
};

export function roleLabel(role?: string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? role;
}