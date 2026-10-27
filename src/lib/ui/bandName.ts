// Nombre de banda + acceso a su ficha. Fuente ÚNICA para el nombre enriquecido
// con enlaces del juego y para el CTA "Ver banda" junto al nombre.
import { normalizeWowLink } from '@/lib/wowLink';
import { wowLinkEl } from '@/lib/ui/wowhead';
import { ui } from '@/lib/ui/design';

export interface BandNameLink {
  // Enlace del juego SOLO cuando produce un <a> real (tooltip UltimoWoW).
  anchor: HTMLAnchorElement | null;
  // Texto visible para el fallback plano (sin enlace o tipo no soportado).
  label: string;
}

export function bandNameLink(name: string, source?: unknown): BandNameLink {
  const link = normalizeWowLink(source);
  const label = name || link?.label || 'Sin nombre';
  if (!link) return { anchor: null, label };
  const node = wowLinkEl(link);
  return {
    anchor: node instanceof HTMLAnchorElement ? node : null,
    label,
  };
}

export function bandDetailHref(slug?: string | null): string | null {
  return slug ? `/banda/${encodeURIComponent(slug)}` : null;
}

export function bandDetailCta(slug: string, name: string, cls = ''): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = bandDetailHref(slug) ?? '#';
  anchor.className = `${ui.btnBase} ${ui.btnSecondary} ${ui.focusRing} shrink-0 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${cls}`.trim();
  anchor.textContent = 'Ver banda';
  anchor.title = `Abrir la banda ${name}`;
  anchor.setAttribute('aria-label', `Ver la banda ${name}`);
  return anchor;
}
