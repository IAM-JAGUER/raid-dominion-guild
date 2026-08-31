/**
 * Tokens de UI del portal (convenciones gráficas compartidas).
 *
 * Regla de bordes: salvo círculos inherentes (rounded-full legítimo,
 * p. ej. avatares o botones circulares), `rounded-md` es el radio MÁXIMO
 * permitido. Prohibidos rounded-xl/2xl/3xl en toda la plataforma.
 *
 * Criterio geométrico: elementos CON TEXTO (chips, badges, contadores,
 * botones filtro) usan siempre `rounded-md`. `rounded-full` solo para
 * elementos SIN texto inherentemente píldora/círculo (dots, indicadores,
 * medallones de icono, botones flotantes circulares) o vía el token
 * `ui.sectionRule` (divisor fino h-1, única excepción de divisor).
 *
 * Convenciones v2 (detalle en AGENTS.sections/design.md):
 * R1 monogramas de un glifo en rounded-full · R2 chips con texto
 * siempre rounded-md (usar ui.chip) · R3 paneles de dashboard via
 * ui.panel (+ui.panelHover si interactivo) · R4 dashboards usan
 * h1 + ui.subTitle, nunca SectionHeader · R5 superficie única vía la
 * constante SURFACE · R6 estado semántico vía ui.status.* · R7 transición
 * vía ui.transition · R8 formularios vía ui.form.* con aria-describedby.
 *
 * Solo strings de clases Tailwind: sin lógica ni render.
 */

// Superficie canónica de paneles/cards: única fuente del literal borde
// ámbar (R3/R5). Cualquier variante nueva comparte esta constante.
const SURFACE = 'bg-gray-900/60 backdrop-blur-sm border border-amber-600/30';

export const ui = {
  container: 'max-w-6xl mx-auto',
  // Contenedor de navegación de ancho completo (Navigation, Footer):
  // conserva su propio max-w-7xl por estar anclado al borde.
  containerNav: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  panel: `${SURFACE} rounded-md`,
  panelHover: 'hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300',
  // Ventana estilo terminal del dashboard: cabecera + cuerpo contiguos, sin
  // radio en la junta y esquina inferior cuadrada. Van SIEMPRE en pares:
  // sectionHead (barra de título, gradiente aparte) + sectionBody (cuerpo)
  // como hermanos consecutivos; el border-b del head hace de divisor único y
  // el body no repite borde superior (border-t-0), contiguos sin micro-gap.
  sectionHead: `${SURFACE} rounded-t-md rounded-b-none p-4 sm:p-6`,
  sectionBody: `${SURFACE} border-t-0 rounded-none p-4 sm:p-6`,
  btnBase:
    'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
  btnPrimary:
    'bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/20',
  btnSecondary:
    'border border-amber-500/50 text-amber-200 bg-gray-900/60 hover:bg-amber-900/30 hover:border-amber-400',
  btnGhost: 'text-gray-300 hover:text-amber-200 hover:border-amber-500/40',
  btnSizes: { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' },
  badge:
    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/30 bg-gray-900/60 text-xs sm:text-sm text-gray-300',
  sectionTitle: 'text-3xl font-bold text-amber-400',
  sectionRule: 'mt-4 h-1 w-24 rounded-full bg-amber-500 mx-auto',
  // Subtítulo de bloque dentro de un panel (visores, fichas, listas)
  subTitle: 'text-xs font-bold uppercase tracking-widest text-amber-300/90 mb-2',
  // Chip de categoría/etiqueta (CON texto → rounded-md obligatorio); el color lo aporta colorClasses
  chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-widest',
  // Comando/ruta estilo tecla para material de referencia
  kbd: 'inline-block font-mono text-[11px] leading-none bg-gray-800/80 border border-amber-600/20 rounded px-1.5 py-0.5 text-amber-200',

  // ── Tipografía (design.md §4, F009) ──────────────────────────────────────
  // Escala única: hero (landing), h1-h3 (jerarquía de sección, SIN color:
  // lo aporta el contexto), body/bodyMuted/caption (con color calibrado).
  text: {
    hero: 'text-3xl md:text-4xl font-bold',
    h1: 'text-2xl md:text-3xl font-bold',
    h2: 'text-lg font-bold',
    h3: 'text-base font-bold',
    body: 'text-sm text-gray-300',
    bodyMuted: 'text-sm text-gray-400',
    caption: 'text-xs text-gray-500',
  },

  // ── Estado semántico (design.md R6, F006) ───────────────────────────────
  // SUPERFICIE DE COLOR de mensajes error/éxito/advertencia/info. El layout
  // (padding, radio, tamaño) lo aporta el contexto (chip/badge/alert-box);
  // el color NUNCA va suelto (prohibido red-500/green-500 fuera de aquí).
  status: {
    success: 'text-emerald-300 bg-emerald-950/30 border border-emerald-600/40',
    warning: 'text-amber-300 bg-amber-950/30 border border-amber-500/40',
    error: 'text-red-300 bg-red-950/40 border border-red-600/40',
    info: 'text-sky-200 bg-gray-900/60 border border-sky-600/30',
  },

  // ── Formularios (design.md §5/R8, P011) ─────────────────────────────────
  // label: siempre <label for> con este estilo; jamás placeholder-como-label.
  // input: base; en error sumar inputError (importante para vencer a input)
  // y asociar el mensaje por aria-describedby → errorText.
  // helperText: ayuda opcional (aria-describedby opcional); errorText: error.
  form: {
    label: 'block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5',
    input:
      'w-full px-3 py-2.5 rounded-md bg-gray-800/70 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-gray-100 text-sm placeholder:text-gray-500 transition-colors',
    inputError: '!border-red-500/70 focus:!border-red-500 focus:!ring-red-500/30',
    helperText: 'mt-1.5 text-[11px] text-gray-500 italic',
    errorText: 'mt-1.5 text-[11px] text-red-300',
  },

  // ── Loading / feedback async (design.md §6, F010) ───────────────────────
  // skeleton: placeholder de contenido (roster/bandas). spinner: acción
  // puntual (submit/upload). liveText: texto de estado en aria-live.
  loading: {
    skeleton: 'animate-pulse rounded-md bg-gray-800/60',
    spinner: 'inline-block w-4 h-4 border-2 border-amber-500/30 border-t-amber-300 rounded-full animate-spin',
    liveText: 'text-sm text-gray-400',
  },

  // ── Interacción (design.md §5/P011) ─────────────────────────────────────
  // Foco visible para todo elemento interactivo sin foco propio ya definido.
  focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
  // Transición única (design.md R7): duración custom solo si se documenta.
  transition: 'transition-all duration-300',
} as const;