import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import { loadEnv } from 'vite';

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
        // Dev-only: replica la Netlify Function /api/chat → chat.ts.
        // astro dev no sirve funciones serverless; este middleware ejecuta la
        // misma lógica (contexto público + Groq) en el servidor de desarrollo.
        name: 'dev-chat-function',
        apply: 'serve',
        configureServer(server) {
          // astro dev no sirve funciones serverless: inyectamos las env del
          // .env en process.env (las funciones leen process.env vía env()) y
          // ejecutamos el handler de chat.ts con la misma lógica de producción.
          const loaded = loadEnv(server.config.mode, server.config.root, '');
          Object.entries(loaded).forEach(([k, v]) => {
            if (process.env[k] === undefined) process.env[k] = v;
          });
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url !== '/api/chat' || (req.method ?? 'GET') !== 'POST') return next();
            try {
              const mod = await server.ssrLoadModule('/netlify/functions/chat.ts');
              const handler = mod.default;
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = Buffer.concat(chunks).toString('utf8');
              const request = new Request('http://localhost/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
                body,
              });
              const response = await handler(request);
              res.statusCode = response.status;
              const ct = response.headers.get('content-type');
              if (ct) res.setHeader('Content-Type', ct);
              res.end(await response.text());
            } catch (err) {
              console.error('[dev-chat-function]', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
          });
        },
      },
      {
        // Dev-only: replica la Netlify Function /api/discord-send →
        // discord-send.ts (envío manual a Discord desde el panel admin).
        name: 'dev-discord-send-function',
        apply: 'serve',
        configureServer(server) {
          const loaded = loadEnv(server.config.mode, server.config.root, '');
          Object.entries(loaded).forEach(([k, v]) => {
            if (process.env[k] === undefined) process.env[k] = v;
          });
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url !== '/api/discord-send' || (req.method ?? 'GET') !== 'POST') return next();
            try {
              const mod = await server.ssrLoadModule('/netlify/functions/discord-send.ts');
              const handler = mod.default;
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = Buffer.concat(chunks).toString('utf8');
              const request = new Request('http://localhost/api/discord-send', {
                method: 'POST',
                headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
                body,
              });
              const response = await handler(request);
              res.statusCode = response.status;
              const ct = response.headers.get('content-type');
              if (ct) res.setHeader('Content-Type', ct);
              res.end(await response.text());
            } catch (err) {
              console.error('[dev-discord-send-function]', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
          });
        },
      },
      {
        // Dev-only: replica la Netlify Function /api/visit → visit.ts
        // (registro de visitas + aviso al canal admin de Discord).
        name: 'dev-visit-function',
        apply: 'serve',
        configureServer(server) {
          const loaded = loadEnv(server.config.mode, server.config.root, '');
          Object.entries(loaded).forEach(([k, v]) => {
            if (process.env[k] === undefined) process.env[k] = v;
          });
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (url !== '/api/visit' || (req.method ?? 'GET') !== 'POST') return next();
            try {
              const mod = await server.ssrLoadModule('/netlify/functions/visit.ts');
              const handler = mod.default;
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = Buffer.concat(chunks).toString('utf8');
              // visit.ts excluye tráfico local (localhost/LAN) segun IP: pasamos
              // la IP real del cliente (socket.remoteAddress) como lo haría Netlify.
              const remoteAddress = req.socket?.remoteAddress;
              const request = new Request('http://localhost/api/visit', {
                method: 'POST',
                headers: {
                  'Content-Type': req.headers['content-type'] ?? 'application/json',
                  'x-nf-client-connection-ip': remoteAddress ?? '',
                },
                body,
              });
              const response = await handler(request);
              res.statusCode = response.status;
              const ct = response.headers.get('content-type');
              if (ct) res.setHeader('Content-Type', ct);
              res.end(await response.text());
            } catch (err) {
              console.error('[dev-visit-function]', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
          });
        },
      },
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