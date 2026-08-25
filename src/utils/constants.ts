// URLs de la aplicación
export const APP_URLS = {
  HOME: '/',
  ADDON: '/#addon',
  GUIDES: '/#addon',
  DISCORD: 'https://discord.gg/BwdpNV9sky',
  YOUTUBE: 'https://www.youtube.com/@IAM-GAMECODE',
  GITHUB: 'https://github.com/IAM-DEV88/raid-dominion-guild',
  DOWNLOAD: 'https://github.com/IAM-DEV88/RaidDominion/archive/refs/heads/main.zip',
};

// Nombres de rutas para el menú
export const ROUTE_NAMES = {
  HOME: 'Inicio',
  ADDON: 'Guía',
};

// Rutas de navegación
export const NAV_ITEMS = [
  { name: ROUTE_NAMES.HOME, href: '/#inicio' },
  { name: ROUTE_NAMES.ADDON, href: '/#addon' },
];

// Configuración del sitio
export const SITE_CONFIG = {
  TITLE: 'RaidDominion',
  DESCRIPTION: 'Addon para World of Warcraft 3.3.5a para liderar bandas. Compacto y fácil de usar.',
  KEYWORDS: ['wow', 'wotlk', 'addon', 'raid', '3.3.5a', 'bandas', 'pve', 'roles', 'buffs', 'raiddominion'],
  AUTHOR: 'RaidDominion',
  THEME_COLOR: '#d97706', // Color ámbar-600
  LOCALE: 'es-ES',
};

// Configuración de redes sociales
export const SOCIAL_LINKS = {
  discord: {
    name: 'Discord',
    url: 'https://discord.gg/BwdpNV9sky',
    icon: 'discord',
  },
  youtube: {
    name: 'YouTube',
    url: 'https://www.youtube.com/@IAM-GAMECODE',
    icon: 'youtube',
  },
  github: {
    name: 'GitHub',
    url: 'https://github.com/IAM-DEV88/raid-dominion-guild',
    icon: 'github',
  },
};

// Configuración de características del addon
export const ADDON_FEATURES = [
  'Gestión avanzada de bandas',
  'Asignación de roles y responsabilidades',
  'Seguimiento de buffs y debuffs',
  'Alertas personalizables',
  'Interfaz intuitiva y personalizable',
  'Soporte para múltiples dificultades',
];

// Tipos de dificultad de raid
export const RAID_DIFFICULTIES = {
  '10n': '10 Normal',
  '10h': '10 Heroico',
  '25n': '25 Normal',
  '25h': '25 Heroico',
} as const;

export type RaidDifficulty = keyof typeof RAID_DIFFICULTIES;
