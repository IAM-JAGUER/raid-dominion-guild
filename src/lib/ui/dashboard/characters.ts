// Card de personaje del dashboard (Mis Personajes). Extraída de
// src/pages/dashboard.astro — comportamiento idéntico. El gate de publicación
// y el refresco posterior al guardado entran por opciones (estado del closure
// del dashboard).

import { setCharacterVisibility } from '@/lib/api';
import type { CharacterRow } from '@/lib/api';

export interface CharacterCardOptions {
  // Gate de publicación: un Visitante sin personajes validados no puede
  // activar visibilidad pública (el toggle queda bloqueado).
  canPublish: boolean;
  // Se ejecuta tras guardar con éxito la visibilidad (el dashboard refresca
  // el selector de personaje principal y los indicadores del encabezado).
  onSaved: () => void;
}

export function characterCard(c: CharacterRow, opts: CharacterCardOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'bg-gray-800/50 border border-amber-700/40 rounded-md p-4';

  const header = document.createElement('div');
  header.className = 'flex flex-wrap items-center justify-between gap-3';
  const info = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'text-sm font-bold text-white';
  title.textContent = `${c.name}${c.realm ? '-' + c.realm : ''}`;
  const chips = document.createElement('div');
  chips.className = 'flex flex-wrap gap-2 mt-1.5';
  const chipCls = 'text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-900/60 border border-amber-600/30 rounded-md px-2.5 py-1';
  if (c.class) chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: c.class }));
  if (c.race) chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: c.race }));
  if (typeof c.level === 'number') chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls, textContent: `Nivel ${c.level}` }));
  if (c.avg_ilvl !== null && c.avg_ilvl !== undefined) {
    chips.appendChild(Object.assign(document.createElement('span'), { className: chipCls + ' !text-amber-300 !border-amber-500/40', textContent: `ilvl ${c.avg_ilvl}` }));
  }
  if (c.sv_guild_name) {
    chips.appendChild(Object.assign(document.createElement('span'), { className: 'text-[10px] font-black uppercase tracking-widest ' + (c.sv_is_gm ? 'text-amber-300 bg-amber-950/30 border border-amber-500/40' : 'text-sky-200 bg-gray-900/60 border border-sky-600/30') + ' rounded-md px-2.5 py-1', textContent: c.sv_is_gm ? `★ ${c.sv_guild_name} · Maestro` : `${c.sv_guild_name}${c.sv_guild_rank ? ' · ' + c.sv_guild_rank : ''}` }));
  }
  info.append(title, chips);
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
  card.appendChild(header);

  // El equipamiento vive solo en la ficha dedicada /personaje/:slug: la
  // card del dashboard es un enlace compacto, sin lista de piezas.
  if (c.slug) {
    const ficha = document.createElement('a');
    ficha.href = `/personaje/${c.slug}`;
    ficha.className = 'inline-block mt-3 text-xs text-amber-300 hover:text-amber-200 underline';
    ficha.textContent = 'Ver ficha del personaje →';
    card.appendChild(ficha);
  }
  return card;
}