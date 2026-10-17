# Convenciones de Diseño — RaidDominion Portal

> Reglas visuales PERMANENTES. A diferencia de `.opencode/improve/priorities.md`
> (backlog operativo, cambia seguido), este archivo casi no cambia — cuando lo
> hace, es una decisión deliberada (nueva regla Rn), no un ajuste de prioridad.
> Fuente de verdad en código: `src/lib/ui/design.ts` (tokens `ui.*`). Este
> archivo explica el *por qué*; el código tiene el *qué* (las clases exactas).

---

## 1. Personalidad visual

El portal no es un dashboard genérico: es la casa web de una comunidad de
WoW 3.3.5a. La consistencia de color (ámbar/dorado sobre `#111`) es la base,
pero la diferenciación real viene de tres cosas:

- **Iconografía temática**: clase/rol de personaje, tipo de banda, insignia
  de maestro de hermandad — íconos reconocibles para el público de WoW, no
  iconografía SaaS genérica (nada de check-marks/settings-gear estilo
  producto B2B).
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

## 2. Sistema de tokens (`src/lib/ui/design.ts`)

Ver el archivo directamente para las clases exactas. Categorías disponibles:
`container`/`containerNav`, `panel`/`panelHover`/`sectionHead`/`sectionBody`,
`card`/`cardTop`/`cardHover`/`cardRow`/`divider`, `btnBase`/`btnPrimary`/
`btnSecondary`/`btnGhost`/`btnSizes`, `badge`/`chip`, `kbd`, `text.*`
(hero/h1-h3/body/bodyMuted/caption), `status.*` (success/warning/error/info),
`eyebrow`/`gradientTitle`/`statValue`/`iconTile`, `form.*`
(label/input/inputError/helperText/errorText), `filter.*` (searchRow/
searchWrap/searchIcon/result/facets/row/chip/chipActive/chipIdle/count —
barra de filtros de directorios), `loading.*` (skeleton/spinner/spinnerLg/
liveText), `focusRing`, `transition`.

**Regla de oro:** si vas a escribir un literal de Tailwind que ya existe como
token, usa el token. Si necesitas un literal nuevo que se repetirá más de
una vez, primero agrégalo como token — no lo dupliques en 2+ componentes.

## 3. Lenguaje de cards (2026-08-30)

Toda card de la plataforma usa la misma superficie (`ui.card`, que comparte
`SURFACE`) y, según su rol:

- **Interactiva** (enlace): `ui.cardHover` (lift `-translate-y-1` + halo ámbar).
- **Destacada**: línea de acento superior `ui.cardTop` (gradiente ámbar;
  requiere `relative overflow-hidden` en la card).
- **Fila** (roster/núcleos/listas): `ui.cardRow` (superficie tenue, hover de
  borde ámbar).
- **Medallón de icono/inicial**: `ui.iconTile` (un glifo, gradiente interior).
- **Etiqueta superior**: `ui.eyebrow`. **Título destacado**: `ui.gradientTitle`
  (bg-clip-text; no combinarlo con `group-hover:text-*`, pelea con el gradiente).
- **Cifra**: `ui.statValue` (gradiente vertical + tabular-nums).

En render JS usa los helpers de `src/lib/ui/card.ts` (`cardLink`, `card`,
`cardTop`, `iconTile`, `eyebrow`, `stat`, `cardTitle`, `cardRow`, `divider`)
como fuente única del literal (R5). No escribir `bg-gray-900/60` + borde ámbar
sueltos fuera de ese helper.

## 3b. Materiales y dirección de arte (2026-08-30)

La plataforma no es un dashboard genérico: es una **interfaz de aventurero /
grimorio de MMORPG clásico**. Todo el material se construye SOLO con CSS
(gradients, box-shadow, clip-path, pseudo-elementos) en
`src/styles/material.css` — sin imágenes, sin texturas descargadas, sin
copiar assets de WoW. Referencia emocional: "personalidad y densidad de una
UI MMORPG clásica", no una copia.

- **Atmósfera**: `.rd-bg` en `<body>` (vacío profundo + resplandor ámbar
  ambiental + trama procedural + viñeta). Reemplazó a `background.png`.
- **Atmósfera de página (2026-10-16)**: `.rd-atmosphere*` (material.css) +
  `PageAtmosphere.astro` + `src/lib/ui/particles.ts` — capa fija bajo el
  contenido con imagen de fondo atenuada por un velo de contraste y un canvas
  de partículas por página. Fondo e intensidad por tipo de página:
  `GameLoginBg`+`snow` en la landing, `GameLoginBg` en los directorios
  (bandas `ember`, hermandades `banner`, servidores `frost`, personajes y
  jugadores `arcane`), `characterBg`+`arcane` en las fichas de
  personaje/jugador, `bandsBg`+`ember` en la ficha de banda,
  `guildBg`+`banner` en el portal de hermandad, `serverBg`+`frost` en la
  ficha de servidor, `GameLoginBg`+`frost` en login, `404Bg`+`frost` en la
  404 y `addonBg`+`arcane` en las secciones de usuario/staff (upload,
  dashboard, admin, moderación), además de la textura sutil de la sección
  Addon. Reglas: el markup/engine son contratos únicos (jamás montar
  canvas suelto en una página); el motor pausa con `visibilitychange` y se
  personaliza por el evento `rd:particles` (paleta de clase o calidad de
  ítem). **Ritmo y volumen:** cada partícula lleva `depth` (0 lejos → 1
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
  F016/F018. Las páginas pasan
  `background`/`particles` a `Layout` (o `DetailShell`), nunca estilos de
  fondo propios. **Apilado:** el contenido del body vive dentro de un wrapper
  `relative isolate` (Layout); sin ese contexto, el fondo del body
  (posicionado) tapa la capa `z -1`.
- **Materiales**: `.rd-metal` (paneles forjados, `ui.panel`/`ui.sectionHead`),
  `.rd-card` (cards con energía sutil, `ui.card`), `.rd-stone`,
  `.rd-parchment` (misiones/citas), `.rd-btn` (botones que se hunden),
  `.rd-progress` (barras vivas), `.rd-glow` (pulso mágico), `.rd-active`
  (borde energético de selección), `.rd-nav-item` (barra de habilidades).
- **Esquinas**: cortes geométricos con `clip-path` (`.rd-cut`, `.rd-cut-sm`,
  `.rd-cut-both` vía `ui.cut`/`ui.cutSm`) para contenedores ceremoniales —
  NO es border-radius.
- **Títulos ceremoniales**: `ui.ornament` (`rd-title rd-ornament`) añade
  doble línea + diamante bajo títulos TIER 1/2.
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
  (borde canónico `amber-600/30`, definido una sola vez en la constante
  `SURFACE` de `design.ts`); prohibido reescribir el literal bg/border/rounded.
  Interactivo → sumar `ui.panelHover`.
- **R4 — Alcance de `SectionHeader`**: solo landing/páginas de contenido.
  Dashboards: `h1` de página + `ui.subTitle`; no mezclar sistemas de
  encabezado.
- **R5 — Sin duplicar el literal de superficie**: cualquier variante nueva de
  panel/card comparte la constante `SURFACE` en vez de repetir la cadena
  `bg-gray-900/60 backdrop-blur-sm border border-amber-600/30`.
- **R6 — Estado semántico único**: mensajes de error/éxito/advertencia SIEMPRE
  vía `ui.status.*`. Prohibidos colores Tailwind sueltos (`red-500`,
  `green-500`, etc.) fuera de ese token — deben leerse bien sobre `#111` y no
  competir visualmente con el acento ámbar de marca.
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

## 8. Responsive

Rango verificado: 320px–1440px sin overflow horizontal. Breakpoints:
los de Tailwind por defecto (`sm`/`md`/`lg`), sin breakpoints custom.
Tablas de dashboard → cards en `< sm`. Ver `patrones.md` P001 para el patrón
de dashboard con pestañas que ya resuelve esto en desktop.

## 9. Reglas fijas (no negociables sin discusión explícita)

- NO cambiar colores de marca (ámbar-400/600/900, fondo `#111`).
- NO eliminar clases `hidden sm:*` que controlan responsive.
- NO introducir componentes que rompan el estilo "card + borde ámbar".
- Textos de UI en español (esMX); NO hardcodear inglés.
- Prohibidos `rounded-xl/2xl/3xl` en `src/`.

## Historial de enmiendas

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
