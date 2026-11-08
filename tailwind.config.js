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
        // ── Paleta de marca RaidDominion (material v3 del addon) ───────────
        // 200 Plata/300 Hielo/400/500 Energía conservan el acento; 600-950
        // son el marco y las superficies negro-teal del addon (design.md §1b).
        brand: {
          50: '#EEF6FE',
          100: '#DCEBFB',
          200: '#B8D7F1',
          300: '#93C4EE',
          400: '#5CA9E8',
          500: '#00BFFF',
          // Paleta v3 (2026-11-08): las paradas oscuras adoptan el material
          // del addon (teal/negro casi opaco) mientras 200-500 conservan el
          // acento hielo/energía para foco, enlaces y estados vivos.
          600: '#2E5B66',
          700: '#1A343B',
          800: '#0F2026',
          900: '#06171F',
          950: '#02090C',
        },
        // ── Tonos ceremoniales de la paleta v2 (2026-11-04) ───────────────
        // Bronce/oro (valor, hermandad, metas), ascuas (bandas, core),
        // arcano (jugadores, conocimiento) y pergamino (notas, reglas,
        // editorial). Se usan por contexto, no como acento global.
        valor: {
          50: '#FBF4DD',
          100: '#F6E8BC',
          200: '#EED595',
          300: '#E2BC6B',
          400: '#D4A247',
          500: '#BE8630',
          600: '#9C6725',
          700: '#754B1F',
          800: '#4C3019',
          900: '#2B1B10',
          950: '#180E08',
        },
        ember: {
          50: '#FDF1EE',
          100: '#FADDD6',
          200: '#F4B8A9',
          300: '#EB8C77',
          400: '#D95C45',
          500: '#B93C2B',
          600: '#972D22',
          700: '#72241D',
          800: '#4A1814',
          900: '#2A0E0C',
          950: '#170706',
        },
        arcane: {
          50: '#F4F1FC',
          100: '#E8E1F8',
          200: '#D0C4F0',
          300: '#B29FE4',
          400: '#8F75D2',
          500: '#6F53B8',
          600: '#574097',
          700: '#423178',
          800: '#2B2050',
          900: '#19122F',
          950: '#0D091A',
        },
        parchment: {
          50: '#FBF7EC',
          100: '#F4EBD3',
          200: '#E8D7AE',
          300: '#D8BE85',
          400: '#C3A264',
          500: '#A9824A',
          600: '#896438',
          700: '#684A2B',
          800: '#46311F',
          900: '#291C12',
          950: '#170F0A',
        },
        normal: "rgba(221, 213, 184,.8)",
        primary: "rgba(213, 185, 84,.8)",
        enphasis: "rgba(58, 41, 43, .8)",
        secondary: "rgba(0, 0, 0, .8)",
        txtbg: "rgba(0,170,250,.8)",
        txtbg1: "rgba(0,0,0,.6)",
      },
      fontFamily: {
        sans: ['"Jost Variable"', 'system-ui', 'sans-serif'],
        display: ['"Cinzel Variable"', 'Georgia', 'serif'],
        editorial: ['"Cormorant Garamond Variable"', 'Georgia', 'serif'],
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
