// Contrato ÚNICO de pestañas del portal.
//
// Este módulo es la ÚNICA fuente de ids/labels/hashes/hrefs de las pestañas del
// dashboard (usuario) y de los paneles en cliente del admin (routing por hash).
// Cualquier pantalla con pestañas (dashboard, admin) importa de aquí en vez de
// hardcodear strings; así las pestañas nunca divergen.
//
// Tab = { id (data-tab / hash), label, href }.

export interface TabDef {
  // id corto: se usa en data-tab, hash (#tab-id) y como sufijo de los ids
  // de los botones (tab-<id>) y paneles (panel-<id>).
  id: string;
  label: string;
  // Enlace directo del tab (dashboard → /dashboard#<id>).
  href: string;
}

// Pestañas del dashboard de usuario (orden de la barra superior).
// CONTRATO APROBADO: Personajes · Bandas · Hermandad · Registro. La
// configuración NO es una pestaña: se abre desde su ícono de engranaje.
export const DASHBOARD_TABS: TabDef[] = [
  { id: 'personajes', label: 'Personajes', href: '/dashboard#personajes' },
  { id: 'bandas', label: 'Bandas', href: '/dashboard#bandas' },
  { id: 'hermandad', label: 'Hermandad', href: '/dashboard#hermandad' },
  { id: 'registro', label: 'Registro', href: '/dashboard#registro' },
];

// Panel oculto de configuración del dashboard (seguridad y zona de peligro):
// se abre con el ícono de engranaje del encabezado; NO es una pestaña de la
// barra. El hash #cuenta abre este panel (deep-link histórico #perfil se
// redirige a #cuenta en dashboard.astro).
export const DASHBOARD_CONFIG = {
  id: 'cuenta',
  label: 'Configuración',
  hash: '#cuenta',
} as const;

// Pestañas del portal público de hermandad (/hermandad/:slug): Miembros · Bandas ·
// Reglas. Se navegan por hash (#miembros/#bandas/#reglas). Los paneles vacíos
// se mantienen visibles con placeholder (contrato: barra fija de 3 pestañas).
export const PORTAL_TABS: TabDef[] = [
  { id: 'miembros', label: 'Miembros', href: '#miembros' },
  { id: 'bandas', label: 'Bandas', href: '#bandas' },
  { id: 'reglas', label: 'Reglas', href: '#reglas' },
];

// Pestañas de la vista pública de banda (/banda/:slug): Core · Reglas.
export const BAND_TABS: TabDef[] = [
  { id: 'core', label: 'Core', href: '#core' },
  { id: 'reglas', label: 'Reglas', href: '#reglas' },
];

// Pestañas del perfil público de jugador (/jugador/:slug): Personajes · Bandas ·
// Hermandades. Los paneles sin datos no generan pestaña (initAvailableTabs).
export const JUGADOR_TABS: TabDef[] = [
  { id: 'personajes', label: 'Personajes', href: '#personajes' },
  { id: 'bandas', label: 'Bandas', href: '#bandas' },
  { id: 'hermandades', label: 'Hermandades', href: '#hermandades' },
];

// Pestañas de la ficha pública de personaje (/personaje/:slug): Equipamiento ·
// Bandas · Hermandad. Los paneles sin datos no generan pestaña.
export const PERSONAJE_TABS: TabDef[] = [
  { id: 'equipamiento', label: 'Equipamiento', href: '#equipamiento' },
  { id: 'bandas', label: 'Bandas', href: '#bandas' },
  { id: 'hermandad', label: 'Hermandad', href: '#hermandad' },
];

// Pestañas del reino anidado (/servidor/:server/reino/:realm): Hermandades ·
// Personajes · Bandas. Bandas solo si hay bandas públicas del reino.
export const REINO_TABS: TabDef[] = [
  { id: 'hermandades', label: 'Hermandades', href: '#hermandades' },
  { id: 'personajes', label: 'Personajes', href: '#personajes' },
  { id: 'bandas', label: 'Bandas', href: '#bandas' },
];

// Pestañas/paneles del admin. El listado es la raíz (#lista); cada usuario
// abre un detalle por hash #usuario/<id> (coherente con el patrón de tabs).
export const ADMIN_PANELS = {
  LIST: 'lista',
  USER: 'usuario', // seguido de /<id>
} as const;

// Pestañas de sección del admin (barra superior): Usuarios · Discord. El
// detalle de usuario (#usuario/<id>) es una vista aparte que sustituye a
// "Usuarios" mientras está abierta. admin.astro construye la barra desde aquí
// (nunca hardcodear labels/ids en la página).
export const ADMIN_TABS: TabDef[] = [
  { id: ADMIN_PANELS.LIST, label: 'Usuarios', href: '#lista' },
  { id: 'discord', label: 'Discord', href: '#discord' },
];

// Convierte un id de tab a su hash (#<id>).
export function tabHash(id: string): string {
  return `#${id}`;
}

// Lee el id de tab activo desde location.hash (sin el '#', '' si vacío).
export function tabFromHash(hash: string): string {
  return (hash ?? '').replace(/^#/, '');
}

// Resuelve el id de tab correspondiente a un hash de admin.
// - '#lista' → { kind: 'list' }
// - '#usuario/<id>' → { kind: 'user', id }
// - cualquier otro → { kind: 'list' } (default)
export function resolveAdminHash(hash: string): { kind: 'list' } | { kind: 'user'; id: string } {
  const clean = (hash ?? '').replace(/^#/, '');
  const [head, ...rest] = clean.split('/');
  if (head === ADMIN_PANELS.USER && rest.length > 0) {
    return { kind: 'user', id: rest.join('/') };
  }
  return { kind: 'list' };
}

// ── Barra de pestañas reutilizable (portal, banda, …) ───────────────────────
// Construye la barra y los paneles `panel-<id>` desde un contrato TabDef, con
// deep-link por hash y navegación ARIA (flechas/Home/End). Es el mismo patrón
// visual que la barra del dashboard (tab-btn + rounded-t-lg).

export interface TabBarConfig {
  tabs: TabDef[];
  barId: string;
  defaultId: string;
}

export function createTabBar(config: TabBarConfig): { activate: (id: string, updateHash?: boolean) => void } {
  const bar = document.getElementById(config.barId) as HTMLElement | null;
  if (!bar) return { activate: () => undefined };

  const tabBtnCls =
    'tab-btn shrink-0 whitespace-nowrap px-2 sm:px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 rounded-t-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';

  const buttons: HTMLButtonElement[] = config.tabs.map((t) => {
    const btn = document.createElement('button');
    btn.id = `tab-${t.id}`;
    btn.dataset.tab = t.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${t.id}`);
    btn.className = tabBtnCls;
    btn.textContent = t.label;
    bar.appendChild(btn);
    return btn;
  });

  const activate = (name: string, updateHash = true): void => {
    const valid = config.tabs.some((t) => t.id === name);
    const target = valid ? name : config.defaultId;
    buttons.forEach((b) => {
      const active = b.dataset.tab === target;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      // Tabs limpios: sin fondo ni caja; solo el borde inferior activo.
      b.classList.toggle('border-amber-400', active);
      b.classList.toggle('text-amber-200', active);
      b.classList.toggle('border-transparent', !active);
      b.classList.toggle('text-gray-500', !active);
    });
    config.tabs.forEach((t) => {
      document.getElementById(`panel-${t.id}`)?.classList.toggle('hidden', t.id !== target);
    });
    if (updateHash) {
      const targetHash = `#${target}`;
      if (window.location.hash !== targetHash) {
        // replaceState evita saltar y no ensucia el historial con cada click
        window.history.replaceState(null, '', targetHash);
      }
    }
  };

  buttons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.tab ?? config.defaultId)));

  const syncFromHash = (): void => {
    const id = tabFromHash(window.location.hash);
    activate(id, false);
  };
  window.addEventListener('hashchange', syncFromHash);
  bar.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const idx = buttons.indexOf(ev.target as HTMLButtonElement);
    if (idx === -1) return;
    let next: number | null = null;
    if (ev.key === 'ArrowRight') next = (idx + 1) % buttons.length;
    else if (ev.key === 'ArrowLeft') next = (idx - 1 + buttons.length) % buttons.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = buttons.length - 1;
    if (next === null) return;
    ev.preventDefault();
    const target = buttons[next];
    target.focus();
    activate(target.dataset.tab ?? config.defaultId);
  });
  syncFromHash();

  return { activate };
}

// Barra de pestañas para vistas públicas (jugador/personaje/reino): construye
// la barra SOLO con los paneles disponibles (los que tienen contenido). Si
// queda un único panel, se muestra directamente sin barra; si hay 2+, se
// delega en createTabBar (deep-link por hash + ARIA). Los paneles arrancan
// `hidden` y `available` decide cuáles entran al contrato.
export function initAvailableTabs(config: {
  barId: string;
  tabs: TabDef[];
  available: string[];
}): void {
  const shown = config.tabs.filter((t) => config.available.includes(t.id));
  if (shown.length === 0) return;
  if (shown.length === 1) {
    document.getElementById(`panel-${shown[0].id}`)?.classList.remove('hidden');
    return;
  }
  const bar = document.getElementById(config.barId) as HTMLElement | null;
  bar?.classList.remove('hidden');
  createTabBar({ barId: config.barId, tabs: shown, defaultId: shown[0].id });
}