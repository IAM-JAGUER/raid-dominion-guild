// Chips de identidad de un personaje (raza, clase, cifras y hermandad).
// Fuente única del patrón que compartían la ficha de personaje y el perfil
// de jugador; cada consumidor elige qué grupos pinta.
import { classIconEl } from '@/lib/ui/classIcon';
import { chip, el, iconChip, statChip } from '@/lib/ui/dom';
import { raceIconFor } from '@/lib/ui/icons';
import { racePortraitEl } from '@/lib/ui/racePortrait';

export interface CharacterChipsInput {
  race?: string | null;
  race_file?: string | null;
  sex?: string | null;
  class?: string | null;
  class_file?: string | null;
  level?: number | null;
  avg_ilvl?: number | null;
  member_verified?: boolean;
  sv_guild_name?: string | null;
  sv_is_gm?: boolean;
  sv_guild_rank?: string | null;
}

export interface CharacterChipsOptions {
  // Chip de raza antes de la clase (ficha de personaje).
  race?: boolean;
  // Nivel, ilvl medio y validación después de la clase (perfil de jugador).
  stats?: boolean;
}

// Añade los chips directamente al contenedor del consumidor (sin wrapper).
export function appendCharacterChips(
  row: HTMLElement,
  c: CharacterChipsInput,
  opts: CharacterChipsOptions = {},
): HTMLElement {
  if (opts.race) {
    const portrait = racePortraitEl(c.race, c.race_file, undefined, c.sex);
    if (portrait) {
      const raceChip = chip(c.race || 'Raza', '', 'md');
      raceChip.insertBefore(portrait, raceChip.firstChild);
      row.appendChild(raceChip);
    } else {
      row.appendChild(iconChip(raceIconFor(c.race), c.race || 'Raza', '', 'md'));
    }
  }

  if (c.class) {
    // El chip usa el MISMO icono de clase nuevo que el medallón, a 20px.
    const clsChip = chip(c.class, '', 'md');
    const clsImg = classIconEl(c.class, c.class_file, 'w-5 h-5 rounded-full object-contain shrink-0');
    clsImg.alt = '';
    clsChip.insertBefore(clsImg, clsChip.firstChild);
    row.appendChild(clsChip);
  }

  if (opts.stats) {
    if (typeof c.level === 'number') row.appendChild(statChip('Nivel', String(c.level)));
    if (c.avg_ilvl !== null && c.avg_ilvl !== undefined) {
      const il = statChip('ilvl', String(c.avg_ilvl));
      il.classList.add('!text-brand-300', '!border-brand-500/40');
      row.appendChild(il);
    }
    if (c.member_verified) {
      const v = iconChip('validado', 'Validado', '', 'md');
      v.classList.add('!text-emerald-300', '!border-emerald-600/40');
      row.appendChild(v);
    }
  }

  if (c.sv_guild_name) {
    row.appendChild(iconChip(
      c.sv_is_gm ? 'estrella' : 'hermandad',
      c.sv_is_gm ? `${c.sv_guild_name} · Maestro` : `${c.sv_guild_name}${c.sv_guild_rank ? ' · ' + c.sv_guild_rank : ''}`,
      c.sv_is_gm ? '!text-fuchsia-300 !border-fuchsia-500/40' : '!text-brand-200 !border-brand-600/30',
      'md',
    ));
  }

  return row;
}

// Fila de chips (contenedor flex) para consumidores que la insertan como bloque.
export function characterChips(c: CharacterChipsInput, opts: CharacterChipsOptions = {}): HTMLElement {
  return appendCharacterChips(el('div', 'flex flex-wrap gap-1.5'), c, opts);
}
