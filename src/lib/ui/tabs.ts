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
// Metas · Notas · Bandas · Hermandad. Los paneles sin datos no generan pestaña.
// Orden (2026-10-15, alineado al editor "Jugador" del addon): "Metas" va
// segunda porque es el dato que el personaje publica para que la comunidad sepa
// qué busca (registry[*].objectives); "Notas" es la nota pública opcional.
// "Instancias" NO se publica: el snapshot de lockouts vive solo en el tracker
// privado de personajes de la cuenta (#personajes en /dashboard).
export const PERSONAJE_TABS: TabDef[] = [
  { id: 'equipamiento', label: 'Equipamiento', href: '#equipamiento', icon: 'arma' },
  { id: 'metas', label: 'Metas', href: '#metas', icon: 'estrella' },
  { id: 'notas', label: 'Notas', href: '#notas', icon: 'nota' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
  { id: 'hermandad', label: 'Hermandad', href: '#hermandad', icon: 'hermandad' },
];

// Pestañas de la ficha del Task Tracker dentro de #personajes. Sustituyen
// temporalmente la lista del tracker (fiel al tracker local wow-rd).
export const TRACKER_FICHA_TABS: TabDef[] = [
  { id: 'detalle', label: 'Detalle', href: '#detalle', icon: 'personaje' },
  { id: 'tareas', label: 'Tareas', href: '#tareas', icon: 'validado' },
  { id: 'equipamiento', label: 'Equipamiento', href: '#equipamiento', icon: 'arma' },
  { id: 'monedas', label: 'Monedas', href: '#monedas', icon: 'cristal' },
  { id: 'metas', label: 'Metas', href: '#metas', icon: 'estrella' },
  { id: 'bandas', label: 'Bandas', href: '#bandas', icon: 'espadas' },
  { id: 'instancias', label: 'Instancias', href: '#instancias', icon: 'ciudadela' },
  { id: 'notas', label: 'Notas', href: '#notas', icon: 'nota' },
];

// Subvistas del tracker dentro de #personajes (hash anidado).
export const TRACKER_SUBVIEWS = {
  ficha: 'ficha',
  catalogo: 'catalogo',
} as const;

// Hash de la ficha del tracker por slug (o id si aún no hay slug).
export function trackerFichaHash(slugOrId: string): string {
  return `#personajes/${TRACKER_SUBVIEWS.ficha}/${encodeURIComponent(slugOrId)}`;
}

// Hash del catálogo del tracker.
export function trackerCatalogHash(): string {
  return `#personajes/${TRACKER_SUBVIEWS.catalogo}`;
}

// Primer segmento de un hash de dashboard (#personajes/ficha/x → personajes).
// Permite que las subvistas del tracker no rompan la pestaña activa.
export function dashboardTabHead(hash: string): string {
  return (tabFromHash(hash).split('/')[0] ?? '') as string;
}

// Subvista del tracker desde el hash: { view: 'ficha'|'catalogo'|'', slug }.
export function trackerHashView(hash: string): { view: '' | 'ficha' | 'catalogo'; slug: string } {
  const clean = tabFromHash(hash);
  const [head, view, ...rest] = clean.split('/');
  if (head !== 'personajes') return { view: '', slug: '' };
  if (view === TRACKER_SUBVIEWS.catalogo) return { view: 'catalogo', slug: '' };
  if (view === TRACKER_SUBVIEWS.ficha && rest.length > 0) {
    try {
      return { view: 'ficha', slug: decodeURIComponent(rest.join('/')) };
    } catch {
      return { view: '', slug: '' };
    }
  }
  return { view: '', slug: '' };
}

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
  const id = rest.join('/');
  if (head === ADMIN_PANELS.USER && id) {
    return { kind: 'user', id };
  }
  return { kind: 'list' };
}

// ── Barra de pestañas reutilizable (portal, banda, …) ───────────────────────
// Construye la barra y los paneles `panel-<id>` desde un contrato TabDef, con
// deep-link por hash y navegación ARIA (flechas/Home/End). Es el mismo patrón
// visual que la barra del dashboard (tab-btn + rounded-t-lg).

export type TabBarVariant = 'default' | 'ficha';

export type TabActivateSource = 'click' | 'keyboard' | 'hash' | 'api';

export interface TabBarConfig {
  tabs: TabDef[];
  barId: string;
  defaultId: string;
  // `ficha` dibuja el dock integrado en la placa de identidad (icono en
  // medallón, contador y acento de clase/tono); `default` conserva la barra
  // genérica de dashboard/admin.
  variant?: TabBarVariant;
  // Contadores opcionales por tab (solo se pintan en la variante ficha).
  counts?: Record<string, number | undefined>;
  // Etiquetas visibles por tab cuando el contexto cambia el nombre (p. ej.
  // Miembros → Jerarquía si el roster es privado). El id/hash no cambia.
  labels?: Record<string, string | undefined>;
  // Id del panel por tab (default `panel-${id}`).
  panelIds?: Record<string, string>;
  // Gestiona visibilidad de paneles al activar (default true). Admin lo apaga
  // porque sus vistas no siguen el patrón `panel-<id>`.
  managePanels?: boolean;
  // Paneles extra que se ocultan al activar un tab (p. ej. configuración).
  hidePanels?: string[];
  // Clases completas del botón (default según variante).
  btnCls?: string;
  // Clase del estado inactivo (default `text-gray-300`).
  inactiveCls?: string;
  // aria-controls por tab (default `panel-${id}`).
  ariaControls?: (tab: TabDef) => string;
  // Sincroniza los tabs con `location.hash` (default true).
  syncHash?: boolean;
  // Traduce un hash a id de tab; null = no corresponde a esta barra.
  resolveHash?: (hash: string) => string | null;
  // Notifica la activación (click, teclado, hash o llamada API).
  onActivate?: (id: string, source: TabActivateSource) => void;
}

export interface TabBarController {
  activate: (id: string, updateHash?: boolean, source?: TabActivateSource) => void;
  // Desmarca todos los tabs y oculta sus paneles (panel externo, p. ej. config).
  deactivate: () => void;
  // Actualiza los contadores del variant ficha tras cargas async.
  setCounts: (counts: Record<string, number | undefined>) => void;
}

export function createTabBar(config: TabBarConfig): TabBarController {
  const bar = document.getElementById(config.barId) as HTMLElement | null;
  if (!bar) {
    return {
      activate: () => undefined,
      deactivate: () => undefined,
      setCounts: () => undefined,
    };
  }

  const isDock = config.variant === 'ficha';
  const tabBtnCls = config.btnCls ?? (isDock
    ? 'rd-ficha-tab'
    : 'tab-btn shrink-0 whitespace-nowrap px-2 sm:px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest border-b-2 rounded-t-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400');
  const inactiveClasses = (config.inactiveCls ?? 'text-gray-300').split(/\s+/).filter(Boolean);
  const panelId = (tab: TabDef): string => config.panelIds?.[tab.id] ?? `panel-${tab.id}`;

  function applyCount(btn: HTMLButtonElement, label: string, count: number | undefined): void {
    if (!isDock) return;
    const existing = btn.querySelector<HTMLElement>('.rd-ficha-tab__count');
    if (typeof count !== 'number' || count <= 0) {
      existing?.remove();
      btn.removeAttribute('aria-label');
      return;
    }
    const countEl = existing ?? document.createElement('span');
    countEl.className = 'rd-ficha-tab__count';
    countEl.textContent = String(count);
    countEl.setAttribute('aria-hidden', 'true');
    if (!existing) btn.appendChild(countEl);
    btn.setAttribute('aria-label', `${label} (${count})`);
  }

  const buttons: HTMLButtonElement[] = config.tabs.map((t) => {
    const label = config.labels?.[t.id] ?? t.label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `tab-${t.id}`;
    btn.dataset.tab = t.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', config.ariaControls?.(t) ?? panelId(t));
    btn.className = tabBtnCls;
    // Icono temático decorativo + label (el nombre accesible es el texto).
    // En la ficha de personaje el arte vive en un medallón de clase; en el
    // resto se usa el icono suelto de densidad `md` (design.md §10/§12).
    if (t.icon) {
      if (isDock) {
        const iconWrap = document.createElement('span');
        iconWrap.className = 'rd-ficha-tab__icon';
        iconWrap.appendChild(iconEl(t.icon, { size: 'sm' }));
        btn.appendChild(iconWrap);
      } else {
        btn.classList.add('inline-flex', 'items-center', 'gap-1.5');
        btn.appendChild(iconEl(t.icon, { size: 'md' }));
      }
    }
    btn.appendChild(document.createTextNode(label));
    const count = config.counts?.[t.id];
    if (isDock && typeof count === 'number' && count > 0) {
      applyCount(btn, label, count);
    }
    bar.appendChild(btn);
    return btn;
  });
  // 5+ secciones: mantener scroll horizontal en móvil; con 2-4 conviene
  // envolver en dos filas para que ninguna pestaña quede oculta.
  if (isDock) bar.classList.toggle('rd-ficha-tabs--many', buttons.length > 4);

  const activate = (name: string, updateHash = true, source: TabActivateSource = 'api'): void => {
    const valid = config.tabs.some((t) => t.id === name);
    const target = valid ? name : config.defaultId;
    buttons.forEach((b) => {
      const active = b.dataset.tab === target;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      if (!isDock) {
        // Tabs limpios: sin fondo ni caja; solo el borde inferior activo.
        b.classList.toggle('border-valor-400', active);
        b.classList.toggle('text-valor-200', active);
        b.classList.toggle('border-transparent', !active);
        inactiveClasses.forEach((cls) => b.classList.toggle(cls, !active));
      }
    });
    if (config.managePanels !== false) {
      config.tabs.forEach((t) => {
        document.getElementById(panelId(t))?.classList.toggle('hidden', t.id !== target);
      });
      config.hidePanels?.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    }
    if (updateHash) {
      const targetHash = `#${target}`;
      if (window.location.hash !== targetHash) {
        // replaceState evita saltar y no ensucia el historial con cada click
        window.history.replaceState(null, '', targetHash);
      }
    }
    config.onActivate?.(target, source);
  };

  const deactivate = (): void => {
    buttons.forEach((b) => {
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
      if (!isDock) {
        b.classList.remove('border-valor-400', 'text-valor-200');
        b.classList.add('border-transparent', ...inactiveClasses);
      }
    });
    if (config.managePanels !== false) {
      config.tabs.forEach((t) => document.getElementById(panelId(t))?.classList.add('hidden'));
    }
  };

  buttons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.tab ?? config.defaultId, true, 'click')));

  const syncFromHash = (): void => {
    const id = config.resolveHash
      ? config.resolveHash(window.location.hash)
      : tabFromHash(window.location.hash);
    if (id === null) return;
    activate(id, false, 'hash');
  };
  if (config.syncHash !== false) window.addEventListener('hashchange', syncFromHash);
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
    activate(target.dataset.tab ?? config.defaultId, true, 'keyboard');
  });
  if (config.syncHash !== false) syncFromHash();

  return {
    activate,
    deactivate,
    setCounts(counts: Record<string, number | undefined>): void {
      buttons.forEach((btn) => {
        const id = btn.dataset.tab ?? '';
        const label = config.labels?.[id] ?? config.tabs.find((t) => t.id === id)?.label ?? id;
        applyCount(btn, label, counts[id]);
      });
    },
  };
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
  // Contenedor del dock integrado (ficha de personaje): se oculta si no hay
  // barra (0/1 paneles) para no dejar una banda vacía bajo la identidad.
  dockId?: string;
  variant?: TabBarVariant;
  counts?: Record<string, number | undefined>;
}): void {
  const shown = config.tabs.filter((t) => config.available.includes(t.id));
  const dock = config.dockId ? document.getElementById(config.dockId) : null;
  const hasBar = shown.length > 1;
  dock?.classList.toggle('hidden', !hasBar);
  if (shown.length === 0) return;
  if (shown.length === 1) {
    document.getElementById(`panel-${shown[0].id}`)?.classList.remove('hidden');
    return;
  }
  const bar = document.getElementById(config.barId) as HTMLElement | null;
  bar?.classList.remove('hidden');
  createTabBar({
    barId: config.barId,
    tabs: shown,
    defaultId: shown[0].id,
    variant: config.variant,
    counts: config.counts,
  });
}