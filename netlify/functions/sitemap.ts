// Sitemap dinámico del portal (GET /sitemap.xml).
//
// Incluye las rutas estáticas indexables y las entidades públicas que la RLS
// ya permite leer con la anon-key: hermandades, personajes, bandas, perfiles,
// servidores y reinos. No usa service_role ni tablas privadas.
//
// netlify.toml redirige /sitemap.xml ANTES del redirect /:slug → /hermandad/:slug;
// si se mueve, el sitemap acabaría en /hermandad/sitemap.xml.
import { selectFrom } from './_shared/supabase';
import { env } from './_shared/env';
import { buildSitemap, slugify, STATIC_PATHS, type SitemapUrl } from './_shared/sitemap';

const SITE_URL = (env('SITE_URL') || 'https://raid-dominion.netlify.app').replace(/\/+$/, '');

interface SlugRow {
  slug: string | null;
  updated_at?: string | null;
}

interface ServerRow {
  server: string | null;
  realm: string | null;
  updated_at?: string | null;
}

async function safeSelect<T>(table: string, params: string): Promise<T[]> {
  try {
    return await selectFrom<T>(table, params);
  } catch (err) {
    console.error(`[sitemap] ${table}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function pushSlug(urls: SitemapUrl[], prefix: string, rows: SlugRow[]): void {
  for (const row of rows) {
    if (!row.slug) continue;
    urls.push({ loc: absolute(`${prefix}/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at ?? undefined });
  }
}

export default async (_req: Request): Promise<Response> => {
  const urls: SitemapUrl[] = STATIC_PATHS.map((path) => ({
    loc: path === '/' ? `${SITE_URL}/` : absolute(path),
  }));

  const [guilds, characters, bands, profiles, charServers, guildServers] = await Promise.all([
    safeSelect<SlugRow>(
      'raiddominion_guilds',
      'select=slug,updated_at&is_public=eq.true&slug=not.is.null&order=updated_at.desc&limit=1000',
    ),
    safeSelect<SlugRow>(
      'raiddominion_characters',
      'select=slug,updated_at&is_public=eq.true&slug=not.is.null&order=updated_at.desc&limit=1000',
    ),
    safeSelect<SlugRow>(
      'raiddominion_bands',
      'select=slug,updated_at&is_public=eq.true&slug=not.is.null&order=updated_at.desc&limit=1000',
    ),
    safeSelect<SlugRow>(
      'raiddominion_profiles',
      'select=slug,updated_at&is_public=eq.true&slug=not.is.null&order=updated_at.desc&limit=1000',
    ),
    safeSelect<ServerRow>(
      'raiddominion_characters',
      'select=server,realm,updated_at&is_public=eq.true&server=not.is.null&limit=1000',
    ),
    safeSelect<ServerRow>(
      'raiddominion_guilds',
      'select=server,realm,updated_at&is_public=eq.true&server=not.is.null&limit=1000',
    ),
  ]);

  pushSlug(urls, '/hermandad', guilds);
  pushSlug(urls, '/personaje', characters);
  pushSlug(urls, '/banda', bands);
  pushSlug(urls, '/jugador', profiles);

  const serverLayers = new Map<string, { server: string; realm?: string; lastmod?: string }>();
  for (const row of [...charServers, ...guildServers]) {
    const server = (row.server ?? '').trim();
    if (!server) continue;
    const realm = (row.realm ?? '').trim();
    const key = `${server.toLowerCase()}|${realm.toLowerCase()}`;
    if (!serverLayers.has(key)) {
      serverLayers.set(key, { server, realm: realm || undefined, lastmod: row.updated_at ?? undefined });
    }
  }

  const seenServers = new Set<string>();
  for (const layer of serverLayers.values()) {
    if (layer.realm) {
      const realmSlug = slugify(layer.realm);
      if (realmSlug) {
        urls.push({
          loc: absolute(`/servidor/${encodeURIComponent(layer.server)}/reino/${encodeURIComponent(realmSlug)}`),
          lastmod: layer.lastmod,
        });
      }
    }
    const serverKey = layer.server.toLowerCase();
    if (!seenServers.has(serverKey)) {
      seenServers.add(serverKey);
      urls.push({
        loc: absolute(`/servidor/${encodeURIComponent(layer.server)}`),
        lastmod: layer.lastmod,
      });
    }
  }

  return new Response(buildSitemap(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
