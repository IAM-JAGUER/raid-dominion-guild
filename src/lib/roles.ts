import type { RaiddominionRole } from '@/types/database';

export const ROLES: RaiddominionRole[] = ['visitante', 'member', 'guild_master', 'moderator', 'admin'];

// El visitante aún no usa el addon activamente; sube su SV para validar su personaje
export function isVisitor(role: RaiddominionRole): boolean {
  return role === 'visitante';
}

export function roleIndex(role: RaiddominionRole): number {
  return ROLES.indexOf(role);
}

// guild_master, moderator y admin acceden al dashboard de hermandad
export function canAccessGuildDashboard(role: RaiddominionRole): boolean {
  return roleIndex(role) >= 1;
}

// Solo guild_master y admin administran la ficha
export function canManageGuild(role: RaiddominionRole): boolean {
  return role === 'guild_master' || role === 'admin';
}

// moderator y admin son staff
export function isStaff(role: RaiddominionRole): boolean {
  return role === 'moderator' || role === 'admin';
}
