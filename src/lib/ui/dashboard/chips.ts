// Chips de etiqueta del visor de Registro. Extraído de
// src/pages/dashboard.astro — comportamiento idéntico.

import { el } from '@/lib/ui/dom';
import { ui } from '@/lib/ui/design';

// Chip de configuración: etiqueta + highlight opcional. Tokenizado con el
// sistema unificado ui.badge (base + badgeMd) — mismo lenguaje que el resto
// de badges/chips de la plataforma.
export function configChip(text: string, highlight = false): HTMLElement {
  return el(
    'span',
    `${ui.badge} ${ui.badgeMd} text-gray-300 bg-gray-900/60 border-amber-600/30` + (highlight ? ' !border-amber-500/40' : ''),
    text,
  );
}