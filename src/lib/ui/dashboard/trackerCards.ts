// Tarjetas del Task Tracker dentro de #personajes (dashboard).
// Estructura del tracker wow-rd: cabecera colapsable, progreso, stats, tabs de
// tareas/instancias/monedas, nota LOCAL y controles del dueño. Sin GearScore.

import type { CharacterInstance, AccountCurrency } from '@/types/parser';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { ui } from '@/lib/ui/design';
import { el } from '@/lib/ui/dom';
import { formatMoney, fmtEpoch, formatRemaining } from '@/lib/ui/dashboard/format';
import type { TrackerCharacter } from '@/lib/ui/dashboard/trackerLogic';
import { renderTrackerTasks, setTrackerTab } from '@/lib/ui/dashboard/trackerTasks';
import type { TrackerTaskTab } from '@/lib/ui/dashboard/trackerLogic';
import { inferFactionFromRace } from '@/lib/parser/savedVariables';
import { currencyIconFor, iconEl, raceIconFor } from '@/lib/ui/icons';

export interface TrackerCardHandlers {
  catalog: Array<{ id: string; label: string; position: number }>;
  selected: Set<string>;
  collapsed: Set<string>;
  canPublish: boolean;
  activeTab: TrackerTaskTab;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleCollapse: (id: string, collapsed: boolean) => void;
  onOpenFicha: (id: string) => void;
  onTaskToggle: (
    characterId: string,
    op: 'mark' | 'unmark' | 'activate' | 'deactivate',
    taskId: string,
  ) => Promise<void>;
  onSaveLocalNote: (characterId: string, note: string) => Promise<boolean>;
  setVisibility: (characterId: string, visible: boolean) => Promise<{ ok: boolean }>;
  setNotesPublic: (characterId: string, visible: boolean) => Promise<{ ok: boolean }>;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const r = parseInt(n.substring(0, 2), 16) || 0;
  const g = parseInt(n.substring(2, 4), 16) || 0;
  const b = parseInt(n.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function badge(icon: Parameters<typeof iconEl>[0], label: string, cls = ''): HTMLElement {
  const span = el('span', `inline-flex items-center ${cls}`);
  span.title = label;
  span.appendChild(iconEl(icon, { size: 'xs' }));
  const sr = el('span', 'sr-only', label);
  span.appendChild(sr);
  return span;
}

function instancesContent(character: TrackerCharacter): HTMLElement {
  const wrap = el('div', 'space-y-1');
  const now = Date.now() / 1000;
  const instances = (character.instances ?? []) as CharacterInstance[];
  instances.forEach((instance) => {
    const row = el('div', `${ui.tracker.task} justify-between`);
    const left = el('div', 'min-w-0');
    left.appendChild(el('p', 'text-[11px] text-gray-200 truncate', instance.name));
    if (instance.difficulty) left.appendChild(el('p', 'text-[9px] uppercase tracking-widest text-gray-400', instance.difficulty));
    const remaining = !instance.extended && typeof instance.resetAt === 'number'
      ? instance.resetAt - now
      : null;
    const right = el(
      'span',
      remaining !== null && remaining <= 0
        ? 'text-[9px] font-black uppercase tracking-widest text-emerald-300'
        : 'text-[11px] font-bold text-brand-200 tabular-nums',
      remaining === null ? '—' : remaining <= 0 ? 'Reiniciado' : formatRemaining(remaining),
    );
    if (remaining !== null) right.title = 'Cuenta atrás estimada según el último registro del addon';
    row.append(left, right);
    wrap.appendChild(row);
  });
  return wrap;
}

function currenciesContent(character: TrackerCharacter): HTMLElement {
  const wrap = el('div', 'space-y-1');
  const currencies = (character.currencies ?? []) as AccountCurrency[];
  currencies.forEach((currency) => {
    const row = el('div', `${ui.tracker.task} justify-between gap-2`);
    const left = el('div', 'flex items-center gap-2 min-w-0');
    left.appendChild(iconEl(currencyIconFor(currency.name), { size: 'sm', cls: 'shrink-0' }));
    const name = el('span', 'text-[11px] text-gray-200 truncate', currency.name);
    name.title = currency.name;
    left.appendChild(name);
    const qty = currency.money
      ? formatMoney(character.money || currency.quantity || 0)
      : (Number(currency.quantity) || 0).toLocaleString('es-MX');
    row.append(left, el('span', 'text-[11px] font-bold text-brand-200 tabular-nums shrink-0', qty));
    wrap.appendChild(row);
  });
  return wrap;
}

function watermark(character: TrackerCharacter): HTMLElement {
  const wm = el('div', 'absolute inset-0 pointer-events-none overflow-hidden rounded-md');
  wm.setAttribute('aria-hidden', 'true');
  const glyph = el('span', 'absolute -right-6 -bottom-8 opacity-[0.07]');
  glyph.appendChild(iconEl(raceIconFor(character.race), { size: 'hero' }));
  wm.appendChild(glyph);
  const factionName = inferFactionFromRace(character.race_file ?? undefined, character.race ?? undefined);
  const faction = factionName === 'Horde' ? 'horde' : factionName === 'Alliance' ? 'alliance' : '';
  if (character.race) {
    const raceName = el('span', 'absolute left-3 bottom-16 text-lg font-black uppercase tracking-widest opacity-[0.05] text-brand-200 max-w-[70%] truncate', character.race);
    wm.appendChild(raceName);
  }
  if (faction) {
    const img = document.createElement('img');
    img.src = `/images/watermarks/${faction}.svg`;
    img.alt = '';
    img.className = 'absolute left-3 bottom-3 w-10 h-10 opacity-10';
    wm.appendChild(img);
  }
  return wm;
}

function ownerToggle(
  id: string,
  label: string,
  checked: boolean,
  disabled: boolean,
  title: string,
  onSave: (next: boolean) => Promise<{ ok: boolean }>,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = `flex items-center gap-1.5 select-none text-[10px] font-black uppercase tracking-widest text-gray-400 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`;
  wrap.title = title;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  input.className = 'w-3.5 h-3.5 accent-brand-500 shrink-0';
  input.setAttribute('aria-label', label);
  const status = el('span', 'text-gray-400');
  input.addEventListener('change', async () => {
    input.disabled = true;
    status.textContent = '· guardando…';
    status.className = 'text-brand-300';
    const res = await onSave(input.checked);
    input.disabled = disabled;
    if (res.ok) {
      status.textContent = '✓';
      status.className = 'text-emerald-400';
    } else {
      input.checked = !input.checked;
      status.textContent = '✗';
      status.className = 'text-red-400';
    }
    window.setTimeout(() => { status.textContent = ''; }, 2200);
  });
  wrap.append(input, document.createTextNode(label), status);
  wrap.dataset.control = id;
  return wrap;
}

export function renderTrackerCard(character: TrackerCharacter, h: TrackerCardHandlers): HTMLElement {
  const id = character.id;
  const color = classColor(character.class, character.class_file);
  const tint = hexToRgba(color, 0.24);
  const border = hexToRgba(color, 0.38);
  const collapsed = h.collapsed.has(id);
  const selected = h.selected.has(id);

  const card = el('article', [
    ui.tracker.card,
    selected ? ui.tracker.cardSelected : '',
    character.trackerHidden ? ui.tracker.cardHidden : '',
  ].filter(Boolean).join(' '));
  card.dataset.characterId = id;
  card.style.setProperty('--class-color', color);
  if (!selected) card.style.borderColor = border;
  card.appendChild(watermark(character));

  // ── Cabecera ────────────────────────────────────────────────────────────
  const header = el('div', ui.tracker.cardHeader);
  header.style.background = `linear-gradient(180deg, ${tint} 0%, rgba(0,0,0,0.16) 100%)`;

  const pickWrap = document.createElement('label');
  pickWrap.className = ui.tracker.cardPick;
  pickWrap.title = 'Seleccionar personaje';
  const pick = document.createElement('input');
  pick.type = 'checkbox';
  pick.checked = selected;
  pick.className = 'w-3.5 h-3.5 accent-brand-500 cursor-pointer';
  pick.setAttribute('aria-label', `Seleccionar ${character.name}`);
  pick.addEventListener('change', () => h.onToggleSelect(id, pick.checked));
  pickWrap.appendChild(pick);

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = ui.tracker.cardCollapse;
  collapseBtn.dataset.trackerCollapse = '';
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  collapseBtn.setAttribute('aria-controls', `tracker-body-${id}`);
  collapseBtn.title = collapsed ? 'Expandir personaje' : 'Contraer personaje';
  const chevron = el('span', `text-[10px] text-brand-300 transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`, '▼');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.dataset.trackerChevron = '';
  collapseBtn.append(chevron, classIconEl(character.class, character.class_file, 'w-6 h-6 rounded-md border border-gray-700/50 object-cover shrink-0'));
  const titleGroup = el('span', 'min-w-0 flex flex-col');
  const title = el('span', `${ui.tracker.cardTitle} block`, character.name);
  title.style.color = color;
  titleGroup.appendChild(title);
  const meta = [
    typeof character.level === 'number' && character.level > 0 ? `Nv ${character.level}` : '',
    character.realm ?? '',
  ].filter(Boolean).join(' · ');
  if (meta) titleGroup.appendChild(el('span', `${ui.tracker.cardMeta} truncate`, meta));
  collapseBtn.appendChild(titleGroup);
  collapseBtn.addEventListener('click', () => {
    const next = !h.collapsed.has(id);
    h.onToggleCollapse(id, next);
  });
  header.appendChild(collapseBtn);
  header.appendChild(el('span', ui.tracker.counter, `${character.progress.done}/${character.progress.active}`));

  const ficha = document.createElement('button');
  ficha.type = 'button';
  ficha.className = `${ui.btnBase} ${ui.btnSecondary} px-2 py-1 text-[10px] font-black uppercase tracking-widest shrink-0`;
  ficha.textContent = 'Ficha';
  ficha.title = `Abrir la ficha de ${character.name}`;
  ficha.addEventListener('click', () => h.onOpenFicha(id));
  header.appendChild(ficha);
  card.appendChild(header);
  card.appendChild(pickWrap);

  // ── Cuerpo colapsable ───────────────────────────────────────────────────
  const content = el('div', `${ui.tracker.content} ${collapsed ? ui.tracker.contentClosed : ui.tracker.contentOpen}`);
  content.id = `tracker-body-${id}`;
  content.dataset.trackerContent = '';
  const inner = el(
    'div',
    `${ui.tracker.contentInner} ${collapsed ? ui.tracker.contentInnerClosed : ''}`.trim(),
  );
  const body = el('div', ui.tracker.body);
  inner.appendChild(body);
  content.appendChild(inner);

  // Progreso
  const progress = el('div', `${ui.tracker.progress} mt-1 mb-1`);
  const progressBar = el('span', ui.tracker.progressBar);
  progressBar.style.width = `${Math.max(0, Math.min(100, character.progress.percent))}%`;
  progress.appendChild(progressBar);
  body.appendChild(progress);

  // Badges
  const badges = el('div', 'flex flex-wrap items-center gap-2 mt-2');
  if (character.trackerHidden) badges.appendChild(badge('visibilidad', 'Oculto del tracker'));
  if (character.is_public) badges.appendChild(badge('portal', 'Personaje público'));
  if (character.member_verified) badges.appendChild(badge('validado', 'Cuenta validada'));
  if (character.sv_is_gm) badges.appendChild(badge('estrella', 'Maestro de hermandad'));
  if (character.sv_guild_name) badges.appendChild(badge('hermandad', `Hermandad: ${character.sv_guild_name}`));
  if (character.gameNote) badges.appendChild(badge('nota', 'Tiene nota del juego'));
  if (badges.children.length > 0) body.appendChild(badges);

  // Stats (sin GS: iLvl, piezas y visto).
  const stats = el('div', ui.tracker.stats);
  const stat = (label: string, value: string, title?: string): HTMLElement => {
    const item = el('span', ui.tracker.stat);
    item.appendChild(el('span', ui.tracker.statLabel, label));
    const val = el('span', ui.tracker.statValue, value);
    if (title) val.title = title;
    item.appendChild(val);
    return item;
  };
  stats.appendChild(stat('iLvl', String(character.avg_ilvl ?? '—')));
  const gearCount = Array.isArray(character.equipment) ? character.equipment.length : 0;
  stats.appendChild(stat('Piezas', String(gearCount)));
  const seen = character.lastSeen && character.lastSeen > 0
    ? fmtEpoch(character.lastSeen)
    : character.updated_at
      ? new Date(character.updated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
  stats.appendChild(stat('Visto', seen, character.lastSeen ? 'Última conexión según el SV' : 'Última actualización en el portal'));
  body.appendChild(stats);

  // Tareas + extras
  const tasksBox = renderTrackerTasks({
    catalog: h.catalog,
    tasks: character.tasks,
    defaultTab: h.activeTab,
    showLabels: false,
    extra: {
      instancias: { count: (character.instances ?? []).length, content: instancesContent(character) },
      monedas: { count: (character.currencies ?? []).length, content: currenciesContent(character) },
    },
    onToggle: (op, taskId) => h.onTaskToggle(id, op, taskId),
  });
  body.appendChild(tasksBox);

  // Nota local del tracker (exclusiva, nunca la del juego).
  const notes = el('div', 'mt-2');
  const label = el('label', 'block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1', 'Nota local del tracker');
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = character.trackerNote;
  ta.placeholder = 'Nota solo para tu tracker…';
  ta.className = `${ui.form.input} ${ui.focusRing} text-xs`;
  ta.setAttribute('aria-label', `Nota local del tracker de ${character.name}`);
  label.setAttribute('for', `tracker-note-${id}`);
  ta.id = `tracker-note-${id}`;
  ta.addEventListener('change', async () => {
    const ok = await h.onSaveLocalNote(id, ta.value);
    if (!ok) ta.value = character.trackerNote;
  });
  notes.append(label, ta);
  body.appendChild(notes);

  // Controles del dueño: Público + Nota del juego pública.
  const owner = el('div', 'mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-600/15 pt-2.5');
  owner.appendChild(ownerToggle(
    `vis-${id}`,
    'Público',
    character.is_public,
    h.canPublish === false,
    h.canPublish === false
      ? 'Requiere cuenta Miembro validada (2+ personajes).'
      : 'Visible en el directorio público.',
    (next) => h.setVisibility(id, next),
  ));
  const noteText = (character.gameNote ?? '').trim();
  const noteLabel = noteText
    ? el('span', 'text-[10px] text-gray-400 truncate max-w-[12rem]', noteText)
    : el('span', 'text-[10px] text-gray-400 italic', 'Sin nota del juego');
  noteLabel.title = noteText || 'Escribe la nota en el addon y vuelve a subir tu SV.';
  owner.appendChild(noteLabel);
  owner.appendChild(ownerToggle(
    `note-${id}`,
    'Nota del juego pública',
    character.notes_public,
    !noteText,
    noteText ? 'La nota solo se muestra si el personaje también es público.' : 'Primero registra una nota en el addon.',
    (next) => h.setNotesPublic(id, next),
  ));
  body.appendChild(owner);

  card.appendChild(content);
  card.dataset.tab = h.activeTab;
  return card;
}

// Aplica la pestaña activa a todas las tarjetas visibles (leyenda del pie).
export function setAllCardTabs(root: HTMLElement, tabId: TrackerTaskTab): void {
  root.querySelectorAll<HTMLElement>('[data-tracker-tasks]').forEach((node) => setTrackerTab(node, tabId));
  root.querySelectorAll<HTMLElement>('[data-character-id]').forEach((card) => {
    card.dataset.tab = tabId;
  });
}
