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