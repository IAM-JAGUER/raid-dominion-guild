// Constructor XML del sitemap. Separado de la función para poder probarlo con
// datos simulados y para que el handler solo se ocupe de consultar PostgREST.

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function validLastmod(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Normaliza el nombre de un reino igual que src/lib/routes.ts (slugify).
// La duplicación es deliberada: las Netlify Functions no comparten el alias
// `@/` del cliente.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildSitemap(urls: SitemapUrl[]): string {
  const seen = new Map<string, SitemapUrl>();
  for (const item of urls) {
    const loc = item.loc.trim();
    if (!loc || seen.has(loc)) continue;
    seen.set(loc, { loc, lastmod: validLastmod(item.lastmod) });
  }

  const body = Array.from(seen.values())
    .map((item) => {
      const lastmod = item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeXml(item.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const STATIC_PATHS = [
  '/',
  '/upload',
  '/hermandades',
  '/bandas',
  '/personajes',
  '/jugadores',
  '/servidores',
] as const;
