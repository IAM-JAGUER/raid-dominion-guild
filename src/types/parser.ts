// Tipos del parser de SavedVariables de RaidDominion (RaidDominionDB v3.0.0)
// Formato real del addon v3 (ver D:\WowClient esMX\Interface\AddOns\RaidDominion).

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

// Miembro del roster de la hermandad (Guild.memberList)
export interface GuildMember {
  name: string;
  class: string;
  rank: string;
  race?: string;
  publicNote: string;
  officerNote: string;
}

// Jugador dentro de una banda (bands[i].players)
export interface BandPlayer {
  name: string;
  class?: string;
  role?: string;
  dual?: string;
  gearScore?: number;
  leader?: string;
  isLeader?: boolean;
  isSanctioned?: boolean;
  banned?: boolean;
  sanction?: string;
  notes?: string;
  points?: number;
}

// Registro de asistencia (bands[i].attendance)
export interface BandAttendance {
  date?: string;
  present: string[];
  absent: string[];
}

// Banda registrada (bands[])
export interface Band {
  name: string;
  icon?: string;
  schedule?: string;
  minGS?: number;
  players: BandPlayer[];
  attendance: BandAttendance[];
  spammer?: {
    channels?: Record<string, boolean>;
    duration?: number;
    message?: string;
  };
}

// Banda Core (Core[])
export interface CoreBand {
  name: string;
  schedule?: string;
  minGS?: number;
  withNote?: boolean;
  members?: BandPlayer[];
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
  generatedBy: string | null;
  lastUpdate: number | null;
  guild: {
    members: GuildMember[];
    leaderCandidate: string | null;
    isLeaderRank: boolean;
  };
  coreBands: CoreBand[];
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
  raw: {
    guildSize: number;
    hasCore: boolean;
    hasBands: boolean;
    hasUi: boolean;
  };
}

export interface ParseResult {
  ok: boolean;
  data: ParsedSavedVariables | null;
  errors: string[];
  warnings: string[];
}

export const PARSER_VERSION = 'v3.0.0';

export const MAX_SV_BYTES = 2 * 1024 * 1024; // 2 MB

// Rangos que indican liderazgo para el claim de maestro
export const LEADER_RANKS = ['administrador', 'oficial', 'maestro', 'guild master', 'lider', 'líder'];