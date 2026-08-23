// Tipos del parser de SavedVariables de RaidDominion (RaidDominionDB v3)
// Alineados al formato REAL verificado en los SV del cliente
// (IAMM 2026-08-22 como referencia vigente; IAMM1/JUNGJX para secciones legacy).

// Ítem de una lista configurable (roles, buffs, auras, abilities)
export interface ConfigListItem {
  name: string;
  icon?: string;
}

// Ítem de contenido (mecánicas, reglas)
export interface ContentItem {
  title?: string;
  content?: string;
  icon?: string;
}

// Pieza de equipamiento (registry.player.equipment)
export interface EquipmentPiece {
  slot: number;
  name: string;
  ilvl: number;
  quality: number;
}

// Personaje propio exportado por el addon (registry.player)
export interface PlayerCharacter {
  name: string;
  realm: string;
  race?: string;
  raceFile?: string;
  class?: string;
  classFile?: string;
  level?: number;
  talentSpec?: string;
  talentTree?: number;
  avgIlvl?: number;
  equipmentCount?: number;
  equipment: EquipmentPiece[];
}

// Personaje de la cuenta WoW (characters["Nombre-Reino"]) — config compartida
export interface AccountCharacter {
  key: string;
  name: string;
  realm?: string;
  faction?: string;
  class?: string;
  classFile?: string;
  race?: string;
  level?: number;
  firstSeen?: number;
  lastSeen?: number;
}

// Snapshot de registro POR PERSONAJE (registry["Nombre-Reino"])
export interface CharacterRegistry {
  key: string;
  player: PlayerCharacter | null;
  guild: RegistryGuild | null;
  savedAt: string | null;
}

// Miembro del roster GM v3 (registry.*.guild.memberList).
// El addon NO incluye notas pública/oficial por diseño (privacidad).
export interface GuildMemberSummary {
  name: string;
  rank?: string;
  rankIndex?: number;
  level?: number;
  class?: string;
  classFile?: string;
  online?: boolean;
}

// Hermandad del personaje activo según el addon (registry.guild)
export interface RegistryGuild {
  name: string;
  numMembers?: number;
  isGM: boolean;
  rankIndex?: number;
  rank?: string;
  // Roster completo; solo presente cuando el archivo fue generado por un maestro
  memberList?: GuildMemberSummary[];
}

// Miembro del roster de la hermandad (Guild.memberList; sección legacy opcional)
export interface GuildMember {
  name: string;
  class: string;
  rank: string;
  race?: string;
  publicNote: string;
  officerNote: string;
}

// Jugador dentro de una banda (bands[i].players) — forma real:
// { name, class(CLASSFILE), role, dual, leader, banned, sanction, notes, points }
export interface BandPlayer {
  name: string;
  class?: string;
  role?: string;
  dual?: string;
  leader?: string;
  banned?: boolean;
  sanction?: string;
  notes?: string;
  points?: number;
}

// Banda registrada (bands[])
export interface Band {
  name: string;
  icon?: string;
  schedule?: string;
  minGS?: number;
  players: BandPlayer[];
  spammer?: {
    channels?: Record<string, boolean>;
    duration?: number;
    message?: string;
  };
}

// Asignaciones (assignments: mapa nombre → jugador)
export interface Assignments {
  roles: Record<string, string>;
  buffs: Record<string, string>;
  abilities: Record<string, string>;
  auras: Record<string, string>;
}

// Resultado normalizado del parseo
export interface ParsedSavedVariables {
  version: string;
  // Personaje propio del archivo actual (registry.player) — fuente principal
  player: PlayerCharacter | null;
  savedAt: string | null;
  // Roster completo de la cuenta (config compartida entre personajes)
  characters: AccountCharacter[];
  // Snapshots de registro por personaje (equipamiento individual incluido)
  registries: CharacterRegistry[];
  // Hermandad del personaje activo reportada por el addon
  registryGuild: RegistryGuild | null;
  // Roster de hermandad (sección legacy; evidencia de membresía)
  generatedBy: string | null;
  lastUpdate: number | null;
  guild: {
    members: GuildMember[];
    leaderCandidate: string | null;
    isLeaderRank: boolean;
  };
  bands: Band[];
  roles: ConfigListItem[];
  buffs: ConfigListItem[];
  abilities: ConfigListItem[];
  auras: ConfigListItem[];
  mechanics: ContentItem[];
  rules: ContentItem[];
  assignments: Assignments;
  chat: {
    channel?: string;
    discordLink?: string;
  };
  // Submenús visibles del addon (ui.show*Menu)
  menus: Record<string, boolean>;
  raw: {
    guildSize: number;
    hasBands: boolean;
    hasUi: boolean;
    hasRegistry: boolean;
  };
}

export interface ParseResult {
  ok: boolean;
  data: ParsedSavedVariables | null;
  errors: string[];
  warnings: string[];
}

export const PARSER_VERSION = 'v3.1.0';

export const MAX_SV_BYTES = 2 * 1024 * 1024; // 2 MB

// Rangos que indican liderazgo para el claim de maestro
export const LEADER_RANKS = ['administrador', 'oficial', 'maestro', 'guild master', 'lider', 'líder'];
