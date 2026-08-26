// Contrato ÚNICO de pestañas del dashboard y sus enlaces públicos.
//
// Fuente de verdad para los tabs de /dashboard: la importan dashboard.astro
// (para activar paneles) y Navigation.astro (para enlazar desde la nav).
// Cambiar un tab = tocar UNA sola constante aquí; nunca editar ids, labels o
// hashes sueltos en las páginas (causa divergencias silenciosas entre sesiones).

export interface DashboardTabDef {
  readonly id: string;
  readonly label: string;
  readonly hash: string;
  readonly href: string;
}

export const DASHBOARD_TABS = [
  { id: 'addon', label: 'Registro', hash: '#addon', href: '/dashboard#addon' },
  { id: 'bandas', label: 'Bandas', hash: '#bandas', href: '/dashboard#bandas' },
  { id: 'hermandad', label: 'Hermandad', hash: '#hermandad', href: '/dashboard#hermandad' },
  { id: 'perfil', label: 'Perfil', hash: '#perfil', href: '/dashboard#perfil' },
] as const satisfies readonly DashboardTabDef[];

export const PANELS = DASHBOARD_TABS.map((t) => t.id) as readonly string[];
export type PanelName = (typeof PANELS)[number];

export const TAB_LABELS: Record<PanelName, string> = Object.fromEntries(
  DASHBOARD_TABS.map((t) => [t.id, t.label]),
) as Record<PanelName, string>;

export const TAB_HASH: Record<PanelName, string> = Object.fromEntries(
  DASHBOARD_TABS.map((t) => [t.id, t.hash]),
) as Record<PanelName, string>;

export const TAB_HREF: Record<PanelName, string> = Object.fromEntries(
  DASHBOARD_TABS.map((t) => [t.id, t.href]),
) as Record<PanelName, string>;

// Convierte un hash de URL (#bandas, /dashboard#bandas) en un panel válido o null.
export function panelFromHash(hash: string): PanelName | null {
  const clean = hash.replace(/^#\/?/, '');
  return (PANELS as readonly string[]).includes(clean) ? (clean as PanelName) : null;
}