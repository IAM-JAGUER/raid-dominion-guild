// Renderers del visor de Registro del dashboard (pestaña Registro).
// Extraídos de src/pages/dashboard.astro — comportamiento idéntico.
// Solo funciones puras (reciben datos, escriben en el DOM por id o por
// contenedor pasado); el estado del closure del dashboard (snapshotGmGuilds,
// updateClaimBanner) lo conecta la capa fina de dashboard.astro.

import { el } from '@/lib/ui/preview';
import { configChip } from '@/lib/ui/dashboard/chips';
import { resolveRankName } from '@/lib/ui/ranks';
import { ui } from '@/lib/ui/design';
import { card, cardTop, cardRow } from '@/lib/ui/card';
import type { ParsedSavedVariables, ConfigListItem, ContentItem, Assignments, RegistryGuild } from '@/types/parser';

// Lista de ítems de configuración (roles, buffs, auras, abilities)
export function fillList(listId: string, cntId: string, items: ConfigListItem[]): void {
  const wrap = document.getElementById(listId) as HTMLElement;
  const cnt = document.getElementById(cntId) as HTMLElement;
  wrap.innerHTML = '';
  cnt.textContent = `(${items.length})`;
  if (items.length === 0) {
    wrap.innerHTML = '<span class="text-[11px] text-gray-600 italic">Sin elementos aún</span>';
    return;
  }
  items.forEach((it) => wrap.appendChild(configChip(it.name)));
}

// Lista de contenido (mecánicas, reglas)
export function renderContentList(listId: string, cntId: string, items: ContentItem[]): void {
  const wrap = document.getElementById(listId) as HTMLElement;
  const cnt = document.getElementById(cntId) as HTMLElement;
  wrap.innerHTML = '';
  cnt.textContent = `(${items.length})`;
  if (items.length === 0) {
    wrap.innerHTML = '<p class="text-[11px] text-gray-600 italic">Sin elementos aún</p>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'space-y-2';
  items.forEach((it) => {
    const li = el('li', 'flex items-start text-sm text-gray-300 bg-gray-900/40 border border-amber-600/15 rounded-md px-3 py-2');
    li.appendChild(el('span', 'text-amber-600 mr-2 mt-0.5', '›'));
    const inner = el('div', '');
    inner.appendChild(el('p', 'font-bold text-white', it.title || 'Elemento'));
    if (it.content) inner.appendChild(el('p', 'text-gray-400 text-xs mt-0.5', it.content));
    li.appendChild(inner);
    list.appendChild(li);
  });
  wrap.appendChild(list);
}

// Mi personaje registrado (registry.player): datos + equipamiento
export function renderPlayerSnapshot(d: ParsedSavedVariables): void {
  const wrap = document.getElementById('viewer-player') as HTMLElement;
  wrap.innerHTML = '';
  const p = d.player;
  if (!p) {
    wrap.appendChild(el('p', 'text-[11px] text-gray-600 italic', 'Sin registro de personaje propio (registry.player).'));
    return;
  }
  wrap.appendChild(el('p', `${ui.gradientTitle} text-sm font-black italic`, `${p.name}${p.realm ? '-' + p.realm : ''}`));
  const chips = el('div', 'flex flex-wrap gap-2 mt-1.5');
  if (p.race) chips.appendChild(configChip(p.race));
  if (p.class) chips.appendChild(configChip(p.class));
  if (typeof p.level === 'number') chips.appendChild(configChip(`Nivel ${p.level}`));
  if (p.talentSpec) chips.appendChild(configChip(`Spec: ${p.talentSpec}`));
  if (typeof p.avgIlvl === 'number') chips.appendChild(configChip(`ilvl ${p.avgIlvl}`, true));
  wrap.appendChild(chips);
}

// Hermandad del registro normalizada para la ficha del visor.
export interface RegistryGuildCard {
  name: string;
  isGM: boolean;
  ranks: NonNullable<RegistryGuild['ranks']>;
  ownRankIndex: number | undefined;
  ownRank: string | undefined;
  numMembers: number | undefined;
  characters: string[];
}

// Hermandades del registro (registry.*.guild): CIFRAS + jerarquía de rangos,
// sin roster completo. Un jugador puede tener personajes en varias hermandades
// y ser GM de varias. Pura: devuelve las fichas; el dashboard decide el banner.
export function collectRegistryGuilds(d: ParsedSavedVariables): RegistryGuildCard[] {
  const guilds = new Map<string, RegistryGuildCard>();
  const addGuild = (rg: RegistryGuild | null | undefined, charName?: string): void => {
    if (!rg?.name) return;
    const key = rg.name.trim().toLowerCase();
    const cur = guilds.get(key) ?? {
      name: rg.name, isGM: false, ranks: [], ownRankIndex: undefined, ownRank: undefined,
      numMembers: undefined, characters: [],
    };
    if (rg.isGM) cur.isGM = true;
    if (typeof rg.rankIndex === 'number') cur.ownRankIndex = rg.rankIndex;
    if (rg.rank) cur.ownRank = rg.rank;
    if (rg.ranks && rg.ranks.length > 0 && cur.ranks.length === 0) {
      cur.ranks = [...rg.ranks].sort((a, b) => a.index - b.index);
    }
    if (typeof rg.numMembers === 'number') cur.numMembers = rg.numMembers;
    if (charName) cur.characters.push(charName);
    guilds.set(key, cur);
  };
  addGuild(d.registryGuild, d.player?.name);
  d.registries.forEach((r) => addGuild(r.guild, r.player?.name));
  return Array.from(guilds.values());
}

// Renderiza las fichas de hermandad del registro en el contenedor dado.
export function renderRegistryGuildCards(wrap: HTMLElement, guilds: RegistryGuildCard[]): void {
  wrap.innerHTML = '';
  if (guilds.length === 0) {
    wrap.appendChild(el('p', 'text-[11px] text-gray-600 italic', 'Sin hermandad en el registro.'));
    return;
  }
  guilds.forEach((g) => {
    const cardEl = card('p-4');
    cardEl.appendChild(cardTop());
    const head = el('div', 'flex flex-wrap items-center gap-2');
    head.appendChild(el('p', `${ui.gradientTitle} text-sm font-black italic`, g.name));
    if (g.isGM) head.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-amber-300 bg-amber-950/30 border-amber-500/40`, '★ Maestro'));
    cardEl.appendChild(head);

    // El rango propio se detecta por rankIndex contra la jerarquía; el
    // índice 0 (o isGM) es SIEMPRE el líder.
    const ownIndex = g.isGM ? 0 : g.ownRankIndex;
    const ownRankName = resolveRankName({
      rankIndex: ownIndex,
      rank: g.ownRank,
      ranks: g.ranks,
      isGM: g.isGM,
    });

    const meta = el('div', 'flex flex-wrap gap-2 mt-1.5');
    if (typeof g.numMembers === 'number') meta.appendChild(configChip(`${g.numMembers} miembros`));
    if (g.characters.length > 0) meta.appendChild(configChip(`${g.characters.length} personaje(s)`));
    meta.appendChild(configChip(`Tu rango: ${ownRankName}`, g.isGM));
    cardEl.appendChild(meta);

    // Jerarquía completa de rangos (registry.guild.ranks), ordenada por index
    // (0 = líder). El rango del propio usuario se marca si está disponible.
    if (g.ranks.length > 0) {
      const hier = el('div', 'flex flex-wrap items-center gap-1.5 mt-2');
      hier.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500', 'Rangos:'));
      g.ranks.forEach((r) => {
        const isMine = ownIndex !== undefined
          ? r.index === ownIndex
          : (!!g.ownRank && r.name.trim().toLowerCase() === g.ownRank.trim().toLowerCase());
        const label = r.name.trim() || (r.index === 0 ? 'Líder' : `Rango ${r.index}`);
        const cls = isMine
          ? 'text-amber-300 border-amber-500/50 bg-amber-900/30'
          : r.index === 0
            ? 'text-amber-200/90 border-amber-600/30 bg-gray-900/60'
            : 'text-gray-400 border-gray-700/40 bg-gray-900/60';
        hier.appendChild(el('span', `text-[10px] px-2 py-0.5 rounded-md border ${cls}`,
          `${r.index}: ${label}${isMine ? ' · tú' : ''}`));
      });
      cardEl.appendChild(hier);
    }
    if (g.characters.length > 0) {
      cardEl.appendChild(el('p', 'text-[11px] text-gray-500 mt-1.5', `Personajes: ${g.characters.join(', ')}`));
    }
    wrap.appendChild(cardEl);
  });
}

// Personajes de la cuenta (characters: config compartida del SV)
export function renderAccountCharacters(d: ParsedSavedVariables): void {
  const wrap = document.getElementById('viewer-account-chars') as HTMLElement;
  const cnt = document.getElementById('cnt-account-chars') as HTMLElement;
  wrap.innerHTML = '';
  cnt.textContent = `(${d.characters.length})`;
  if (d.characters.length === 0) {
    wrap.innerHTML = '<span class="text-[11px] text-gray-600 italic">Sin personajes de cuenta aún.</span>';
    return;
  }
  d.characters.forEach((c) => {
    const label = `${c.name}${c.realm ? '-' + c.realm : ''}`;
    wrap.appendChild(configChip(label));
  });
}

// Snapshots de registro por personaje (registry["Nombre-Reino"])
export function renderRegistries(d: ParsedSavedVariables): void {
  const wrap = document.getElementById('viewer-registries') as HTMLElement;
  const cnt = document.getElementById('cnt-registries') as HTMLElement;
  wrap.innerHTML = '';
  cnt.textContent = String(d.registries.length);
  if (d.registries.length === 0) {
    wrap.innerHTML = '<p class="text-[11px] text-gray-600 italic">Sin registros por personaje.</p>';
    return;
  }
  d.registries.forEach((reg) => {
    const cardEl = card('p-4');
    cardEl.appendChild(cardTop());
    const head = el('div', 'flex flex-wrap items-center gap-2');
    head.appendChild(el('p', `${ui.gradientTitle} text-sm font-black italic`, reg.player?.name || reg.key || 'Personaje'));
    if (reg.player) {
      if (reg.player.class) head.appendChild(configChip(reg.player.class));
      if (typeof reg.player.level === 'number') head.appendChild(configChip(`Nivel ${reg.player.level}`));
      if (typeof reg.player.avgIlvl === 'number') head.appendChild(configChip(`ilvl ${reg.player.avgIlvl}`, true));
    }
    if (reg.guild) head.appendChild(configChip(`${reg.guild.name}${reg.guild.isGM ? ' · GM' : ''}`));
    if (reg.savedAt) head.appendChild(el('span', 'text-[11px] text-gray-500 italic', reg.savedAt));
    cardEl.appendChild(head);
    wrap.appendChild(cardEl);
  });
}

// Asignaciones detalladas por categoría (nombre → jugador)
export function renderAssignments(d: ParsedSavedVariables): void {
  const wrap = document.getElementById('viewer-assignments') as HTMLElement;
  wrap.innerHTML = '';
  const labels: Record<keyof Assignments, string> = {
    roles: 'Roles',
    buffs: 'Bendiciones',
    abilities: 'Habilidades',
    auras: 'Auras',
  };
  let any = false;
  (Object.keys(labels) as (keyof Assignments)[]).forEach((cat) => {
    const entries = Object.entries(d.assignments[cat]);
    if (entries.length === 0) return;
    any = true;
    const box = el('div', '');
    box.appendChild(el('p', `${ui.eyebrow} mb-1`, labels[cat]));
    const rows = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-1');
    entries.forEach(([name, player]) => {
      const row = cardRow('text-xs text-gray-300 flex justify-between gap-3 px-2 py-1');
      row.appendChild(el('span', 'font-bold text-amber-200', name));
      row.appendChild(el('span', 'text-gray-400', player));
      rows.appendChild(row);
    });
    box.appendChild(rows);
    wrap.appendChild(box);
  });
  if (!any) {
    wrap.innerHTML = '<p class="text-[11px] text-gray-600 italic">Sin asignaciones aún.</p>';
  }
}