import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

// Slugs reservados: no se interpretan como portal de hermandad en dev.
// Deben coincidir con RESERVED de src/lib/routes.ts.
const RESERVED_PORTAL_SLUGS = new Set([
  'upload', 'login', 'dashboard', 'admin', 'moderate', 'guilds', 'p', 'api',
  'assets', '_astro', 'portal', 'jugador', 'personajes', 'personaje',
  'servidor', 'servidores', 'reino', 'hermandad', 'hermandades',
  'jugadores', 'banda', 'bandas', 'detalle',
]);

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  
  // Desactivar la barra de desarrollo de Astro
  devToolbar: {
    enabled: false
  },

  vite: {
    plugins: [
      {
        // Dev-only: replica el rewrite /p/* y /jugador/* → /jugador de netlify.toml
        name: 'dev-p-rewrite',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && (req.url.startsWith('/p/') || req.url.startsWith('/jugador/'))) {
              const raw = req.url.slice(req.url.startsWith('/jugador/') ? 9 : 3).split('?')[0];
              const slug = decodeURIComponent(raw.replace(/\/+$/, ''));
              if (slug && slug !== 'index.html') {
                req.url = '/jugador?slug=' + encodeURIComponent(slug);
              }
            }
            next();
          });
        },
      },
      {
        // Dev-only: replica los rewrites de las rutas de DETALLE de
        // netlify.toml → /detalle. El shell (detalle.astro) resuelve la
        // vista por el PRIMER segmento en el cliente. Cubre /servidor/*
        // (incluida la ruta anidada /servidor/:server/reino/:realm),
        // /personaje/* y /banda/*.
        name: 'dev-detail-rewrite',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url) {
              const path = req.url.split('?')[0];
              const seg = path.split('/').filter(Boolean)[0];
              if (seg && ['servidor', 'personaje', 'banda'].includes(seg.toLowerCase())) {
                const raw = path.slice('/'.length + seg.length).split('?')[0];
                const rest = decodeURIComponent(raw.replace(/\/+$/, ''));
                // Reescribe siempre que haya un slug (los realmlist de servidor
                // contienen puntos, p. ej. logon.ultimowow.com, así que no se
                // rechazan por el punto). Estas rutas nunca son archivos reales.
                if (rest && rest !== 'index.html') {
                  req.url = '/detalle';
                }
              }
            }
            next();
          });
        },
      },
      {
        // Dev-only: replica el rewrite /:slug → /portal (portal de hermandad
        // en raíz). Las páginas reales y los slugs reservados tienen prioridad.
        name: 'dev-slug-rewrite',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url) {
              const path = req.url.split('?')[0];
              const segs = path.split('/').filter(Boolean);
              if (segs.length === 1 && !segs[0].includes('.')) {
                const slug = decodeURIComponent(segs[0]);
                if (slug && !RESERVED_PORTAL_SLUGS.has(slug.toLowerCase())) {
                  req.url = '/portal?slug=' + encodeURIComponent(slug);
                }
              }
            }
            next();
          });
        },
      },
    ],
    server: {
      watch: {
        // DrvFs/WSL2: inotify no funciona confiablemente sobre /mnt/d/.
        // Con polling el dev server detecta cambios y recarga (HMR).
        usePolling: true,
        interval: 300,
      },
    },
  },
});