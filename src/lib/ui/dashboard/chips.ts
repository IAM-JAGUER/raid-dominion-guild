// Chips de etiqueta del visor de Registro. Extraído de
// src/pages/dashboard.astro — comportamiento idéntico.

import { el } from '@/lib/ui/preview';

// Chip de configuración: etiqueta + highlight opcional. El layout del literal
// se conserva (no coincide con ui.chip: px-2.5 py-1 text-[11px] vs el token
// px-2 py-0.5 text-[10px]); tokenizar aquí cambiaría el aspecto.
export function configChip(text: string, highlight = false): HTMLElement {
  return el(
    'span',
    'inline-flex items-center gap-1.5 text-[11px] text-gray-300 bg-gray-900/60 border border-amber-600/30 rounded-md px-2.5 py-1' + (highlight ? ' !border-amber-500/40' : ''),
    text,
  );
}