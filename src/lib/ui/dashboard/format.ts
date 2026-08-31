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