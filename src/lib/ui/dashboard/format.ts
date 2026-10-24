// Helpers de formato puros del dashboard (sin estado ni DOM).
// Extraídos de src/pages/dashboard.astro — comportamiento idéntico.

import type { UploadSummary } from '@/lib/api';
import type { ContentItem } from '@/types/parser';

// Fecha/hora en es-MX (formato corto de los análisis)
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

// Etiqueta de un análisis en el selector: fecha + generador
export function svLabel(item: UploadSummary): string {
  const who = item.generatedBy ? ` · ${item.generatedBy}` : '';
  return `${fmtDateTime(item.parsedAt)}${who}`;
}

// Clave de identidad de una regla (para marcar/desmarcar en el catálogo).
export function ruleKey(r: ContentItem): string {
  return `${(r.title ?? '').trim()}|${(r.content ?? '').trim()}`;
}

// Identidad ESTABLE de una regla para el toggle del GM: el TÍTULO (o el
// contenido si no hay título). Al cambiar el CONTENIDO de una regla del
// proponente, la selección del GM sigue coincidiendo y la página de banda
// permanece sincronizada (el toggle no se congela con title|content).
export function ruleId(r: { title?: string | null; content?: string | null }): string {
  return (r.title ?? '').trim() || (r.content ?? '').trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}
// Epoch (segundos) → fecha/hora local es-MX. `—` si no hay dato.
export function fmtEpoch(epoch?: number | null): string {
  if (typeof epoch !== 'number' || !Number.isFinite(epoch) || epoch <= 0) return '—';
  return new Date(epoch * 1000).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

// Segundos restantes → "2d 4h" / "5h 20m" / "30m" / "ahora" (formato del addon).
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s <= 0) return 'ahora';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${Math.max(1, mins)}m`;
}

// Cobre → "12.345 oro 67 plata 89 cobre".
export function formatMoney(copper: number): string {
  const c = Math.max(0, Math.floor(Number(copper) || 0));
  const gold = Math.floor(c / 10000);
  const silver = Math.floor((c % 10000) / 100);
  const cop = c % 100;
  const parts: string[] = [];
  if (gold) parts.push(`${gold.toLocaleString('es-MX')} oro`);
  if (silver) parts.push(`${silver} plata`);
  if (cop || parts.length === 0) parts.push(`${cop} cobre`);
  return parts.join(' ');
}
