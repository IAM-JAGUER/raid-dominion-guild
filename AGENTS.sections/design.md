# Convenciones de Diseño — RaidDominion Portal

> Reglas visuales PERMANENTES. A diferencia de `.opencode/improve/priorities.md`
> (backlog operativo, cambia seguido), este archivo casi no cambia — cuando lo
> hace, es una decisión deliberada (nueva regla Rn), no un ajuste de prioridad.
> Fuente de verdad en código: `src/lib/ui/design.ts` (tokens `ui.*`). Este
> archivo explica el *por qué*; el código tiene el *qué* (las clases exactas).

---

## 1. Personalidad visual

El portal no es un dashboard genérico: es la casa web de una comunidad de
WoW 3.3.5a. La consistencia de color (azul/acero sobre `#07111E`, §1b) es la
base, pero la diferenciación real viene de tres cosas:

- **Iconografía temática**: el portal usa un **set propio de 65 iconos**
  estilo WoW (azul/acero, ver §10). La vieja regla "nada de
  check-marks/settings-gear genéricos" se resolvió con arte PROPIO: los
  glifos de estado/acción (confirmar, engranaje, buscar, eliminar…) existen,
  pero dibujados como material de fantasía, no como iconografía SaaS plana.
  Además: clase/rol de personaje, tipo de banda e insignia de maestro
  conservan sus íconos reconocibles.
- **Micro-interacciones al parsear el SV**: la subida y el parseo del
  `RaidDominionDB` es el momento de mayor valor percibido del producto (ver
  `product.md` §Prioridades #2). Merece una transición con intención —
  usar la **View Transitions API de Astro** (nativa del stack, sin librería
  extra) para el paso `/upload` → preview de resultados, en vez de un
  salto brusco de página.
- **Densidad controlada**: roster, bandas y roles pueden volverse densos
  rápido. Preferir cards con jerarquía clara (`ui.text.h3` + `ui.text.caption`)
  sobre tablas comprimidas en vista de escritorio; en móvil, cards es
  obligatorio (no hay tabla que quepa en 320px sin scroll horizontal).

## 1b. Paleta (2026-10-17)

Identidad **azul/acero**, alineada con el arte del set de iconos. Cinco
colores ancla: **Abismo** `#07111E` (fondo profundo), **Acero** `#123253`
(superficies y bordes oscuros), **Hielo** `#5CA9E8` (acento secundario),
**Plata** `#B8D7F1` (texto claro) y **Energía** `#00BFFF` (acento primario).

- La escala Tailwind es `brand` 50–950 (`tailwind.config.js`), con los ancla
  en 200/400/500/800/950. El sustituto de la vieja `amber-*` es `brand-*` al
  MISMO índice: el rol de cada parada se conserva (500/600 acento, 900/950
  fondos). Lo hardcodeado vive en `material.css` (`--accent-*`, `--bg-*`,
  `--metal-*`, resplandores del `.rd-bg`) y en los tokens `ui.*`.
- **Superficies teñidas, texto neutro**: `bg/from/to/via-gray-800|900|950`
  pasan a `brand-*` (Acero/Abismo); `text/border/ring-gray-*` se mantienen
  neutros para legibilidad (los grises calibrados de F011 no cambian).
- **Única excepción semántica**: `ui.status.warning` conserva ámbar
  (`amber-300/950/500`) — el código universal de advertencia no debe
  confundirse con la marca. `success`/`error` no cambian.
- Assets con tonos tibios (`gallery/logo.png`, `GameLoginBg.jpg`) quedan
  fuera de código: reemplazarlos es una decisión de arte pendiente.

## 2. Sistema de tokens (`src/lib/ui/design.ts`)

Ver el archivo directamente para las clases exactas. Categorías disponibles:
`container`/`containerNav`, `panel`/`panelHover`/`sectionHead`/`sectionBody`,
`card`/`cardTop`/`cardHover`/`cardRow`/`divider`, `btnBase`/`btnPrimary`/
`btnSecondary`/`btnGhost`/`btnSizes`, `badge`/`chip`, `kbd`, `text.*`
(hero/h1-h3/body/bodyMuted/caption), `status.*` (success/warning/error/info),
`eyebrow`/`gradientTitle`/`statValue`/`iconTile`, `form.*`
(label/input/inputError/helperText/errorText), `filter.*` (searchRow/
searchWrap/searchIcon/result/facets/row/chip/chipActive/chipIdle/count —
barra de filtros de directorios), `pager.*` (bar/info/select/btn — barra de
paginación "Página [X] de Y", `src/lib/ui/paginator.ts`), `loading.*`
(skeleton/spinner/spinnerLg/liveText), `focusRing`, `transition`.

**Regla de oro:** si vas a escribir un literal de Tailwind que ya existe como
token, usa el token. Si necesitas un literal nuevo que se repetirá más de
una vez, primero agrégalo como token — no lo dupliques en 2+ componentes.

## 3. Lenguaje de cards (2026-08-30)

Toda card de la plataforma usa la misma superficie (`ui.card`, que comparte
`SURFACE`) y, según su rol:

- **Interactiva** (enlace): `ui.cardHover` (lift `-translate-y-1` + halo de
  energía).
- **Destacada**: línea de acento superior `ui.cardTop` (gradiente de marca;
  requiere `relative overflow-hidden` en la card).
- **Fila** (roster/núcleos/listas): `ui.cardRow` (superficie tenue, hover de
  borde de acento).
- **Medallón de icono/inicial**: `ui.iconTile` (un glifo, gradiente interior).
- **Etiqueta superior**: `ui.eyebrow`. **Título destacado**: `ui.gradientTitle`
  (bg-clip-text; no combinarlo con `group-hover:text-*`, pelea con el gradiente).
- **Cifra**: `ui.statValue` (gradiente vertical + tabular-nums).

En render JS usa los helpers de `src/lib/ui/card.ts` (`cardLink`, `card`,
`cardTop`, `iconTile`, `eyebrow`, `stat`, `cardTitle`, `cardRow`, `divider`)
como fuente única del literal (R5). No escribir `bg-brand-900/60` + borde de
marca sueltos fuera de ese helper. `cardLink` añade `ui.focusRing` (foco de
teclado visible y ceremonial, 2026-10-17) y los textos secundarios de card
usan `gray-400` (6.7:1 AA) — `gray-500` sobre la superficie de marca no pasa
AA (F011, `frallas.md`).

## 3b. Materiales y dirección de arte (2026-08-30)

La plataforma no es un dashboard genérico: es una **interfaz de aventurero /
grimorio de MMORPG clásico**. Todo el material se construye SOLO con CSS
(gradients, box-shadow, clip-path, pseudo-elementos) en
`src/styles/material.css` — sin imágenes, sin texturas descargadas, sin
copiar assets de WoW. Referencia emocional: "personalidad y densidad de una
UI MMORPG clásica", no una copia.

- **Atmósfera**: `.rd-bg` en `<body>` — degradado azul **opaco** (Acero →
  Abismo). Sin tramas procedurales, resplandores ni velos propios. Reemplazó
  a `background.png`.
- **Atmósfera de página (2026-10-16)**: `.rd-atmosphere*` (material.css) +
  `PageAtmosphere.astro` + `src/lib/ui/particles.ts` — capa fija bajo el
  contenido con la imagen de fondo al **45%** (`--rd-img-opacity`, afinable
  por página; el degradado de marca `.rd-bg` se integra debajo y el texto
  respira) y UN ÚNICO velo de
  contraste por página (`.rd-atmosphere__veil`, **0.3** por defecto; SOLO se
  monta si hay imagen) más su canvas de partículas. **Fondo único
  (2026-10-17):** `GameLoginBg` en TODAS las páginas — default de `background`
  en `Layout`; ninguna página pasa imagen propia. La partícula sí varía por
  sección (`snow` en la landing, `frost` en login/servidores/404, `ember` en
  bandas, `banner` en hermandades, `arcane` en el resto), y la
  sección de la Guía del Addon del index conserva su textura `addonBg` al
  14% dentro de la card (es superficie de card, no capa de página). Reglas: el markup/engine son contratos únicos (jamás montar
  canvas suelto en una página); el motor pausa con `visibilitychange` y se
  personaliza por el evento `rd:particles` (paleta de clase o calidad de
  ítem). **Capa única (2026-10-17)**: sobre el fondo solo puede ir el velo
  (`veil`) — prohibido sumar texturas/tramas/velos extra sobre el fondo
  (grids `bg-grid-pattern`, imágenes decorativas al X% de opacidad, humo
  legacy): ensucian el encuadre y compiten con el contenido. **Ritmo y volumen:** cada partícula lleva `depth` (0 lejos → 1
  cerca) y de él derivan tamaño, velocidad, alfa y respuesta al viento
  (`parallax` por variante); el viento es un compuesto de 3 senos
  inconmensurables + una ráfaga de envolvente suave (`windAt`, sin picos
  secos); los copos de `snow` se dibujan SIEMPRE como la misma mancha difusa
  pre-renderizada (un solo lenguaje visual: sin brazos ni puntos nítidos
  mezclados) y sin titileo (nieve estable, como el login). **Montaje
  idempotente:** remontar un canvas desmonta el campo anterior (HMR o doble
  ejecución del script jamás dejan dos bucles rAF dibujando encima, que se
  percibían como "dos efectos" superpuestos). **Movimiento reducido:**
  `prefers-reduced-motion: reduce` no apaga el ambiente — lo atenúa (50% de
  velocidad, 70% de densidad, ráfagas al 45% pero CONSERVADAS, sin titileo),
  porque previews embebidos/entornos headless reportan `reduce` por defecto,
  un campo congelado se percibe como roto y las ráfagas son el ritmo mismo
  del efecto. **Encuadre estable:** el fondo se precarga (`rel=preload`),
  `html { scrollbar-gutter: stable }` fija el ancho útil, la capa se ancla a
  `100lvh` (el chrome móvil no la redimensiona) y el fondo se sincroniza por
  JS con transición corta (`[data-fit]`); el canvas usa `ResizeObserver`
  inmediato y CONSERVA su campo al cambiar de tamaño (solo reescala
  posiciones: sin bitmap estirado ni re-aleatorización) — frallas.md
  F016/F018. El fondo es
  default único de `Layout`; las páginas solo pasan `particles` (o afinan
  `veil`), nunca imagen ni estilos de fondo propios. **Apilado:** el contenido del body vive dentro de un wrapper
  `relative isolate` (Layout); sin ese contexto, el fondo del body
  (posicionado) tapa la capa `z -1`.
- **Materiales**: `.rd-metal` (paneles forjados, `ui.panel`/`ui.sectionHead`),
  `.rd-card` (cards con energía sutil, `ui.card`), `.rd-stone`,
  `.rd-parchment` (misiones/citas), `.rd-btn` (botones que se hunden),
  `.rd-progress` (barras vivas), `.rd-glow` (pulso mágico), `.rd-active`
  (borde energético de selección), `.rd-nav-item` (barra de habilidades).
- **Esquinas**: corte diagonal sup-izq con `clip-path` (`.rd-cut` vía
  `ui.cut`; `.rd-cut-t` vía `ui.cutTop` en cabeceras de panel contiguo) para
  contenedores ceremoniales — NO es border-radius. El filo lleva un **bisel
  helado** (`::after`: línea de luz pegada al clip + resplandor cian hacia
  dentro) y una **chispa de vértice** (destello radial `circle at 5px 5px`
  r11 α.4 — la MISMA receta del remache de `rd-metal`, para que las placas de
  encabezado emparejen con las cabeceras de panel), todo respirando
  (`rd-seam-breathe`, 7s; familia del sistema de divisores, compás y
  portadora propios). Detalle fino: el pseudo se ancla al **border-box**
  (`top/left: -1px`) porque el absoluto se posa en el padding box y el
  `border` de 1px lo corría respecto al `clip-path` (que referencia el border
  box); en los combos con `rd-metal` (que ya usan `::after` para la costura)
  el bisel se integra a esa costura — juntos laten — y compensa el desfase
  en sus stops.
- **Contenedores vivos (2026-10-18)**: las **costuras** superiores (`.rd-metal::after`
  — paneles `ui.panel`, `sectionHead`/`sectionBody`, y los combos con corte)
  y las **bandas espectrales** del borde superior llevan la misma luz:
  bloom cian que **respira** (opacidad) y **vaga en vaivén espectral** sobre
  el borde. Ambas estructuras la llevan: placas de encabezado (banda propia
  en su `::before` libre: `radial-gradient(90% 320% at 50% 0%)` 10px, vaivén
  por `transform` ±18px — compuesto) y cabeceras/paneles de metal (banda
  integrada a la costura; en los combos el vaivén usa `background-position`
  POR CAPA: el bisel queda clavado en la esquina y solo costura+banda vagan).
  Delays propios por portadora (breathe −1.4/−2.8/−5.4s; sway/shift 13s).
  Cards regulares (`rd-card`) quedan FUERA a propósito: decenas por
  directorio latiendo a la vez sería ruido y coste de composición — su vida
  es el hover (`rd-lift`) y la línea de acento estática. Con `reduce` bandas,
  costuras y biseles usan `rd-seam-breathe-slow` (opacidad pura; el vaivén
  se retira por ser traslación).
- **Títulos ceremoniales**: `ui.ornament` (`rd-title rd-ornament`) añade
  doble línea + diamante bajo títulos TIER 1/2.
- **Divisores (2026-10-18)**: sistema único en material.css — el trazo
  hairline (`border-image` anti-subpixel) lleva un **bloom helado de dos
  capas** (`::before`: núcleo de 6px + resplandor de altura completa, la
  envolvente `--rd-divider-env` dos veces) con blur suave; además la LÍNEA
  late: el propio elemento anima opacidad (compuesto, sin layout). Pulso
  profundo y perceptible: breathe 6s (0.3→0.95) sobre línea y halo, más un
  vaivén espectral (drift 14s con deriva vertical e hinchazón `scaleY`).
  Delays negativos: ningún latido queda en fase consigo mismo ni con otro de
  la página. Sin partículas (la ventisca de puntos de la primera versión se
  retiró el mismo día; el pulso se reforzó tras revisión). Solo
  opacity/transform (pseudos `pointer-events:none`, cero impacto en layout).
  El envelope del halo sigue el del trazo de cada variante; el efecto vive en
  `.rd-divider` (landing), `.rd-divider-both` y `.rd-divider-left`, y el
  separador inferior de las tab bars (`.rd-tabbar`, dashboard/portal/fichas)
  comparte el sistema sobre su hairline fade-derecha (late con delay propio;
  halo DENTRO del borde — la barra es scroller `overflow-x-auto` y un pseudo
  que sobresalga se recorta). Con `prefers-reduced-motion: reduce` se
  ATENÚA, no se congela (mismo criterio que las partículas: un estado
  congelado se percibe roto): sin deriva (cero traslación/escala), solo
  respiración lenta de opacidad pura (11s, 0.4→0.8).
- **Reglas**: el material va vía tokens (`design.ts`), nunca literales sueltos.
  Las cards de enlace siguen usando `rd-card rd-lift` para el hover con peso.
  Respetar `prefers-reduced-motion` (ya incluido).

## 4. Reglas geométricas y de superficie (R1-R8)

- **R1 — Monogramas**: `rounded-full` admite texto SOLO si es un único glifo
  (inicial de avatar, dígito de paso) en contenedor cuadrado `w-N h-N`.
  Palabras o frases jamás en `rounded-full`.
- **R2 — Radio único**: todo chip/badge/contador con texto usa `rounded-md`
  (vía `ui.chip`/`ui.badge`); prohibido `rounded-lg` flotante. Excepción:
  `rounded-t-lg` en pestañas ancladas a una barra.
- **R3 — Superficie única en dashboards**: paneles siempre vía `ui.panel`
  (borde canónico `brand-600/30`, definido una sola vez en la constante
  `SURFACE` de `design.ts`); prohibido reescribir el literal bg/border/rounded.
  Interactivo → sumar `ui.panelHover`.
- **R4 — Alcance de `SectionHeader`**: solo landing/páginas de contenido.
  Dashboards: `h1` de página + `ui.subTitle`; no mezclar sistemas de
  encabezado.
- **R5 — Sin duplicar el literal de superficie**: cualquier variante nueva de
  panel/card comparte la constante `SURFACE` en vez de repetir la cadena
  `bg-brand-900/60 backdrop-blur-sm border border-brand-600/30`.
- **R6 — Estado semántico único**: mensajes de error/éxito/advertencia SIEMPRE
  vía `ui.status.*`. Prohibidos colores Tailwind sueltos (`red-500`,
  `green-500`, etc.) fuera de ese token — deben leerse bien sobre `#111` y no
  competir visualmente con el acento de marca.
- **R7 — Transición única**: toda transición usa `ui.transition`
  (`transition-all duration-300`). Duración custom solo si se documenta el
  motivo puntual en el componente.
- **R8 — Formularios estandarizados**: todo formulario (login, registro,
  upload) usa `ui.form.*`. Todo error de campo va asociado por
  `aria-describedby` al input correspondiente — ver §5.

## 5. Tipografía

Escala en `ui.text`: `hero` (landing hero), `h1`/`h2`/`h3` (jerarquía de
sección), `body`/`bodyMuted` (contenido y metadatos), `caption` (timestamps,
notas pequeñas). No usar tamaños Tailwind sueltos (`text-2xl`, `text-sm`)
fuera de este set salvo caso puntual documentado en el componente.

## 6. Formularios y accesibilidad

- Todo `<input>`/`<select>`/`<textarea>` usa `ui.form.input`; en estado de
  error, sumar `ui.form.inputError` y asociar el mensaje con
  `aria-describedby="id-del-error"` apuntando a un elemento con
  `ui.form.errorText`.
- Todo `<label>` usa `ui.form.label` y está asociado por `for`/`id` — nunca
  placeholder-como-label.
- Foco visible siempre: `ui.focusRing` en cualquier elemento interactivo
  que no sea ya un botón/link con foco propio.
- Mensajes de estado dinámico (subida en progreso, error de parseo) van en
  un contenedor `aria-live="polite"` usando `ui.loading.liveText`.

## 7. Loading y feedback async

Usar `ui.loading.skeleton` para placeholders de roster/bandas mientras carga,
`ui.loading.spinner` para acciones puntuales (submit, upload) y
`ui.loading.spinnerLg` para BLOQUES de carga de contenido: fichas
(`DetailShell`, `JugadorProfile`, portal de hermandad, admin, moderación) y
directorios. El bloque es SIEMPRE `LoadingBlock.astro` (spinner + texto en
`aria-live`, `text-center py-16`/`py-20`). En las listas vive DENTRO del
contenedor de ítems (`data-rd-list-content`) como único hijo mientras carga:
`settleAsyncList` (`src/lib/ui/list.ts`) lo RETIRA al asentarse y los ítems
ocupan su lugar (reemplazo in-place, sin salto de layout); en un `notice`
(error/«sin resultados») el mensaje se escribe en el mismo nodo sin spinner.
Nunca dejar una operación async sin feedback visual — ver `frallas.md` F010.

- **Entrada de contenido (estilo agendalisto)**: TODO contenido async entra
  con fundido en cuanto está disponible — motor único `src/lib/ui/reveal.ts`
  (registrado una vez en `Layout`). Contrato por atributos:
  `data-rd-reveal` (al quitarle `hidden`, funde), `data-rd-reveal-cards` (los
  hijos recién pintados por JS entran escalonados, solo la 1ª carga; los
  re-render de filtro/búsqueda no re-animan) y todo `[role="tabpanel"]` que
  se desoculta funde (dashboard, portal de hermandad, fichas, perfil de
  jugador) sin marcar cada pestaña. `routes.ts` (`showView`/`showNotFound`)
  usa `revealEl` para las vistas de ficha. Clases: `.rd-enter` (bloque),
  `.rd-enter-card` (hijo escalonado, índice en `--rd-card-i`), ambas sobre el
  `@keyframes fadeIn` global (opacidad pura, sin desplazamiento);
  `.animate-fade-in-1` sigue para encabezados/secciones del markup. Con
  `prefers-reduced-motion: reduce` el fundido se acorta (0.3s) y el escalonado
  se anula, no se eliminan.
- **Trampa de animaciones**: `@midudev/tailwind-animations` define su theme
  SIN `extend`, así que reemplaza la escala `animation`/`keyframes` de Tailwind;
  las utilidades core que no re-provee (p. ej. `animate-spin`) dejan de
  generarse en silencio. Las core que el portal use se definen en
  `material.css` (fuente única; hoy `spin`, ver F014) — no confiar en el
  plugin, y `theme.extend` exige reiniciar el dev server (su build queda
  cacheado).

## 7b. Filtros de directorio (2026-10-16)

Los directorios raíz (`/servidores`, `/jugadores`, `/personajes`, `/bandas`,
`/hermandades`) comparten el esquema de `/bandas`: **ventana de panel**
(`PanelWindow`) cuyo encabezado monta la barra de filtros y cuyo cuerpo es la
lista asíncrona. El motor es ÚNICO — `src/lib/ui/filterBar.ts`
(`createFilterBar`) — y no se duplica buscador/botones de filtro por página:

- **Buscador** de texto (`getSearchText` por ítem) + una **fila de chips por
  faceta** (valores) o un **chip de bandera** (booleano: ★ Maestro,
  ✓ Verificada, Discord, Sin nombre). Chips = `<button aria-pressed>` sobre
  los tokens `ui.filter.*`; clic en el activo limpia el filtro.
- **Conteo por chip** computado sobre la búsqueda + los DEMÁS filtros activos
  (el propio facet se excluye) y **faceta dinámica**: una fila solo se pinta
  si aporta ≥2 valores distintos (bandera: ≥1 ítem que la cumple). El orden
  de los chips se fija al crear la barra (no re-ordena al tipear) y el input
  persiste (foco/cursor).
- **Facetas por directorio**: personajes → clase (ícono WoW + `CLASS_LABELS`
  de `classColors.ts`), reino, ★ Maestro; jugadores → reino, ★ Maestro, sin
  nombre; hermandades → facción (Horda/Alianza), reino, ✓ Verificada,
  Discord; bandas → día y tipo (Personal / De hermandad, vía
  `bandasPanel.ts`); servidores → solo buscador (una sola dimensión de dato).
  El día de bandas es dimensión núcleo (`minValues: 1`): su fila se muestra
  aunque los horarios caigan en un solo día, y solo lista los días presentes.
- **Sin resultados**: con texto → «Ninguno/a coincide con "q"»; solo facetas
  → «Sin resultados con los filtros aplicados.» Se asienta por el contrato de
  listas (`settleAsyncList` → `notice`, conserva el marco); el estado sin
  datos (0 al cargar) sigue siendo `empty` (EmptyState). `bandasPanel.ts`
  recibe el `list` del directorio para lo mismo y cae a un párrafo interno en
  las pestañas (sin contrato de lista).

El montaje del motor es `#filters` (`data-rd-filter-bar`) en la cabecera;
las pestañas Bandas de perfil/personaje/reino y el portal de hermandad usan
`bandasPanel.ts` (que consume el mismo motor) sobre sus propios contenedores.

### 7b.1 Pestañas de lista (2026-10-19)

El MISMO motor se monta en las pestañas que renderizan listas, cada una con
sus facetas de contenido (nunca un buscador propio):

- **Jugador**: personajes (clase, reino, ✓ Validado, ★ Maestro; solo el
  bloque "otros personajes", la carta principal no se filtra) y hermandades
  (facción, reino, ✓ Verificada).
- **Personaje**: equipamiento (ranura, calidad, Épico+), metas (tipo,
  ranura, calidad, Completada; un paginador POR SECCIONES equipo/monedas) e
  instancias (dificultad, Extendida).
- **Banda**: core (rol y clase, sin paginar: conserva los grupos por rol
  colapsables) y reglas (buscador + Con contenido).
- **Portal**: reglas (buscador + Con contenido; sin el tope de 20).
- **Dashboard**: mis personajes (clase, reino, Público, Validado, Con nota),
  registro de personajes (clase, reino, Maestro, Otra cuenta, Con ficha),
  registro de hermandades (Maestro, rango, tamaño, Con personajes) y
  propuestas de integración (estado, Con reglas).
- **Sin filtros/paginador**: la nota y la hermandad de la ficha de personaje
  (0/1 ítem) y la pestaña Bandas del dashboard (selector, no lista).

### 7c. Paginador (2026-10-19)

`src/lib/ui/paginator.ts` (`createPaginator`) es el ÚNICO paginador: barra
`Página [X] de Y • N …` con desplegable de salto + prev/next, oculta con una
sola página; tokens `ui.pager.*`. El roster (`preview.ts`) y todas las listas
lo consumen; `PAGE_SIZE_GRID` (12, grillas de 3 columnas) y `PAGE_SIZE_LIST`
(20, listas verticales) salen del mismo módulo. Para listas con secciones,
`packSections` empaqueta secciones enteras en páginas y repite la cabecera
con `continuation` cuando una sección se parte (días de bandas, equipo/
monedas de metas). La barra es SIEMPRE hermana del contenedor de ítems (nunca
dentro del grid con reveal). Los estados vacío/aviso no montan paginador.

### 7d. Video embebido (2026-10-19)

`src/components/shared/VideoEmbed.astro` es la fachada única para videos de
YouTube: miniatura 16:9 + play centrado; el `<a>` abre el video como fallback
sin JS y, con JS, el clic inyecta un iframe de `youtube-nocookie.com`
(`autoplay=1&rel=0`) en el mismo marco. Nada de YouTube se carga hasta el
clic (rendimiento/privacidad); el play es un control circular de marca
(`ui.video.*`), no el rojo de YouTube. El video del addon vive en
`ADDON_VIDEO` (`src/utils/constants.ts`) y se monta en `AddonSection`.

## 8. Responsive

Rango verificado: 320px–1440px sin overflow horizontal. Breakpoints:
los de Tailwind por defecto (`sm`/`md`/`lg`), sin breakpoints custom.
Tablas de dashboard → cards en `< sm`. Ver `patrones.md` P001 para el patrón
de dashboard con pestañas que ya resuelve esto en desktop.

## 9. Reglas fijas (no negociables sin discusión explícita)

- NO cambiar colores de marca sin decisión deliberada (§1b: escala
  `brand-n`, fondo Abismo `#07111E`).
- NO eliminar clases `hidden sm:*` que controlan responsive.
- NO introducir componentes que rompan el estilo "card + borde de marca".
- Textos de UI en español (esMX); NO hardcodear inglés.
- Prohibidos `rounded-xl/2xl/3xl` en `src/`.

## 10. Sistema de iconos (2026-10-16)

**Fuente única**: `src/lib/ui/icons.ts` — 65 iconos (`IconName`), con la
celda (`row`/`col`) del sprite normalizado y la trazabilidad (`crop`/
`center`) con la fuente maestra `public/images/icons.png`. **NO escribas
spans/backgrounds de icono a mano**: usa `Icon.astro` (template) o `iconEl`
(render JS); ambos comparten el mismo markup.

- **Assets**: `public/icons/rd-icons.webp` (+`.png` de respaldo), rejilla
  uniforme 8×9 de celdas 96px generada por `scripts/icons-sheet.py` a partir
  de la fuente maestra (rejilla irregular). Regenerar SOLO con ese script.
- **CSS**: `src/styles/icons.css` — `.rd-ico` escala el sprite con
  `--rd-ico` (tamaño) y `--rd-ico-col/-row` (celda). Excepción documentada a
  la regla de cascada de material.css: aquí `background-image` ES contenido.
- **Tamaños**: `ui.icon.xs…hero` (14/16/20/24/40/48px base) =
  `ICON_SIZE_CLASS`. Default de `Icon.astro`/`iconEl`: `sm` (16px); en
  medallones y cabeceras se usa `lg`/`xl`, y las cabeceras de ficha y los
  medallones héroe usan `hero` (§12).
- **Escala de prominencia (responsiva)**: SOLO los tres tamaños mayores crecen
  en pantallas grandes — `lg` 24→28px, `xl` 40→48→56px y `hero` 48→64→80px
  (media queries en `icons.css`). Los medallones acompañan con
  `ui.iconTileMd` (40→48px), `ui.iconTileLg` (48→56px) y `ui.iconTileHero`
  (80→96→112px). `md/sm/xs` son tamaño de DENSIDAD (nav, tabs, chips,
  filtros, toasts, botones) y **no escalan nunca**: agrandarlos rompe el
  ritmo de las barras y el balance de los controles. `hero` se mantiene
  ≤80px: el sprite es arte nativo de 96px y hasta ahí es nítido.
- **Color**: el arte va a color; PROHIBIDO recolorear con `text-*` o
  `opacity` para “teñir”. La jerarquía se logra por tamaño y por el
  medallón (`ui.iconTile`), no por color.
- **Accesibilidad**: sin `label` el icono es decorativo (`aria-hidden`); con
  `label` se anuncia (`role="img"`). Nunca un control icon-only sin nombre
  accesible. `class="hidden"` sobre `Icon` funciona (regla `.rd-ico.hidden`).
- **Contención (balance)**: los iconos marcan jerarquía y acciones —
  navegación, tabs, cabeceras de panel, medallones de cards, estados
  vacíos, toasts, filtros, acciones (añadir/editar/eliminar/compartir) y
  badges de logro. NO van en cada línea de texto ni reemplazan texto de
  estado micro (`✓ guardado`, contadores): eso es tipografía, no icono.
  Ante la duda, menos iconos.

## 11. Enlaces del juego / markup de chat (2026-10-17)

Los textos del SavedVariables pueden traer markup del cliente WoW
(`|cAARRGGBB…|r`, `|Htipo:datos|h[Etiqueta]|h`, `|T…|t`). Caso real:
`bands[].name` es el enlace del logro de la mazmorra. Reglas:

- **Fuente única de parseo**: `src/lib/wowLink.ts` (`stripWowMarkup`,
  `parseWowLink`, `tokenizeWowText`). El parser NUNCA persiste markup: todo
  campo visible pasa por su texto limpio.
- **Render**: `src/lib/ui/wowhead.ts` — `wowLinkEl(link)` (etiqueta + enlace)
  y `applyWowhead(anchor, link)`. NO escribas `data-wowhead`, URLs de Wowhead
  ni spans con color del juego a mano.
- **Color**: se respeta el color del código `|c` del SV (color del juego:
  logro = dorado, hechizo = azul); sin color, `text-brand-200`. El enlace
  siempre fija color explícito (nunca hereda `text-transparent` de
  `ui.gradientTitle`).
- **Tooltip**: widget oficial de Wowhead (`power.js`), cargado PEREZOSAMENTE
  (`ensureWowhead`) solo cuando la página monta un enlace con id soportado
  (item/spell/achievement/quest) — la landing no descarga terceros.
- **Alcance del id**: el id sale del markup (preview del upload). Los nombres
  limpios que vienen de la DB NO conservan id → en páginas públicas se
  degradan a etiqueta limpia (sin tooltip), decisión 2026-10-17.

## 12. Póster: zonas, jerarquía y escala (2026-10-17)

Las fichas públicas (personaje, jugador, banda, servidor, reino, portal de
hermandad) siguen una composición de **póster**: zona de identidad, compás de
pestañas y cuerpo de paneles, cada uno con su ritmo y su contenedor. Reglas:

- **Zonas y ritmo** (`ui.zone`): `hero` (`mb-8 lg:mb-10`), `tabs` (`mb-8`) y
  `body` (`space-y-8 lg:space-y-10`). Prohibido volver al `mb-6`/`space-y-6`
  único que igualaba todas las distancias de la página.
- **Placa de identidad** (`ui.plaque`): la zona héroe lleva superficie REAL
  (borde + corte `rd-cut` + línea de acento `ui.cardTop`). El texto suelto
  sobre la imagen de atmósfera se disolvía en las zonas claras del fondo —
  la decisión previa de "hero sin caja" (portal de hermandad) era de la
  época del velo 0.75-0.9; con la capa única y el velo 0.3 dejó de
  sostenerse. Desde 2026-10-18 es hermana de la VENTANA DE CONTENIDO: misma
  geometría (`rounded-tl-md` + diagonal por `rd-cut`, resto recto) y misma
  superficie (`SURFACE`: `bg-brand-900/60` + blur + borde), sin metal. Desde
  2026-10-17 la cabecera de los 5 directorios (`PageHeader`) también es
  placa con medallón de identidad (`iconTileLg` + `Icon` `xl`).
- **Medallón héroe** (`ui.iconTileHero` + `ui.icon.hero` +
  `.rd-medallion-hero`): el arte del sprite a tamaño protagonista con halo
  del color de contexto (`--rd-hero-tint`: color de clase en fichas de
  personaje/jugador; acento de marca en el resto). El halo ilumina por
  fuera; el arte no se recolorea (§10).
- **Tira de cifras** (`ui.statBlock`): las magnitudes de la identidad en
  grande (etiqueta + `ui.statValue`), separadas por hairline. Sustituye los
  chips de cifra pequeños en los héroes (Nivel/ilvl/Piezas, contadores de
  reino).
- **Filas con contenedor** (`ui.surf.row`): toda fila de dato dentro de un
  panel lleva marco real (base opaca + borde). El patrón fantasma
  `bg-brand-900/40 + border-l-2` (texto flotando sobre la atmósfera) queda
  prohibido en listas.
- **Lenguaje del ítem** (`ui.item`): slot como etiqueta (eyebrow legible,
  sin recorte), NOMBRE como protagonista (una talla sobre el texto de
  contenido, en el color de calidad del juego vía `--rd-q` +
  `.rd-quality-rail`) y cifra como `ui.statValue`. Fuente única del render:
  `itemRow()` de `src/lib/ui/card.ts`; Equipamiento y Metas comparten el
  MISMO componente (y `statCell()`/`heroMedallion()` el resto del póster).
- **Arte de clase**: los JPG de clase son de 18px (`frallas.md` F023): a
  96px se veían borrosos. La clase va como miniatura a 20px en su chip; el
  protagonismo visual es del medallón del sprite (arte nativo de 96px).
- **PanelWindow**: prop `pad="lg"` (`ui.panelPad.lg`) para paneles
  protagonistas de ficha; el ícono de cabecera usa `lg` y las pestañas
  (`tabs.ts`) usan `md` — el arte marca jerarquía, no viñetas diminutas.

## Historial de enmiendas

- **2026-10-19 (video del addon)**: la tarjeta "ADDON WOW 3.3.5A" de la
  landing deja de ser un enlace al canal y monta el video de presentación
  (`VideoEmbed.astro`, §7d): fachada con miniatura 16:9 y play, iframe
  `youtube-nocookie` al clic, fallback al `watch` sin JS. Tokens `ui.video.*`;
  el hover con escala sale de la card (un reproductor no debe ampliarse).

- **2026-10-19 (filtros y paginador en pestañas)**: el buscador + facetas
  (`createFilterBar`) deja de ser exclusivo de los directorios y Bandas: se
  monta en TODAS las pestañas de lista (jugador, personaje, banda, reino,
  portal y dashboard) con facetas por contenido (§7b.1). El paginador del
  roster se extrae a `src/lib/ui/paginator.ts` (barra, desplegable de salto
  y tokens `ui.pager.*`) y suma `packSections` para listas agrupadas
  (días de bandas, equipo/monedas de metas); tamaños únicos
  `PAGE_SIZE_GRID` (12) y `PAGE_SIZE_LIST` (20) (§7c). El portal de
  hermandad deja de recortar las reglas a 20. Excluidos: ítems únicos
  (nota/hermandad del personaje), core de banda (grupos por rol) y el
  selector de Bandas del dashboard.

- **2026-10-18 (luz espectral de contenedores)**: refinamiento del sistema
  del mismo día — (1) **chispa de vértice** en el bisel de las placas
  (destello radial idéntico al remache de `rd-metal`: `circle at 5px 5px`
  r11 α.4), que empareja los encabezados de página con las cabeceras de panel
  del contenido; (2) **banda espectral** que vaga por el borde superior de
  AMBAS estructuras: placas (::before libre, bloom 10px + vaivén por
  `transform` ±18px, compuesto) y metal (banda integrada a su costura —
  `rd-metal::after` crece a 8px con bloom; en combos el vaivén usa
  `background-position` por capa con el bisel clavado). Keyframes nuevos
  `rd-spectral-sway` (transform, 13s) y `rd-spectral-shift` (posiciones por
  capa, 13s); con `reduce` todo conserva SOLO la respiración lenta (el
  vaivén se retira por ser traslación). Verificado por CSSOM (reduce: sin
  transform/posiciones animadas; anim: sway mid-cycle `translate(-1.4px)` en
  placa y `background-position 8.2px` en capas de costura+banda del combo con
  el bisel en `0 0`) y píxeles (contra capturas previas: banda +25/35 B
  bajo el borde decayendo ~8px en placa, panel llano y head combo; chispa
  +20 B en el resplandor del vértice; móvil 390 consistente).

- **2026-10-18 (contenedores vivos)**: encabezados y contenedores de
  contenido de todas las páginas ganan luz viva — mismo lenguaje del sistema
  de divisores, portadoras propias. (1) **Bisel helado** en el corte diagonal
  sup-izq de TODOS los encabezados (placas `ui.plaque` y cabeceras de panel
  `ui.cutTop`): línea blanca-helada pegada al filo + resplandor cian, con
  respiración `rd-seam-breathe` 7s (delays −3.7s placa / −5.4s combo).
  Implementado como `::after` en `.rd-cut:not(.rd-metal)` (ancla border-box:
  `top/left: -1px` — el absoluto se posaba en el padding box y el border de
  1px lo corría del `clip-path`; verificado por píxeles que el filo vuelve a
  ceñirse) y como capas integradas en la costura de `.rd-metal.rd-cut(-t)`
  (stops compensados −1.41px en p por el mismo desfase). (2) **Costuras de
  panel que respiran** (`.rd-metal::after`, 7s/−2.8s): paneles, cabeceras y
  cuerpos de todas las páginas. Cards regulares fuera a propósito (decenas
  por directorio = ruido; su vida es el hover). Con `reduce`, costuras y
  biseles usan `rd-seam-breathe-slow` (12s, 0.55↔0.9, opacidad pura — sin
  traslación), a tono con la política de atenuar. Verificado por CSSOM
  (ambos branches, delays y capas por combo) y píxeles (perfil R/B por `p`:
  filo AA en 8.5px, línea llena ~9-10px, bloom hasta ~13px; consistente en
  placa de portal, PageHeader de directorio, placa de upload, head combo,
  móvil 390; costura de panel presente). De paso se corrigió la doc de
  «Esquinas»: `.rd-cut-sm`/`.rd-cut-both`/`ui.cutSm` no existían (drift
  documental).

- **2026-10-18 (divisores)**: los tres divisores (`ui.divider`,
  `dividerFadeBoth`, `dividerFadeLeft`) y el separador inferior de las tab
  bars (`.rd-tabbar`, dashboard/portal/fichas) comparten un mismo sistema:
  trazo `border-image` anti-subpixel + bloom helado de dos capas que respira
  y flota (breathe 6s 0.3→0.95 sobre línea Y halo; drift 14s con deriva
  vertical e hinchazón `scaleY`; delays negativos; sin partículas — la
  ventisca de puntos de la primera versión se retiró a pedido el mismo día).
  El legacy `.rd-divider` (rombo ❖, sin uso) se reescribe como base de
  `ui.divider` (envelope plateau simétrico; antes gradiente Tailwind con fade
  a la derecha y, por ser `background-image`, sujeto a la caída de 1px
  subpíxel que el `border-image` ya documentaba). En el tab bar el halo vive
  DENTRO del borde inferior (la barra es scroller `overflow-x-auto` ⇒
  `overflow-y` computed `auto`: un pseudo que sobresalga se recorta y añade
  scroll vertical) y usa `drift-soft` (±6px). Con `reduce` se ATENÚA (sin
  deriva ni escala; respiración lenta de opacidad pura a 11s), no se congela
  — mismo criterio que las partículas. Verificado por píxeles (perfil de
  bloom simétrico valle/pico — línea 82→195 y aura 53→152 en la landing;
  hairline del tab bar 145→213; sin partículas; envelope fade-derecha) en
  landing, portal de hermandad y directorio, a 1400 y 390 px, y por CSSOM
  (nombres/duraciones reales, opacidad y transform a media animación —
  `scaleY` incluido — y cero traslación con `reduce`).

- **2026-10-18 (cifras de la landing)**: `ui.statBlock` en la landing queda con
  dos celdas (cliente WoW / gratis), label y cifra centrados
  (`text-center` + `!px-4`, que vence el `first:pl-0`/`last:pr-0` del token).
  El `cardTop` se mueve fuera de la tira: dentro era el primer hijo del flex y
  los `first:`/`last:` no alcanzaban a las celdas (hairline fantasma + 16px de
  sangría en la primera; el `gap-x-6` sumado al `px-4` dejaba además el
  separador a 40/16). Sin gap en `sm+` (simétrico 16/16) y sin hairlines en
  móvil (wrap seguro). Verificado midiendo geometría real en iframe (dpr 1) a
  390 y 1400 px: centros de placa/tira/celdas coincidentes, `border-left` 0/1px
  y padding `2 16 2 16` en ambas celdas.

- **2026-10-18 (placa = ventana)**: `ui.plaque` adopta la geometría y la
  superficie de la ventana de contenido: `rounded-tl-md rounded-tr-none
  rounded-b-none` (diagonal sup-izq por `rd-cut`, resto recto — antes
  `rounded-md` redondeaba las 4 esquinas) y `bg-brand-950/80` →
  `bg-brand-900/60` (SURFACE, con blur y borde intactos). Aplica a las 14
  páginas con encabezado (directorios vía `PageHeader`, fichas, staff, 404,
  landing). Verificado con capturas headless en directorio, ficha, login y
  landing.

- **2026-10-18 (tiras de contexto)**: nuevo token `ui.contextStrip`
  (`hidden flex flex-wrap gap-2 mt-10`): chips de servidor/reino tras el
  separador final de las fichas (personaje, jugador, reino y portal de
  hermandad) — liberan el encabezado y cierran la página con el mismo respiro
  divisor→contenido que el directorio (2.5rem). Fuente única de los chips:
  `serverRealmLinks()` (`card.ts`, icono de servidor/vientos en vez de
  prefijos de texto); cada vista desoculta la tira solo cuando hay datos (la
  fila del helper siempre existe). Se eliminan los `space-y-10` de `#profile`
  y `space-y-8` de `#portal`: su selector (0,3,0) pisaba el `mt-12` del
  divisor y añadía margen fantasma a la tira. Verificado con capturas
  headless en las 4 rutas.

- **2026-10-17 (auditoría general)**: fondo de página al 45% de opacidad
  (`--rd-img-opacity` en `.rd-atmosphere__image`) para legibilidad global;
  `prefers-reduced-motion` neutraliza los `animation-delay` inline
  (`!important`) y cubre `animate-blurred-fade-in`. Póster aplicado a los
  heroes de staff/login/upload/dashboard/admin/moderado/404 (placa +
  medallón) y a la landing (`GrandLogo`: h1 de `text-md` inexistente a
  `text-3xl/4xl` en placa con marca, franja de stats a `ui.statBlock`).
  Barrido F011 completo: tokens (`helperText`, `badgeStat`, tabs inactivas)
  y literales de login/upload/dashboard/admin/moderate, módulos
  `ui/dashboard/*` y `preview.ts`. Superficies fantasma
  (`bg-brand-900/60 border-brand-600/25`) → `ui.panel`/`ui.surf.row` en
  upload/admin/moderate; fix del bug `class="${ui.badgeStat}"` (literal, no
  interpolado) ×11 en dashboard; código muerto eliminado (`NewsSection`,
  `YoutubeBanner`, `RaidSection` + `data/raids.json`); copys corregidos
  (claim sin "revisión de moderador" inexistente, pasos de hermandad,
  hint de personajes, origen del SV, canal de pruebas del admin, Footer
  2026, guías).

- **2026-10-17 (directorios)**: cabecera de los 5 directorios a placa de
  identidad (`PageHeader` con `ui.plaque` + `ui.zone.hero` + medallón
  `iconTileLg`/`xl`) con prop `icon` alimentada por `panelIcon` (DirectoryPage)
  y `espadas` (bandas). Barrido F011 en directorios: `ui.filter.result`,
  `ui.text.caption` y placeholders del formulario pasan a `gray-400`, y los
  literales `gray-500`/`gray-600` de cards (`cards.ts`, `bandasPanel.ts`,
  `servidores`, `jugadores`) a `gray-400`; `cardLink` gana `ui.focusRing`.
  Espaciado: divisor único `mt-6 mb-10` (fuera overrides `mt-6 mb-8`) y
  grillas de cards `gap-5 sm:gap-6`.

- **2026-10-17 (fondo único)**: `GameLoginBg` pasa a ser el fondo de TODAS
  las páginas vía default de `background` en `Layout`; se eliminan
  `characterBg`/`guildBg`/`bandsBg`/`serverBg` (archivos incluidos) y las
  secciones de usuario/staff dejan de ir sin imagen. `404Bg.jpg` se conserva
  en disco sin uso. Las páginas ya no pasan `background` (solo `particles`).

- **2026-10-17 (póster de fichas)**: nuevo §12 — placa de identidad
  (`ui.plaque`), medallón héroe (`ui.iconTileHero`/`ui.icon.hero` +
  `.rd-medallion-hero` con `--rd-hero-tint`), tira de cifras
  (`ui.statBlock`), filas con contenedor (`ui.surf.row`) y lenguaje del ítem
  (`ui.item` + `.rd-quality-rail` + `itemRow()`), ritmo de zonas
  (`ui.zone`). Escala de iconos ampliada (§10): `xl` 40→48→56px y tier
  nuevo `hero` 48→64→80px; `md/sm/xs` siguen siendo densidad. El héroe de
  las 6 fichas pasa de texto suelto a placa (la disolución sobre las zonas
  claras del fondo era el síntoma) y el avatar de clase (JPG de 18px a 96px,
  F023) se sustituye por medallón del sprite + miniatura de clase a 20px.

- **2026-10-17 (enlaces del juego)**: nuevo §11; parseo único de markup de
  chat en `src/lib/wowLink.ts`, render con widget perezoso de Wowhead en
  `src/lib/ui/wowhead.ts`, y limpieza del nombre de banda del SV (antes se
  persistía el enlace crudo → slug basura).
- **2026-10-17 (capa única sobre el fondo)**: la imagen de atmósfera pasa a
  opacidad plena (fuera `opacity 0.42/0.3` y el `filter` de saturación/brillo)
  y `.rd-bg` queda como degradado azul opaco (fuera la trama procedural y el
  resplandor rgba). El velo `veil` (0.3) es la ÚNICA capa transparente sobre
  el fondo; se eliminan además capas legacy: grid `bg-grid-pattern` de las
  tarjetas de guías y el humo `#smoke-container` (código muerto) del index.
  Las páginas de usuario/staff (upload, dashboard, admin, moderación) sueltan
  su fondo `addonBg` (quedan con `.rd-bg` liso + partículas); la textura
  `addonBg` al 14% de la sección «Guía del Addon» del index se CONSERVA
  (superficie de card). El velo se retinta a la paleta azul.
- **2026-10-17 (paleta azul/acero)**: sustitución completa de la paleta
  ámbar/dorada por la identidad azul/acero (§1b: Abismo/Acero/Hielo/Plata/
  Energía) — escala `brand` 50–950 en `tailwind.config.js` con reemplazo
  índice a índice (`amber|yellow|orange|sky-N` → `brand-N`) en 35 archivos,
  variables/materiales/resplandores azules en `material.css`, superficies
  `bg-gray-800|900|950` teñidas a `brand-*` con texto gris neutro, y
  excepción única de `status.warning` (sigue ámbar). El arte del sistema de
  iconos ya era azul/acero: la UI ahora lo acompaña.

- **2026-10-17 (escala de iconos)**: escala de prominencia responsiva del
  sprite — `lg`/`xl` crecen en `sm` (y `xl` también en `lg`) desde
  `icons.css`; medallones con tokens nuevos `ui.iconTileMd`/`ui.iconTileLg`
  (`EmptyState`, cards de directorio, estados vacíos del portal, upload,
  perfil de jugador). `md/sm/xs` quedan fijos por densidad (§10).
- **2026-10-17 (entrada sin desplazamiento)**: el `<style>` scoped legacy de
  `GrandLogo.astro` redefinía `@keyframes fadeIn` con `translateY(10px)`.
  Astro inyecta el CSS scoped DESPUÉS de las hojas globales: el keyframe
  homónimo sombreaba al canónico del `Layout` y tanto `html` (fade de
  entrada) como los `.animate-fade-in-1` del héroe subían 10 px al cargar.
  Eliminado el bloque completo (incluidas las clases muertas `text-shimmer`,
  `text-outline`, `animation-delay-200` y un `scroll-behavior: smooth` global
  redundante — la nav y las guías ya desplazan con `behavior:'smooth'` por
  JS). El fundido canónico queda SOLO en `material.css` (opacidad pura);
  regla nueva: jamás redefinir un `@keyframes` global homónimo desde un
  componente (ver `frallas.md` F021).
- **2026-10-16 (sistema de iconos)**: adopción del set temático de 65
  iconos — `src/lib/ui/icons.ts` (contrato), `Icon.astro`/`iconEl` (render),
  `icons.css` (CSS-sprite normalizado) y `scripts/icons-sheet.py`
  (generador); §1 enmendada (el veto a glifos genéricos queda resuelto con
  arte propio) y §10 nueva. Integrado en nav, tabs (`TabDef.icon`),
  `PanelWindow` (`icon`), `EmptyState`, toasts, filtros, directorios,
  fichas, dashboard, portal de hermandad, landing y guías.
- **2026-10-16 (filtros de directorio)**: esquema de búsqueda+filtros
  unificado en los 5 directorios raíz — motor `src/lib/ui/filterBar.ts`
  (buscador + chips de facetas dinámicas con conteo, `aria-pressed`,
  conteos sobre búsqueda + los demás filtros, input persistente) y tokens
  `ui.filter.*`; `DirectoryPage` adopta la ventana de panel de `/bandas` y
  monta la barra en `#filters`; `bandasPanel.ts` pasa a consumir el motor
  (facet día + tipo, `getType`) con el contrato de lista (`list` → `notice`
  en filtros sin resultado); facetas por directorio (clase/reino/Maestro,
  reino/Maestro/sin nombre, facción/reino/Verificada/Discord, día/tipo;
  servidores solo buscador); `CLASS_LABELS` en `classColors.ts` (fuente
  única de nombres de clase); `renderGuildCard` reemplaza el card duplicado
  de `/hermandades`; los `<select>` de clase/facción se retiran.

- **2026-10-16 (listas estándar)**: contrato único de lista asíncrona —
  `src/lib/ui/list.ts` (`resolveAsyncList`/`settleAsyncList`, estados
  `ready`/`empty`/`notice`) + atributos `data-rd-list-status/-content/-empty/
  -frame` + bloque de carga `LoadingBlock.astro` (fichas y listas) migran los
  5 directorios y `/bandas`; `revealCards` acepta selector CSS para ítems
  anidados (`#bandas-content` → `".rd-card"`: cascada real de cards, antes
  fundía el bloque entero de una vez). Reveal 100% en
  `src/lib/ui/reveal.ts`; los scripts ya no tocan clases de animación.
- **2026-10-16 (reveal)**: todo contenido async entra con fundido — motor
  único `src/lib/ui/reveal.ts` (observer global en `Layout`) con contrato
  `data-rd-reveal` / `data-rd-reveal-cards` + `[role="tabpanel"]` automático;
  grillas de directorios y bandas escalonadas (`.rd-enter-card`), bloques
  marcados en jugador, portal de hermandad, admin, moderación, upload y
  dashboard; `routes.ts` usa `revealEl`. Con `reduce`, fundido 0.3s y sin
  escalonado (design.md §7).
- **2026-10-16 (spinner)**: el bloque de carga de las fichas (spinner grande +
  texto) se extiende a los directorios — `DirectoryPage` `#status` y bandas
  ahora lo usan; todos los usos previos del spinner grande se unifican al
  token `ui.loading.spinnerLg` (design.md §7, pagina-map.md §2.B).
- **2026-10-16 (velo)**: velo unificado en `veil={0.05}` para TODOS los fondos
  (default de `PageAtmosphere`; `404`/`login`/`index` lo pasan explícito) —
  antes 0.75–0.9 atenuaban mucho la imagen; el contraste lo sostienen
  `.rd-bg` (z -2) y el contenido.
- **2026-10-16**: ventisca del index con ritmo y volumen + fondo sin zoom al
  cargar — `particles.ts`: `depth` por partícula (parallax de tamaño/velocidad/
  alfa/viento, `parallax` por variante para las 5), viento compuesto `windAt`
  (3 senos + ráfaga de envolvente suave, sin picos secos) y copos de `snow`
  como mancha difusa única pre-renderizada (sprites, sin brazos ni mezcla con
  puntos nítidos) sin titileo, más montaje idempotente por canvas (F017); con
  `reduce` las ráfagas SE CONSERVAN al 45% (antes se anulaban), velocidad 50%
  y densidad 70%. `material.css`: sin `transform: scale(1.03)` en
  `.rd-atmosphere__image` (era el zoom brusco al cargar); `Layout.astro`:
  precarga del fondo (`rel=preload`) y `html { scrollbar-gutter: stable }`
  para que el ancho útil no cambie (frallas.md F015/F016).
- **2026-10-16**: fundido de entrada canónico y spinner reparado — `.rd-enter`
  (aplicada por `routes.ts` en `showView`/`showNotFound`) + `.animate-fade-in-1`
  global en `material.css` (antes solo existían en index/GrandLogo, así que en
  las fichas el contenido aparecía de golpe); `DetailShell` usa
  `ui.loading.spinner`; `animate-spin` se define en `material.css` (el plugin
  de animaciones reemplaza `theme.animation` y no lo re-provee; `theme.extend`
  exige reiniciar el dev server, así que la definición material es la fuente
  única). Con `reduce` el fundido se acorta (0.3s) en vez de eliminarse, y se
  eliminó `HeroSection.astro` (código muerto) con las defs de fade muertas de
  `index.astro`.
- **2026-10-16 (tarde)**: atmósfera sin reescalado — resize de partículas
  inmediato (`ResizeObserver`) que conserva el campo y redibuja en el mismo
  frame (antes: debounce 150 ms + re-aleatorización con bitmap estirado,
  F018); fondo sincronizado por JS con transición corta (`[data-fit]`) y capa
  anclada a `100lvh`; montaje idempotente por canvas (F017).
- **2026-10-16 (noche)**: scroll sin saltos al recargar — el logo del héroe
  reserva su alto real (`height="280"`; el PNG es 500×500), y
  `html { overflow-anchor: none }` desactiva el anclaje automático de scroll
  que «bajaba» la página al asentarse el layout/fuente al recargar (F019).
- **2026-10-16**: atmósfera de página con partículas — `PageAtmosphere.astro`
  (imagen + velo + canvas) y motor `src/lib/ui/particles.ts` (variantes
  `snow`/`arcane`/`ember`/`banner`/`frost`, DPR-aware, pausa en background,
  `prefers-reduced-motion`, tinte en vivo por `rd:particles`). Cableado por
  props `background`/`particles` de `Layout`/`DetailShell` (decisión final de
  fondos: `GameLoginBg` en landing y todo directorio — `snow`/`ember`/`banner`/
  `frost`/`arcane` según sección —, `characterBg` en fichas de
  personaje/jugador, `bandsBg` en ficha de banda, `guildBg` en portal de
  hermandad, `serverBg` en ficha de servidor, `404Bg` en la nueva 404; se
  prescindió de `iccDay`/`iccNight` y del selector día/noche). La pestaña
  Equipamiento emite la paleta de calidad de ítem. `addonBg`+`arcane`
  ambienta las secciones de usuario (dashboard, upload) y de staff (admin,
  moderación), además de la textura sutil de la sección Addon. **Movimiento
  reducido:** el motor nunca congela el ambiente; con `reduce` atenuaba a 35%
  de velocidad y mitad de densidad, sin ráfagas ni titileo (revisado el mismo
  día: `reduce` conserva las ráfagas atenuadas — ver entrada de ventisca/
  profundidad). El
  contenido del body se envuelve en un contexto de apilado `relative isolate`
  para que la capa `z -1` quede sobre el fondo del body y bajo el contenido.
  Sin catch-all SPA, Netlify sirve `dist/404.html`.
- **2026-08-30**: dirección de arte "interfaz de aventurero / grimorio MMORPG" —
  nuevo `src/styles/material.css` (tokens CSS, atmósfera `.rd-bg`, materiales
  `.rd-metal`/`.rd-card`/`.rd-stone`/`.rd-parchment`, esquinas `clip-path`
  `.rd-cut*`, títulos ceremoniales `.rd-ornament`, botones `.rd-btn`,
  barra de habilidades `.rd-nav-item`, `.rd-active`, `.rd-glow`,
  `.rd-progress`; con `prefers-reduced-motion`). Cableado en `design.ts`
  (`ui.panel`/`ui.sectionHead` → metal, `ui.card` → card+lift,
  `ui.btnBase` → `rd-btn`, nuevos `ui.cut`/`cutSm`/`active`/`glow`/
  `ornament`/`navItem`). El fondo por imagen (`background.png`) se reemplazó
  por atmósfera CSS pura.
- **2026-08-30**: rediseño UI/UX de cards y secciones — nuevo bloque de tokens
  de card en `design.ts` (`ui.card`, `ui.cardTop`, `ui.cardHover`,
  `ui.cardRow`, `ui.eyebrow`, `ui.gradientTitle`, `ui.statValue`,
  `ui.iconTile`, `ui.divider`) y helpers de render `src/lib/ui/card.ts`.
  Aplicado a directorios, portal de hermandad, fichas, roster/core de
  `preview.ts`, dashboard (chips `hdr-*` con `statValue`, eyebrows, tab bar
  activa, empty states con medallón) y landing (hero con stats, Discord a
  ámbar, cards de guías/donaciones, fix de clases rotas en Footer).
  Contenidos de los tabs del dashboard (`src/lib/ui/dashboard/*`):
  `characterCard`, `renderBandDetail`, `renderGuildCard`, `renderRegistryGuildCards`,
  `renderRegistries`, `renderContentList` y `renderAssignments` migrados a
  `ui.card` + `ui.cardTop` + `ui.eyebrow` + `ui.gradientTitle` + `ui.cardRow`.
- **2026-08-25**: R1 (monogramas) agregada tras detectar caso de avatar con
  iniciales que violaba el criterio geométrico original.
- **2026-08-30**: R5-R8 agregadas tras auditoría que detectó ausencia total
  de tokens de formulario/estado/loading pese a ser prioridades explícitas
  de `ui-ux.md`. Ver `patrones.md` P009.
