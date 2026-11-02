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
  DESCRIPTION: 'Addon gratuito y portal comunitario para organizar bandas y hermandades en World of Warcraft 3.3.5a (WotLK).',
  KEYWORDS: ['addon wow 3.3.5a', 'addon wotlk', 'bandas wow', 'hermandades wow', 'raiddominion', 'savedvariables', 'roster de banda'],
  AUTHOR: 'RaidDominion',
  THEME_COLOR: '#00BFFF', // Energía (paleta azul/acero)
  LOCALE: 'es-CO',
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

// Video de presentación del addon (fachada embebida en la landing).
export const ADDON_VIDEO = {
  id: 'yen-IjWLAoY',
  title: 'RaidDominion Tools - World of Warcraft Addon',
} as const;

// Configuración de características del addon.
// `icon` pertenece al contrato único de src/lib/ui/icons.ts.
export const ADDON_FEATURES = [
  {
    title: 'Gestión avanzada de bandas',
    description: 'Crea bandas, define horarios y conserva su roster sin salir del juego.',
    icon: 'espadas',
  },
  {
    title: 'Asignación de roles y responsabilidades',
    description: 'Asigna tanque, sanador y daño, y anuncia cada rol por el chat de la banda.',
    icon: 'escudo',
  },
  {
    title: 'Seguimiento de buffs y debuffs',
    description: 'Controla buffs, auras y habilidades de utilidad para preparar cada encuentro.',
    icon: 'sanacion',
  },
  {
    title: 'Alertas personalizables',
    description: 'Comparte reglas, mecánicas y recordatorios con el grupo cuando los necesite.',
    icon: 'notificaciones',
  },
  {
    title: 'Interfaz intuitiva y personalizable',
    description: 'Menú flotante, barra de raid y comandos /rd para tener todo a mano.',
    icon: 'engranajes',
  },
  {
    title: 'Soporte para múltiples dificultades',
    description: 'Organiza bandas de 10 y 25, normal y heroico, con sus propias reglas.',
    icon: 'ciudadela',
  },
  {
    title: 'Portal de hermandad',
    description: 'Sube el SavedVariables y publica roster, bandas y reglas en una página gratuita.',
    icon: 'hermandad',
  },
  {
    title: 'Perfil público',
    description: 'Comparte tu personaje, equipo, metas e instancias con la comunidad.',
    icon: 'perfil-alt',
  },
] as const;

// Tipos de dificultad de raid
export const RAID_DIFFICULTIES = {
  '10n': '10 Normal',
  '10h': '10 Heroico',
  '25n': '25 Normal',
  '25h': '25 Heroico',
} as const;

export type RaidDifficulty = keyof typeof RAID_DIFFICULTIES;
