/**
 * Tokens de UI del portal (convenciones gráficas compartidas).
 *
 * Regla de bordes: salvo círculos inherentes (rounded-full legítimo,
 * p. ej. avatares o botones circulares), `rounded-lg` es el radio MÁXIMO
 * permitido. Prohibidos rounded-xl/2xl/3xl en toda la plataforma.
 *
 * Criterio geométrico: elementos CON TEXTO (chips, badges, contadores,
 * botones filtro) usan siempre `rounded-lg`. `rounded-full` solo para
 * elementos SIN texto inherentemente píldora/círculo (dots, indicadores,
 * medallones de icono, botones flotantes circulares) o vía el token
 * `ui.sectionRule` (divisor fino h-1, única excepción de divisor).
 *
 * Convenciones v2 (detalle en .opencode/improve/priorities.md):
 * R1 monogramas de un glifo en rounded-full · R2 chips con texto
 * siempre rounded-lg (usar ui.chip) · R3 paneles de dashboard via
 * ui.panel (+ui.panelHover si interactivo) · R4 dashboards usan
 * h1 + ui.subTitle, nunca SectionHeader.
 *
 * Solo strings de clases Tailwind: sin lógica ni render.
 */
export const ui = {
  container: 'max-w-6xl mx-auto',
  panel: 'bg-gray-900/60 backdrop-blur-sm border border-amber-600/30 rounded-lg',
  panelHover: 'hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300',
  btnBase:
    'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
  btnPrimary:
    'bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/20',
  btnSecondary:
    'border border-amber-500/50 text-amber-200 bg-gray-900/60 hover:bg-amber-900/30 hover:border-amber-400',
  btnGhost: 'text-gray-300 hover:text-amber-200 hover:border-amber-500/40',
  btnSizes: { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' },
  badge:
    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-gray-900/60 text-xs sm:text-sm text-gray-300',
  sectionTitle: 'text-3xl font-bold text-amber-400',
  sectionRule: 'mt-4 h-1 w-24 rounded-full bg-amber-500 mx-auto',
  // Subtítulo de bloque dentro de un panel (visores, fichas, listas)
  subTitle: 'text-xs font-bold uppercase tracking-widest text-amber-300/90 mb-2',
  // Chip de categoría/etiqueta (CON texto → rounded-lg obligatorio); el color lo aporta colorClasses
  chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest',
  // Comando/ruta estilo tecla para material de referencia
  kbd: 'inline-block font-mono text-[11px] leading-none bg-gray-800/80 border border-amber-600/20 rounded px-1.5 py-0.5 text-amber-200',
} as const;
