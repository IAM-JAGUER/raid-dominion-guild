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