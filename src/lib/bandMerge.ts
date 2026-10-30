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

// Vínculo de un PERSONAJE con una banda. Existe por dos vías:
//   * atribución: el personaje subió el SV (character_name/character_realm),
//     aunque no aparezca en players[] (caso típico del GM/organizador);
//   * membresía: el personaje figura en players[].
// El reino acota la atribución cuando ambos lados lo traen (mismo nombre en
// reinos distintos); si falta en la banda (filas legacy) o en el personaje,
// se acepta por nombre. Devuelve null si no hay vínculo.
export interface BandCharacterMatch {
  attributed: boolean;
  member: boolean;
  role?: string;
}

export function matchBandCharacter(
  band: { character_name?: string | null; character_realm?: string | null; players?: unknown[] | null },
  charName: string | null | undefined,
  charRealm?: string | null,
): BandCharacterMatch | null {
  const name = (charName ?? '').trim().toLowerCase();
  if (!name) return null;
  const realm = (charRealm ?? '').trim().toLowerCase();
  const bandRealm = (band.character_realm ?? '').trim().toLowerCase();
  const attributed =
    (band.character_name ?? '').trim().toLowerCase() === name &&
    (!realm || !bandRealm || realm === bandRealm);
  const players = Array.isArray(band.players) ? (band.players as Array<{ name?: string; role?: string }>) : [];
  const row = players.find((p) => (p?.name ?? '').trim().toLowerCase() === name);
  if (!attributed && !row) return null;
  return { attributed, member: !!row, role: row?.role };
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
//
// Al repetirse un nombre NO se descarta la entrada nueva: se completa la ya
// guardada con los campos que le faltaban. Sin esto, las notas de una banda
// integrada se perdían si el jugador aparecía antes (sin nota) en otra banda
// del grupo: la ficha pública del core perdía información que el SV sí trae.
// Regla: gana el primer valor no vacío; el SV es la fuente de verdad, así que
// no se concatenan notas distintas (evita texto infinito entre reuploads).
const MERGE_FIELDS = ['class', 'role', 'dual', 'leader', 'notes', 'sanction'] as const;

export function mergeBandPlayers(bands: BandRow[]): MergePlayer[] {
  const byName = new Map<string, MergePlayer>();
  const order: string[] = [];
  bands.forEach((b) => {
    const list = Array.isArray(b.players) ? (b.players as MergePlayer[]) : [];
    list.forEach((p) => {
      const name = (p.name || '').trim();
      if (!name) return;
      const prev = byName.get(name);
      if (!prev) {
        byName.set(name, p);
        order.push(name);
        return;
      }
      MERGE_FIELDS.forEach((field) => {
        if (prev[field] === undefined || prev[field] === null || prev[field] === '') {
          const incoming = p[field];
          if (incoming !== undefined && incoming !== null && incoming !== '') {
            prev[field] = incoming as never;
          }
        }
      });
      // Puntos y sanción: gana el valor más alto (acumulación del raid leader).
      if (typeof p.points === 'number' && (!prev.points || p.points > prev.points)) {
        prev.points = p.points;
      }
      if (p.banned !== undefined && !prev.banned) prev.banned = true;
    });
  });
  return order.map((name) => byName.get(name) as MergePlayer);
}
