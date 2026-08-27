// Resolución de rangos de hermandad a partir de la jerarquía del SV
// (registry.guild.ranks) y el rankIndex de cada miembro.
//
// El addon escribe registry.guild.ranks = [{ index: 0..N-1, name }] para
// CUALQUIER miembro con hermandad (BuildGuildRanks): índice 0 = líder/GM,
// jerarquía descendente hasta N-1. La DETECCIÓN del rango de un miembro debe
// basarse en SU rankIndex resuelto contra esa jerarquía; el índice 0 es
// SIEMPRE el líder. El nombre crudo (`rank`) es solo fallback cuando no hay
// jerarquía ni índice (SV legacy).
import type { GuildRank } from '@/types/parser';

export function resolveRankName(opts: {
  rankIndex?: number;
  rank?: string;
  ranks?: GuildRank[];
  isGM?: boolean;
}): string {
  const { rankIndex, rank, ranks = [], isGM } = opts;

  // Índice 0 (o isGM) = líder de la hermandad, siempre.
  if (isGM || rankIndex === 0) {
    const leader = ranks.find((r) => r.index === 0);
    return (leader?.name || '').trim() || 'Líder';
  }

  // Jerarquía presente: resolver por índice.
  if (typeof rankIndex === 'number' && rankIndex > 0) {
    const hit = ranks.find((r) => r.index === rankIndex);
    if (hit) return (hit.name || '').trim() || `Rango ${rankIndex}`;
    return `Rango ${rankIndex}`;
  }

  // Fallback: nombre crudo del SV.
  const named = (rank || '').trim();
  if (named) return named;

  if (typeof rankIndex === 'number') return `Rango ${rankIndex}`;
  return 'Miembro';
}

// Ordena los rangos por jerarquía (índice 0 = líder primero).
export function sortRanks(ranks?: GuildRank[]): GuildRank[] {
  return [...(ranks ?? [])].sort((a, b) => a.index - b.index);
}

// Posición de un miembro en la jerarquía para ordenar el roster: los que no
// traen rankIndex van al final (los GM, índice 0, quedan arriba).
export function rankOrder(rankIndex?: number): number {
  return typeof rankIndex === 'number' ? rankIndex : Number.MAX_SAFE_INTEGER;
}