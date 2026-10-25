// Catálogo de capturas del addon para los embeds de Discord (mercadeo).
//
// Cada captura tiene uno o más ejes temáticos (bandas/hermandades/jugadores/
// general). El motor de mercadeo elige la captura más acorde al eje del
// mensaje y la rota "balanceadamente" (la menos usada recientemente primero)
// gracias a la tabla raiddominion_marketing_images + RPC
// raiddominion_marketing_pick_image (migraciones 20260925_marketing_images.sql
// y 20261025_marketing_images_addon_pngs.sql).
// Si el RPC no está disponible (migración pendiente o fallo de red), se usa
// una rotación determinista por ventana horaria como fallback.
//
// Archivos: public/images/addon/*.jpg y *.png — sirve el portal estático.
const IMAGES_DIR = '/images/addon';

export interface AddonImage {
  key: string;
  file: string;
  label: string;
  ejes: ('bandas' | 'hermandades' | 'jugadores' | 'general')[];
}

export const ADDON_IMAGES: AddonImage[] = [
  { key: 'menu-flotante', file: 'MenuFlotante.jpg', label: 'Menú flotante del addon', ejes: ['general'] },
  {
    key: 'configuracion-bandas',
    file: 'ConfiguracionBandas.jpg',
    label: 'Configuración de bandas',
    ejes: ['bandas'],
  },
  {
    key: 'configuracion-reglas',
    file: 'ConfiguracionReglas.jpg',
    label: 'Reglas de banda/hermandad',
    ejes: ['bandas', 'hermandades'],
  },
  { key: 'editar-elemento', file: 'EditarElemento.jpg', label: 'Editor de mecánicas y reglas', ejes: ['bandas'] },
  { key: 'editar-jugador', file: 'EditarJugador.jpg', label: 'Roster y gestor de jugador', ejes: ['bandas', 'jugadores'] },
  { key: 'gestor-botin', file: 'GestorBotin.jpg', label: 'Gestor de botín', ejes: ['bandas', 'jugadores'] },
  { key: 'lista-jugadores-banda', file: 'ListaJugadoresBanda.jpg', label: 'Lista de jugadores de la banda', ejes: ['bandas', 'jugadores'] },
  { key: 'sanciones', file: 'Sanciones.jpg', label: 'Sancionados', ejes: ['bandas'] },
  { key: 'selector-icono', file: 'SelectorIcono.jpg', label: 'Selector de icono', ejes: ['general'] },
  { key: 'spammer-bandas', file: 'SpammerBandas.jpg', label: 'Spammer de banda', ejes: ['bandas', 'hermandades'] },
  {
    key: 'spammer-reglas',
    file: 'SpammerReglas.jpg',
    label: 'Spammer de reglas',
    ejes: ['bandas', 'hermandades'],
  },
  // Capturas reubicadas desde public/gallery (2026-10-25). Se suman a la
  // rotación con los mismos ejes que usa el motor de mercadeo.
  {
    key: 'menu-habilidades-roles',
    file: 'MenuHabilidadesRoles.png',
    label: 'Menú de habilidades y roles',
    ejes: ['general', 'jugadores'],
  },
  {
    key: 'menu-reglas-mecanicas',
    file: 'MenuReglasMecanicas.png',
    label: 'Menú de reglas y mecánicas',
    ejes: ['general', 'bandas', 'hermandades', 'jugadores'],
  },
  {
    key: 'roster-roles-banda',
    file: 'RosterRolesBanda.png',
    label: 'Roster de roles de banda',
    ejes: ['bandas', 'jugadores'],
  },
  {
    key: 'buffs-banda',
    file: 'BuffsBanda.png',
    label: 'Buffs de banda',
    ejes: ['bandas', 'jugadores'],
  },
  {
    key: 'habilidades-utilidad',
    file: 'HabilidadesUtilidad.png',
    label: 'Habilidades de utilidad',
    ejes: ['bandas', 'jugadores'],
  },
  {
    key: 'habilidades-duales',
    file: 'HabilidadesDuales.png',
    label: 'Habilidades duales',
    ejes: ['bandas', 'jugadores'],
  },
];

export function addonImageUrl(siteUrl: string, file: string): string {
  return `${siteUrl}${IMAGES_DIR}/${encodeURIComponent(file)}`;
}

// Selecciona la captura para el eje dado. Ideal: RPC balanceado (menos usada
// primero, priorizando capturas cuyo eje coincide). Fallback: determinista por
// ventana horaria para no repetir la misma captura seguidas.
export async function pickAddonImage(siteUrl: string, eje: string): Promise<AddonImage> {
  try {
    const { rpc } = await import('./supabase');
    const picked = await rpc<{ key: string } | null>('raiddominion_marketing_pick_image', { p_eje: eje });
    const found = picked?.key ? ADDON_IMAGES.find((img) => img.key === picked.key) : undefined;
    if (found) return found;
  } catch (err) {
    console.warn('marketing: no se pudo rotar captura por RPC (fallback determinista):', err);
  }

  // Fallback determinista: entre las capturas del eje (o general si no hay),
  // elige la que toque según la ventana horaria para evitar repeticiones.
  const ejePool = ADDON_IMAGES.filter((img) => img.ejes.includes(eje as AddonImage['ejes'][number]));
  const pool = ejePool.length > 0 ? ejePool : ADDON_IMAGES.filter((img) => img.ejes.includes('general'));
  const finalPool = pool.length > 0 ? pool : ADDON_IMAGES;
  const hourIndex = Math.floor(Date.now() / 3_600_000);
  return finalPool[hourIndex % finalPool.length];
}