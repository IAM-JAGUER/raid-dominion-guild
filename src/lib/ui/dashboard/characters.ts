// Card de personaje del dashboard (Mis Personajes). Extraída de
// src/pages/dashboard.astro — comportamiento idéntico. El gate de publicación
// y el refresco posterior al guardado entran por opciones (estado del closure
// del dashboard).

import { setCharacterVisibility } from '@/lib/api';
import type { CharacterRow } from '@/lib/api';
import { card, cardTop } from '@/lib/ui/card';
import { ui } from '@/lib/ui/design';

export interface CharacterCardOptions {
  // Gate de publicación: un Visitante sin personajes validados no puede
  // activar visibilidad pública (el toggle queda bloqueado).
  canPublish: boolean;
  // Se ejecuta tras guardar con éxito la visibilidad (el dashboard refresca
  // el selector de personaje principal y los indicadores del encabezado).
  onSaved: () => void;
  // Número de orden del personaje en la lista (1, 2, 3…): se muestra en un
  // chip circular numerado al inicio de la card.
  number: number;
}

export function characterCard(c: CharacterRow, opts: CharacterCardOptions): HTMLElement {
  const cardEl = card('p-4');
  cardEl.appendChild(cardTop());

  const header = document.createElement('div');
  header.className = 'flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between';
  const info = document.createElement('div');
  info.className = 'flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:gap-2.5';
  const num = document.createElement('span');
  num.className = 'shrink-0 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/40 text-amber-200 text-xs font-black flex items-center justify-center';
  num.textContent = String(opts.number);
  info.appendChild(num);
  const titleWrap = document.createElement('div');
  titleWrap.className = 'min-w-0';
  const title = document.createElement(c.slug ? 'a' : 'p');
  title.className = 'text-sm font-black italic leading-[1.3] text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600';
  title.textContent = `${c.name}${c.realm ? '-' + c.realm : ''}`;
  if (c.slug) {
    (title as HTMLAnchorElement).href = `/personaje/${c.slug}`;
    (title as HTMLAnchorElement).classList.add('decoration-amber-600/50', 'underline-offset-2', 'hover:decoration-amber-400');
  }
  titleWrap.appendChild(title);
  const chips = document.createElement('div');
  chips.className = 'flex flex-wrap gap-2 mt-1.5';
  const chipCls = `${ui.badge} ${ui.badgeMd} text-gray-400 bg-gray-900/60 border-amber-600/30`;
  if (c.class) chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: c.class }));
  if (c.race) chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: c.race }));
  if (typeof c.level === 'number') chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: `Nivel ${c.level}` }));
  if (c.avg_ilvl !== null && c.avg_ilvl !== undefined) {
    chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls + ' !text-amber-300 !border-amber-500/40', textContent: `ilvl ${c.avg_ilvl}` }));
  }
  if (c.sv_guild_name) {
    chips.appendChild(Object.assign(document.createElement('span'), { className: `${ui.badge} ${ui.badgeMd} ` + (c.sv_is_gm ? 'text-amber-300 bg-amber-950/30 border-amber-500/40' : 'text-sky-200 bg-gray-900/60 border-sky-600/30'), textContent: c.sv_is_gm ? `★ ${c.sv_guild_name} · Maestro` : `${c.sv_guild_name}${c.sv_guild_rank ? ' · ' + c.sv_guild_rank : ''}` }));
  }
  info.append(titleWrap, chips);
  header.appendChild(info);

  const visLabel = document.createElement('label');
  visLabel.className = 'flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400';
  const visCheck = document.createElement('input');
  visCheck.type = 'checkbox';
  visCheck.checked = c.is_public;
  visCheck.className = 'w-4 h-4 accent-amber-500';
  const visStatus = document.createElement('span');
  visStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest';
  if (!opts.canPublish) {
    visCheck.disabled = true;
    visCheck.checked = false;
    visCheck.className += ' opacity-40';
    visLabel.className += ' opacity-70 cursor-not-allowed';
    visLabel.title = 'Requiere cuenta Miembro validada (2+ personajes).';
    visStatus.textContent = 'bloqueado';
    visStatus.className += ' text-gray-500';
  } else {
    visCheck.addEventListener('change', async () => {
      visCheck.disabled = true;
      visStatus.textContent = '· guardando…';
      visStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-amber-300';
      const res = await setCharacterVisibility(c.id, visCheck.checked);
      visCheck.disabled = false;
      if (res.ok) {
        c.is_public = visCheck.checked;
        visStatus.textContent = '✓ guardado';
        visStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400';
        opts.onSaved();
      } else {
        visCheck.checked = !visCheck.checked;
        visStatus.textContent = '✗ error';
        visStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-red-400';
      }
      window.setTimeout(() => { visStatus.textContent = ''; }, 2500);
    });
  }
  visLabel.append(visCheck, document.createTextNode('Público'), visStatus);
  header.appendChild(visLabel);
  cardEl.appendChild(header);

  return cardEl;
}