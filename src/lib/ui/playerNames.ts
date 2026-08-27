// Resolución de nombres visibles de jugador para presentación pública.
//
// Un perfil puede dejar display_name y character_name vacíos (por decisión
// del usuario; NO se rellenan en datos). En esos casos el nombre visible se
// deriva solo para presentación: primero el personaje público más relevante
// (donde lo haya) y, si tampoco hay personajes, un handle estable único por
// cuenta derivado del slug (raiddominion_ensure_profile_slug genera
// 'perfil-<8hex>' para cuentas sin nombre).

export interface PlayerNameSource {
  display_name?: string | null;
  character_name?: string | null;
  slug?: string | null;
}

// ¿El perfil no declara ningún nombre (display_name ni character_name)?
export function isNameless(p: PlayerNameSource): boolean {
  return !(p.display_name ?? '').trim() && !(p.character_name ?? '').trim();
}

// Handle estable y único desde el slug del perfil. Los slugs de cuentas sin
// nombre nacen como 'perfil-<8hex>'; se muestra '@<hex>'. Para slugs legacy
// no 'perfil-' se usa '@<slug>' (recortado a 16). Sin slug → fallback.
export function handleFromSlug(slug?: string | null): string {
  const s = (slug ?? '').trim();
  if (!s) return '@usuario';
  const m = /^perfil-(.+)$/i.exec(s);
  return `@${(m ? m[1] : s).slice(0, 16)}`;
}

// Nombre visible efectivo: display_name → character_name → handle del slug.
// `fallbackName` permite inyectar el personaje público más relevante antes
// del handle (presentación), sin tocar los datos del perfil.
export function playerName(p: PlayerNameSource, fallbackName?: string | null): string {
  const dn = (p.display_name ?? '').trim();
  if (dn) return dn;
  const cn = (p.character_name ?? '').trim();
  if (cn) return cn;
  const fb = (fallbackName ?? '').trim();
  if (fb) return fb;
  return handleFromSlug(p.slug);
}

// Inicial para avatar.
export function playerInitial(name: string): string {
  return (name[0] || '?').toUpperCase();
}