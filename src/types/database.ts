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
