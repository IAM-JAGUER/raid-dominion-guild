import type { BandRow } from '@/types/database';

// Jugador del roster de una banda (subset tipado de players: unknown[]).
export interface MergePlayer {
  name?: string;
  class?: string;
  role?: string;
  dual?: string;
  leader?: string;
  banned?: boolean;
  sanction?: string;
  notes?: string;
  points?: number;
}

// Clave de coincidencia de una banda: nombre + horario (día y hora van en el
// string schedule del addon) + gearscore, normalizados (trim + lowercase).
// Única fuente de verdad del criterio de fusión de bandas integradas.
export function bandMergeKey(b: { name?: string | null; schedule?: string | null; min_gs?: number | null }): string {
  return [
    (b.name || '').trim().toLowerCase(),
    (b.schedule || '').trim().toLowerCase(),
    typeof b.min_gs === 'number' && b.min_gs > 0 ? String(b.min_gs) : '',
  ].join('|');
}

// Unión de jugadores de varias bandas, deduplicada por name (conserva el orden
// de aparición). Bandas con hide_players ya llegan sin players[] desde el API.
export function mergeBandPlayers(bands: BandRow[]): MergePlayer[] {
  const seen = new Set<string>();
  const out: MergePlayer[] = [];
  bands.forEach((b) => {
    const list = Array.isArray(b.players) ? (b.players as MergePlayer[]) : [];
    list.forEach((p) => {
      const name = (p.name || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      out.push(p);
    });
  });
  return out;
}