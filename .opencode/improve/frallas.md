# Frallas conocidas — RaidDominion Portal

Problemas encontrados y cómo evitarlos. Cada entrada tiene **estado**
(vigente = puede volver a pasar / mitigada = blindada por lint o script) y
**fecha** de detección, para saber si sigue siendo un riesgo activo.

## F001: Build falla por Browser API en SSR
- **Estado**: vigente (2026-08-23)
- **Error**: `document` o `window` en componente server-side
- **Solución**: Usar `client:only` o lifecycle methods
- **Detección**: verifica.sh falla con "Browser APIs are not available on the server"

## F002: RLS policies sin prefijo
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: CREATE POLICY sin raiddominion_
- **Solución**: Siempre prefijo raiddominion_
- **Detección**: audita-ecosistema.sh

## F003: handle_new_user() modificado
- **Estado**: vigente — requiere disciplina humana, no hay blindaje automático (2026-08-23)
- **Error**: Editar la función canónica en supabase-shared
- **Solución**: Coordinar con las 5 apps
- **Detección**: audita-ecosistema.sh

## F004: officerNote expuesta
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: Mostrar officerNote en páginas públicas
- **Solución**: Solo publicNote en público
- **Detección**: audita-ecosistema.sh

## F005: Contrato SV roto
- **Estado**: vigente (2026-08-23)
- **Error**: Cambiar claves del parser sin actualizar addon
- **Solución**: Coordinar addon↔portal en mismo ciclo
- **Detección**: contract-test.sh

## F006: any en TypeScript
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: Usar `: any` o `as any`
- **Solución**: Tipar correctamente
- **Detección**: audita-ecosistema.sh

## F007: Build paralelo en DrvFs
- **Estado**: mitigada por lock global de `verifica.sh` (2026-08-23)
- **Error**: Múltiples builds simultáneos
- **Solución**: usa scripts/verifica.sh (lock global)
- **Consecuencia**: Corrupción de dist/

## F008: Tablas compartidas modificadas
- **Estado**: mitigada por `audita-ecosistema.sh` (2026-08-23)
- **Error**: ALTER TABLE en apps o user_apps
- **Solución**: NO modificar tablas sin prefijo
- **Detección**: audita-ecosistema.sh

## F009: Inconsistencia tipográfica
- **Estado**: vigente — parcialmente mitigada (2026-08-30)
- **Error**: Tamaños Tailwind (`text-2xl`, `text-sm`, etc.) hardcodeados en
  componentes en vez de usar `ui.text.*` de `design.ts`
- **Solución**: Migrar a `ui.text.hero/h1/h2/h3/body/bodyMuted/caption`
- **Progreso**: tokens `ui.text.*` creados en `design.ts`; migrados login,
  upload, admin, moderate, portal, listados y el HTML estático del dashboard.
  Pendiente: render JS dinámico del dashboard (cards/chips) tras el split.
- **Detección**: manual/QA §7 — sin script automatizado todavía

## F010: Operación async sin feedback visual
- **Estado**: vigente — parcialmente mitigada (2026-08-30)
- **Error**: Upload/parseo/submit sin spinner, skeleton ni `aria-live`,
  dejando al usuario sin saber si algo está pasando
- **Solución**: `ui.loading.spinner`/`ui.loading.skeleton` +
  `aria-live="polite"` con `ui.loading.liveText` (ver `patrones.md` P010)
- **Progreso**: tokens `ui.loading.*` creados; login con spinner + `aria-busy`
  en submit y reset; `#status` aria-live de upload migrado a `ui.loading.liveText`;
  admin/moderate/portal/listados usan `ui.loading.liveText` en sus status.
  Pendiente: skeletons para las 5 cargas iniciales del dashboard y `aria-busy`
  en toggles por fila (card de personaje ya lo maneja vía texto de estado).
- **Detección**: QA §7 (gate mínimo) / revisión completa de `@ui-ux`

## F011: Contraste insuficiente en texto secundario
- **Estado**: cerrada (2026-10-17) — barrido completo de texto; solo restan
  `gray-500/600` no textuales (bordes/dots/chevron, 1.4.11 ≥3:1)
- **Error**: `text-gray-400`/`text-amber-200` sobre fondo `#111` sin
  verificar WCAG AA
- **Solución**: Auditar con herramienta de contraste; consolidar en
  `ui.text.bodyMuted`/`ui.text.caption` ya calibrados una vez verificados
- **Progreso**: `ui.text.bodyMuted` (gray-400 ≈7.5:1) y `ui.text.caption`
  (gray-500 ≈4.9:1) sobre `#111` pasan WCAG AA; `ui.status.*` también
  (red-300 ≈8.4:1, emerald-300 ≈9.7:1, amber-300 ≈12:1, sky-200 ≈10.5:1).
  Pendiente: barrer los usos sueltos restantes (`placeholder:text-gray-600`
  ≈3:1 NO pasa — corregir con placeholder más claro) en componentes no migrados.
- **Actualización 2026-10-17 (paleta azul/acero)**: sobre la superficie teñida
  (`bg-brand-900/60` ≈ `#091D2E`) los contrastes medidos son: `gray-300`
  11.6:1, `gray-400` 6.7:1, `brand-200` 11.4:1 y `brand-400` 6.8:1 (todos AA);
  `gray-500` baja a **3.54:1** (antes ≈3.9:1 sobre gris) — NO pasa AA en
  texto normal. `ui.text.caption` y `ui.filter.result` aún usan `gray-500`:
  el barrido de captions (a `brand-200/70` ≈6.3:1 o `gray-400`) queda como
  trabajo pendiente de este ciclo.
- **Actualización 2026-10-17 (directorios)**: barrido aplicado — `ui.text.caption`,
  `ui.filter.result`, `placeholder:*` de `ui.form.input` y los literales de
  cards de directorio (`cards.ts`, `bandasPanel.ts`, `servidores`,
  `jugadores`) pasan a `gray-400` (AA).
- **Resolución 2026-10-17 (auditoría general)**: barrido COMPLETO de
  `text-gray-500`/`text-gray-600` (≈50 literales) a `gray-400` en
  `login`, `upload`, `dashboard` (+ módulos `ui/dashboard/bands|guilds|visitor`),
  `admin`, `moderate`, `tabs.ts` (tab inactiva), `preview.ts`, `cards.ts`,
  `Navigation.astro`, `JugadorProfile`, `BandView`/`RealmView` y tokens
  (`ui.form.helperText`, `ui.badgeStat`). Solo quedan `gray-500/600` en
  elementos NO textuales (bordes `border-gray-600`, puntos de estado y el
  chevron del nav), donde aplica 1.4.11 (3:1) y pasan. `F011` queda
  cerrada para texto.
- **Detección**: manual — pendiente incorporar a `verifica.sh` o CI

## F012: Migración aplicada sin registrar en el ledger
- **Estado**: mitigada (2026-08-30)
- **Error**: Se aplica una migración a mano vía dashboard de Supabase pero no
  se registra en `ciclos.json` → `migraciones_aplicadas`, generando drift
  entre lo que dicen los archivos `.sql` locales y lo que realmente corrió
  en producción
- **Solución**: Registrar SIEMPRE en `ciclos.json` inmediatamente después de
  aplicar, antes de cerrar el ciclo de trabajo
- **Resolución 2026-08-30**: el usuario confirmó que las 40 migraciones de
  `supabase/migrations/` fueron aplicadas; todas quedaron registradas en
  `ciclos.json` → `migraciones_aplicadas` con `project_ref_verificado: true`.
- **Detección**: manual — sin CLI de Supabase no hay tracking automático,
  ver `AGENTS.md` §8

## F013: Agente detiene el servidor de Live Preview del usuario
- **Estado**: vigente (2026-10-16)
- **Error**: `pkill`/`kill` por patrón amplio (`astro`, `astro dev`) o
  `taskkill` global (`/IM chrome.exe`) tumba el dev server del usuario
  (puerto 4321, su Live Preview) y/o sus navegadores, dejando el preview
  roto y, si el proceso queda zombi, el puerto ocupado
- **Solución**: nunca terminar procesos por patrón ni puertos del usuario;
  para pruebas del agente usar puerto alterno
  (`npm run dev -- --port 4322`) y matar SOLO el PID propio registrado al
  lanzarlo; el 4321 se diagnostica únicamente con `curl` de lectura
  (regla completa en `AGENTS.md` §9, "Servidor de Live Preview")
- **Detección**: manual — antes de cualquier "limpieza" de procesos,
  verificar si el objetivo es del puerto 4321, un port-forward de LAN o un
  navegador/preview del usuario

## F014: Utilidad core de animación desaparece por plugin que reemplaza `theme.animation`
- **Estado**: mitigada (2026-10-16)
- **Error**: `@midudev/tailwind-animations` (plugins de `tailwind.config.js`)
  define su theme SIN `extend`: reemplaza las escalas `animation`/`keyframes`
  por defecto de Tailwind. Las utilidades core que el plugin no re-provee
  (p. ej. `animate-spin`) dejan de generarse EN SILENCIO — el spinner de
  "Cargando" quedaba estático y `animate-fade-in-1/2/3` (clases custom) nunca
  fueron utilidad real: solo existían en `index.astro`/`GrandLogo`/`HeroSection`,
  así que en las fichas el contenido aparecía de golpe
- **Solución**: definir en `material.css` las core que el portal use (fuente
  única; hoy `spin`, que alimenta `ui.loading.spinner`) — así existen en dev y
  build sin depender de la regeneración del plugin ni de reiniciar el dev
  server (el build de Tailwind queda cacheado por Vite). `theme.extend` también
  funciona, pero exige reiniciar el server para verse en dev. El reveal de
  vistas va por `rd-enter`/`animate-fade-in-1` en `material.css` + `routes.ts`
  (con `reduce` se acorta, nunca se elimina — ver `design.md` §7)
- **Detección**: grep del CSS servido — si el HTML/JS usa una clase
  `animate-*` y `@keyframes <nombre>` no existe en el CSS del dev server
  (`curl` de solo lectura), la utilidad no se generó

## F015: `prefers-reduced-motion` usado para APAGAR el efecto
- **Estado**: mitigada (2026-10-16)
- **Error**: la rama `reduce` de `particles.ts` anulaba el viento
  (`gust = 0`) y bajaba velocidad/densidad a 35%/50%; en entornos que
  reportan `reduce` por defecto (previews embebidos, headless) la ventisca
  perdía sus ráfagas y el usuario la percibía como "ya no emula el ritmo de
  la original" aunque el código "funcionara"
- **Solución**: `reduce` atenúa, no apaga — ráfagas al 45% (conservadas),
  50% de velocidad, 70% de densidad, sin titileo. La preferencia busca
  evitar parpadeo y movimiento brusco, no el movimiento ambiental mismo
- **Detección**: mirar el efecto en Chrome headless (reporta `reduce` por
  defecto) y comparar contra un entorno sin la preferencia; si en headless
  el efecto "no se mueve" o pierde su carácter, la rama `reduce` está
  apagando algo que debía atenuar

## F016: Zoom brusco del fondo al cargar
- **Estado**: mitigada (2026-10-16)
- **Error**: `.rd-atmosphere__image` tenía `transform: scale(1.03)` sobre un
  `background-size: cover` dentro de la capa fija: el encuadre "saltaba" de
  tamaño (~3%) al aplicarse tarde / recomputarse cuando cambiaba el ancho
  útil (aparición del scrollbar), y la imagen no precargada aparecía con
  pop-in
- **Solución**: sin transform en la capa de fondo (`cover` ya llena sin
  costuras), `html { scrollbar-gutter: stable }` fija el ancho útil y
  `<link rel="preload" as="image" fetchpriority="high">` en `Layout` cuando
  hay `background`, para decodificar el fondo antes del primer pintado
- **Detección**: recargar y observar el primer segundo; el computed style
  del div de fondo no debe tener `transform` distinto de `none` y el ancho
  del documento no debe cambiar al aparecer el scrollbar

## F017: Doble montaje del motor de partículas (dos efectos superpuestos)
- **Estado**: mitigada (2026-10-16)
- **Error**: si el script de montaje corre dos veces (HMR de Vite, doble
  inclusión del script), `mountParticleField` creaba un SEGUNDO bucle rAF
  sobre el mismo canvas: cada bucle borra y redibuja su propio set en el
  mismo frame → el campo "titila" y se percibe como dos efectos de
  partículas superpuestos aunque el DOM tenga un solo canvas
- **Solución**: guarda de idempotencia en `mountParticleField` — el disposer
  se registra en el propio canvas (`__rdParticlesDispose`) y remontar
  desmonta primero el campo anterior (funciona incluso entre instancias
  distintas del módulo bajo HMR)
- **Detección**: si el campo se ve inestable/superpuesto, parchear
  `requestAnimationFrame` y contar llamadas por frame: 2× el número de
  campos = hay más de un bucle activo; `--dump-dom` sigue mostrando 1 canvas

## F018: Reescalado brusco de la atmósfera al cambiar de tamaño
- **Estado**: mitigada (2026-10-16)
- **Error**: el resize de partículas usaba debounce de 150 ms + `populate()`:
  al cambiar el viewport, la imagen reencuadraba `cover` al instante mientras
  el canvas conservaba el bitmap viejo ESTIRADO a la caja nueva
  (cvCSS ≠ cvPix) y, al vencer el debounce, el campo se re-aleatorizaba. Se
  percibía como un "efecto de reescalado" simultáneo de imagen y partículas
- **Solución**: `ResizeObserver` inmediato en `particles.ts` que CONSERVA el
  campo (reescala posiciones `x*=sx, y*=sy`; nada de `populate()`) y redibuja
  en el mismo frame; fondo sincronizado por JS con transición corta
  (`[data-fit]`, 220 ms) para que el reencuadre se anime; capa anclada a
  `100lvh` para que el chrome del navegador móvil no la redimensione
- **Detección**: tras un resize, `canvas.clientWidth/Height` debe coincidir
  con `canvas.width/height` de inmediato (sin frame estirado) y las
  posiciones del campo no deben re-aleatorizarse

## F019: El scroll salta solo al recargar con la página arriba
- **Estado**: mitigada (2026-10-16)
- **Error**: al recargar el index con el scroll en el tope, el **scroll
  anchoring** de Chrome compensaba el asentamiento tardío del layout (el
  logo del héroe con `width="280" height="auto"` — `height="auto"` es
  inválido en HTML y no reserva alto — pasaba de 0 a 280 px al cargar, más
  el swap de la fuente Jost con `font-display: swap`) moviendo el scroll
  unos píxeles hacia abajo sin interacción del usuario
- **Solución**: reservar el espacio real de las imágenes del héroe con
  `width`/`height` numéricos (nunca `height="auto"`; el PNG es 500×500 →
  `280×280`) y `html { overflow-anchor: none }` para que el navegador jamás
  ajuste el scroll por reflujos tardíos — el desplazamiento es siempre del
  usuario
- **Detección**: recargar con el scroll en 0 y vigilar `window.scrollY`:
  debe permanecer en 0 mientras carga la imagen y la fuente

## F020: `hidden` no ocultaba un icono del sprite (display empatado)
- **Estado**: mitigada (2026-10-16)
- **Error**: `.rd-ico` (icons.css) fija `display:inline-block` para poder
  dimensionar el sprite. La utilidad `hidden` de Tailwind tiene la MISMA
  especificidad (0,1,0) y, según el orden de hojas, `.rd-ico` ganaba: el
  ícono "ojo cerrado" del login se veía junto al abierto.
- **Solución**: regla explícita `.rd-ico.hidden { display:none }` en
  `icons.css` (especificidad mayor) — `class="hidden"` sobre `<Icon>` es
  confiable siempre, sin `!important` en los consumidores.
- **Detección**: cualquier `Icon` con clase `hidden` que siga visible; o al
  añadir utilidades de display (`inline-flex`, `block`) a un `.rd-ico`.

## F021: `@keyframes` local sombrea el canónico y desplaza el layout entero
- **Estado**: mitigada (2026-10-17)
- **Error**: `GrandLogo.astro` conservaba un `<style>` legacy (scoped) que
  redefinía `@keyframes fadeIn` con `transform: translateY(10px)`. Astro
  inyecta el CSS scoped DESPUÉS de las hojas globales en el `<head>`: con dos
  `@keyframes` homónimos, la última definición gana en la cascada, así que
  `html { animation: fadeIn 1.5s }` (Layout, pensado solo opacidad) pasó a
  animar `translateY(10px→0)` y **toda la página** subía 10 px al entrar;
  los `.animate-fade-in-1` del héroe también (el selector scoped
  `.animate-fade-in-1[cid]` gana por especificidad al global).
- **Solución**: eliminar el `<style>` legacy del componente; el fundido
  canónico vive SOLO en `material.css` (`.animate-fade-in-1`/`.rd-enter`,
  opacidad pura) y el escalonado va por `animation-delay` inline. Regla:
  un componente NUNCA redefine un `@keyframes` global homónimo — si necesita
  variante, nombre propio o token en `material.css`.
- **Detección**: en el CSS servido, buscar `@keyframes <nombre>` duplicados
  (`grep -o "@keyframes [a-zA-Z]*" dist/**/*.css`) y que el HTML no tenga
  `<style>` scoped redefiniendo animaciones del contrato; comparar
  `window.scrollY`/posiciones antes y después de la animación de entrada.

## F022: Markup de chat del SV persistido como texto crudo (nombre de banda)
- **Estado**: mitigada (2026-10-17)
- **Error**: el addon guarda `bands[].name` como enlace del juego
  (`|cffffff00|Hachievement:4608:…|h[ICC25N]|h|r`). El parser solo hacía
  `.trim()`: la DB guardaba el markup crudo y el slug del RPC
  `raiddominion_upsert_bands` (`regexp_replace(name,'[^a-zA-Z0-9]+','-','g')`)
  quedaba basura tipo `sinregistro-cffffff00-hachievement-4608-…-h-icc25n-h-r`.
- **Solución**: `src/lib/wowLink.ts` (parseo puro) + `toCleanStr` en el parser
  (ningún campo visible conserva markup) + `Band.nameLink` en memoria para el
  tooltip del widget de Wowhead en el preview + migración de limpieza
  `20261017_bands_name_wow_markup_cleanup.sql` para las filas ya guardadas
  (sin ella, el re-upload con nombre limpio duplica la banda sucia porque la
  idempotencia es por nombre).
- **Detección**: `SELECT id, name, slug FROM raiddominion_bands WHERE
  name ~ '\|c[0-9a-fA-F]{8}|\|H';` — cualquier fila con markup o slug con
  `hachievement` es un caso de esta falla.

## F023: Iconos de clase de 18px renderizados a 96px (avatares borrosos)
- **Estado**: mitigada (2026-10-17)
- **Error**: los avatares de las fichas de personaje/jugador se veían
  borrosos. Los assets `public/images/classes/class-*.jpg` son JPG de
  **18×18** (Pícaro 36×36) y el avatar los mostraba a `w-24 h-24` (96px):
  ampliación de 5.3× (el "arte" es una mancha).
- **Solución**: el héroe usa el medallón del sprite (`personaje`, arte nativo
  de 96px, nítido hasta 80px) con halo del color de clase
  (`--rd-hero-tint`); la clase va como miniatura de 20px en su chip. Si algún
  día se consiguen iconos de clase de 64px+, se puede reevaluar el avatar
  grande.
- **Detección**: comparar `file public/images/classes/*` (18×18) contra el
  tamaño renderizado de `#pv-avatar`/`#avatar` (96px+) en las fichas.

## F024: Archivos huérfanos del sandbox se cuelan al `dist/` local
- **Estado**: mitigada (2026-10-17)
- **Error**: `scripts/verifica.sh` sincroniza con `rsync --files-from` (lista
  de `git ls-files`): borrar un archivo del worktree (p. ej. una imagen de
  `public/images/`) no lo elimina de `~/rd-build/public/` porque `--delete`
  con `--files-from` no purga hermanos fuera de la lista. `astro build` copia
  ese `public/` completo → el `dist/` local resucita fondos muertos (p. ej.
  `bandsBg.jpg`) y el sync final los trae de vuelta al worktree. Además, si la
  eliminación no está staged, rsync falla con
  `link_stat "...": No such file or directory` porque `git ls-files` sigue
  devolviendo la ruta borrada.
- **Solución**: stagear la eliminación (`git add`/`git rm`) y limpiar a mano
  los huérfanos de `~/rd-build/public/` antes de re-verificar:
  `rm ~/rd-build/public/images/<archivo>`. No afecta al deploy de Netlify
  (build limpio desde el repo).
- **Detección**: `ls dist/images/` muestra archivos que no existen en
  `public/images/`.
