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

export function itemQualityColor(quality?: number | null): string {
  if (quality === null || quality === undefined) return '#ffffff';
  return ITEM_QUALITY_COLORS[quality] ?? '#ffffff';
}

// El SV no guarda item ID, solo slot/nombre/ilvl/calidad. Se enlaza el objeto
// a UltimoWoW 3.3.5a por nombre vía búsqueda (?search=), apostrofado/normalizado.
export function wowItemUrl(name: string): string {
  const q = (name || '').trim().replace(/['"]/g, '').replace(/\s+/g, ' ');
  return `https://wotlk.ultimowow.com/?search=${encodeURIComponent(q)}`;
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