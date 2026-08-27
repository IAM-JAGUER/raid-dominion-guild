import { supabase } from './supabase';
import { resolveRankName, sortRanks } from '@/lib/ui/ranks';
import type { ParsedSavedVariables, GuildRank } from '@/types/parser';
import type { SavedVariableRow, ProfileRow, GuildRow, BandRow, RaiddominionRole } from '@/types/database';

// Tipos re-exportados para los consumidores de la capa de datos.
export type { BandRow } from '@/types/database';

export interface UploadSummary {
  id: string;
  generatedBy: string | null;
  parsedAt: string;
  members: number;
  bands: number;
}

// Guarda un parseo en el historial del usuario autenticado
export async function saveUpload(data: ParsedSavedVariables): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const insert = await supabase
    .from('raiddominion_saved_variables')
    .insert({
      user_id: user.id,
      generated_by: data.generatedBy ?? null,
      addon_version: data.version ?? null,
      status: 'parsed',
      raw: data,
    })
    .select('id')
    .single();

  if (insert.error) return { ok: false, error: insert.error.message };
  return { ok: true, id: insert.data.id };
}

// Lista los uploads del usuario autenticado (más recientes primero)
export async function listMyUploads(): Promise<{ ok: boolean; items?: UploadSummary[]; error?: string }> {
  const query = await supabase
    .from('raiddominion_saved_variables')
    .select('id, generated_by, parsed_at, raw')
    .order('parsed_at', { ascending: false })
    .limit(50);

  if (query.error) return { ok: false, error: query.error.message };

  const items: UploadSummary[] = (query.data as Array<{
    id: string;
    generated_by: string | null;
    parsed_at: string;
    raw: ParsedSavedVariables | null;
  }>).map((row) => ({
    id: row.id,
    generatedBy: row.generated_by,
    parsedAt: row.parsed_at,
    members: row.raw?.guild?.members?.length ?? 0,
    bands: row.raw?.bands?.length ?? 0,
  }));

  return { ok: true, items };
}

// Obtiene un upload completo por id (RLS garantiza que sea del usuario)
export async function getUpload(id: string): Promise<{ ok: boolean; item?: SavedVariableRow; error?: string }> {
  const query = await supabase
    .from('raiddominion_saved_variables')
    .select('*')
    .eq('id', id)
    .single();

  if (query.error) return { ok: false, error: query.error.message };
  return { ok: true, item: query.data as SavedVariableRow };
}

// ─── Perfil y roles (fuente de verdad: raiddominion_profiles.role) ──────

export interface ProfileUpdate {
  display_name?: string | null;
  character_name?: string | null;
  is_public?: boolean;
}

// Perfil del usuario autenticado
export async function getMyProfile(): Promise<{ ok: boolean; profile?: ProfileRow; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  // El perfil puede no existir aún (handle_new_user pendiente); se crea al vuelo
  const existing = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data) return { ok: true, profile: existing.data as ProfileRow };

  const created = await supabase
    .from('raiddominion_profiles')
    .upsert({ id: user.id })
    .select('*')
    .single();

  if (created.error) return { ok: false, error: created.error.message };
  return { ok: true, profile: created.data as ProfileRow };
}

// Actualiza campos básicos del perfil (nombre visible, visibilidad pública)
export async function updateMyProfile(patch: ProfileUpdate): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// Reclama la hermandad leyendo registry.guild DESDE EL SV GUARDADO.
// Sin formularios: los datos de la ficha provienen solo del addon y nadie
// puede reclamar un nombre de hermandad que no exista en su SV.
export async function claimGuildFromSV(svId: string): Promise<{ ok: boolean; guildId?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_claim_from_sv', { p_sv_id: svId });
  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('duplicate key')) msg = 'Ese slug ya existe; reintenta.';
    if (msg.includes('Ya tienes una hermandad')) msg = 'Ya tienes una hermandad registrada.';
    if (msg.includes('ya tiene un maestro registrado')) msg = 'Esa hermandad ya tiene un maestro registrado en el portal; no se puede reclamar dos veces.';
    return { ok: false, error: msg };
  }
  return { ok: true, guildId: rpc.data as string };
}

// ─── Hermandades del usuario (guild_master multi-hermandad) ─────────────

// Hermandades propias (RLS: owner las ve aunque no estén publicadas).
// Un jugador puede ser maestro de más de una.
export async function getMyGuilds(): Promise<{ ok: boolean; items?: GuildRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as GuildRow[]) ?? [] };
}

// ─── Páginas públicas (Fase 3) ──────────────────────────────────────────

export interface GuildPortalSnapshot {
  generatedBy: string | null;
  lastUpdate: number | null;
  // Jerarquía de rangos de la hermandad (registry.guild.ranks), ordenada por
  // index (0 = líder). El portal la muestra y ordena el roster con ella.
  ranks?: Array<{ index: number; name: string }>;
  // Whitelist explícita: el snapshot es público (SELECT TRUE) y jamás
  // debe incluir officerNote ni campos privados futuros. `rankIndex` se
  // conserva para ordenar el roster por jerarquía en el portal.
  members: Array<{
    name: string;
    class: string;
    rank: string;
    rankIndex?: number;
    publicNote: string;
  }>;
  bands: ParsedSavedVariables['bands'];
  rules: ParsedSavedVariables['rules'];
}

export function buildPortalSnapshot(data: ParsedSavedVariables): GuildPortalSnapshot {
  // Jerarquía de rangos: unión de registry.guild.ranks de todos los registros
  // del SV (dedupe por index), ordenada por jerarquía (0 = líder).
  const ranksRaw = new Map<number, string>();
  const addRanks = (r: GuildRank[] | undefined): void => {
    (r ?? []).forEach((x) => { if (!ranksRaw.has(x.index)) ranksRaw.set(x.index, x.name); });
  };
  addRanks(data.registryGuild?.ranks);
  data.registries.forEach((r) => addRanks(r.guild?.ranks));
  const ranks = sortRanks(Array.from(ranksRaw, ([index, name]) => ({ index, name })));

  // Roster efectivo: memberList v3 (registry.*.guild.memberList) ∪ legacy,
  // dedupe por nombre (misma lógica que el preview del upload). El nombre del
  // rango de cada miembro se RESUELVE desde su rankIndex contra la jerarquía
  // (índice 0 = líder), no desde el texto crudo del SV.
  const seen = new Set<string>();
  const members: GuildPortalSnapshot['members'] = [];
  const push = (m: { name: string; class?: string; rank?: string; rankIndex?: number; publicNote?: string }): void => {
    const key = m.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    members.push({
      name: m.name,
      class: m.class ?? '',
      rank: resolveRankName({ rankIndex: m.rankIndex, rank: m.rank, ranks }),
      rankIndex: typeof m.rankIndex === 'number' ? m.rankIndex : undefined,
      publicNote: m.publicNote ?? '',
    });
  };
  data.registries.forEach((r) =>
    r.guild?.memberList?.forEach((gm) => push({
      name: gm.name,
      class: gm.class ?? gm.classFile ?? '',
      rank: gm.rank,
      rankIndex: gm.rankIndex,
      publicNote: '',
    }))
  );
  if (members.length === 0) data.guild.members.forEach((m) => push(m));
  return {
    generatedBy: data.generatedBy ?? null,
    lastUpdate: data.lastUpdate ?? null,
    ranks: ranks.length > 0 ? ranks : undefined,
    members,
    bands: data.bands ?? [],
    rules: data.rules ?? [],
  };
}

// Asegura el slug público del propio perfil (RPC SECURITY DEFINER)
export async function ensureMyProfileSlug(): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_ensure_profile_slug');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, slug: rpc.data as string };
}

// Perfil público por slug (/p/:slug) — RLS permite si is_public o es propio
export async function getPublicProfileBySlug(slug: string): Promise<{ ok: boolean; profile?: ProfileRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, profile: (res.data as ProfileRow | null) ?? undefined };
}

// Listado público de JUGADORES (perfiles con visibilidad activa). Distinto de
// /personajes: aquí se listan las cuentas humanas (perfiles), no los
// personajes validados. Cada entrada enlaza a su perfil /jugador/:slug.
export async function listPublicPlayers(): Promise<{ ok: boolean; players?: ProfileRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('is_public', true)
    .not('slug', 'is', null)
    .order('display_name', { ascending: true, nullsFirst: false })
    .order('character_name', { ascending: true, nullsFirst: false })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, players: (res.data as ProfileRow[]) ?? [] };
}

// Directorio público de hermandades
export async function listPublicGuilds(): Promise<{ ok: boolean; guilds?: GuildRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guilds: (res.data as GuildRow[]) ?? [] };
}

// Portal de hermandad por slug (/:slug) — RLS filtra privadas salvo del dueño
export async function getPublicGuildBySlug(slug: string): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guild: (res.data as GuildRow | null) ?? undefined };
}

// ─── Servidores (realmlist) y reinos — capa pública ────────────────────

// Servidores distintos que aparecen en personajes/hermandades públicas.
export async function listPublicServers(): Promise<{ ok: boolean; servers?: string[]; error?: string }> {
  const [chars, guilds] = await Promise.all([
    supabase.from('raiddominion_characters').select('server').eq('is_public', true).not('server', 'is', null),
    supabase.from('raiddominion_guilds').select('server').eq('is_public', true).not('server', 'is', null),
  ]);
  if (chars.error) return { ok: false, error: chars.error.message };
  if (guilds.error) return { ok: false, error: guilds.error.message };

  const set = new Set<string>();
  (chars.data as Array<{ server: string | null }>).forEach((r) => r.server && set.add(r.server));
  (guilds.data as Array<{ server: string | null }>).forEach((r) => r.server && set.add(r.server));
  return { ok: true, servers: [...set].sort((a, b) => a.localeCompare(b)) };
}

// Reinos distintos dentro de un servidor (personajes/hermandades públicas).
export async function getServerRealms(server: string): Promise<{ ok: boolean; realms?: string[]; error?: string }> {
  const [chars, guilds] = await Promise.all([
    supabase.from('raiddominion_characters').select('realm').eq('is_public', true).eq('server', server).not('realm', 'is', null),
    supabase.from('raiddominion_guilds').select('realm').eq('is_public', true).eq('server', server).not('realm', 'is', null),
  ]);
  if (chars.error) return { ok: false, error: chars.error.message };
  if (guilds.error) return { ok: false, error: guilds.error.message };

  const set = new Set<string>();
  (chars.data as Array<{ realm: string | null }>).forEach((r) => r.realm && set.add(r.realm));
  (guilds.data as Array<{ realm: string | null }>).forEach((r) => r.realm && set.add(r.realm));
  return { ok: true, realms: [...set].sort((a, b) => a.localeCompare(b)) };
}

// Estadísticas públicas de un servidor (realmlist): reinos distintos, número
// de personajes públicos y número de jugadores (cuentas distintas) con
// visibilidad activa en ese servidor. Alimenta el resumen de /servidor/:server.
export async function getServerStats(
  server: string
): Promise<{ ok: boolean; realms?: number; characters?: number; players?: number; error?: string }> {
  const [charsRes, guildsRes] = await Promise.all([
    supabase
      .from('raiddominion_characters')
      .select('realm,user_id', { count: 'exact' })
      .eq('is_public', true)
      .eq('server', server),
    supabase
      .from('raiddominion_guilds')
      .select('realm')
      .eq('is_public', true)
      .eq('server', server),
  ]);
  if (charsRes.error) return { ok: false, error: charsRes.error.message };
  if (guildsRes.error) return { ok: false, error: guildsRes.error.message };

  const realms = new Set<string>();
  const players = new Set<string>();
  (charsRes.data as Array<{ realm: string | null; user_id: string | null }> | null)?.forEach((r) => {
    if (r.realm) realms.add(r.realm);
    if (r.user_id) players.add(r.user_id);
  });
  (guildsRes.data as Array<{ realm: string | null }> | null)?.forEach((r) => {
    if (r.realm) realms.add(r.realm);
  });

  return {
    ok: true,
    realms: realms.size,
    characters: charsRes.count ?? 0,
    players: players.size,
  };
}

// Resumen público de un reino (anidado en un servidor): hermandades y
// personajes públicos de ese reino en ese servidor. server+realm definen la
// capa: el mismo nombre de reino puede existir en servidores distintos.
export async function getRealmOverview(
  server: string,
  realm: string
): Promise<{ ok: boolean; guilds?: GuildRow[]; characters?: CharacterRow[]; error?: string }> {
  const [guildsRes, charsRes] = await Promise.all([
    supabase.from('raiddominion_guilds').select('*').eq('is_public', true).eq('server', server).ilike('realm', realm).order('name', { ascending: true }).limit(200),
    supabase.from('raiddominion_characters').select('*').eq('is_public', true).eq('server', server).ilike('realm', realm).order('avg_ilvl', { ascending: false }).limit(200),
  ]);
  if (guildsRes.error) return { ok: false, error: guildsRes.error.message };
  if (charsRes.error) return { ok: false, error: charsRes.error.message };
  return {
    ok: true,
    guilds: (guildsRes.data as GuildRow[]) ?? [],
    characters: (charsRes.data as CharacterRow[]) ?? [],
  };
}

// ─── Bandas públicas (tabla raiddominion_bands) ─────────────────────────

// Bandas públicas (espejo de visibilidad de su guild o del perfil del dueño).
export async function listPublicBands(): Promise<{ ok: boolean; bands?: BandRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  const rows = (res.data as BandRow[]) ?? [];
  // No exponer players[] de bandas que ocultan jugadores al público.
  rows.forEach((b) => {
    if (b.hide_players) b.players = [];
  });
  return { ok: true, bands: rows };
}

// Banda pública por slug.
export async function getPublicBandBySlug(slug: string): Promise<{ ok: boolean; band?: BandRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  const band = res.data as BandRow | null;
  if (band && band.hide_players) band.players = [];
  return { ok: true, band: band ?? undefined };
}

// ─── Gestión de bandas propias ──────────────────────────────────────────

// Bandas del usuario autenticado (RLS: solo las propias).
export async function getMyBands(): Promise<{ ok: boolean; items?: BandRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('owner_id', user.id)
    .order('name', { ascending: true });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as BandRow[]) ?? [] };
}

// Alterna la visibilidad pública de una banda propia.
export async function setBandVisibility(id: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// Persiste bandas/reglas de un SV vía RPC SECURITY DEFINER.
// ownerRankIndex = registry.guild.rankIndex del dueño (índice de su rango
// dentro de la hermandad; 0 = líder). guildName = registry.guild.name (la
// hermandad del dueño, sea o no el maestro) que asocia guild_id a cada banda.
export async function upsertBands(
  svId: string,
  bands: ParsedSavedVariables['bands'],
  rules: ParsedSavedVariables['rules'],
  ownerRankIndex?: number | null,
  guildName?: string | null,
  characterName?: string | null,
  characterRealm?: string | null
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_upsert_bands', {
    p_sv_id: svId,
    p_bands: (bands ?? []) as unknown as Record<string, unknown>[],
    p_rules: (rules ?? []) as unknown as Record<string, unknown>[],
    p_owner_rank_index: ownerRankIndex ?? null,
    p_guild_name: guildName ?? null,
    p_character_name: characterName ?? null,
    p_character_realm: characterRealm ?? null,
  });

  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, count: rpc.data as number };
}

// Alterna la ocultación global (número + lista de jugadores) de una banda
// propia frente al público. Vía RPC SECURITY DEFINER (solo owner).
export async function setBandHidePlayers(id: string, hide: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_hide_players', {
    p_band_id: id,
    p_hide: hide,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Política del GM: qué índices de rango integran bandas al portal.
export interface BandRankPolicy {
  authorized_rank_indices: number[];
}

// Lee la política de rangos autorizados de una hermandad (público).
// Default: [0] — el rango del maestro integra sus propias bandas, de modo
// que un GM que sube su SV antes de configurar la política conserva su
// portal con bandas (comportamiento previo del snapshot).
export async function getBandRankPolicy(guildId: string): Promise<{ ok: boolean; policy?: BandRankPolicy; error?: string }> {
  const res = await supabase
    .from('raiddominion_guild_config')
    .select('config_value')
    .eq('guild_id', guildId)
    .eq('config_key', 'band_rank_policy')
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  const value = res.data?.config_value as { authorized_rank_indices?: number[] } | undefined;
  return {
    ok: true,
    policy: {
      authorized_rank_indices: Array.isArray(value?.authorized_rank_indices)
        ? value.authorized_rank_indices
        : [0],
    },
  };
}

// El GM guarda qué índices de rango integran bandas y re-evalúa la
// integración de todas las bandas de la hermandad. Vía RPC (solo owner).
export async function saveBandRankPolicy(
  guildId: string,
  authorized: number[]
): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_rank_policy', {
    p_guild_id: guildId,
    p_authorized: authorized,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Bandas que cuentan en el portal de la hermandad (fuente REAL-TIME, ya no
// el snapshot): filas con guild_id = hermandad, dueño de rango autorizado
// (is_rank_integrated) Y públicas (is_public) — consistente con RLS
// (SELECT owner OR is_public), así el portal anónimo ve exactamente esto.
// Si hide_players, se quita players[] para que no se exponga número ni lista.
export async function listGuildPortalBands(guildId: string): Promise<{ ok: boolean; bands?: BandRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('guild_id', guildId)
    .eq('is_rank_integrated', true)
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };

  const rows = (res.data as BandRow[]) ?? [];
  // Si la banda oculta jugadores, no exponer players[] al consumidor.
  rows.forEach((b) => {
    if (b.hide_players) b.players = [];
  });
  return { ok: true, bands: rows };
}


// Primer portal público de un dueño (multi-hermandad: toma el más reciente)
export async function getPublicGuildByOwner(ownerId: string): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guild: (res.data as GuildRow | null) ?? undefined };
}

// Snapshot público del portal (roster/bandas/reglas) desde guild_config
export async function getGuildSnapshot(guildId: string): Promise<{ ok: boolean; snapshot?: GuildPortalSnapshot; error?: string }> {
  const res = await supabase
    .from('raiddominion_guild_config')
    .select('config_value')
    .eq('guild_id', guildId)
    .eq('config_key', 'portal_snapshot')
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, snapshot: (res.data?.config_value as GuildPortalSnapshot | undefined) ?? undefined };
}

// Guarda/actualiza el snapshot del portal de UNA hermandad (RLS: solo owner)
export async function saveGuildSnapshot(guildId: string, snapshot: GuildPortalSnapshot): Promise<{ ok: boolean; error?: string }> {
  const upsert = await supabase
    .from('raiddominion_guild_config')
    .upsert(
      { guild_id: guildId, config_key: 'portal_snapshot', config_value: snapshot },
      { onConflict: 'guild_id,config_key' }
    );

  if (upsert.error) return { ok: false, error: upsert.error.message };
  return { ok: true };
}

// Actualiza el snapshot del portal para CADA hermandad propia que aparezca
// en el SV (por nombre). Un re-upload mantiene al día todos los portales
// de un jugador que es maestro de varias hermandades.
export async function saveMyGuildSnapshotsFromSV(data: ParsedSavedVariables): Promise<{ ok: boolean; updated: number; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, updated: 0, error: 'sin sesión' };

  // Solo una subida de un personaje MAESTRO (registry.guild.isGM) refresca
  // el snapshot del portal. Una subida de otro rango (miembro/líder) NO debe
  // pisar roster/bandas/reglas publicados por el maestro (bug 2026-08-31).
  if (!data.registryGuild?.isGM) {
    return { ok: true, updated: 0 };
  }

  const guildsRes = await supabase
    .from('raiddominion_guilds')
    .select('id, name')
    .eq('owner_id', user.id);

  if (guildsRes.error) return { ok: false, updated: 0, error: guildsRes.error.message };
  const owned = (guildsRes.data as Array<{ id: string; name: string }>) ?? [];

  // Nombres de hermandad presentes en el SV (registryGuild + registries)
  const svGuildNames = new Set<string>();
  if (data.registryGuild?.name) svGuildNames.add(data.registryGuild.name.trim().toLowerCase());
  data.registries.forEach((r) => {
    if (r.guild?.name) svGuildNames.add(r.guild.name.trim().toLowerCase());
  });

  const snapshot = buildPortalSnapshot(data);
  let updated = 0;
  for (const g of owned) {
    if (!svGuildNames.has(g.name.trim().toLowerCase())) continue;
    const res = await saveGuildSnapshot(g.id, snapshot);
    if (!res.ok) return { ok: false, updated, error: res.error };
    updated += 1;
  }

  return { ok: true, updated };
}

// ─── Staff: moderación y administración (Fase 3.5) ──────────────────────

function friendlyStaffError(msg: string): string {
  if (msg.includes('No autorizado')) return 'No tienes permisos de staff para esta acción.';
  if (msg.includes('Rol inválido')) return 'Rol inválido.';
  if (msg.includes('propio rol')) return 'No puedes cambiar tu propio rol.';
  return msg;
}

export interface StaffGuildRow {
  id: string;
  slug: string;
  name: string;
  realm: string | null;
  faction: string | null;
  description: string | null;
  claim_status: 'pending' | 'verified' | 'rejected';
  is_public: boolean;
  owner_email: string | null;
  updated_at: string;
}

export interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Todas las hermandades (moderador/admin), incluidas pendientes y privadas
export async function staffListGuilds(): Promise<{ ok: boolean; guilds?: StaffGuildRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_staff_list_guilds');
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true, guilds: (rpc.data as StaffGuildRow[]) ?? [] };
}

// Verifica/rechaza un claim pendiente (moderador/admin); sincroniza roster
export async function verifyClaim(guildId: string, approved: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_verify_guild_claim', {
    p_guild_id: guildId,
    p_approved: approved,
    p_members: null,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// Takedown / republicación de un portal (moderador/admin)
export async function staffSetGuildPublic(guildId: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_staff_set_guild_public', {
    p_guild_id: guildId,
    p_is_public: isPublic,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// Bitácora reciente de acciones staff (RLS: solo staff lee)
export async function listAuditLog(): Promise<{ ok: boolean; items?: AuditRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as AuditRow[]) ?? [] };
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  character_name: string | null;
  realm: string | null;
  slug: string | null;
  role: RaiddominionRole;
  is_public: boolean;
  created_at: string;
}

// Listado completo de usuarios (solo admin)
export async function adminListUsers(): Promise<{ ok: boolean; users?: AdminUserRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_admin_list_users');
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true, users: (rpc.data as AdminUserRow[]) ?? [] };
}

// Cambia el rol de un usuario (solo admin; vía RPC SECURITY DEFINER)
export async function adminSetRole(userId: string, role: RaiddominionRole): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_admin_set_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// ─── Personajes y onboarding visitante → member ─────────────────────────

export interface CharacterRow {
  id: string;
  user_id: string;
  sv_upload_id: string | null;
  slug: string | null;
  name: string;
  realm: string | null;
  server: string | null;
  class: string | null;
  class_file: string | null;
  race: string | null;
  race_file: string | null;
  level: number | null;
  talent_spec: string | null;
  avg_ilvl: number | null;
  equipment: Array<{ slot: number; name: string; ilvl: number; quality: number }>;
  is_public: boolean;
  member_verified: boolean;
  sv_guild_name: string | null;
  sv_guild_rank: string | null;
  sv_is_gm: boolean;
  created_at: string;
  updated_at: string;
}

// Registra/actualiza el personaje del SV subido (RPC SECURITY DEFINER).
// 'conflict' = el (nombre, reino) ya está vinculado a otra cuenta.
export async function upsertMyCharacter(
  svId: string,
  player: ParsedSavedVariables['player'],
  savedAt?: string | null,
  guild?: ParsedSavedVariables['registryGuild']
): Promise<{ ok: boolean; result?: 'created' | 'updated' | 'conflict'; error?: string }> {
  if (!player) return { ok: false, error: 'el archivo no trae registry.player' };

  const rpc = await supabase.rpc('raiddominion_upsert_character', {
    p_sv_id: svId,
    p_player: player as unknown as Record<string, unknown>,
    p_saved_at: savedAt ?? null,
    p_guild: (guild ?? null) as unknown as Record<string, unknown> | null,
  });

  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('personaje inválido')) msg = 'El personaje del archivo es inválido.';
    if (msg.includes('raiddominion_characters_name_realm_unique')) msg = 'conflict';
    if (msg.includes('duplicate key')) msg = 'conflict';
    return { ok: false, error: msg };
  }
  return { ok: true, result: rpc.data as 'created' | 'updated' | 'conflict' };
}

// Guarda el roster del upload como evidencia para promociones ajenas
export async function saveRosterEvidence(
  svId: string,
  members: ParsedSavedVariables['guild']['members']
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_save_roster_evidence', {
    p_sv_id: svId,
    p_members: members as unknown as Record<string, unknown>[],
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, count: rpc.data as number };
}

export interface PromotionResult {
  promoted: boolean;
  reason?: string;
  character?: string;
}

// Intenta promover visitante→member. p_sv_id opcional habilita la
// auto-validación GM: un SV con registry.guild.isGM + más de dos personajes
// registrados valida los personajes de la cuenta sin evidencia cruzada.
// Si la DB aún no tiene la migración 20260824 (sin parámetro p_sv_id),
// reintenta sin argumento por si la firma antigua sigue viva.
export async function tryPromoteMember(svId?: string): Promise<{ ok: boolean; data?: PromotionResult; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_try_promote_member', svId ? { p_sv_id: svId } : {});
  if (rpc.error && svId) {
    const retry = await supabase.rpc('raiddominion_try_promote_member');
    if (!retry.error) return { ok: true, data: retry.data as PromotionResult };
  }
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, data: rpc.data as PromotionResult };
}

// Elimina los datos del usuario SOLO en RaidDominion (perfil, personajes,
// uploads y hermandades) y su membresía del app. No toca auth.users ni
// otras apps del ecosistema (decisión de producto 2026-08-24).
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_delete_account');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Resetea TODO el flujo del SV (uploads, personajes, hermandad/portal) y
// devuelve el rol a visitante salvo staff. Conserva la cuenta y el perfil.
export async function resetMyData(): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_reset_account_data');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Personajes del usuario autenticado
export async function getMyCharacters(): Promise<{ ok: boolean; items?: CharacterRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_characters')
    .select('*')
    .order('created_at', { ascending: false });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as CharacterRow[]) ?? [] };
}

// Alterna visibilidad pública de un personaje propio
export async function setCharacterVisibility(id: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase
    .from('raiddominion_characters')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// Personajes públicos de un usuario (perfil público /p/:slug)
export async function getPublicCharactersByUser(userId: string): Promise<{ ok: boolean; items?: CharacterRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_characters')
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('avg_ilvl', { ascending: false });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as CharacterRow[]) ?? [] };
}

export interface CharacterSlugRow {
  id: string;
  slug: string;
}

// Genera/recupera slugs hex-8 para TODOS los personajes propios (RPC
// SECURITY DEFINER). Idempotente: conserva los existentes. Útil para
// enlazar cards secundarias y el directorio a /personaje/<slug>.
export async function ensureMyCharacterSlugs(): Promise<{ ok: boolean; slugs?: CharacterSlugRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_ensure_character_slug');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, slugs: (rpc.data as CharacterSlugRow[]) ?? [] };
}

export interface PublicCharacterResult {
  character: CharacterRow;
  // Dueño del personaje; presente solo si su perfil es público (RLS).
  profile?: ProfileRow;
}

// Ficha POR PERSONAJE (/personaje/:slug): devuelve el personaje consultado
// + el perfil público de su dueño en UNA consulta (vista
// raiddominion_character_public, security_invoker). El card principal
// SIEMPRE es el personaje del slug, no el último subido.
export async function getPublicCharacterBySlug(slug: string): Promise<{ ok: boolean; result?: PublicCharacterResult; error?: string }> {
  const res = await supabase
    .from('raiddominion_character_public')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  if (!res.data) return { ok: true };

  const row = res.data as CharacterRow & {
    profile_slug: string | null;
    profile_display_name: string | null;
    profile_character_name: string | null;
    profile_realm: string | null;
    profile_role: RaiddominionRole | null;
    profile_is_guild_master: boolean | null;
    profile_is_public: boolean | null;
  };

  // Perfil del dueño solo si es público (RLS de la vista lo filtra a NULL).
  const profile: ProfileRow | undefined = row.profile_role !== null
    ? {
        id: row.user_id,
        role: row.profile_role,
        display_name: row.profile_display_name,
        character_name: row.profile_character_name,
        realm: row.profile_realm,
        slug: row.profile_slug,
        is_guild_master: row.profile_is_guild_master ?? false,
        is_public: row.profile_is_public ?? false,
      }
    : undefined;

  return { ok: true, result: { character: row, profile } };
}

export interface PublicBandSummary {
  name: string;
  schedule?: string;
  minGS?: number;
  role?: string;
}

// Bandas públicas donde aparece un personaje: cruza la tabla raiddominion_bands
// (SELECT público) buscando en players[] el nombre insensible a mayúsculas.
// Ya no depende del snapshot: las bandas viven en su propia tabla con su
// visibilidad espejo.
export async function getPublicBandsForCharacter(
  charName: string,
  guildName: string | null
): Promise<{ ok: boolean; bands?: PublicBandSummary[]; error?: string }> {
  const name = (charName ?? '').trim().toLowerCase();
  if (!name) return { ok: true, bands: [] };

  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('is_public', true)
    .limit(500);

  if (res.error) return { ok: false, error: res.error.message };

  const rows = (res.data as BandRow[]) ?? [];
  const bands: PublicBandSummary[] = [];

  for (const b of rows) {
    // Bandas que ocultan jugadores no exponen membresía ni rol al público.
    if (b.hide_players) continue;
    const players = Array.isArray(b.players) ? (b.players as Array<{ name?: string; role?: string }>) : [];
    const me = players.find((p) => (p?.name ?? '').trim().toLowerCase() === name);
    if (!me) continue;
    bands.push({
      name: b.name,
      schedule: b.schedule ?? undefined,
      minGS: b.min_gs !== null && b.min_gs !== undefined ? Number(b.min_gs) : undefined,
      role: me.role,
    });
  }
  return { ok: true, bands };
}

// ─── Estadísticas públicas de comunidad (hero) ──────────────────────────

export interface CommunityStats {
  guilds: number;
  characters: number;
}

export async function getPublicStats(): Promise<CommunityStats> {
  const rpc = await supabase.rpc('raiddominion_public_stats');
  if (rpc.error || !rpc.data || !Array.isArray(rpc.data) || rpc.data.length === 0) {
    return { guilds: 0, characters: 0 };
  }
  const row = rpc.data[0] as { guilds: number | string; characters: number | string };
  return { guilds: Number(row.guilds) || 0, characters: Number(row.characters) || 0 };
}
