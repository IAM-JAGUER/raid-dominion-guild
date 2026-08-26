import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

// Slugs reservados: no se interpretan como portal de hermandad en dev.
// Deben coincidir con RESERVED de src/pages/portal.astro.
const RESERVED_PORTAL_SLUGS = new Set([
  'upload', 'login', 'dashboard', 'admin', 'moderate', 'guilds', 'p', 'api',
  'assets', '_astro', 'portal', 'jugador', 'personajes', 'personaje',
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
        // Dev-only: replica el rewrite /p/* → /jugador de netlify.toml
        name: 'dev-p-rewrite',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && req.url.startsWith('/p/')) {
              const raw = req.url.slice(3).split('?')[0];
              const slug = decodeURIComponent(raw.replace(/\/+$/, ''));
              if (slug && slug !== 'index.html') {
                req.url = '/jugador?slug=' + encodeURIComponent(slug);
              }
            }
            // Dev-only: replica el rewrite /personaje/* → /personaje de
            // netlify.toml. El shell (personaje/index.astro) resuelve el
            // slug desde window.location.pathname en el cliente.
            if (req.url && req.url.startsWith('/personaje/')) {
              const raw = req.url.slice('/personaje/'.length).split('?')[0];
              const slug = decodeURIComponent(raw.replace(/\/+$/, ''));
              if (slug && slug !== 'index.html' && !raw.includes('.')) {
                req.url = '/personaje';
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