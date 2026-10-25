// Tipos del parser de SavedVariables de RaidDominion (RaidDominionDB v3)
// Alineados al formato REAL verificado en los SV del cliente
// (IAMM 2026-08-22 como referencia vigente; IAMM1/JUNGJX para secciones legacy).

import type { RichTextToken, WowLink } from '@/lib/wowLink';

// Ítem de contenido (mecánicas, reglas)
export interface ContentItem {
  title?: string;
  content?: string;
  icon?: string;
}

// Pieza de equipamiento (efectiva: characters[].equipment o fallback registry)
export interface EquipmentPiece {
  slot: number;
  name: string;
  ilvl: number;
  quality: number;
  // ID del objeto del cliente (si el SV lo exporta); alimenta el tooltip de
  // UltimoWoW en las fichas. Las filas antiguas pueden no traerlo.
  itemID?: number;
}

// Metas personales proyectadas desde itemGoals al pulsar "Registrar".
export interface EquipmentObjective {
  slot: number;
  name: string;
  itemID?: number;
  ilvl?: number;
  quality?: number;
  done: boolean;
}

export interface CurrencyObjective {
  name: string;
  target: number;
  reached: boolean;
}

export interface PlayerObjectives {
  equipment: EquipmentObjective[];
  currencies: CurrencyObjective[];
}

// Instancia guardada (v3.2.0). Fuente canónica: characters["Nombre-Reino"].instances;
// fallback: registry["Nombre-Reino"].player.instances. `resetAt` es la época
// absoluta del reinicio; la web recalcula la cuenta atrás.
export interface CharacterInstance {
  name: string;
  difficulty?: string;
  resetAt?: number;
  extended?: boolean;
}

// Personaje propio normalizado: identidad/nota/objetivos desde registry.player
// y datos pasivos (equipo/instancias/nivel/raza/clase) desde characters.
// `server` = realmlist (servidor real, p.ej. "Lordaeron"), DISTINTO de `realm`.
// Solo existe en registry.player (el roster `characters` de la cuenta no lo trae).
export interface PlayerCharacter {
  name: string;
  realm: string;
  server?: string;
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
  // Metas personales proyectadas desde itemGoals por el addon. El SV las
  // escribe como rama hermana (`registry["Nombre-Reino"].objectives`); aquí se
  // normalizan dentro del personaje porque son datos scope-del-personaje.
  objectives?: PlayerObjectives;
  // Nota global del personaje (RD_Utils_PlayerNotes). Viaja SIEMPRE que el SV
  // traiga la clave (puede ser "" para borrarla); ausente = SV anterior a 3.1.0.
  note?: string;
  // Tokens ricos de la nota (enlaces del juego) para el tooltip de UltimoWoW.
  // Solo se persisten en el almacén privado de notas; nunca se publica markup.
  noteRich?: RichTextToken[];
  // Instancias efectivas: characters[].instances o fallback registry (v3.2.0).
  instances?: CharacterInstance[];
}

// Moneda del roster de la cuenta (`characters[key].currencies`). `money`
// marca la entrada de oro; `quantity` es la cantidad (cobre si money=true).
export interface AccountCurrency {
  name: string;
  quantity: number;
  money: boolean;
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
  version?: string;
  firstSeen?: number;
  lastSeen?: number;
  currencies?: AccountCurrency[];
  money?: number;
}

// Snapshot de registro POR PERSONAJE (registry["Nombre-Reino"])
export interface CharacterRegistry {
  key: string;
  // Único portador de las metas: `player.objectives`. La rama `objectives` del
  // SV se lee y se anida aquí; no se expone duplicada en el registry.
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

// Rango de la jerarquía de hermandad (registry.guild.ranks).
// El addon la escribe para CUALQUIER miembro con hermandad (BuildGuildRanks):
// índice 0 = líder (GM), jerarquía descendente hasta N-1. El nombre del
// índice 0 puede venir vacío en algunos SV (se muestra con fallback).
export interface GuildRank {
  index: number;
  name: string;
}

// Hermandad del personaje activo según el addon (registry.guild)
export interface RegistryGuild {
  name: string;
  numMembers?: number;
  isGM: boolean;
  rankIndex?: number;
  rank?: string;
  // Jerarquía completa de rangos, ordenada por index (0 = líder). Presente
  // para cualquier miembro con hermandad, no solo para el maestro.
  ranks?: GuildRank[];
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
  // Enlace original del nombre cuando el SV lo guardó como markup de chat
  // (caso real: logro de la mazmorra). Solo vive en memoria para el preview;
  // a la DB viaja `name` ya limpio (sin markup).
  nameLink?: WowLink;
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
  rules: ContentItem[];
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

export const PARSER_VERSION = 'v3.7.0';

export const MAX_SV_BYTES = 2 * 1024 * 1024; // 2 MB

// Rangos que indican liderazgo para el claim de maestro
export const LEADER_RANKS = ['administrador', 'oficial', 'maestro', 'guild master', 'lider', 'líder'];
