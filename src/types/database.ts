import type { ParsedSavedVariables } from './parser';

export type RaiddominionRole = 'visitante' | 'member' | 'guild_master' | 'moderator' | 'admin';
export type UploadStatus = 'parsed' | 'verified' | 'rejected';

export interface ProfileRow {
  id: string;
  role: RaiddominionRole;
  display_name: string | null;
  character_name: string | null;
  realm: string | null;
  slug: string | null;
  is_guild_master: boolean;
  is_public: boolean;
}

export interface GuildRow {
  id: string;
  slug: string;
  name: string;
  realm: string | null;
  server: string | null;
  faction: string | null;
  discord_link: string | null;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  claim_status: 'none' | 'pending' | 'verified' | 'rejected';
}

export interface SavedVariableRow {
  id: string;
  user_id: string;
  guild_id: string | null;
  addon_version: string | null;
  generated_by: string | null;
  status: UploadStatus;
  raw: ParsedSavedVariables | null;
  parsed_at: string;
}

export interface GuildConfigRow {
  id: string;
  guild_id: string;
  config_key: string;
  config_value: unknown;
  updated_at: string;
}

// Banda persistida en raiddominion_bands. guild_id es NULLABLE: un jugador
// puede llevar bandas+reglas SIN hermandad reclamada (owner-only / público
// por su perfil). players/rules conservan la forma real del addon.
export interface BandRow {
  id: string;
  owner_id: string;
  guild_id: string | null;
  slug: string;
  name: string;
  icon: string | null;
  schedule: string | null;
  min_gs: number | null;
  players: unknown[] | null;
  rules: unknown[] | null;
  is_public: boolean;
  // Índice del rango del dueño dentro de la hermandad (registry.guild.
  // rankIndex del SV; 0 = líder). NULL si el dueño no pertenece a una guild.
  owner_rank_index: number | null;
  // Oculta número y lista de jugadores al público (global).
  hide_players: boolean;
  // true si el dueño tiene un rango autorizado por el GM y la banda cuenta
  // en el portal de la hermandad.
  is_rank_integrated: boolean;
  // Personaje que subió la banda (atribución). NULL para bandas legacy.
  character_name: string | null;
  character_realm: string | null;
  created_at: string;
  updated_at: string;
}

type PublicSchema = {
  raiddominion_profiles: {
    Row: ProfileRow;
    Insert: Partial<ProfileRow> & { id: string };
    Update: Partial<ProfileRow>;
  };
  raiddominion_guilds: {
    Row: GuildRow;
    Insert: Partial<GuildRow> & { slug: string; name: string; owner_id: string };
    Update: Partial<GuildRow>;
  };
  raiddominion_saved_variables: {
    Row: SavedVariableRow;
    Insert: Partial<SavedVariableRow> & { user_id: string };
    Update: Partial<SavedVariableRow>;
  };
  raiddominion_guild_config: {
    Row: GuildConfigRow;
    Insert: Pick<GuildConfigRow, 'guild_id' | 'config_key'> & Partial<Pick<GuildConfigRow, 'config_value'>>;
    Update: Partial<GuildConfigRow>;
  };
  raiddominion_bands: {
    Row: BandRow;
    Insert: Partial<BandRow> & { owner_id: string; slug: string; name: string };
    Update: Partial<BandRow>;
  };
};

export type Database = {
  public: {
    Tables: PublicSchema;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
