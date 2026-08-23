import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

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