// Ficha en línea del Task Tracker (reemplaza la lista, fiel al tracker wow-rd).
// Pestañas: Detalle · Tareas · Equipamiento · Monedas · Metas · Bandas ·
// Instancias · Notas. Sin GearScore: iLvl, piezas y fechas del SV/portal.

import type { BandRow } from '@/types/database';
import type {
  CharacterInstance,
  CurrencyObjective,
  EquipmentObjective,
  EquipmentPiece,
} from '@/types/parser';
import { inferFactionFromRace } from '@/lib/parser/savedVariables';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { itemRow } from '@/lib/ui/card';
import { TRACKER_FICHA_TABS } from '@/lib/ui/tabs';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { formatMoney, fmtEpoch, formatRemaining } from '@/lib/ui/dashboard/format';
import type { TrackerCharacter } from '@/lib/ui/dashboard/trackerLogic';
import { renderTrackerTasks } from '@/lib/ui/dashboard/trackerTasks';
import { currencyIconFor, iconEl } from '@/lib/ui/icons';
import { applyWowhead, richTextEl, wowheadUrl, wowLinkEl } from '@/lib/ui/wowhead';
import { normalizeWowLink } from '@/lib/wowLink';
import {
  equipmentSlotLabel,
  roleLabel,
} from '@/lib/ui/itemQuality';

export interface TrackerFichaHandlers {
  onClose: () => void;
  onTaskToggle: (
    op: 'mark' | 'unmark' | 'activate' | 'deactivate',
    taskId: string,
  ) => Promise<void>;
  onSaveLocalNote: (note: string) => Promise<boolean>;
  onToggleHidden: (hidden: boolean) => Promise<boolean>;
  onSetVisibility: (visible: boolean) => Promise<{ ok: boolean }>;
  onSetNotesPublic: (visible: boolean) => Promise<{ ok: boolean }>;
  canPublish: boolean;
  onTabChange?: (tabId: string) => void;
}

interface FichaContext {
  character: TrackerCharacter;
  catalog: Array<{ id: string; label: string; position: number }>;
  bands: BandRow[];
  handlers: TrackerFichaHandlers;
}

function sectionTitle(icon: Parameters<typeof iconEl>[0], text: string): HTMLElement {
  const title = el('div', 'flex items-center gap-2 mb-2');
  title.appendChild(iconEl(icon, { size: 'sm' }));
  title.appendChild(el('h4', `${ui.subTitle} mb-0`, text));
  return title;
}

function detailRow(key: string, value: string | number | null | undefined): HTMLElement {
  const row = el('div', ui.tracker.detailRow);
  row.appendChild(el('span', ui.tracker.detailKey, key));
  row.appendChild(el('span', ui.tracker.detailValue, value === null || value === undefined || value === '' ? '—' : String(value)));
  return row;
}

function equipPieceRow(piece: EquipmentPiece): HTMLElement {
  const hasId = typeof piece.itemID === 'number' && piece.itemID > 0;
  const itemHref = hasId
    ? wowheadUrl({ type: 'item', id: piece.itemID as number, label: piece.name, raw: piece.name }) ?? undefined
    : undefined;
  const row = itemRow({
    slot: equipmentSlotLabel(piece.slot),
    name: piece.name,
    quality: piece.quality,
    value: `i${piece.ilvl}`,
    ...(itemHref ? { href: itemHref, hrefTitle: `Ver "${piece.name}" en UltimoWoW` } : {}),
  });
  if (itemHref && hasId) {
    applyWowhead(row as HTMLAnchorElement, {
      type: 'item',
      id: piece.itemID as number,
      label: piece.name,
      raw: piece.name,
    });
  }
  return row;
}

function metaRow(
  item: { kind: 'equipment'; goal: EquipmentObjective } | { kind: 'currency'; goal: CurrencyObjective },
): HTMLElement {
  if (item.kind === 'currency') {
    return itemRow({
      name: item.goal.name,
      done: item.goal.reached,
      rail: '#0C74A8',
      leading: iconEl(item.goal.reached ? 'correcto' : 'medalla', { size: 'md', cls: 'shrink-0' }),
      value: item.goal.reached ? undefined : `${item.goal.target}`,
    });
  }
  const goal = item.goal;
  const hasId = typeof goal.itemID === 'number' && goal.itemID > 0;
  const itemHref = hasId
    ? wowheadUrl({ type: 'item', id: goal.itemID as number, label: goal.name, raw: goal.name }) ?? undefined
    : undefined;
  const row = itemRow({
    slot: equipmentSlotLabel(goal.slot),
    name: goal.name,
    quality: goal.quality,
    value: typeof goal.ilvl === 'number' ? `i${goal.ilvl}` : undefined,
    done: goal.done,
    leading: iconEl(goal.done ? 'correcto' : 'reloj', { size: 'md', cls: 'shrink-0' }),
    ...(itemHref ? { href: itemHref, hrefTitle: `Ver "${goal.name}" en UltimoWoW` } : {}),
    valueEl: undefined,
  });
  if (itemHref && hasId) {
    applyWowhead(row as HTMLAnchorElement, {
      type: 'item',
      id: goal.itemID as number,
      label: goal.name,
      raw: goal.name,
    });
  }
  return row;
}

// Card de banda del personaje (rol, líder, horario, GS, puntos, sanción).
function bandRow(band: BandRow, character: TrackerCharacter): HTMLElement {
  const players = Array.isArray(band.players) ? (band.players as Array<Record<string, unknown>>) : [];
  const nameKey = character.name.trim().toLowerCase();
  const member = players.find((p) => String(p.name ?? '').trim().toLowerCase() === nameKey);
  const row = el('div', `${ui.surf.row} p-3`);
  const head = el('div', 'flex flex-wrap items-center gap-2');
  head.appendChild(iconEl('espadas', { size: 'sm' }));
  const bandTitle = el('p', 'font-black italic text-sm text-brand-100');
  const bandLink = normalizeWowLink(band.name_link);
  if (bandLink) bandTitle.appendChild(wowLinkEl(bandLink));
  else bandTitle.textContent = band.name;
  head.appendChild(bandTitle);
  if (member?.leader) head.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-brand-200 bg-brand-950/60 border-brand-600/30`, 'Líder'));
  if (member?.banned) head.appendChild(el('span', `${ui.badge} ${ui.badgeSm} text-red-300 bg-red-950/30 border-red-600/40`, 'Baneado'));
  row.appendChild(head);

  const tags = el('div', 'flex flex-wrap gap-1.5 mt-2');
  const add = (text: string, cls = 'text-gray-300 border-brand-700/40'): void => {
    tags.appendChild(el('span', `text-[10px] px-2 py-0.5 rounded-md border bg-brand-950/50 ${cls}`, text));
  };
  if (member?.role) add(roleLabel(String(member.role)));
  if (member?.dual) add(`Dual ${String(member.dual)}`);
  if (band.schedule) add(band.schedule);
  if (typeof band.min_gs === 'number' && band.min_gs > 0) add(`GS ${band.min_gs}`);
  if (typeof member?.points === 'number') add(`${member.points} pts`);
  if (member?.sanction) add(String(member.sanction), 'text-red-300 border-red-600/40');
  if (member?.notes) add(String(member.notes));
  if (band.integration_status === 'approved') add('Integrada', 'text-emerald-300 border-emerald-600/40');
  if (tags.children.length > 0) row.appendChild(tags);
  return row;
}

function panelsFor(ctx: FichaContext): Map<string, HTMLElement> {
  const c = ctx.character;
  const panels = new Map<string, HTMLElement>();

  // ── Detalle (sin GS) ────────────────────────────────────────────────────
  const detalle = el('div', 'space-y-4');
  const datos = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-x-8');
  const faction = inferFactionFromRace(c.race_file ?? undefined, c.race ?? undefined);
  const gearCount = Array.isArray(c.equipment) ? c.equipment.length : 0;
  [
    ['Personaje', c.name],
    ['Reino', c.realm],
    ['Servidor', c.server],
    ['Clase', c.class],
    ['Raza', c.race],
    ['Facción', faction === 'Alliance' ? 'Alianza' : faction === 'Horde' ? 'Horda' : null],
    ['Nivel', c.level],
    ['Especialidad', c.talent_spec],
    ['iLvl medio', c.avg_ilvl],
    ['Piezas de equipo', gearCount],
    ['Hermandad', c.sv_guild_name],
    ['Rango hermandad', c.sv_guild_rank],
    ['Maestro de hermandad', c.sv_is_gm ? 'Sí' : 'No'],
    ['Validado', c.member_verified ? 'Sí' : 'No'],
    ['Público', c.is_public ? 'Sí' : 'No'],
    ['Oculto del tracker', c.trackerHidden ? 'Sí' : 'No'],
  ].forEach(([k, v]) => datos.appendChild(detailRow(String(k), v as string | number | null | undefined)));
  detalle.appendChild(sectionTitle('personaje', 'Datos'));
  detalle.appendChild(datos);

  const origen = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-x-8');
  [
    ['Primera conexión', fmtEpoch(c.firstSeen)],
    ['Última conexión', fmtEpoch(c.lastSeen)],
    ['Registro del juego', c.svSavedAt],
    ['Versión del addon', c.addonVersion],
    ['Alta en el portal', fmtEpoch(Date.parse(c.created_at) / 1000)],
    ['Actualizado', fmtEpoch(Date.parse(c.updated_at) / 1000)],
  ].forEach(([k, v]) => origen.appendChild(detailRow(String(k), v as string)));
  detalle.appendChild(sectionTitle('bandeja', 'Origen de los datos'));
  detalle.appendChild(origen);
  detalle.appendChild(el('p', 'text-[11px] text-gray-400 italic', 'Datos de tus subidas de SavedVariables. El portal no lee el WTF ni usa GearScore.'));
  panels.set('detalle', detalle);

  // ── Tareas ──────────────────────────────────────────────────────────────
  const tareas = el('div', '');
  tareas.appendChild(renderTrackerTasks({
    catalog: ctx.catalog,
    tasks: c.tasks,
    showLabels: true,
    showExtras: false,
    onToggle: ctx.handlers.onTaskToggle,
  }));
  panels.set('tareas', tareas);

  // ── Equipamiento ────────────────────────────────────────────────────────
  const equip = el('div', '');
  const pieces = ((c.equipment ?? []) as EquipmentPiece[]).slice().sort((a, b) => a.slot - b.slot);
  equip.appendChild(sectionTitle('arma', `Equipamiento (${pieces.length} piezas)`));
  if (pieces.length === 0) {
    equip.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin equipamiento registrado en tus subidas.'));
  } else {
    const missingIds = pieces.filter((piece) => typeof piece.itemID !== 'number').length;
    if (missingIds > 0) {
      const hint = el('p', `${ui.text.caption} mb-3`, 'Este personaje tiene piezas sin ID de objeto (subida anterior). Vuelve a subir tu SavedVariables para activar el tooltip.');
      const upload = el('a', 'text-brand-300 hover:text-brand-200 underline', 'Subir SavedVariables');
      (upload as HTMLAnchorElement).href = '/upload';
      hint.append(' ', upload);
      equip.appendChild(hint);
    }
    const list = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-2');
    pieces.forEach((piece) => list.appendChild(equipPieceRow(piece)));
    equip.appendChild(list);
  }
  panels.set('equipamiento', equip);

  // ── Monedas ─────────────────────────────────────────────────────────────
  const monedas = el('div', '');
  const currencies = c.currencies ?? [];
  monedas.appendChild(sectionTitle('cristal', `Monedas (${currencies.length})`));
  if (currencies.length === 0) {
    monedas.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin monedas registradas. Re-subre el SV con la barra de monedas actualizada.'));
  } else {
    const list = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-2');
    currencies.forEach((currency) => {
      const row = el('div', `${ui.item.row} justify-between gap-3`);
      const left = el('div', 'flex items-center gap-2 min-w-0');
      left.appendChild(iconEl(currencyIconFor(currency.name), { size: 'md', cls: 'shrink-0' }));
      const name = el('span', `${ui.item.name} truncate`, currency.name);
      name.title = currency.name;
      left.appendChild(name);
      const qty = currency.money
        ? formatMoney(c.money || currency.quantity || 0)
        : (Number(currency.quantity) || 0).toLocaleString('es-MX');
      row.append(left, el('span', `${ui.statValue} ${ui.item.value}`, qty));
      list.appendChild(row);
    });
    monedas.appendChild(list);
  }
  panels.set('monedas', monedas);

  // ── Metas ───────────────────────────────────────────────────────────────
  const metas = el('div', 'space-y-4');
  const objectives = (c.objectives ?? { equipment: [], currencies: [] }) as {
    equipment: EquipmentObjective[];
    currencies: CurrencyObjective[];
  };
  const equipmentGoals = [...(objectives.equipment ?? [])].sort((a, b) => a.slot - b.slot);
  const currencyGoals = [...(objectives.currencies ?? [])];
  metas.appendChild(sectionTitle('estrella', `Objetivos de equipo (${equipmentGoals.length})`));
  if (equipmentGoals.length === 0) {
    metas.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin objetivos de equipo registrados.'));
  } else {
    const list = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-2');
    equipmentGoals.forEach((goal) => list.appendChild(metaRow({ kind: 'equipment', goal })));
    metas.appendChild(list);
  }
  metas.appendChild(sectionTitle('cristal', `Objetivos de moneda (${currencyGoals.length})`));
  if (currencyGoals.length === 0) {
    metas.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin objetivos de moneda registrados.'));
  } else {
    const list = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-2');
    currencyGoals.forEach((goal) => list.appendChild(metaRow({ kind: 'currency', goal })));
    metas.appendChild(list);
  }
  panels.set('metas', metas);

  // ── Bandas ──────────────────────────────────────────────────────────────
  const bandas = el('div', 'space-y-3');
  const charName = c.name.trim().toLowerCase();
  const charRealm = (c.realm ?? '').trim().toLowerCase();
  const mine = ctx.bands.filter((band) => {
    const bandRealm = (band.character_realm ?? '').trim().toLowerCase();
    if (
      (band.character_name ?? '').trim().toLowerCase() === charName &&
      (!charRealm || !bandRealm || charRealm === bandRealm)
    ) return true;
    const players = Array.isArray(band.players) ? (band.players as Array<Record<string, unknown>>) : [];
    return players.some((p) => String(p.name ?? '').trim().toLowerCase() === charName);
  });
  bandas.appendChild(sectionTitle('espadas', `Bandas del personaje (${mine.length})`));
  if (mine.length === 0) {
    bandas.appendChild(el('p', 'text-xs text-gray-400 italic', 'El personaje no está en ninguna banda registrada.'));
  } else {
    mine.forEach((band) => bandas.appendChild(bandRow(band, c)));
  }
  panels.set('bandas', bandas);

  // ── Instancias ──────────────────────────────────────────────────────────
  const instancias = el('div', '');
  const instances = ((c.instances ?? []) as CharacterInstance[]).slice();
  const now = Date.now() / 1000;
  instances.sort((a, b) => {
    const ra = typeof a.resetAt === 'number' && a.resetAt > 0 ? a.resetAt : Number.POSITIVE_INFINITY;
    const rb = typeof b.resetAt === 'number' && b.resetAt > 0 ? b.resetAt : Number.POSITIVE_INFINITY;
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });
  instancias.appendChild(sectionTitle('ciudadela', `Instancias guardadas (${instances.length})`));
  if (instances.length === 0) {
    instancias.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin instancias registradas en tus subidas.'));
  } else {
    const list = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-2');
    instances.forEach((instance) => {
      const remaining = !instance.extended && typeof instance.resetAt === 'number' && instance.resetAt > 0
        ? instance.resetAt - now
        : null;
      let valueEl: HTMLElement | undefined;
      if (remaining !== null) {
        valueEl = el(
          'span',
          remaining <= 0
            ? 'shrink-0 text-[10px] font-black uppercase tracking-widest text-emerald-300'
            : `${ui.statValue} ${ui.item.value}`,
          remaining <= 0 ? 'Reiniciado' : formatRemaining(remaining),
        );
        valueEl.title = 'Cuenta atrás estimada según el último registro del addon';
      }
      list.appendChild(itemRow({
        slot: [instance.difficulty, instance.extended ? 'extendido' : ''].filter(Boolean).join(' · ') || undefined,
        name: instance.name,
        leading: iconEl('ciudadela', { size: 'md', cls: 'shrink-0' }),
        rail: '#0C74A8',
        valueEl,
      }));
    });
    instancias.appendChild(list);
  }
  panels.set('instancias', instancias);

  // ── Notas ───────────────────────────────────────────────────────────────
  const notas = el('div', 'space-y-4');
  notas.appendChild(sectionTitle('nota', 'Nota local del tracker'));
  const localWrap = el('div', ui.surf.row, '') as HTMLElement;
  localWrap.classList.add('p-3');
  const ta = document.createElement('textarea');
  ta.rows = 6;
  ta.className = `${ui.form.input} ${ui.focusRing} text-sm`;
  ta.value = c.trackerNote;
  ta.placeholder = 'Nota exclusiva de tu tracker (no se envía al juego ni al portal público).';
  ta.setAttribute('aria-label', 'Nota local del tracker');
  const noteStatus = el('p', `${ui.form.helperText} mt-1.5`, 'Se guarda en tu cuenta del portal. No se publica.');
  ta.addEventListener('change', async () => {
    noteStatus.textContent = 'Guardando…';
    noteStatus.className = `${ui.loading.liveText} mt-1.5`;
    const ok = await ctx.handlers.onSaveLocalNote(ta.value);
    if (ok) {
      noteStatus.textContent = 'Nota local guardada.';
      noteStatus.className = `${ui.status.success} mt-1.5 text-xs`;
    } else {
      ta.value = c.trackerNote;
      noteStatus.textContent = 'No se pudo guardar la nota local.';
      noteStatus.className = `${ui.status.error} mt-1.5 text-xs`;
    }
  });
  localWrap.append(ta, noteStatus);
  notas.appendChild(localWrap);

  notas.appendChild(sectionTitle('pergamino', 'Nota del juego (SavedVariables)'));
  const gameNote = (c.gameNote ?? '').trim();
  if (gameNote) {
    notas.appendChild(richTextEl(
      c.gameNoteRich,
      gameNote,
      `${ui.surf.row} rd-parchment p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-line`,
    ));
  } else {
    notas.appendChild(el('p', 'text-xs text-gray-400 italic', 'Sin nota del juego. Se escribe en el addon y se sincroniza al subir el SV.'));
  }
  const notePublic = document.createElement('label');
  notePublic.className = `mt-2 flex items-center gap-2 select-none text-[10px] font-black uppercase tracking-widest text-gray-400 ${gameNote ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`;
  const noteCheck = document.createElement('input');
  noteCheck.type = 'checkbox';
  noteCheck.checked = c.notes_public;
  noteCheck.disabled = !gameNote;
  noteCheck.className = 'w-3.5 h-3.5 accent-brand-500';
  noteCheck.setAttribute('aria-label', 'Publicar la nota del juego');
  const noteCheckStatus = el('span', 'text-gray-400');
  noteCheck.addEventListener('change', async () => {
    noteCheck.disabled = true;
    noteCheckStatus.textContent = '· guardando…';
    noteCheckStatus.className = 'text-brand-300';
    const res = await ctx.handlers.onSetNotesPublic(noteCheck.checked);
    noteCheck.disabled = !gameNote;
    if (res.ok) {
      noteCheckStatus.textContent = '✓';
      noteCheckStatus.className = 'text-emerald-400';
    } else {
      noteCheck.checked = !noteCheck.checked;
      noteCheckStatus.textContent = '✗';
      noteCheckStatus.className = 'text-red-400';
    }
    window.setTimeout(() => { noteCheckStatus.textContent = ''; }, 2200);
  });
  notePublic.append(noteCheck, document.createTextNode('Nota del juego pública'), noteCheckStatus);
  notas.appendChild(notePublic);
  panels.set('notas', notas);

  return panels;
}

export interface TrackerFichaView {
  root: HTMLElement;
  setTab: (tabId: string) => void;
}

export function renderTrackerFicha(ctx: FichaContext): TrackerFichaView {
  const c = ctx.character;
  const color = classColor(c.class, c.class_file);
  const root = el('section', '');
  root.dataset.trackerFicha = c.id;

  // Cabecera (ventana del dashboard: sectionHead + sectionBody).
  const head = el('div', `${ui.sectionHead} ${ui.cutTop} bg-gradient-to-br from-brand-900/20 to-transparent`);
  const headRow = el('div', 'flex flex-wrap items-start justify-between gap-4');
  const ident = el('div', 'flex items-start gap-3 min-w-0');
  ident.appendChild(classIconEl(c.class, c.class_file, 'w-12 h-12 rounded-md border border-gray-700/50 object-cover shrink-0'));
  const identText = el('div', 'min-w-0');
  identText.appendChild(el('p', ui.eyebrow, 'Personaje · Ficha del tracker'));
  const h2 = el('h2', `${ui.gradientTitle} text-xl sm:text-2xl font-black italic truncate`, c.name);
  h2.style.color = color;
  identText.appendChild(h2);
  identText.appendChild(el('p', `${ui.text.caption} mt-0.5`, [c.realm, c.class, c.level ? `Nivel ${c.level}` : '', c.sv_guild_name].filter(Boolean).join(' · ')));
  ident.appendChild(identText);
  headRow.appendChild(ident);

  const controls = el('div', 'flex flex-wrap items-center gap-2');
  const hiddenLabel = document.createElement('label');
  hiddenLabel.className = 'flex items-center gap-1.5 select-none text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer';
  hiddenLabel.title = 'Oculta este personaje de tu lista del tracker (no afecta su visibilidad pública).';
  const hiddenCheck = document.createElement('input');
  hiddenCheck.type = 'checkbox';
  hiddenCheck.checked = c.trackerHidden;
  hiddenCheck.className = 'w-3.5 h-3.5 accent-brand-500';
  hiddenCheck.setAttribute('aria-label', 'Ocultar del tracker');
  hiddenCheck.addEventListener('change', async () => {
    hiddenCheck.disabled = true;
    const ok = await ctx.handlers.onToggleHidden(hiddenCheck.checked);
    hiddenCheck.disabled = false;
    if (!ok) hiddenCheck.checked = !hiddenCheck.checked;
  });
  hiddenLabel.append(hiddenCheck, document.createTextNode('Oculto del tracker'));

  const publicLabel = document.createElement('label');
  publicLabel.className = `flex items-center gap-1.5 select-none text-[10px] font-black uppercase tracking-widest text-gray-400 ${ctx.handlers.canPublish ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`;
  publicLabel.title = ctx.handlers.canPublish ? 'Visible en el directorio público.' : 'Requiere cuenta Miembro validada (2+ personajes).';
  const publicCheck = document.createElement('input');
  publicCheck.type = 'checkbox';
  publicCheck.checked = c.is_public;
  publicCheck.disabled = !ctx.handlers.canPublish;
  publicCheck.className = 'w-3.5 h-3.5 accent-brand-500';
  publicCheck.setAttribute('aria-label', 'Personaje público');
  publicCheck.addEventListener('change', async () => {
    publicCheck.disabled = true;
    const res = await ctx.handlers.onSetVisibility(publicCheck.checked);
    publicCheck.disabled = !ctx.handlers.canPublish;
    if (!res.ok) publicCheck.checked = !publicCheck.checked;
  });
  publicLabel.append(publicCheck, document.createTextNode('Público'));

  const back = document.createElement('button');
  back.type = 'button';
  back.className = `${ui.btnBase} ${ui.btnSecondary} px-3 py-2 text-[10px] font-black uppercase tracking-widest`;
  back.textContent = '← Volver a la lista';
  back.addEventListener('click', () => ctx.handlers.onClose());

  controls.append(hiddenLabel, publicLabel, back);
  headRow.appendChild(controls);
  head.appendChild(headRow);

  const body = el('div', `${ui.sectionBody} space-y-4`);

  // Tabs (contrato único: TRACKER_FICHA_TABS). Sin hash propio: el hash lo
  // gobierna la vista (#personajes/ficha/<slug>) y la pestaña es estado local.
  const tabBar = el('div', 'flex flex-nowrap items-center gap-1 rd-tabbar relative overflow-x-auto justify-start [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden');
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Secciones de la ficha del tracker');

  const panels = panelsFor(ctx);
  const buttons: HTMLButtonElement[] = [];
  const setTab = (tabId: string): void => {
    const valid = TRACKER_FICHA_TABS.some((t) => t.id === tabId) ? tabId : 'detalle';
    buttons.forEach((btn) => {
      const active = btn.dataset.tab === valid;
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
      btn.classList.toggle('border-brand-400', active);
      btn.classList.toggle('text-brand-200', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-gray-400', !active);
    });
    panels.forEach((panel, id) => panel.classList.toggle('hidden', id !== valid));
    ctx.handlers.onTabChange?.(valid);
  };

  const tabBtnCls = 'tab-btn shrink-0 whitespace-nowrap px-2 sm:px-3 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 rounded-t-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 inline-flex items-center gap-1.5';
  TRACKER_FICHA_TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = tabBtnCls;
    btn.id = `tracker-ficha-tab-${tab.id}`;
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `tracker-ficha-panel-${tab.id}`);
    btn.appendChild(iconEl(tab.icon, { size: 'md' }));
    btn.appendChild(document.createTextNode(tab.label));
    btn.addEventListener('click', () => setTab(tab.id));
    buttons.push(btn);
    tabBar.appendChild(btn);
  });
  tabBar.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const idx = buttons.indexOf(ev.target as HTMLButtonElement);
    if (idx === -1) return;
    let next: number | null = null;
    if (ev.key === 'ArrowRight') next = (idx + 1) % buttons.length;
    else if (ev.key === 'ArrowLeft') next = (idx - 1 + buttons.length) % buttons.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = buttons.length - 1;
    if (next === null) return;
    ev.preventDefault();
    const target = buttons[next];
    target.focus();
    setTab(target.dataset.tab ?? 'detalle');
  });

  const panelBox = el('div', '');
  panels.forEach((panel, id) => {
    panel.id = `tracker-ficha-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tracker-ficha-tab-${id}`);
    panel.classList.toggle('hidden', id !== 'detalle');
    panelBox.appendChild(panel);
  });

  body.append(tabBar, panelBox);
  root.append(head, body);

  return { root, setTab };
}
