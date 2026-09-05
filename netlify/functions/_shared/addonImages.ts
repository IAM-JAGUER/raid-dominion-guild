// Catálogo de capturas del addon para los embeds de Discord (mercadeo).
//
// Cada captura tiene uno o más ejes temáticos (bandas/hermandades/jugadores/
// general). El motor de mercadeo elige la captura más acorde al eje del
// mensaje y la rota "balanceadamente" (la menos usada recientemente primero)
// gracias a la tabla raiddominion_marketing_images + RPC
// raiddominion_marketing_pick_image (ver migración 20260925_marketing_images.sql).
// Si el RPC no está disponible (migración pendiente o fallo de red), se usa
// una rotación determinista por ventana horaria como fallback.
//
// Archivos: public/images/addon/*.jpg — sirve el portal estático.
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