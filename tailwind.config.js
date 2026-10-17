import animations from "@midudev/tailwind-animations";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      screens: {
        'dsm': '320px',
      },
      colors: {
        // ── Paleta de marca RaidDominion (azul/acero) ─────────────────────
        // Escala 50–950 que ancla los cinco colores de la identidad:
        // 200 Plata #B8D7F1 · 400 Hielo #5CA9E8 · 500 Energía #00BFFF ·
        // 800 Acero #123253 · 950 Abismo #07111E (ver design.md §1).
        brand: {
          50: '#EEF6FE',
          100: '#DCEBFB',
          200: '#B8D7F1',
          300: '#93C4EE',
          400: '#5CA9E8',
          500: '#00BFFF',
          600: '#00A0DC',
          700: '#0C74A8',
          800: '#123253',
          900: '#0B2338',
          950: '#07111E',
        },
        normal: "rgba(221, 213, 184,.8)",
        primary: "rgba(213, 185, 84,.8)",
        enphasis: "rgba(58, 41, 43, .8)",
        secondary: "rgba(0, 0, 0, .8)",
        txtbg: "rgba(0,170,250,.8)",
        txtbg1: "rgba(0,0,0,.6)",
      },
      boxShadow: {
        "3xl": [
          "0 0px 2px rgba(58,41,43,.8)",
          "0 0px 2px rgba(0,170,250,.8)",
        ],
      },
      dropShadow: {
        "4xl": [
          "0 0px 2px rgba(0,170,250,.8)",
          "0 0px 2px rgba(58, 41, 43,.8)",
        ],
        backgroundImage: {
          'custom-gradient': 'linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.9))',
        },
      },
    },
  },
  plugins: [animations],
};
