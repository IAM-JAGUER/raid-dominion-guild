// Fuente única de SEO/AEO del portal.
//
// Centraliza la URL canónica, los metadatos por ruta, los constructores de
// JSON-LD y la actualización de <head> en las vistas que resuelven datos en
// cliente (fichas, portal de hermandad y perfil de jugador).
//
// Reglas:
// - La descripción visible y la del schema deben coincidir (FAQPage).
// - Ninguna página declara un canonical ajeno: las rutas estáticas usan
//   `absoluteUrl(path)` y los shells con rewrite lo resuelven en cliente.
// - Sin cifras, reseñas ni datos inventados.

import { APP_URLS, SOCIAL_LINKS } from '@/utils/constants';
import type { FaqItem } from '@/data/faq';

export const SITE_NAME = 'RaidDominion';
const envSite = (import.meta as unknown as { env?: { SITE?: string } }).env?.SITE;
export const SITE_URL = (envSite ?? 'https://raid-dominion.netlify.app').replace(/\/+$/, '');
export const LOCALE = 'es_CO';
export const DEFAULT_OG_IMAGE = '/og/raid-dominion.png';
export const DEFAULT_OG_IMAGE_ALT =
  'RaidDominion: addon de bandas y hermandades para World of Warcraft 3.3.5a';

export interface PageMeta {
  title: string;
  description: string;
  noindex?: boolean;
}

// Metadatos de las rutas estáticas. Los shells dinámicos usan su entrada de
// tipo de ficha como respaldo hasta que la vista resuelve los datos.
export const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'RaidDominion — Addon de bandas para WoW 3.3.5a (WotLK)',
    description:
      'Addon gratuito para WoW 3.3.5a (WotLK): organiza bandas, roles, buffs y botín. Sube tu RaidDominion.lua y publica el portal de tu hermandad.',
  },
  '/upload': {
    title: 'Sube tu SavedVariables — Portal de hermandades RaidDominion',
    description:
      'Sube tu RaidDominion.lua y convierte el roster, las bandas y las metas de tu hermandad en un portal web gratuito. Sin formularios y en segundos.',
  },
  '/hermandades': {
    title: 'Directorio de hermandades de WoW 3.3.5a — RaidDominion',
    description:
      'Explora hermandades de WoW 3.3.5a por reino y facción: roster, bandas, horarios, reglas y Discord, sincronizados desde el addon RaidDominion.',
  },
  '/bandas': {
    title: 'Bandas de raid públicas en WoW 3.3.5a — RaidDominion',
    description:
      'Descubre bandas de raid de WoW 3.3.5a por día, tipo y reino. Consulta roster, gearscore mínimo, horarios y reglas desde el portal RaidDominion.',
  },
  '/personajes': {
    title: 'Personajes públicos de WoW 3.3.5a — RaidDominion',
    description:
      'Explora personajes de WoW 3.3.5a con equipo, iLevel, metas, instancias y bandas. Datos públicos sincronizados desde el addon RaidDominion.',
  },
  '/jugadores': {
    title: 'Jugadores y perfiles públicos — RaidDominion',
    description:
      'Conoce a los jugadores de la comunidad RaidDominion: perfiles públicos con sus personajes, hermandades y bandas de WoW 3.3.5a.',
  },
  '/servidores': {
    title: 'Servidores y reinos de WoW 3.3.5a — RaidDominion',
    description:
      'Explora servidores y reinos de WoW 3.3.5a con hermandades, personajes y bandas públicas registradas en el portal RaidDominion.',
  },
  // Shells de ficha: respaldo hasta que la vista resuelve el slug.
  '/personaje': {
    title: 'Personaje — RaidDominion',
    description:
      'Ficha pública de personaje de World of Warcraft 3.3.5a: equipo, iLevel, metas, instancias y bandas registradas con RaidDominion.',
  },
  '/banda': {
    title: 'Banda — RaidDominion',
    description:
      'Ficha pública de banda de raid de WoW 3.3.5a: horario, gearscore mínimo, roster y reglas sincronizados desde el addon RaidDominion.',
  },
  '/servidor': {
    title: 'Servidor — RaidDominion',
    description:
      'Ficha de servidor y reinos de WoW 3.3.5a con hermandades, personajes y bandas públicas de la comunidad RaidDominion.',
  },
  '/jugador': {
    title: 'Jugador — RaidDominion',
    description:
      'Perfil público de jugador de RaidDominion: personajes, hermandades y bandas visibles de World of Warcraft 3.3.5a.',
  },
  '/hermandad': {
    title: 'Hermandad — RaidDominion',
    description:
      'Portal público de hermandad de WoW 3.3.5a: roster, bandas, horarios, reglas y Discord sincronizados desde el addon RaidDominion.',
  },
  '/login': {
    title: 'Iniciar sesión — RaidDominion',
    description:
      'Inicia sesión o crea tu cuenta en RaidDominion para validar personajes y publicar el portal de tu hermandad.',
    noindex: true,
  },
  '/dashboard': {
    title: 'Mi dashboard — RaidDominion',
    description:
      'Gestiona tus personajes, bandas, hermandad y visibilidad pública en el portal RaidDominion.',
    noindex: true,
  },
  '/admin': {
    title: 'Administración — RaidDominion',
    description: 'Panel privado de administración de usuarios y roles de RaidDominion.',
    noindex: true,
  },
  '/moderate': {
    title: 'Moderación — RaidDominion',
    description: 'Panel privado de moderación de hermandades y portales de RaidDominion.',
    noindex: true,
  },
  '/404': {
    title: 'Página no encontrada — RaidDominion',
    description:
      'La ruta que buscas no existe, es privada o cambió de enlace. Vuelve al portal o explora los directorios de RaidDominion.',
    noindex: true,
  },
};

export function normalizeRoute(path: string): string {
  const clean = (path || '/').split('#')[0].split('?')[0];
  if (!clean || clean === '/') return '/';
  return `/${clean.replace(/^\/+|\/+$/g, '')}`;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function metaFor(path: string, overrides: Partial<PageMeta> = {}): PageMeta {
  const key = normalizeRoute(path);
  const base = PAGE_META[key] ?? PAGE_META['/'];
  return { ...base, ...overrides };
}

export function robotsContent(noindex = false): string {
  return noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';
}

function jsonPlatformOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return SITE_URL;
}

// ── JSON-LD ─────────────────────────────────────────────────────────────

export type JsonLdNode = Record<string, unknown>;

export function jsonLdGraph(...nodes: JsonLdNode[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter(Boolean),
  };
}

export function organizationSchema(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/logo.png'),
    description:
      'Addon y portal comunitario para organizar bandas, hermandades y rosters de World of Warcraft 3.3.5a (WotLK).',
    sameAs: [SOCIAL_LINKS.discord.url, SOCIAL_LINKS.youtube.url, SOCIAL_LINKS.github.url],
  };
}

export function websiteSchema(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description:
      'Portal comunitario de RaidDominion: addon, guías, directorios de hermandades, bandas, personajes, jugadores y servidores de WoW 3.3.5a.',
    inLanguage: LOCALE,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function softwareApplicationSchema(features: string[] = []): JsonLdNode {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#addon`,
    name: 'RaidDominion',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Windows',
    url: SITE_URL,
    downloadUrl: APP_URLS.DOWNLOAD,
    description:
      'Addon gratuito para World of Warcraft 3.3.5a (WotLK) que ayuda a organizar bandas, roles, buffs, botín y hermandades.',
    inLanguage: LOCALE,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: features,
    screenshot: absoluteUrl('/images/addon/ListaJugadoresBanda.jpg'),
  };
}

export function faqSchema(items: FaqItem[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export interface HowToStep {
  name: string;
  text: string;
}

export function howToSchema(name: string, description: string, steps: HowToStep[]): JsonLdNode {
  return {
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function collectionPageSchema(name: string, description: string, path: string): JsonLdNode {
  return {
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl(path)}#collection`,
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: LOCALE,
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function webPageSchema(name: string, description: string, path: string): JsonLdNode {
  return {
    '@type': 'WebPage',
    '@id': `${absoluteUrl(path)}#webpage`,
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: LOCALE,
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function profilePageSchema(name: string, description: string, path: string): JsonLdNode {
  return {
    '@type': 'ProfilePage',
    '@id': `${absoluteUrl(path)}#profile`,
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: LOCALE,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'Person',
      name,
    },
  };
}

// ── Actualización de <head> en cliente ──────────────────────────────────

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(url: string, auto: boolean): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  if (auto) el.setAttribute('data-rd-auto-canonical', '');
  el.setAttribute('href', url);
}

function upsertJsonLd(id: string, data: JsonLdNode | null): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }
  const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  if (!existing) document.head.appendChild(script);
}

export interface PageMetaUpdate {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'profile' | 'article';
  noindex?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  jsonLd?: JsonLdNode | JsonLdNode[];
}

// Usado por las vistas que resuelven datos después de la carga (fichas,
// portal de hermandad y perfil de jugador). Mantiene title/description,
// canonical, OG/Twitter, robots y breadcrumb JSON-LD en sintonía.
export function setPageMeta(options: PageMetaUpdate): void {
  if (typeof document === 'undefined') return;
  const origin = jsonPlatformOrigin();
  const path = normalizeRoute(options.path ?? window.location.pathname);
  const url = `${origin}${path === '/' ? '/' : path}`;
  const image = options.image ?? DEFAULT_OG_IMAGE;
  const imageUrl = /^https?:\/\//i.test(image) ? image : `${origin}${image.startsWith('/') ? image : `/${image}`}`;
  const noindex = options.noindex === true;

  document.title = options.title;
  upsertMeta('name', 'description', options.description);
  upsertMeta('name', 'robots', robotsContent(noindex));
  upsertCanonical(url, true);

  upsertMeta('property', 'og:title', options.title);
  upsertMeta('property', 'og:description', options.description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:type', options.type ?? 'website');
  upsertMeta('property', 'og:image', imageUrl);
  upsertMeta('property', 'og:image:alt', DEFAULT_OG_IMAGE_ALT);
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', LOCALE);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', options.title);
  upsertMeta('name', 'twitter:description', options.description);
  upsertMeta('name', 'twitter:image', imageUrl);

  upsertJsonLd(
    'rd-breadcrumb-ld',
    options.breadcrumbs && options.breadcrumbs.length > 0
      ? breadcrumbSchema(options.breadcrumbs)
      : null,
  );

  if (options.jsonLd) {
    const nodes = Array.isArray(options.jsonLd) ? options.jsonLd : [options.jsonLd];
    upsertJsonLd('rd-dynamic-ld', jsonLdGraph(...nodes));
  }
}
