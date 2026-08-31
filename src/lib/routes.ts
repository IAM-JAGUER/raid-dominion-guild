// Resolver central de rutas públicas del portal RaidDominion.
//
// Centraliza:
//   - RESERVED: slugs que NUNCA se interpretan como portal/hermandad en raíz.
//   - extracción del slug/segmentos desde window.location (con override por ?slug=).
//   - showNotFound(): muestra el bloque "no encontrado" de los shells de ficha.
//
// Consumido por los shells (src/pages/hermandad, personaje.astro,
// servidor.astro, banda.astro, jugador.astro) y las vistas en
// src/components/views/. Mantén RESERVED sincronizado con astro.config.mjs
// (middleware dev) y netlify.toml.

export const RESERVED = new Set([
  'upload', 'login', 'dashboard', 'admin', 'moderate', 'api',
  'assets', '_astro', 'portal', 'jugador', 'personajes', 'personaje',
  'servidor', 'servidores', 'reino', 'hermandad', 'hermandades',
  'jugadores', 'banda', 'bandas', 'guilds',
]);

// Segmentos de la ruta actual (sin vacíos ni barra final), p. ej.
// "/servidor/foo/reino/bar" → ["servidor", "foo", "reino", "bar"]
export function currentSegments(): string[] {
  return window.location.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
}

// Primer segmento normalizado a minúsculas (para decidir la vista).
export function currentSection(): string {
  const seg = currentSegments();
  return seg.length > 0 ? seg[0].toLowerCase() : '';
}

// Slug principal: el 2º segmento de la ruta, o el override por ?slug= (dev).
export function currentSlug(): string {
  const override = new URLSearchParams(window.location.search).get('slug');
  if (override) return override;
  const seg = currentSegments();
  return seg.length > 1 ? seg[1] : '';
}

// Slug de un segmento concreto (p. ej. realm en rutas de 3 segmentos).
export function segmentSlug(index: number): string {
  const seg = currentSegments();
  return seg.length > index ? seg[index] : '';
}

// Muestra el bloque de "no encontrado" del shell y oculta el cargando.
// El shell (DetailShell o los shells de ficha) define los elementos
// #loading y #not-found.
export function showNotFound(message?: string): void {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
  const nf = document.getElementById('not-found');
  if (nf) nf.classList.remove('hidden');
  if (message) {
    const msg = document.getElementById('not-found-msg');
    if (msg) msg.textContent = message;
  }
  document.title = 'No encontrado - RaidDominion';
}

// Oculta el cargando y muestra un contenedor de vista (id dado).
export function showView(viewId: string): void {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
  const view = document.getElementById(viewId);
  if (view) view.classList.remove('hidden');
}

// ¿El primer segmento es un slug reservado que no debe resolverse como vista?
export function isReserved(seg?: string): boolean {
  return RESERVED.has((seg ?? currentSection()).toLowerCase());
}

// Normaliza un nombre a slug (bandas, reinos, servidores): minúsculas,
// sin acentos, espacios→guiones, sin caracteres especiales.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
