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
// CONTRATO APROBADO: exactamente 4 pestañas — Registro · Bandas · Hermandad ·
// Perfil. NO añadir pestañas nuevas sin aprobación explícita del usuario.
export const DASHBOARD_TABS: TabDef[] = [
  { id: 'addon', label: 'Registro', href: '/dashboard#addon' },
  { id: 'bandas', label: 'Bandas', href: '/dashboard#bandas' },
  { id: 'hermandad', label: 'Hermandad', href: '/dashboard#hermandad' },
  { id: 'perfil', label: 'Perfil', href: '/dashboard#perfil' },
];

// Pestañas del portal público de hermandad (/:slug): Miembros · Bandas ·
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

// Pestañas/paneles del admin. El listado es la raíz (#lista); cada usuario
// abre un detalle por hash #usuario/<id> (coherente con el patrón de tabs).
export const ADMIN_PANELS = {
  LIST: 'lista',
  USER: 'usuario', // seguido de /<id>
} as const;

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
// deep-link por hash, navegación ARIA (flechas/Home/End) y badges de conteo.
// Es el mismo patrón visual que la barra del dashboard (tab-btn + rounded-t-lg).

export interface TabBarConfig {
  tabs: TabDef[];
  barId: string;
  defaultId: string;
  badgeCounts?: Record<string, number>;
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
    const count = config.badgeCounts?.[t.id];
    if (typeof count === 'number') {
      const badge = document.createElement('span');
      badge.className = 'ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/20 text-amber-300';
      badge.textContent = String(count);
      btn.appendChild(badge);
    }
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