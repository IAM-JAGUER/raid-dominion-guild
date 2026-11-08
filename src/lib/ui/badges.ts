// Helpers de badges dinámicos del dashboard. La tipografía se mantiene en
// Jost 11px (no ensancha); la identidad visual viene del icono, tono y marco.
import { iconEl, type IconName } from '@/lib/ui/icons';
import { ui } from '@/lib/ui/design';
import { ROLE_ICONS } from '@/lib/roles';
import type { RaiddominionRole } from '@/types/database';

export type BadgeTone = keyof typeof ui.badgeTone;

export interface BadgeData {
  icon?: IconName;
  label: string;
  value?: string | number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  title?: string;
}

export function badgeClass(data: Pick<BadgeData, 'tone' | 'size'> = {}): string {
  return [
    ui.badge,
    data.size === 'sm' ? ui.badgeSm : ui.badgeMd,
    ui.badgeTone[data.tone ?? 'neutral'],
  ].join(' ');
}

export function badgeEl(data: BadgeData): HTMLElement {
  const el = document.createElement('span');
  el.className = badgeClass(data);
  if (data.title) el.title = data.title;
  if (data.icon) {
    const holder = document.createElement('span');
    holder.className = ui.badgeIcon;
    holder.setAttribute('aria-hidden', 'true');
    holder.appendChild(iconEl(data.icon, { size: 'xs' }));
    el.appendChild(holder);
  }
  const label = document.createElement('span');
  label.className = ui.badgeLabel;
  label.textContent = data.label;
  el.appendChild(label);
  if (data.value !== undefined) {
    const value = document.createElement('strong');
    value.className = ui.badgeStatValue;
    value.textContent = String(data.value);
    el.appendChild(value);
  }
  return el;
}

export function setBadge(el: HTMLElement, data: BadgeData): void {
  el.className = badgeClass(data);
  if (data.title) el.title = data.title;
  el.replaceChildren(...Array.from(badgeEl(data).childNodes));
}

export function roleBadgeData(role: RaiddominionRole, label: string, title = label): BadgeData {
  const tone: BadgeTone =
    role === 'guild_master' ? 'gold'
      : role === 'admin' ? 'danger'
        : role === 'moderator' ? 'info'
          : role === 'member' ? 'steel' : 'neutral';
  return { icon: ROLE_ICONS[role], label, tone, title };
}
