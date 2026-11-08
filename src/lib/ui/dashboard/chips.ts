// Chips de etiqueta del visor de Registro. Extraído de
// src/pages/dashboard.astro — comportamiento idéntico.

import { badgeEl } from '@/lib/ui/badges';

// Chip de configuración: etiqueta + highlight opcional. Tokenizado con el
// sistema unificado ui.badge (base + badgeMd) — mismo lenguaje que el resto
// de badges/chips de la plataforma.
export function configChip(text: string, highlight = false): HTMLElement {
  return badgeEl({ label: text, tone: highlight ? 'gold' : 'neutral', size: 'md' });
}