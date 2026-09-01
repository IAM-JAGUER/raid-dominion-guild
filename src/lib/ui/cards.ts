/**
 * Fichas comunes (cards) del portal: hermandad, personaje y banda.
 * Fuente ÚNICA del literal de cada card pública — no dupliques en directorios,
 * vistas (Realm/Character/Jugador) ni portales (ver AGENTS.sections/pagina-map.md §2).
 * Cards base (cardLink/cardTitle/iconTile) viven en src/lib/ui/card.ts.
 */
import { supabase } from '@/lib/supabase';
import { getPublicAccountNames, type CharacterRow, type PublicAccountNames } from '@/lib/api';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { safePlayerName, isNamelessSafe, handleFromSlug } from '@/lib/ui/playerNames';
import { cardLink, card as cardBox, cardTitle, iconTile } from '@/lib/ui/card';
import { ui } from '@/lib/ui/design';
import { chip, el } from '@/lib/ui/dom';
import type { GuildRow, BandRow } from '@/types/database';

// ── Card de hermandad (directorio /hermandades, reino, perfil) ──────────────
export function renderGuildCard(g: GuildRow): HTMLElement {
  const link = cardLink(`/hermandad/${g.slug}`, 'p-5');

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(iconTile((g.name[0] || '?').toUpperCase(), 'w-10 h-10', 'text-lg'));
  head.appendChild(cardTitle(g.name, 'text-base', 'truncate min-w-0'));
  link.appendChild(head);

  if (g.description) {
    link.appendChild(el('p', `${ui.text.bodyMuted} italic line-clamp-2 mb-3`, g.description));
  }

  // Chips: facción, servidor (enlaza al directorio de servidores), verificación y Discord
  const chips = el('div', 'flex flex-wrap gap-1.5 mb-3');
  if (g.faction) {
    const faction = el('span', `shrink-0 ${ui.badge} ${ui.badgeSm} ${g.faction === 'Horde' ? 'bg-red-950/40 border-red-700/50 text-red-300' : 'bg-sky-950/40 border-sky-700/50 text-sky-300'}`, g.faction === 'Horde' ? 'Horda' : 'Alianza');
    chips.appendChild(faction);
  }
  if (g.server) {
    const serverChip = el('a', `${ui.badge} ${ui.badgeSm} bg-gray-800/60 border-amber-600/20 text-sky-200 hover:bg-sky-900/30 transition-colors`, g.server) as HTMLAnchorElement;
    serverChip.href = `/servidor/${encodeURIComponent(g.server)}`;
    chips.appendChild(serverChip);
  }
  if (g.claim_status === 'verified') {
    chips.appendChild(el('span', `${ui.badge} ${ui.badgeSm} bg-emerald-950/30 border-emerald-600/40 text-emerald-300`, '✓ Verificada'));
  }
  if (g.discord_link) {
    const discord = el('a', `${ui.badge} ${ui.badgeSm} bg-indigo-950/30 border-indigo-600/40 text-indigo-300 hover:bg-indigo-900/30 transition-colors`, 'Discord') as HTMLAnchorElement;
    discord.href = g.discord_link;
    discord.target = '_blank';
    discord.rel = 'noopener noreferrer';
    discord.title = 'Discord de la hermandad';
    chips.appendChild(discord);
  }
  if (chips.children.length > 0) link.appendChild(chips);

  const meta = el('div', 'flex items-center justify-between mt-auto pt-3 border-t border-amber-600/15');
  meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500', g.realm || 'Reino no especificado'));
  meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-amber-400 group-hover:text-amber-300 transition-colors', 'Ver portal →'));
  link.appendChild(meta);

  return link;
}

// ── Card compacta de personaje (directorio /personajes y reino) ────────────
// Acento lateral por clase + ícono + nombre en color de clase + chips + pie
// con atribución al dueño (handle estable @hex si el perfil no declara nombre).
interface CharacterCardCtx {
  // Perfil dueño de cada personaje (id → slug/display/character_name).
  profiles?: Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>;
  // Nombres públicos por cuenta (sanitiza el "Por <jugador>").
  names?: Map<string, PublicAccountNames>;
  // Ocultar el chip de reino (vista acotada a un reino).
  hideRealm?: boolean;
}

export function renderCharacterCard(c: CharacterRow, ctx: CharacterCardCtx = {}): HTMLElement {
  const profile = ctx.profiles?.get(c.user_id);
  const charHref = c.slug ? `/personaje/${c.slug}` : null;
  const profHref = profile?.slug ? `/jugador/${profile.slug}` : null;
  const href = charHref ?? profHref;
  const color = classColor(c.class, c.class_file);
  const link: HTMLElement = href
    ? cardLink(href, 'p-4 pl-5')
    : cardBox('p-4 pl-5 opacity-80');
  if (!href) link.title = 'El jugador mantiene su perfil privado';

  const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
  accent.style.backgroundColor = color;
  link.appendChild(accent);

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(classIconEl(c.class, c.class_file, 'w-9 h-9 rounded-md shrink-0 shadow-lg border border-gray-700/50 object-cover'));
  const nameWrap = el('div', 'flex items-center gap-1.5 min-w-0');
  const name = el('h2', 'font-black italic leading-[1.3] text-base transition-colors duration-200', `${c.name}${c.realm && !ctx.hideRealm ? '-' + c.realm : ''}`);
  name.style.color = color;
  nameWrap.appendChild(name);
  if (c.sv_is_gm) {
    const star = el('span', 'shrink-0 text-fuchsia-400 text-sm', '★');
    star.title = 'Maestro de hermandad';
    nameWrap.appendChild(star);
  }
  head.appendChild(nameWrap);
  link.appendChild(head);

  const chips = el('div', 'flex flex-wrap gap-1.5');
  if (c.class) chips.appendChild(chip(c.class));
  if (!ctx.hideRealm && c.realm) chips.appendChild(chip(c.realm, 'text-sky-200 bg-gray-800/60 border-sky-600/30'));
  if (c.server) chips.appendChild(chip(c.server, 'text-sky-200 bg-gray-800/60 border-sky-600/30'));
  if (typeof c.level === 'number') chips.appendChild(chip(`Nivel ${c.level}`));
  if (c.avg_ilvl !== null && c.avg_ilvl !== undefined) chips.appendChild(chip(`ilvl ${c.avg_ilvl}`, 'text-amber-300 bg-gray-800/60 border-amber-500/30'));
  if (c.member_verified) chips.appendChild(chip('✓ Validado', 'text-emerald-300 bg-emerald-950/30 border-emerald-600/40'));
  if (c.sv_guild_name) chips.appendChild(chip(`${c.sv_guild_name}${c.sv_guild_rank ? ' · ' + c.sv_guild_rank : ''}`, 'text-sky-200 bg-gray-800/60 border-sky-600/30'));
  link.appendChild(chips);

  const foot = el('p', 'text-xs text-gray-500 mt-4 flex items-center justify-between');
  const info = ctx.names?.get(c.user_id);
  // Un personaje solo se atribuye a un jugador, nunca a otro personaje: si
  // el perfil dueño no declara nombre visible, cae al handle estable @hex.
  const ownerName = profile
    ? isNamelessSafe(profile, { publicNames: info?.publicNames })
      ? handleFromSlug(profile.slug)
      : safePlayerName(profile, { publicNames: info?.publicNames, fallbackName: info?.principal })
    : '';
  foot.textContent = charHref
    ? (ownerName ? `Por ${ownerName} · Ver ficha →` : 'Ver ficha →')
    : href
      ? (ownerName ? `Por ${ownerName} · Ver perfil →` : 'Ver perfil →')
      : 'Perfil privado';
  link.appendChild(foot);

  return link;
}

// ── Card de banda (directorio /bandas, reino, portal, perfil) ──────────────
// Ícono + nombre + chips (horario/GS/jugadores/dueño) + pie con atribución.
export interface BandCardInput {
  slug: string;
  name: string;
  schedule?: string | null;
  min_gs?: number | null;
  hide_players?: boolean;
  // ¿Pertenece a una hermandad? `null` = banda personal conocida (chip
  // "Personal" si no hay dueño); `undefined` = se desconoce (no se infiere).
  guildId?: string | null;
}

export interface BandCardOpts {
  // Fuente de la integración (character_name de un miembro): badge "Integrada".
  source?: string | null;
  // Conteo de jugadores YA fusionado; si viene undefined se omite el chip.
  playerCount?: number;
  // Dueño visible (guild pública o perfil público).
  owner?: { href?: string; label?: string; kind?: 'guild' | 'player' } | null;
}

export function renderBandCard(band: BandCardInput, opts?: BandCardOpts): HTMLElement {
  const link = cardLink(`/banda/${encodeURIComponent(band.slug)}`, 'p-5');

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(iconTile((band.name[0] || '?').toUpperCase(), 'w-10 h-10', 'text-lg'));
  head.appendChild(el('h3', 'font-black italic text-base leading-[1.3] text-white group-hover:text-amber-200 transition-colors', band.name));
  link.appendChild(head);

  const meta = el('div', 'flex flex-wrap gap-1.5');
  if (band.schedule) meta.appendChild(chip(band.schedule));
  if (typeof band.min_gs === 'number' && band.min_gs > 0) meta.appendChild(chip(`GS ${band.min_gs}`, '!text-amber-300 !border-amber-500/40'));
  if (band.hide_players) {
    meta.appendChild(chip('jugadores ocultos', '!text-gray-500'));
  } else if (typeof opts?.playerCount === 'number') {
    meta.appendChild(chip(`${opts.playerCount} jugador${opts.playerCount === 1 ? '' : 'es'}`));
  }
  if (opts?.owner?.href && opts.owner.label) {
    meta.appendChild(chip(opts.owner.label, '!text-sky-200 !border-sky-600/30'));
  } else if (band.guildId === null) {
    // Banda personal conocida y sin dueño visible → atribución propia.
    meta.appendChild(chip('Personal', '!text-sky-200 !border-sky-600/30'));
  }
  if (opts?.source) {
    meta.appendChild(chip('Integrada', '!text-emerald-300 !border-emerald-500/40'));
  }
  link.appendChild(meta);

  const foot = el('p', 'text-xs text-gray-500 mt-4 flex items-center justify-between');
  // La banda se atribuye SOLO al jugador (cuenta) o a la hermandad; jamás
  // a un personaje (character_name) que la subió.
  if (opts?.owner?.href && opts.owner.label) {
    foot.appendChild(el('span', 'text-sky-300 hover:text-sky-200 transition-colors', opts.owner.kind === 'guild' ? opts.owner.label : `Por ${opts.owner.label}`));
    foot.appendChild(document.createTextNode('Ver banda →'));
  } else {
    foot.appendChild(el('span', 'text-amber-300/80 group-hover:text-amber-200 transition-colors', 'Ver banda →'));
  }
  link.appendChild(foot);

  return link;
}

// ── Helpers de datos compartidos (directorio y vistas) ─────────────────────
// Perfil dueño de una lista de personajes (id → slug/display/character_name).
export async function loadCharacterProfiles(userIds: string[]): Promise<Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>> {
  const map = new Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>();
  if (userIds.length === 0) return map;
  const res = await supabase.from('raiddominion_profiles').select('id, slug, display_name, character_name').in('id', userIds);
  if (!res.error) {
    (res.data as Array<{ id: string; slug: string | null; display_name: string | null; character_name: string | null }>).forEach((p) => map.set(p.id, p));
  }
  return map;
}