/**
 * Listado de bandas del directorio (/bandas) y de las vistas anidadas
 * (reino/servidor): resolución de dueño visible y fusión de bandas
 * integradas. Fuente ÚNICA de la lógica de agrupación — no dupliques
 * mergeDirectoryBands/resolveBandOwners en vistas.
 */
import { supabase } from '@/lib/supabase';
import { getPublicAccountNames } from '@/lib/api';
import { safePlayerName, isNamelessSafe, handleFromSlug } from '@/lib/ui/playerNames';
import { bandMergeKey, mergeBandPlayers } from '@/lib/bandMerge';
import type { BandRow } from '@/types/database';

// Dueño visible de cada banda: la guild pública (si guild_id) o el perfil
// público del jugador (si es una banda personal). Se resuelve en batch.
export interface OwnerRef {
  href?: string;
  label?: string;
  kind?: 'guild' | 'player';
  ownerId?: string;
}

export async function resolveBandOwners(bands: Array<{ guild_id: string | null; owner_id: string }>): Promise<Map<string, OwnerRef>> {
  const map = new Map<string, OwnerRef>();
  const guildIds = Array.from(new Set(bands.filter((b) => b.guild_id).map((b) => b.guild_id as string)));
  const ownerIds = Array.from(new Set(bands.filter((b) => !b.guild_id).map((b) => b.owner_id)));

  const [gRes, pRes, namesMap] = await Promise.all([
    guildIds.length > 0
      ? supabase.from('raiddominion_guilds').select('id, name, slug, is_public, owner_id').in('id', guildIds)
      : Promise.resolve({ error: null, data: [] }),
    ownerIds.length > 0
      ? supabase.from('raiddominion_profiles').select('id, slug, display_name, character_name').in('id', ownerIds)
      : Promise.resolve({ error: null, data: [] }),
    getPublicAccountNames(ownerIds),
  ]);

  if (!gRes.error) {
    (gRes.data as Array<{ id: string; name: string; slug: string; is_public: boolean; owner_id: string | null }>).forEach((g) => {
      if (g.is_public) map.set(g.id, { href: `/hermandad/${g.slug}`, label: g.name, kind: 'guild', ownerId: g.owner_id ?? undefined });
    });
  }
  if (!pRes.error) {
    // Perfiles: se atribuyen SIEMPRE que haya slug (identificador estable),
    // no solo si el perfil es público — un perfil privado aún se identifica
    // por su handle @hex de fallback. La banda se atribuye al JUGADOR (cuenta).
    // Regla de atribución a personaje: solo si es el PRINCIPAL declarado
    // (character_name) Y público; si no, el nombre visible cae al handle @hex.
    (pRes.data as Array<{ id: string; slug: string | null; display_name: string | null; character_name: string | null }>).forEach((p) => {
      if (!p.slug) return;
      const info = namesMap.get(p.id);
      const publicNames = info?.publicNames;
      // personaje principal solo si coincide con el declarado y es público.
      const principal = p.character_name && publicNames?.has(p.character_name.toLowerCase()) ? p.character_name : null;
      const label = isNamelessSafe(p, { publicNames, fallbackName: principal })
        ? handleFromSlug(p.slug)
        : safePlayerName(p, { publicNames, fallbackName: principal });
      map.set(p.id, { href: `/jugador/${p.slug}`, label, kind: 'player' });
    });
  }

  // Fallback a la PERSONA o al HANDLE: cuentas cuyo perfil no es legible por
  // el cliente anon (privado) o que aún no se resolvieron se atribuyen de
  // forma segura.
  // Regla: una banda SOLO se atribuye a un PERSONAJE si ese personaje está
  // asignado como PRINCIPAL del dueño (perfil.character_name) Y es público
  // (principal_name en la vista). En cualquier otro caso cae al handle @hex
  // del slug, para no inventar atribuciones a personajes secundarios.
  const unresolved = ownerIds.filter((id) => !map.has(id));
  if (unresolved.length > 0) {
    const [hRes, cRes] = await Promise.all([
      supabase
        .from('raiddominion_profile_handles')
        .select('id, slug, principal_name')
        .in('id', unresolved),
      supabase
        .from('raiddominion_characters')
        .select('name, slug, user_id')
        .eq('is_public', true)
        .in('user_id', unresolved),
    ]);

    const handles = new Map<string, { slug: string; principalName: string | null }>();
    (hRes.data as Array<{ id: string; slug: string; principal_name?: string | null }> ?? []).forEach((h) => {
      if (!handles.has(h.id)) handles.set(h.id, { slug: h.slug, principalName: h.principal_name ?? null });
    });

    // Personajes públicos que coinciden con el principal declarado del dueño.
    const principalPublic = new Set<string>();
    const principalSlug = new Map<string, string>();
    (cRes.data as Array<{ name: string; slug: string | null; user_id: string }> ?? []).forEach((c) => {
      const h = handles.get(c.user_id);
      if (h && h.principalName && h.principalName.toLowerCase() === c.name.toLowerCase()) {
        principalPublic.add(c.user_id);
        if (c.slug) principalSlug.set(c.user_id, c.slug);
      }
    });

    handles.forEach((h, uid) => {
      if (map.has(uid)) return;
      if (principalPublic.has(uid)) {
        const slug = principalSlug.get(uid);
        map.set(uid, slug
          ? { href: `/personaje/${slug}`, label: h.principalName!, kind: 'player', ownerId: uid }
          : { label: h.principalName!, kind: 'player', ownerId: uid });
      } else {
        map.set(uid, { href: `/jugador/${h.slug}`, label: handleFromSlug(h.slug), kind: 'player', ownerId: uid });
      }
    });
  }
  return map;
}

export interface MergedBand {
  b: BandRow;
  source: string | null;
  playerCount: number;
}

// Fusión de bandas del directorio: agrupa por hermandad (guild_id) y dentro
// de cada hermandad por clave. La base es la banda del GM (owner de la
// hermandad) si existe; la fuente destacada es el character_name del
// personaje que integró la banda de un miembro. Bandas personales (sin
// guild_id) pasan individuales, sin fusión.
export function mergeDirectoryBands(
  bands: BandRow[],
  ownerMap: Map<string, OwnerRef>,
): MergedBand[] {
  const out: MergedBand[] = [];
  const guildBands = bands.filter((b) => b.guild_id);
  const personalBands = bands.filter((b) => !b.guild_id);

  // Personales: nunca se fusionan con nada.
  personalBands.forEach((b) => out.push({ b, source: null, playerCount: Array.isArray(b.players) ? b.players.length : 0 }));

  // Por hermandad: agrupar por guild_id, luego dentro por clave.
  const byGuild = new Map<string, BandRow[]>();
  guildBands.forEach((b) => {
    const gid = b.guild_id as string;
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid)!.push(b);
  });
  byGuild.forEach((guildGroup) => {
    const ownerRef = ownerMap.get(guildGroup[0].guild_id as string);
    const guildOwnerId = ownerRef?.ownerId;
    const groups = new Map<string, BandRow[]>();
    guildGroup.forEach((b) => {
      const key = bandMergeKey(b);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    });
    groups.forEach((group) => {
      if (group.length === 1) {
        const only = group[0];
        out.push({ b: only, source: null, playerCount: Array.isArray(only.players) ? only.players.length : 0 });
        return;
      }
      const gmBand = guildOwnerId ? group.find((b) => b.owner_id === guildOwnerId) : undefined;
      const memberBand = group.find((b) => !gmBand || b.owner_id !== guildOwnerId);
      const base = gmBand ?? memberBand ?? group[0];
      const source = (memberBand && memberBand !== base) ? memberBand.character_name : null;
      // Conteo combinado: unión de jugadores de todas las bandas del grupo.
      const playerCount = mergeBandPlayers(group).length;
      out.push({ b: base, source, playerCount });
    });
  });
  return out;
}