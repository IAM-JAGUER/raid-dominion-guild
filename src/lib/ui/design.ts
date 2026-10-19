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
 * Cards (2026-08-30): la superficie de CARD es ui.card (misma SURFACE).
 * Interactivas → ui.cardHover (lift+glow). Línea de acento → ui.cardTop
 * (requiere `relative overflow-hidden` en la card). Títulos destacados →
 * ui.gradientTitle; cifras → ui.statValue; etiquetas → ui.eyebrow;
 * medallones → ui.iconTile (R1, un glifo). Uso preferente sobre literales
 * sueltos (regla de oro de design.md §2).
 *
 * Solo strings de clases Tailwind: sin lógica ni render.
 */

// Superficie canónica de paneles/cards: única fuente del literal borde
// ámbar (R3/R5). Cualquier variante nueva comparte esta constante.
const SURFACE = 'bg-brand-900/60 backdrop-blur-sm border border-brand-600/30';

export const ui = {
  container: 'max-w-6xl mx-auto',
  // Contenedor de navegación de ancho completo (Navigation, Footer):
  // conserva su propio max-w-7xl por estar anclado al borde.
  containerNav: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  // Materiales (src/styles/material.css): rd-metal forja paneles (su costura
  // superior respira y su banda espectral vaga por el borde), rd-card da
  // piedra/energía a las cards, rd-cut bisela esquinas (clip-path) con bisel
  // helado y chispa.
  panel: `${SURFACE} rd-metal rounded-md`,
  panelHover: 'hover:border-brand-500/50 transition-all duration-300',
  // Ventana estilo terminal del dashboard: cabecera + cuerpo contiguos, sin
  // radio en la junta, esquina inferior cuadrada y esquina sup-derecha RECTA
  // (la sup-izquierda la corta el clip-path de ui.cutTop). Van SIEMPRE en
  // pares: sectionHead (barra de título, gradiente aparte) + sectionBody
  // (cuerpo) como hermanos consecutivos; el border-b del head hace de divisor
  // único y el body no repite borde superior (border-t-0), contiguos sin gap.
  sectionHead: `${SURFACE} rd-metal rounded-tl-md rounded-tr-none rounded-b-none p-4 sm:p-6`,
  sectionBody: `${SURFACE} rd-metal rd-no-seam rd-no-rivet border-t-0 rounded-none p-4 sm:p-6`,
  // Cuerpo de panel sin el remache esquinero del ::before (sectionBody) — el
  // rivet queda SOLO en el encabezado (sectionHead).
  noRivet: 'rd-no-rivet',
  // Colapsables de filtros (patrón <details>/<summary> tipo guía): contenedor
  // + resumen clicable con acento lateral + cuerpo. Cerrados por defecto.
  disclosure: 'group bg-brand-900/50 border border-brand-600/30 rounded-md overflow-hidden',
  disclosureSummary:
    'cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-brand-200 font-bold text-sm hover:bg-brand-900/10 group-open:bg-brand-900/20 border-l-2 border-l-brand-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 transition-all',
  disclosureBody: 'px-4 py-3',
  btnBase:
    `rd-btn inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`,
  btnPrimary:
    'bg-gradient-to-r from-brand-500 to-brand-600 text-brand-950 hover:from-brand-400 hover:to-brand-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5',
  btnSecondary:
    'border border-brand-500/50 text-brand-200 bg-brand-950/60 hover:bg-brand-900/30 hover:border-brand-400 hover:-translate-y-0.5',
  btnGhost: 'text-gray-300 hover:text-brand-200 hover:border-brand-500/40',
  btnSizes: { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' },
  badge:
    'inline-flex items-center gap-1.5 rounded-md border font-black uppercase tracking-widest',
  // Tamaños de badge: sm para chips de cards, md para badges de rol/estado
  // en headers y tablas. Componer siempre con la base ui.badge.
  badgeSm: 'px-2 py-0.5 text-[9px]',
  badgeMd: 'px-2.5 py-1 text-[10px]',
  // Chip de cifra clave-valor (stat del header/visor): etiqueta + valor.
  badgeStat:
    'inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md border border-brand-700/30 bg-brand-950/50 text-[10px] font-black uppercase tracking-widest text-gray-400',
  // Superficie de color del badge de rol (única fuente; la consumen
  // dashboard, admin y perfiles). El layout lo aporta ui.badge + ui.badgeMd.
  badgeRole: {
    visitante: 'bg-brand-950/70 border-brand-800 text-brand-300',
    member: 'bg-brand-900/70 border-brand-700/60 text-brand-200',
    guild_master: 'bg-brand-900/40 border-brand-500/60 text-brand-200',
    moderator: 'bg-brand-900/30 border-brand-600/50 text-brand-200',
    admin: 'bg-red-900/30 border-red-600/50 text-red-200',
  } as const,
  sectionTitle: 'text-3xl font-bold text-brand-400',
  sectionRule: 'mt-4 h-1 w-24 rounded-full bg-brand-500 mx-auto',
  // Subtítulo de bloque dentro de un panel (visores, fichas, listas)
  subTitle: 'text-xs font-bold uppercase tracking-widest text-brand-300/90 mb-2',
  // Chip de categoría/etiqueta (CON texto → rounded-md obligatorio); el color lo aporta colorClasses
  chip: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-widest',
  // Comando/ruta estilo tecla para material de referencia
  kbd: 'inline-block font-mono text-[11px] leading-none bg-brand-900/80 border border-brand-600/20 rounded px-1.5 py-0.5 text-brand-200',

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
    caption: 'text-xs text-gray-400',
  },
  // H1 de PÁGINA con gradiente de marca: título hero con degradado ámbar y
  // tracking amplio (directorios, upload, login, admin, moderate). ÚNICA
  // fuente del literal del gradiente de h1 (antes duplicado en 8 páginas).
  titleHero:
    'text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-brand-300 to-brand-500 tracking-wider uppercase',
  // H1 de FICHA/VISTA (personaje, servidor, reino, banda, jugador, portal de
  // hermandad): tamaño grande en itálico, SIN color (lo aporta ui.gradientTitle
  // o un literal de gradiente propio de la vista). Solo base tipográfica.
  titleFicha: 'text-3xl sm:text-4xl md:text-5xl font-black italic leading-[1.3]',

  // ── Estado semántico (design.md R6, F006) ───────────────────────────────
  // SUPERFICIE DE COLOR de mensajes error/éxito/advertencia/info. El layout
  // (padding, radio, tamaño) lo aporta el contexto (chip/badge/alert-box);
  // el color NUNCA va suelto (prohibido red-500/green-500 fuera de aquí).
  status: {
    success: 'text-emerald-300 bg-emerald-950/30 border border-emerald-600/40',
    warning: 'text-amber-300 bg-amber-950/30 border border-amber-500/40',
    error: 'text-red-300 bg-red-950/40 border border-red-600/40',
    info: 'text-brand-200 bg-gray-900/60 border border-brand-600/30',
  },

  // ── Switch ON/OFF tipo pill (toggles de visibilidad/estado) ─────────────
  // Patrón replicado del dashboard (bands.ts makeSwitch): input peer sr-only
  // + track con knob deslizante vía after:. El label provee layout
  // (flex/gap/cursor/texto); aquí van SOLO las clases del track y su knob.
  // Uso: label → input.checkbox.peer.sr-only + span con toggleTrack.
  toggleTrack:
    'relative w-9 h-5 rounded-full bg-gray-700/80 border border-gray-600/60 transition-colors after:content-[""] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-gray-300 after:shadow after:transition-transform after:duration-200 peer-checked:bg-brand-600/70 peer-checked:border-brand-500/60 peer-checked:after:translate-x-4 peer-checked:after:bg-white',
  // Label estándar de un toggle pill (layout + cursor).
  toggleLabel: 'flex items-center gap-2.5 cursor-pointer select-none text-xs text-gray-400',

  // ── Formularios (design.md §5/R8, P011) ─────────────────────────────────
  // label: siempre <label for> con este estilo; jamás placeholder-como-label.
  // input: base; en error sumar inputError (importante para vencer a input)
  // y asociar el mensaje por aria-describedby → errorText.
  // helperText: ayuda opcional (aria-describedby opcional); errorText: error.
  form: {
    label: 'block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5',
    input:
      'w-full px-3 py-2.5 rounded-md bg-brand-900/70 border border-brand-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 outline-none text-gray-100 text-sm placeholder:text-gray-400 transition-colors',
    inputError: '!border-red-500/70 focus:!border-red-500 focus:!ring-red-500/30',
    helperText: 'mt-1.5 text-[11px] text-gray-400 italic',
    errorText: 'mt-1.5 text-[11px] text-red-300',
  },

  // ── Filtros de directorio (2026-10-16, filterBar.ts) ────────────────────
  // Barra de filtros estándar de los directorios (buscador + chips de
  // facetas con conteo). ÚNICA fuente del chip de filtro: antes embebido en
  // bandasPanel.ts; hoy lo consume el motor src/lib/ui/filterBar.ts.
  filter: {
    // Fila buscador + contador de resultados (aria-live).
    searchRow: 'flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3',
    searchWrap: 'relative flex-1',
    // Lupa temática (rd-ico) posicionada dentro del input.
    searchIcon: 'absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none',
    // Embudo temático que marca el inicio de la zona de facetas.
    facetLead: 'self-center mr-1 opacity-90',
    // Contador de resultados ("N bandas"): live region de la barra. gray-400
    // (6.7:1 sobre la superficie de marca) — gray-500 no pasa AA (F011).
    result: 'text-[10px] font-black uppercase tracking-widest text-gray-400 sm:text-right shrink-0',
    // Contenedor de filas de facetas (una fila por faceta, con wrap).
    facets: 'mt-3 space-y-2',
    row: 'flex flex-wrap gap-1.5',
    // Chip de filtro (botón): CON texto → rounded-md (R2). Estado por
    // chipActive/chipIdle; el conteo va en un span con `filter.count`.
    chip: 'inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
    chipActive: 'bg-gradient-to-b from-brand-900/50 to-brand-950/50 text-brand-200 border-brand-500/50',
    chipIdle:
      'bg-gradient-to-b from-gray-900/90 to-gray-950/90 text-gray-400 border-brand-600/25 hover:from-brand-900/40 hover:to-brand-950/40 hover:text-brand-200 hover:border-brand-500/40',
    count: 'text-[9px] font-bold opacity-60',
  },

  // ── Paginador reutilizable (2026-10-19, paginator.ts) ──────────────────
  // Barra "Página [X] de Y • N ítems": el número de página es un desplegable
  // de salto directo + controles prev/next. ÚNICA fuente de estas clases
  // (antes literales del roster en preview.ts).
  pager: {
    // Barra inferior: info a la izquierda, controles a la derecha; en móvil
    // se apila en columna centrada.
    bar: 'mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-brand-600/15 pt-3',
    // Texto del contador ("Página [sel] de Y • N ítems").
    info: 'text-xs text-gray-400 italic',
    // Desplegable de salto directo a cualquier página.
    select:
      'mx-1 px-1.5 py-0.5 rounded-md bg-brand-900/40 border border-brand-600/30 text-brand-200 text-xs italic cursor-pointer hover:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/50 transition-colors',
    // Botón cuadrado prev/next (flecha SVG interna).
    btn: 'w-8 h-8 flex items-center justify-center rounded-md border border-brand-600/30 bg-brand-900/20 text-brand-200 hover:bg-brand-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200',
  },

  // ── Sistema de iconos (2026-10-16, icons.css) ───────────────────────────
  // Clases de tamaño del sprite temático (65 iconos, contrato en
  // src/lib/ui/icons.ts). El componente es Icon.astro / iconEl; estas clases
  // solo fijan `--rd-ico` (espejo de ICON_SIZE_CLASS). El arte NO se
  // recolorea: nada de text-* sobre el icono.
  icon: {
    xs: 'rd-ico-xs',
    sm: 'rd-ico-sm',
    md: 'rd-ico-md',
    lg: 'rd-ico-lg',
    xl: 'rd-ico-xl',
    // Tamaño PROTAGONISTA (póster): cabeceras de ficha y medallones héroe.
    // El sprite es arte nativo de 96px: hasta 80px se mantiene nítido.
    hero: 'rd-ico-hero',
  },

  // ── Loading / feedback async (design.md §6, F010) ───────────────────────
  // skeleton: placeholder de contenido (roster/bandas). spinner: acción
  // puntual (submit/upload). spinnerLg: bloque de carga de contenido (fichas
  // y directorios) — mismo aro, tamaño grande. liveText: texto de estado en
  // aria-live (dentro de un contenedor con el bloque de carga).
  loading: {
    skeleton: 'animate-pulse rounded-md bg-gray-800/60',
    spinner: 'inline-block w-4 h-4 border-2 border-brand-500/30 border-t-brand-300 rounded-full animate-spin',
    spinnerLg: 'inline-block w-8 h-8 border-2 border-brand-500/30 border-t-brand-300 rounded-full animate-spin',
    liveText: 'text-sm text-gray-400',
  },

  // ── Interacción (design.md §5/P011) ─────────────────────────────────────
  // Foco visible para todo elemento interactivo sin foco propio ya definido.
  focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
  // Transición única (design.md R7): duración custom solo si se documenta.
  transition: 'transition-all duration-300',

  // ── Cards y superficies enriquecidas (2026-08-30, rediseño UI/UX) ───────
  // Lenguaje de cards de la plataforma: superficie de marca (SURFACE) +
  // línea de acento superior (cardTop) + glow/lift al hover (cardHover).
  // Uso: card como base, cardHover solo en elementos interactivos (links).
  card: `${SURFACE} rd-card rounded-md`,
  // Línea de acento superior: gradiente ámbar sobre la card (apéndice visual;
  // no lleva el foco, solo decoración). Va ABSOLUTA: la card necesita
  // `relative overflow-hidden`.
  cardTop: 'absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent',
  // Hover de card interactiva: rd-lift (material.css) eleva con peso y enciende
  // un borde energético; el borde Tailwind solo cambia de color.
  cardHover: 'rd-lift hover:border-brand-500/60',
  // Fila de card (roster, núcleos, listas): superficie tenue, hover de borde.
  cardRow: 'rounded-md border border-brand-800/40 bg-brand-900/40 hover:border-brand-500/30 transition-colors',
  // Eyebrow: etiqueta superior de sección/card (texto, tracking amplio).
  eyebrow: 'rd-eyebrow text-[10px] font-black uppercase tracking-[0.18em] text-brand-400/80',
  // Título con degradado de marca (hero, h1/h2 de sección destacada).
  // leading despejado + padding inferior: evita que el itálico y las
  // descendentes (g, y, p) se recorten bajo bg-clip-text.
  gradientTitle: 'text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-brand-400 to-brand-600 leading-[1.3] pb-[0.1em]',
  // Cifra destacada (stats, contadores): degradado vertical + tabular.
  // Mismo cuidado tipográfico que gradientTitle (descendentes + itálico).
  statValue: 'font-black italic tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-brand-200 to-brand-500 leading-[1.4] pb-[0.15em]',
  // Medallón de icono/inicial (R1): cuadrado rounded-md, gradiente interior.
  iconTile: 'flex items-center justify-center rounded-md bg-gradient-to-br from-brand-500/25 via-brand-600/10 to-brand-950/40 border border-brand-500/30 text-brand-300 shadow-[inset_0_1px_0_0_rgba(92,169,232,0.25)] shrink-0',
  // Tamaños responsivos del medallón: crecen un paso desde `sm` para
  // acompañar la escala de prominencia de los iconos lg/xl (icons.css).
  // md = medallón de card/lista; lg = medallón de estado vacío/héroe.
  iconTileMd: 'w-10 h-10 sm:w-12 sm:h-12',
  iconTileLg: 'w-12 h-12 sm:w-14 sm:h-14',
  // Medallón HÉROE de ficha (póster): protagonista de la zona de identidad.
  // Se compone con ui.iconTile + ui.icon.hero y el halo .rd-medallion-hero
  // (material.css), tintado por contexto con `--rd-hero-tint`.
  iconTileHero: 'w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28',

  // ── Póster: zonas, superficies y jerarquía (2026-10-17, design.md §12) ──
  // Ritmo de zonas de una ficha: el héroe respira, las pestañas y el cuerpo
  // tienen su propio compás (4/8/12/16/24/32). Sustituye el `mb-6` único
  // que igualaba todas las distancias.
  zone: {
    hero: 'mb-8 lg:mb-10',
    tabs: 'mb-8',
    body: 'space-y-8 lg:space-y-10',
  },
  // Placa de IDENTIDAD de la ficha (póster, design.md §12): superficie real
  // para la zona héroe — sobre la imagen de atmósfera, el texto suelto se
  // disolvía en las zonas claras del fondo. Hermana de la VENTANA DE
  // CONTENIDO: misma geometría (diagonal sup-izq por rd-cut con bisel
  // helado + chispa, resto recto) y misma superficie (SURFACE), sin metal;
  // la línea de acento (ui.cardTop) va dentro y el borde superior lleva la
  // banda espectral.
  plaque: 'relative overflow-hidden rounded-tl-md rounded-tr-none rounded-b-none border border-brand-600/30 bg-brand-900/60 backdrop-blur-sm rd-cut',
  // Superficie de FILA de dato (no card de directorio): contenedor REAL
  // (opaco + marco) para que el dato no se disuelva sobre la atmósfera de
  // página. Sustituye el patrón fantasma `bg-brand-900/40 + border-l-2`,
  // que dejaba las listas como texto flotando sobre la imagen.
  surf: {
    row: 'relative overflow-hidden rounded-md border border-brand-700/50 bg-brand-950/80',
    rowHover: 'hover:border-brand-500/60 hover:bg-brand-950 transition-colors',
  },
  // Lenguaje del ÍTEM de equipo/meta (design.md §12): el slot es la
  // etiqueta, el NOMBRE es el protagonista (una talla sobre el texto de
  // contenido y en el color de calidad del juego vía `--rd-q`) y la cifra
  // va a la derecha como statValue. El riel de calidad lo pinta
  // `.rd-quality-rail` (material.css).
  item: {
    row: 'relative overflow-hidden flex items-center gap-3 rounded-md border border-brand-700/50 bg-brand-950/80 pl-4 pr-3 py-2.5',
    rowHover: 'hover:border-brand-500/60 hover:bg-brand-950 transition-colors',
    slot: 'text-[10px] font-black uppercase tracking-[0.16em] text-gray-400',
    name: 'text-sm sm:text-base font-bold leading-snug line-clamp-2 text-gray-100',
    value: 'shrink-0 text-lg',
  },
  // Tira de cifras del héroe (póster): celdas separadas por hairline, con
  // etiqueta y cifra grande (statValue). El WRAPPER decide el flujo y debe
  // contener SOLO las celdas (si mete otro hijo antes, `first:`/`last:` no
  // alcanzan a la primera/última): fichas → `flex flex-wrap items-center`;
  // landing → `flex flex-wrap justify-center`, celdas `text-center` con
  // `!px-4` (centrado simétrico) y hairline solo desde `sm`.
  statBlock: {
    cell: 'border-l border-brand-700/50 px-4 first:border-l-0 first:pl-0 last:pr-0 py-0.5',
    label: 'text-[10px] font-black uppercase tracking-[0.14em] text-gray-400 mb-0.5',
    value: 'text-xl sm:text-3xl',
  },
  // Padding ampliable del cuerpo/cabecera de un PanelWindow protagonista
  // (prop `pad="lg"`): overrides explícitos sobre el padding del token.
  panelPad: {
    md: '',
    lg: '!p-5 sm:!p-7',
  },
  // Separador ceremonial: trazo hairline con bloom de neón que respira —
  // la línea y el halo laten (efecto en material.css, «Sistema de
  // divisores»). Uso actual: landing (index.astro); card.ts lo expone como
  // separador interno.
  divider: 'rd-divider w-full',
  // Separadores del ESQUELETO de página (encabezado → central →
  // izquierdo/tabs → contenido → derecho):
  //   dividerFadeBoth — separador CENTRAL: sólido al centro, se desvanece a ambos lados.
  //   dividerFadeRight — separador IZQUIERDO: sólido a la izquierda, se
  //     desvanece a la derecha (misma dirección que la hairline interna de
  //     `rd-tabbar`; sustituye a la barra de tabs cuando no hay tabs).
  //   dividerFadeLeft — separador DERECHO: sólido a la derecha, se desvanece
  //     a la izquierda; cierra el contenido principal.
  // El borde inferior de la navegación de tabs (rd-tabbar, material.css)
  // comparte el halo del sistema sobre su propia hairline fade-derecha; no usa token.
  dividerFadeBoth: 'rd-divider-both w-full',
  dividerFadeRight: 'rd-divider-right w-full',
  dividerFadeLeft: 'rd-divider-left w-full',
  // Tira de CONTEXTO de una ficha (chips de servidor/reino tras el divisor
  // final): cierra la página sin tocar el encabezado. El respiro bajo el
  // divisor sigue la relación divisor→contenido del directorio (mb-10).
  // `hidden` inicial: cada vista la desoculta solo cuando aporta datos.
  contextStrip: 'hidden flex flex-wrap gap-2 mt-10',

  // ── Materiales y ornamentación (2026-08-30, material.css) ───────────────
  // Corte diagonal único en la esquina superior izquierda (clip-path, no
  // border-radius) para contenedores ceremoniales (paneles destacados, marcos
  // de misión); el resto de bordes quedan rectos (rounded-md base). El corte
  // lleva el bisel helado con chispa de vértice y la banda espectral del
  // borde superior que respira y vaga (material.css).
  cut: 'rd-cut',
  // Corte sup-izq de la cabecera de un panel contiguo (modelo dashboard).
  cutTop: 'rd-cut-t',
  // Estado "seleccionado": borde energético ámbar (tabs, ítems activos).
  active: 'rd-active',
  // Pulso mágico lento para elementos importantes (energía).
  glow: 'rd-glow',
  // Título ceremonial con ornamentos (doble línea + diamante): añadir a
  // títulos TIER 1/2 destacados.
  ornament: 'rd-title rd-ornament',
  // Ítem de navegación tipo barra de habilidades (estados por CSS).
  navItem: 'rd-nav-item',
} as const;