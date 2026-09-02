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

// Personaje PRINCIPAL declarado (perfil.character_name) SOLO si es público.
// Regla de atribución de bandas/cuentas: un personaje solo se usa como nombre
// visible si está asignado como principal Y es público; si no → null y el
// nombre cae al handle @hex (nunca a un personaje secundario).
export function declaredPrincipalPublic(
  p: PlayerNameSource,
  publicNames?: Set<string>,
): string | null {
  const cn = (p.character_name ?? '').trim();
  if (!cn || !publicNames?.has(cn.toLowerCase())) return null;
  return cn;
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

// ── Nombre seguro para presentación pública ───────────────────────────────
// NUNCA expone character_name si ese personaje no es público (el usuario
// puede dejar su principal declarado apuntando a un personaje con visibilidad
// off). `publicNames` = nombres (minúsculas) de los personajes públicos de la
// cuenta; `fallbackName` = personaje público relevante (presentación).

// ¿El perfil expone algún nombre público? (display_name, character_name solo
// si es público, o un fallbackName público).
export function isNamelessSafe(
  p: PlayerNameSource,
  opts: { publicNames?: Set<string>; fallbackName?: string | null } = {},
): boolean {
  if ((p.display_name ?? '').trim()) return false;
  const cn = (p.character_name ?? '').trim();
  const names = opts.publicNames;
  if (cn && (!names || names.has(cn.toLowerCase()))) return false;
  if ((opts.fallbackName ?? '').trim()) return false;
  return true;
}

// Nombre visible seguro: display_name → character_name (solo si público) →
// fallbackName (público) → handle del slug.
export function safePlayerName(
  p: PlayerNameSource,
  opts: { publicNames?: Set<string>; fallbackName?: string | null } = {},
): string {
  const dn = (p.display_name ?? '').trim();
  if (dn) return dn;
  const cn = (p.character_name ?? '').trim();
  const names = opts.publicNames;
  if (cn && (!names || names.has(cn.toLowerCase()))) return cn;
  const fb = (opts.fallbackName ?? '').trim();
  if (fb) return fb;
  return handleFromSlug(p.slug);
}

// Inicial para avatar.
export function playerInitial(name: string): string {
  return (name[0] || '?').toUpperCase();
}