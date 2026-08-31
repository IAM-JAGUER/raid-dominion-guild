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
`btnBase`/`btnPrimary`/`btnSecondary`/`btnGhost`/`btnSizes`, `badge`/`chip`,
`kbd`, `text.*` (hero/h1-h3/body/bodyMuted/caption), `status.*`
(success/warning/error/info), `form.*` (label/input/inputError/helperText/
errorText), `loading.*` (skeleton/spinner/liveText), `focusRing`,
`transition`.

**Regla de oro:** si vas a escribir un literal de Tailwind que ya existe como
token, usa el token. Si necesitas un literal nuevo que se repetirá más de
una vez, primero agrégalo como token — no lo dupliques en 2+ componentes.

## 3. Reglas geométricas y de superficie (R1-R8)

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

## 4. Tipografía

Escala en `ui.text`: `hero` (landing hero), `h1`/`h2`/`h3` (jerarquía de
sección), `body`/`bodyMuted` (contenido y metadatos), `caption` (timestamps,
notas pequeñas). No usar tamaños Tailwind sueltos (`text-2xl`, `text-sm`)
fuera de este set salvo caso puntual documentado en el componente.

## 5. Formularios y accesibilidad

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

## 6. Loading y feedback async

Usar `ui.loading.skeleton` para placeholders de roster/bandas mientras carga,
`ui.loading.spinner` para acciones puntuales (submit, upload). Nunca dejar
una operación async sin feedback visual — ver `frallas.md` F010.

## 7. Responsive

Rango verificado: 320px–1440px sin overflow horizontal. Breakpoints:
los de Tailwind por defecto (`sm`/`md`/`lg`), sin breakpoints custom.
Tablas de dashboard → cards en `< sm`. Ver `patrones.md` P001 para el patrón
de dashboard con pestañas que ya resuelve esto en desktop.

## 8. Reglas fijas (no negociables sin discusión explícita)

- NO cambiar colores de marca (ámbar-400/600/900, fondo `#111`).
- NO eliminar clases `hidden sm:*` que controlan responsive.
- NO introducir componentes que rompan el estilo "card + borde ámbar".
- Textos de UI en español (esMX); NO hardcodear inglés.
- Prohibidos `rounded-xl/2xl/3xl` en `src/`.

## Historial de enmiendas

- **2026-08-25**: R1 (monogramas) agregada tras detectar caso de avatar con
  iniciales que violaba el criterio geométrico original.
- **2026-08-30**: R5-R8 agregadas tras auditoría que detectó ausencia total
  de tokens de formulario/estado/loading pese a ser prioridades explícitas
  de `ui-ux.md`. Ver `patrones.md` P009.
