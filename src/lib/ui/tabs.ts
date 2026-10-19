// Contrato ÚNICO de pestañas del portal.
//
// Este módulo es la ÚNICA fuente de ids/labels/hashes/hrefs de las pestañas del
// dashboard (usuario) y de los paneles en cliente del admin (routing por hash).
// Cualquier pantalla con pestañas (dashboard, admin) importa de aquí en vez de
// hardcodear strings; así las pestañas nunca divergen.
//
// Tab = { id (data-tab / hash), label, href, icon? }.

import { iconEl, type IconName } from '@/lib/ui/icons';

export interface TabDef {
  // id corto: se usa en data-tab, hash (#tab-id) y como sufijo de los ids
  // de los botones (tab-<id>) y paneles (panel-<id>).
  id: string;
  label: string;
  // Enlace directo del tab (dashboard → /dashboard#<id>).
  href: string;
  // Icono temático de la pestaña (OBLIGATORIO: toda tab de navegación lleva
  // icono; contrato único src/lib/ui/icons.ts).
  icon: IconName;
}

// Pestañas del dashboard de usuario (orden de la barra superior).
// CONTRATO APROBADO: Personajes · Bandas · Hermandad · Registro. La
// configuración NO es una pestaña: se abre desde su ícono de engranaje.
export const DASHBOARD_TABS: TabDef[] = [
  { id: 'personajes', label: 'Personajes', href: '/dashboard#personajes', icon: 'personaje' },
  { id: 'bandas', label: 'Bandas', href: '/dashboard#bandas', icon: 'espadas' },
  { id: 'hermandad', label: 'Hermandad', href: '/dashboard#hermandad', icon: 'hermandad' },
  { id: 'registro', label: 'Registro', href: '/dashboard#registro', icon: 'bandeja' },
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
  { id: 'miembros', label: 'Miembros', href: '#miembros', icon: 'jugadores' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
  { id: 'reglas', label: 'Reglas', href: '#reglas', icon: 'pergamino' },
];

// Pestañas de la vista pública de banda (/banda/:slug): Core · Reglas.
export const BAND_TABS: TabDef[] = [
  { id: 'core', label: 'Core', href: '#core', icon: 'jugadores' },
  { id: 'reglas', label: 'Reglas', href: '#reglas', icon: 'pergamino' },
];

// Pestañas del perfil público de jugador (/jugador/:slug): Personajes · Bandas ·
// Hermandades. Los paneles sin datos no generan pestaña (initAvailableTabs).
export const JUGADOR_TABS: TabDef[] = [
  { id: 'personajes', label: 'Personajes', href: '#personajes', icon: 'personaje' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
  { id: 'hermandades', label: 'Hermandades', href: '#hermandades', icon: 'hermandad' },
];

// Pestañas de la ficha pública de personaje (/personaje/:slug): Equipamiento ·
// Metas · Notas · Instancias · Bandas · Hermandad. Los paneles sin datos no
// generan pestaña.
// Orden (2026-10-15, alineado al editor "Jugador" del addon): "Metas" va
// segunda porque es el dato que el personaje publica para que la comunidad sepa
// qué busca (registry[*].objectives); "Notas" (su nota pública opcional) y
// "Instancias" (snapshot de lockouts) son los datos nuevos del addon 3.1.0.
export const PERSONAJE_TABS: TabDef[] = [
  { id: 'equipamiento', label: 'Equipamiento', href: '#equipamiento', icon: 'arma' },
  { id: 'metas', label: 'Metas', href: '#metas', icon: 'estrella' },
  { id: 'notas', label: 'Notas', href: '#notas', icon: 'nota' },
  { id: 'instancias', label: 'Instancias', href: '#instancias', icon: 'ciudadela' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
  { id: 'hermandad', label: 'Hermandad', href: '#hermandad', icon: 'hermandad' },
];

// Pestañas del reino anidado (/servidor/:server/reino/:realm): Hermandades ·
// Personajes · Bandas. Bandas solo si hay bandas públicas del reino.
export const REINO_TABS: TabDef[] = [
  { id: 'hermandades', label: 'Hermandades', href: '#hermandades', icon: 'hermandad' },
  { id: 'personajes', label: 'Personajes', href: '#personajes', icon: 'personaje' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
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
  { id: ADMIN_PANELS.LIST, label: 'Usuarios', href: '#lista', icon: 'perfil' },
  { id: 'discord', label: 'Discord', href: '#discord', icon: 'discord' },
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
    'tab-btn shrink-0 whitespace-nowrap px-2 sm:px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 rounded-t-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

  const buttons: HTMLButtonElement[] = config.tabs.map((t) => {
    const btn = document.createElement('button');
    btn.id = `tab-${t.id}`;
    btn.dataset.tab = t.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${t.id}`);
    btn.className = tabBtnCls;
    // Icono temático decorativo + label (el nombre accesible es el texto).
    // Tamaño de densidad `md` (20px): las pestañas marcan jerarquía con el
    // arte, no con viñetas diminutas (design.md §10/§12).
    if (t.icon) {
      btn.classList.add('inline-flex', 'items-center', 'gap-1.5');
      btn.appendChild(iconEl(t.icon, { size: 'md' }));
    }
    btn.appendChild(document.createTextNode(t.label));
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
      b.classList.toggle('border-brand-400', active);
      b.classList.toggle('text-brand-200', active);
      b.classList.toggle('border-transparent', !active);
      b.classList.toggle('text-gray-400', !active);
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
  // Separador izquierdo de respaldo: se muestra cuando la barra queda oculta
  // (0/1 paneles). Con 2+ paneles la hairline interna de `rd-tabbar` ya hace
  // de separador izquierdo y este divisor se oculta.
  leftSepId?: string;
}): void {
  const shown = config.tabs.filter((t) => config.available.includes(t.id));
  const leftSep = config.leftSepId ? document.getElementById(config.leftSepId) : null;
  const hasBar = shown.length > 1;
  leftSep?.classList.toggle('hidden', hasBar);
  if (shown.length === 0) return;
  if (shown.length === 1) {
    document.getElementById(`panel-${shown[0].id}`)?.classList.remove('hidden');
    return;
  }
  const bar = document.getElementById(config.barId) as HTMLElement | null;
  bar?.classList.remove('hidden');
  createTabBar({ barId: config.barId, tabs: shown, defaultId: shown[0].id });
}