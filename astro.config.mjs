import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

// Slugs reservados: no se interpretan como portal de hermandad en dev.
// Deben coincidir con RESERVED de src/lib/routes.ts.
const RESERVED_PORTAL_SLUGS = new Set([
  'upload', 'login', 'dashboard', 'admin', 'moderate', 'api',
  'assets', '_astro', 'portal', 'jugador', 'personajes', 'personaje',
  'servidor', 'servidores', 'reino', 'hermandad', 'hermandades',
  'jugadores', 'banda', 'bandas', 'guilds',
]);

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  
  // Desactivar la barra de desarrollo de Astro
  devToolbar: {
    enabled: false
  },

  // Live preview accesible en la red local (LAN), igual que opencode-mobile
  // (escucha en 0.0.0.0). Así el "Live preview" (npm run dev) es alcanzable
  // desde el celular vía http://<IP-LAN>:4321. localhost sigue funcionando.
  server: {
    host: true,
  },

  vite: {
    plugins: [
      {
        // Dev-only: replica el rewrite /jugador/* → /jugador de netlify.toml
        name: 'dev-p-rewrite',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && req.url.startsWith('/jugador/')) {
              const raw = req.url.slice('/jugador/'.length).split('?')[0];
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
        // Dev-only: replica los rewrites de las fichas públicas de
        // netlify.toml → shells estáticos (personaje/servidor/banda). El
        // navegador conserva la URL real y cada vista se auto-activa por el
        // primer segmento en el cliente. Cubre /personaje/:slug,
        // /servidor/:server (y /servidor/:server/reino/:realm) y /banda/:slug.
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
                  req.url = '/' + seg.toLowerCase();
                }
              }
            }
            next();
          });
        },
      },
      {
        // Dev-only: replica el redirect de raíz /:slug → /hermandad/:slug de
        // netlify.toml (páginas reales y slugs reservados tienen prioridad) y
        // el rewrite /hermandad/* → /hermandad (shell estático; el navegador
        // conserva la URL real y el script resuelve el slug).
        name: 'dev-slug-redirect',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url) {
              const path = req.url.split('?')[0];
              const segs = path.split('/').filter(Boolean);
              if (segs[0] === 'hermandad' && segs.length === 2) {
                req.url = '/hermandad';
              } else if (segs.length === 1 && !segs[0].includes('.')) {
                const slug = decodeURIComponent(segs[0]);
                if (slug && !RESERVED_PORTAL_SLUGS.has(slug.toLowerCase())) {
                  res.statusCode = 301;
                  res.setHeader('Location', '/hermandad/' + encodeURIComponent(slug));
                  res.end();
                  return;
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