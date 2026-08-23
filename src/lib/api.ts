import { supabase } from './supabase';
import type { ParsedSavedVariables } from '@/types/parser';
import type { SavedVariableRow, ProfileRow, GuildRow, RaiddominionRole } from '@/types/database';

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
  display_name?: string;
  character_name?: string;
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

// Reclama hermandad vía RPC SECURITY DEFINER (asigna guild_master si el SV acredita liderazgo)
export async function claimGuild(params: {
  slug: string;
  name: string;
  realm?: string | null;
  discordLink?: string | null;
  generatedBy?: string | null;
}): Promise<{ ok: boolean; guildId?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_claim_guild', {
    p_slug: params.slug,
    p_name: params.name,
    p_realm: params.realm ?? null,
    p_faction: null,
    p_discord_link: params.discordLink ?? null,
    p_generated_by: params.generatedBy ?? null,
  });

  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('duplicate key')) msg = 'Ese slug de hermandad ya existe; elige otro nombre.';
    if (msg.includes('Ya tienes una hermandad')) msg = 'Ya tienes una hermandad registrada.';
    return { ok: false, error: msg };
  }
  return { ok: true, guildId: rpc.data as string };
}

// Reclama la hermandad leyendo registry.guild DESDE EL SV GUARDADO.
// Sin formularios: los datos de la ficha provienen solo del addon.
export async function claimGuildFromSV(svId: string): Promise<{ ok: boolean; guildId?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_claim_from_sv', { p_sv_id: svId });
  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('duplicate key')) msg = 'Ese slug ya existe; reintenta.';
    if (msg.includes('Ya tienes una hermandad')) msg = 'Ya tienes una hermandad registrada.';
    return { ok: false, error: msg };
  }
  return { ok: true, guildId: rpc.data as string };
}

// ─── Hermandad del usuario (guild_master) ───────────────────────────────

// Hermandad propia (RLS: owner la ve aunque no esté publicada)
export async function getMyGuild(): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guild: (res.data as GuildRow | null) ?? undefined };
}

// ─── Páginas públicas (Fase 3) ──────────────────────────────────────────

export interface GuildPortalSnapshot {
  generatedBy: string | null;
  lastUpdate: number | null;
  // Whitelist explícita: el snapshot es público (SELECT TRUE) y jamás
  // debe incluir officerNote ni campos privados futuros.
  members: Array<Pick<ParsedSavedVariables['guild']['members'][number], 'name' | 'class' | 'rank' | 'publicNote'>>;
  bands: ParsedSavedVariables['bands'];
  rules: ParsedSavedVariables['rules'];
}

export function buildPortalSnapshot(data: ParsedSavedVariables): GuildPortalSnapshot {
  return {
    generatedBy: data.generatedBy ?? null,
    lastUpdate: data.lastUpdate ?? null,
    members: (data.guild?.members ?? []).map((m) => ({
      name: m.name,
      class: m.class,
      rank: m.rank,
      publicNote: m.publicNote,
    })),
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

// Hermandad pública de un dueño (para vincular perfil de jugador → portal)
export async function getPublicGuildByOwner(ownerId: string): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_public', true)
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

// Guarda/actualiza el snapshot del portal propio (RLS: solo owner)
export async function saveMyGuildSnapshot(snapshot: GuildPortalSnapshot): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const guildRes = await supabase
    .from('raiddominion_guilds')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (guildRes.error) return { ok: false, error: guildRes.error.message };
  const guildId = (guildRes.data as { id: string } | null)?.id;
  if (!guildId) return { ok: false, error: 'sin hermandad' };

  const upsert = await supabase
    .from('raiddominion_guild_config')
    .upsert(
      { guild_id: guildId, config_key: 'portal_snapshot', config_value: snapshot },
      { onConflict: 'guild_id,config_key' }
    );

  if (upsert.error) return { ok: false, error: upsert.error.message };
  return { ok: true };
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
  name: string;
  realm: string | null;
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

// Intenta promover visitante→member si hay evidencia cruzada de roster
export async function tryPromoteMember(): Promise<{ ok: boolean; data?: PromotionResult; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_try_promote_member');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, data: rpc.data as PromotionResult };
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
