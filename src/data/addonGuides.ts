// Guías del addon RaidDominion v3.0.0.
// Contenido alineado con la sección "Ayuda" del addon (RD_Constants.lua del
// dev en D:\WowClient esMX\Interface\AddOns\RaidDominion).

export type GuideCategory = 'Primeros pasos' | 'Interfaz' | 'Bandas' | 'Botín' | 'Comunicación' | 'Referencia';

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
  'Bandas',
  'Botín',
  'Comunicación',
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
    description: 'Instalación, primera carga y cómo empezar a organizar tu banda con RaidDominion.',
    icon: '🚀',
    color: 'amber',
    sections: [
      {
        title: 'Instalación',
        content: [
          'Descarga el addon desde el botón "Descargar Ahora" del sitio y descomprime en Interface\\AddOns\\.',
          'Reinicia World of Warcraft (o recarga con /reload). El addon se activa automáticamente.',
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
    ],
  },
  {
    id: 'menu-flotante',
    title: 'Menú flotante',
    category: 'Interfaz',
    description: 'El corazón del addon: roles, habilidades, buffs, auras, mecánicas, reglas y bandas.',
    icon: '🧭',
    color: 'blue',
    sections: [
      {
        title: 'Estructura del menú',
        content: [
          'El menú agrupa: Roles, Habilidades, Buffs, Auras, Mecánicas, Reglas y Bandas.',
          'Los ítems asignables (roles/habilidades/buffs/auras): selecciona un objetivo y pulsa el icono del ítem para asignárselo (o desasignarlo).',
          'El clic en el texto anuncia el ítem por el canal configurado.',
          'La barra inferior reúne las acciones de raid (ver la guía "Barra de acciones").',
        ],
      },
      {
        title: 'Escalabilidad por datos',
        content: [
          'Los submenús se definen como datos; agregar un ítem no requiere tocar el frame.',
          'Los ítems deshabilitados se omiten del layout sin dejar huecos.',
        ],
      },
    ],
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    category: 'Interfaz',
    description: 'Abre la ventana de configuración, se organiza en pestañas y se renderiza según lo que tengas seteado.',
    icon: '⚙️',
    color: 'purple',
    sections: [
      {
        title: 'Abrir la configuración',
        content: [
          'Ábrela con /rdc o desde el menú flotante / la barra de acciones.',
          'Se organiza en pestañas: General, Bandas, Roles, Habilidades, Buffs, Auras, Mecánicas, Reglas y Ayuda.',
        ],
      },
      {
        title: 'Restablecer valores',
        content: [
          'El botón "Restablecer valores por defecto" (pestaña General) restaura toda la configuración.',
        ],
      },
      {
        title: 'Persistencia',
        content: [
          'Se guarda en las SavedVariables (RaidDominionDB) al salir del juego.',
          'Cada campo lee con RD.config:Get(key, default) y escribe con RD.config:Set(key, value).',
        ],
      },
    ],
  },
  {
    id: 'roles-buffs-auras',
    title: 'Roles, habilidades, buffs y auras',
    category: 'Interfaz',
    description: 'Listas configurables y asignables para gestionar tu banda.',
    icon: '🎯',
    color: 'orange',
    sections: [
      {
        title: 'Cómo funcionan',
        content: [
          'Son listas configurables y asignables. Se editan en la pestaña de Configuración correspondiente: añade o quita ítems con nombre e icono.',
          '"Obtener" pide la lista al líder; "Reiniciar" la restaura al estado por defecto.',
          'La visibilidad de cada ítem en el menú se controla con el botón-ojo.',
        ],
      },
    ],
  },
  {
    id: 'mecanicas-reglas',
    title: 'Mecánicas y reglas',
    category: 'Comunicación',
    description: 'Listas de contenido que se envían al canal de la banda.',
    icon: '📜',
    color: 'red',
    sections: [
      {
        title: 'Cómo funcionan',
        content: [
          'Son listas de contenido (título, icono y texto).',
          'Al pulsar una mecánica o regla en el menú se envía su contenido al canal configurado (se trocea solo si es largo).',
          'Se editan en Configuración > Mecánicas / Reglas; el botón "Obtener" pide la lista al líder.',
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
          'Rol (T/H/R/M), dual, clase, gearscore, líder (No/Sí/Ayudante), asistencia (+/-) y sanción.',
          'Cada jugador tiene botones para invitarlo y susurrarle una plantilla de invitación con los datos de la banda.',
        ],
      },
      {
        title: 'Bandas Core',
        content: [
          'Las bandas Core se guardan en la SavedVariables y pueden sincronizarse con el portal al subir tu RaidDominionDB.',
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
          'Se abre con /rdloot, desde el menú (submenú Bandas > Gestor de botín) o la barra de acciones.',
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
    id: 'spammers',
    title: 'Spammers (banda y reglas)',
    category: 'Comunicación',
    description: 'Bucle de reclutamiento y rotación de reglas por canal.',
    icon: '📢',
    color: 'blue',
    sections: [
      {
        title: 'Spammer de banda',
        content: [
          'Compone el mensaje de reclutamiento de una banda: prefijo, nombre, sufijo, duración, composición por rol, canales y vista previa (máx. 255 caracteres).',
          'Inicia o detiene el bucle de spam. Se abre desde el submenú Bandas > Spamear banda (requiere al menos una banda registrada).',
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
    category: 'Comunicación',
    description: 'Botones inferiores del menú flotante para acciones de raid en vivo.',
    icon: '⚡',
    color: 'orange',
    sections: [
      {
        title: 'Acciones disponibles',
        content: [
          'Modo de raid: izq. configurar dificultad · der. pedir asignaciones al líder.',
          'Indicar discord: enviar / editar el link.',
          'Nombrar objetivo: nombrar / ver info.',
          'Marcar principales: marcar iconos de raid · der. limpiar.',
          'Susurrar asignaciones.',
          'Iniciar Check: ready check · der. reportar ausentes.',
          'Iniciar Pull: cuenta regresiva de pull.',
          'Cambiar botín: método de botín · der. maestro despojador.',
          'Configuración.',
        ],
      },
    ],
  },
  {
    id: 'comunicacion',
    title: 'Comunicación y compartir asignaciones',
    category: 'Comunicación',
    description: 'Pide y comparte asignaciones, reglas, mecánicas y bandas con quienes usen el addon.',
    icon: '💬',
    color: 'green',
    sections: [
      {
        title: 'Solicitar datos al líder',
        content: [
          'Estando en grupo o banda puedes pedir al líder las asignaciones, reglas, mecánicas o bandas (botón "Obtener" o clic derecho en "Modo de raid").',
          'El líder puede compartir las asignaciones y listas con el resto de jugadores que usen el addon.',
        ],
      },
    ],
  },
  {
    id: 'minimapa',
    title: 'Botón del minimapa',
    category: 'Interfaz',
    description: 'Acceso rápido al menú, gestor de botín y acciones desde el minimapa.',
    icon: '🗺️',
    color: 'purple',
    sections: [
      {
        title: 'Uso',
        content: [
          'Clic izquierdo abre/cierra el menú flotante; clic derecho abre un menú contextual (Configuración, Gestor de botín, Recoger items, Spamear reglas/banda, Mover, Recargar UI).',
          'Mantén Alt y arrastra para moverlo alrededor del minimapa.',
          'Se muestra/oculta con /rdminimap.',
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
          '/rdminimap — muestra/oculta el botón del minimapa.',
          'Subcomandos de /rd: /rd c (config), /rd loot (o botin), /rd help (o h).',
        ],
      },
    ],
  },
];

export function getGuide(id: string): Guide | undefined {
  return guides.find((g) => g.id === id);
}