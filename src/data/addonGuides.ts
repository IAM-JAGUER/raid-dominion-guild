// Guías del addon RaidDominion v3.0.0.
// Contenido alineado con las features REALES del addon (RD_Constants.lua,
// RD_Init.lua y RD_Utils_Registry.lua). La ruta local del addon dev vive
// SOLO en AGENTS.sections/addon.md (contrato entre repos).

export type GuideCategory =
  | 'Primeros pasos'
  | 'Interfaz'
  | 'Configuración'
  | 'Listas y contenido'
  | 'Bandas'
  | 'Comunicación'
  | 'Raid en vivo'
  | 'Botín'
  | 'Referencia';

export interface GuideSection {
  title: string;
  content: string[];
}

export interface Guide {
  id: string;
  title: string;
  category: GuideCategory;
  description: string;
  icon: string;
  color: 'amber' | 'blue' | 'purple' | 'red' | 'green' | 'orange';
  sections: GuideSection[];
}

export const guideCategories: GuideCategory[] = [
  'Primeros pasos',
  'Interfaz',
  'Configuración',
  'Listas y contenido',
  'Bandas',
  'Comunicación',
  'Raid en vivo',
  'Botín',
  'Referencia',
];

export const colorClasses: Record<Guide['color'], { border: string; hoverBorder: string; shadow: string; iconBg: string; iconBorder: string; iconText: string; btnBg: string; btnText: string; line: string }> = {
  amber: {
    border: 'border-amber-900/30',
    hoverBorder: 'hover:border-amber-700/50',
    shadow: 'hover:shadow-amber-500/10',
    iconBg: 'bg-amber-500/10',
    iconBorder: 'border-amber-500/20',
    iconText: 'text-amber-400',
    btnBg: 'bg-amber-500/10',
    btnText: 'text-amber-300',
    line: 'from-amber-900/0 via-amber-500/80 to-amber-900/0',
  },
  blue: {
    border: 'border-blue-900/30',
    hoverBorder: 'hover:border-blue-700/50',
    shadow: 'hover:shadow-blue-500/10',
    iconBg: 'bg-blue-500/10',
    iconBorder: 'border-blue-500/20',
    iconText: 'text-blue-400',
    btnBg: 'bg-blue-500/10',
    btnText: 'text-blue-300',
    line: 'from-blue-900/0 via-blue-500/80 to-blue-900/0',
  },
  purple: {
    border: 'border-purple-900/30',
    hoverBorder: 'hover:border-purple-700/50',
    shadow: 'hover:shadow-purple-500/10',
    iconBg: 'bg-purple-500/10',
    iconBorder: 'border-purple-500/20',
    iconText: 'text-purple-400',
    btnBg: 'bg-purple-500/10',
    btnText: 'text-purple-300',
    line: 'from-purple-900/0 via-purple-500/80 to-purple-900/0',
  },
  red: {
    border: 'border-red-900/30',
    hoverBorder: 'hover:border-red-700/50',
    shadow: 'hover:shadow-red-500/10',
    iconBg: 'bg-red-500/10',
    iconBorder: 'border-red-500/20',
    iconText: 'text-red-400',
    btnBg: 'bg-red-500/10',
    btnText: 'text-red-300',
    line: 'from-red-900/0 via-red-500/80 to-red-900/0',
  },
  green: {
    border: 'border-green-900/30',
    hoverBorder: 'hover:border-green-700/50',
    shadow: 'hover:shadow-green-500/10',
    iconBg: 'bg-green-500/10',
    iconBorder: 'border-green-500/20',
    iconText: 'text-green-400',
    btnBg: 'bg-green-500/10',
    btnText: 'text-green-300',
    line: 'from-green-900/0 via-green-500/80 to-green-900/0',
  },
  orange: {
    border: 'border-orange-900/30',
    hoverBorder: 'hover:border-orange-700/50',
    shadow: 'hover:shadow-orange-500/10',
    iconBg: 'bg-orange-500/10',
    iconBorder: 'border-orange-500/20',
    iconText: 'text-orange-400',
    btnBg: 'bg-orange-500/10',
    btnText: 'text-orange-300',
    line: 'from-orange-900/0 via-orange-500/80 to-orange-900/0',
  },
};

export const guides: Guide[] = [
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    category: 'Primeros pasos',
    description: 'Instalación, primera carga, registrar tu personaje (RaidDominion > Registrar) y los beneficios del portal para jugadores y hermandades.',
    icon: '🚀',
    color: 'amber',
    sections: [
      {
        title: 'Instalación',
        content: [
          'Descarga el addon desde el botón "Descargar Ahora" del sitio y descomprime en Interface\\AddOns\\.',
          'Reinicia World of Warcraft. El addon se activa automáticamente.',
        ],
      },
      {
        title: 'Primera carga',
        content: [
          'Al entrar verás el menú flotante (si "Mostrar menú al iniciar" está activo).',
          'Clic izquierdo en un ítem navega o ejecuta su acción; clic derecho vuelve al menú anterior.',
          'Arrastra el menú para moverlo (la posición se recuerda). Usa /rd para mostrarlo u ocultarlo.',
        ],
      },
      {
        title: 'El submenú RaidDominion',
        content: [
          'El submenú RaidDominion (último ítem del menú flotante; ver la [guía "Menú flotante"](#guide-menu-flotante)) tiene 5 ítems:',
          'Registrar — exporta tu(s) personaje(s) actual(es) en SavedVariables. Imprescindible para /upload.',
          'Configuración — abre la ventana de configuración (equivalente a /rdc).',
          'Ayuda — muestra la ayuda del addon en el chat (equivalente a /rdh).',
          'Recargar — recarga la interfaz (ReloadUI).',
          'Ocultar — oculta el menú flotante; vuelve a mostrarlo con /rd.',
          'Subcomandos: /rd c (o config), /rd loot (o botin) y /rd help (o h).',
          'Registra tantos personajes como quieras.',
        ],
      },
      {
        title: 'Onboarding en 5 pasos',
        content: [
          'Paso 1 — Abre el menú flotante con /rd y entra en RaidDominion > Registrar.',
          'Paso 2 — El addon exporta tu ficha a la SavedVariables (RaidDominion.lua): equipamiento, iLvl, bandas, asignaciones y hermandad.',
          'Paso 3 — Sube tu RaidDominion.lua en /upload: el portal carga tu ficha al instante.',
          'Paso 4 — Si tu SV acredita maestría de hermandad (registry.guild.isGM) con más de dos personajes registrados, la cuenta se promueve a member automáticamente.',
          'Paso 5 — Si eres maestro de hermandad, reclama tu hermandad y publica su portal en /hermandad/:slug.',
        ],
      },
      {
        title: 'Beneficios para tu(s) personaje(s)',
        content: [
          'Perfil público en /jugador/:slug con tu personaje validado (equipamiento e iLvl) — actívalo desde /dashboard para aparecer en el [directorio de personajes](/personajes).',
          'Dashboard personal: estado de rol (visitante → member → guild_master) y acceso directo a /upload.',
          'Si eres maestro: dashboard de hermandad en /dashboard/guild con roster, bandas, Discord y reglas.',
        ],
      },
      {
        title: 'Beneficios para tu hermandad',
        content: [
          'Portal web gratuito en /hermandad/:slug con roster, bandas y reglas sincronizados desde el SV: re-subir tu RaidDominion.lua lo mantiene al día y lo publica en el [directorio de hermandades](/hermandades).',
          'Sin formularios: los datos provienen del addon.',
        ],
      },
    ],
  },
  {
    id: 'menu-flotante',
    title: 'Menú flotante',
    category: 'Interfaz',
    description: 'El corazón del addon: menú flotante, submenú RaidDominion y acceso rápido desde el minimapa.',
    icon: '🧭',
    color: 'blue',
    sections: [
      {
        title: 'Estructura del menú',
        content: [
          'El menú agrupa: Habilidades, Roles, Buffs, Auras, Mecánicas, Reglas, Banda y RaidDominion.',
          'El submenú RaidDominion reúne Registrar, Configuración, Ayuda, Recargar y Ocultar (ver la [guía "Primeros pasos"](#guide-primeros-pasos)).',
          'Los ítems de roles, habilidades, buffs y auras se asignan y anuncian por el canal (detalle en la [guía "Listas y contenido"](#guide-listas-y-contenido)).',
          'La barra inferior reúne las acciones de raid (ver la [guía "Barra de acciones"](#guide-barra-acciones)).',
        ],
      },
      {
        title: 'Botón del minimapa',
        content: [
          'Clic izquierdo abre/cierra el menú flotante; clic derecho abre un menú contextual (Configuración, Gestor de botín, Recoger items, Spamear reglas/banda, Mover, Recargar UI).',
          'Mantén Alt y arrastra para moverlo alrededor del minimapa.',
        ],
      },
    ],
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    category: 'Configuración',
    description: 'Abre la ventana de configuración, se organiza en pestañas y se renderiza según lo que tengas seteado.',
    icon: '⚙️',
    color: 'purple',
    sections: [
      {
        title: 'Abrir la configuración',
        content: [
          'Ábrela con /rdc, desde el submenú RaidDominion > Configuración o desde la barra de acciones.',
          'Se organiza en pestañas: General, [Bandas](#guide-bandas-jugadores), Roles, Habilidades, Buffs, Auras, Mecánicas, Reglas y Ayuda.',
        ],
      },
      {
        title: 'Restablecer valores',
        content: [
          'El botón "Restablecer valores por defecto" (pestaña General) restaura toda la configuración.',
        ],
      },
    ],
  },
  {
    id: 'listas-y-contenido',
    title: 'Listas y contenido',
    category: 'Listas y contenido',
    description: 'Roles, habilidades, buffs y auras asignables a jugadores; mecánicas y reglas que se anuncian al canal de la banda.',
    icon: '🎛️',
    color: 'orange',
    sections: [
      {
        title: 'Listas asignables',
        content: [
          'Roles, habilidades, buffs y auras son listas configurables y asignables: selecciona un objetivo y pulsa el icono del ítem para asignárselo (o desasignarlo); el clic en el texto lo anuncia por el canal configurado.',
          'Se editan en la pestaña de [Configuración](#guide-configuracion) correspondiente: añade o quita ítems con nombre e icono.',
          '"Obtener" pide la lista al líder; "Reiniciar" la restaura al estado por defecto.',
          'La visibilidad de cada ítem en el menú se controla con el botón-ojo.',
        ],
      },
      {
        title: 'Listas de contenido',
        content: [
          'Mecánicas y reglas son listas de contenido (título, icono y texto).',
          'Al pulsar una mecánica o regla en el menú se envía su contenido al canal configurado (se trocea solo si es largo).',
          'Se editan en Configuración > Mecánicas / Reglas.',
        ],
      },
    ],
  },
  {
    id: 'bandas-jugadores',
    title: 'Bandas y jugadores',
    category: 'Bandas',
    description: 'Crea y gestiona bandas: nombre, gearscore mínimo, horario, jugadores y roles.',
    icon: '👥',
    color: 'green',
    sections: [
      {
        title: 'Bandas',
        content: [
          'Crea, edita o elimina bandas en Configuración > Bandas (nombre, gearscore mínimo y horario).',
        ],
      },
      {
        title: 'Gestor de jugadores',
        content: [
          'Desde el menú > Banda, el clic en el texto anuncia la banda y el clic en el icono abre su gestor de jugadores.',
          'Cada jugador tiene rol, dual, clase, gearscore, líder, asistencia y sanción (detalle en la sección "Bandas vivas").',
          'Cada jugador tiene botones para invitarlo y susurrarle una plantilla de invitación; para reclutar en el canal usa el [spammer de banda](#guide-comunicacion).',
        ],
      },
      {
        title: 'Bandas vivas',
        content: [
          'Cada banda guarda nombre, horario (schedule), gearscore mínimo (minGS) y sus jugadores con rol y puntos. Se sincroniza con el portal al subir tu RaidDominion.lua y tu roster aparece en el [directorio de hermandades](/hermandades).',
          'Rol del jugador: T (Tanque), H (Healer), R (Rango), M (Melee).',
          'Dual: marca si el jugador tiene doble rol.',
          'Gearscore: iLvl del jugador; la banda puede exigir un mínimo (minGS).',
          'Líder: No, Sí o Ayudante.',
          'Asistencia y puntos: los botones + / - del gestor ajustan los puntos del jugador; mide su compromiso y fidelidad con la banda (se acumula por banda).',
          'Sanción: lag, abandono, rendimiento, baneo, equipamiento (Equip.) o engemado (Eng/Enc).',
        ],
      },
    ],
  },
  {
    id: 'comunicacion',
    title: 'Comunicación y spammers',
    category: 'Comunicación',
    description: 'Pide y comparte asignaciones, reglas, mecánicas y bandas; emite bucles de reclutamiento y rotación de reglas por canal.',
    icon: '📢',
    color: 'blue',
    sections: [
      {
        title: 'Solicitar y compartir datos',
        content: [
          'Estando en grupo o banda puedes pedir al líder las asignaciones, reglas, mecánicas o bandas (botón "Obtener" o clic derecho en "Modo de raid").',
          'El líder puede compartir las asignaciones y listas con el resto de jugadores que usen el addon.',
        ],
      },
      {
        title: 'Spammer de banda',
        content: [
          'Compone el mensaje de reclutamiento de una banda: prefijo, nombre, sufijo, duración (60 s por defecto) y composición por roles (tanque, healer, melee, ranged).',
          'Configura el separador del mensaje (//, |, ;, ", " o ") y los canales (RAID activado por defecto); incluye vista previa y contador (máx. 255 caracteres).',
          'El spammer vive EN BANDA: se abre desde el submenú Bandas > Spamear banda y recluta mientras raidias. Requiere al menos una [banda registrada](#guide-bandas-jugadores).',
          'Inicia o detiene el bucle de spam.',
        ],
      },
      {
        title: 'Spammer de reglas',
        content: [
          'Rota el mensaje de una regla por canal: elige la regla, la duración y los canales, con vista previa y contador de caracteres.',
          'Se abre desde Configuración > Reglas > Spamear.',
        ],
      },
    ],
  },
  {
    id: 'barra-acciones',
    title: 'Barra de acciones',
    category: 'Raid en vivo',
    description: 'Botones inferiores del menú flotante para acciones de raid en vivo.',
    icon: '⚡',
    color: 'orange',
    sections: [
      {
        title: 'Acciones disponibles',
        content: [
          'Acciones de raid EN VIVO: estas funciones se ejecutan dentro de la banda — son el corazón del addon, no del portal.',
          'Modo de raid: izq. configurar dificultad · der. [pedir asignaciones al líder](#guide-comunicacion).',
          'Indicar discord: enviar / editar el link.',
          'Nombrar objetivo: nombrar / ver info.',
          'Marcar principales: marcar iconos de raid · der. limpiar.',
          'Susurrar asignaciones.',
          'Iniciar Check: ready check · der. reportar ausentes.',
          'Iniciar Pull: cuenta regresiva de pull.',
          'Cambiar botín: método de botín · der. maestro despojador (ver el [gestor de botín](#guide-gestor-botin)).',
          'Configuración.',
        ],
      },
    ],
  },
  {
    id: 'gestor-botin',
    title: 'Gestor de botín',
    category: 'Botín',
    description: 'Sorteo de ítems con dados, historial por ítem y desempates.',
    icon: '💰',
    color: 'amber',
    sections: [
      {
        title: 'Abrir el gestor',
        content: [
          'Se abre con /rdloot, desde el menú (submenú Bandas > Gestor de botín) o la [barra de acciones](#guide-barra-acciones).',
        ],
      },
      {
        title: 'Uso',
        content: [
          'Arrastra un ítem de la bolsa o haz clic con uno en el cursor.',
          'Tira dados (Main/Dual/Enchant) con límite de tiempo, elige ganador (clic en un dado), declara ganador y desempata si hay empate en el dado más alto (solo tiran los empatados).',
          'El historial queda agrupado por ítem. También puedes spamear el botín y recoger los ítems hacia el maestro despojador.',
        ],
      },
    ],
  },
  {
    id: 'comandos',
    title: 'Comandos',
    category: 'Referencia',
    description: 'Todos los comandos de chat del addon.',
    icon: '⌨️',
    color: 'red',
    sections: [
      {
        title: 'Comandos disponibles',
        content: [
          '/rd — muestra/oculta el menú flotante.',
          '/rdc — abre la configuración.',
          '/rdh — muestra la ayuda en el chat.',
          '/rdloot — abre el gestor de botín.',
          'Subcomandos de /rd: /rd c (config), /rd loot (o botin), /rd help (o h).',
          'Si empiezas ahora, sigue la [guía de primeros pasos](#guide-primeros-pasos).',
        ],
      },
    ],
  },
];

export function getGuide(id: string): Guide | undefined {
  return guides.find((g) => g.id === id);
}