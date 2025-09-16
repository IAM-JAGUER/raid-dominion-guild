import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  
  // Desactivar la barra de desarrollo de Astro
  devToolbar: {
    enabled: false
  }
});