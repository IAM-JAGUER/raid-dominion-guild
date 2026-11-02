// Contenido editorial de la portada y de /upload.
//
// Fuente ÚNICA de preguntas/respuestas y glosario: lo consumen los componentes
// visibles (src/sections/Faq.astro) y los constructores JSON-LD de
// src/lib/seo.ts. Las respuestas son texto plano para que el schema FAQPage
// coincida exactamente con lo que ve el usuario.

export interface FaqItem {
  question: string;
  answer: string;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export const HOME_FAQ: FaqItem[] = [
  {
    question: '¿Qué es RaidDominion?',
    answer:
      'RaidDominion es un addon gratuito para World of Warcraft 3.3.5a (WotLK) y un portal comunitario. El addon ayuda a organizar bandas, roles, buffs, botín y reglas; el portal convierte tu SavedVariables en fichas de personaje, directorios y un portal público para tu hermandad.',
  },
  {
    question: '¿RaidDominion es gratis?',
    answer:
      'Sí. La descarga del addon y el uso del portal son gratuitos. Las donaciones son opcionales y solo ayudan a mantener el proyecto y sus servicios.',
  },
  {
    question: '¿Para qué versión de World of Warcraft funciona?',
    answer:
      'RaidDominion está pensado para el cliente World of Warcraft 3.3.5a (Wrath of the Lich King) y los servidores privados de esa versión. No es un addon para versiones retail o Classic modernas.',
  },
  {
    question: '¿Cómo instalo el addon?',
    answer:
      'Descarga el archivo, descomprime la carpeta RaidDominion dentro de Interface/AddOns de tu cliente y reinicia World of Warcraft. Después abre el menú con /rd y entra en RaidDominion para registrar tu personaje.',
  },
  {
    question: '¿Dónde encuentro el archivo RaidDominion.lua?',
    answer:
      'Después de usar Registrar y cerrar el juego, el archivo queda en WTF/Account/<tu cuenta>/SavedVariables/RaidDominion.lua. Ese es el archivo que se sube en el portal.',
  },
  {
    question: '¿Qué datos se publican al subir mi SavedVariables?',
    answer:
      'El portal muestra los datos que el addon registra: personaje, equipo, iLevel, metas, instancias, bandas y hermandad. Las notas privadas no se publican salvo que actives su visibilidad. Puedes analizar el archivo sin cuenta; para guardarlo y publicar tu perfil necesitas iniciar sesión.',
  },
  {
    question: '¿Cómo consigo el portal de mi hermandad?',
    answer:
      'Sube un SavedVariables generado con rango de maestro (isGM) y valida al menos un personaje. El portal detecta la maestría y crea la hermandad sin formularios; luego puedes publicarla desde tu dashboard para que aparezca en el directorio.',
  },
  {
    question: '¿Qué es el gearscore y por qué aparece en las bandas?',
    answer:
      'El gearscore (GS) es una cifra de referencia que usa el líder para indicar el equipo mínimo de una banda. RaidDominion muestra el GS mínimo configurado en el addon; no lee ni calcula el gearscore desde el cliente.',
  },
];

export const UPLOAD_FAQ: FaqItem[] = [
  {
    question: '¿Necesito una cuenta para subir el archivo?',
    answer:
      'Puedes analizar tu RaidDominion.lua sin iniciar sesión. Para guardar el análisis en tu historial, validar personajes y publicar tu perfil o el portal de tu hermandad necesitas una cuenta.',
  },
  {
    question: '¿El archivo contiene datos privados?',
    answer:
      'El SavedVariables incluye la información que el addon registra, incluidas notas. El portal no publica notas privadas salvo que actives su visibilidad; antes de guardar puedes revisar la vista previa de lo que se mostrará.',
  },
  {
    question: '¿Puedo subir varios personajes o varios archivos?',
    answer:
      'Sí. Puedes seleccionar uno o varios archivos y el portal procesa cada personaje registrado. Para mantener el roster al día basta con volver a subir el archivo actualizado.',
  },
  {
    question: '¿Qué hago si el archivo no se procesa?',
    answer:
      'Comprueba que sea el RaidDominion.lua generado por el addon y que no supere el límite de 2 MB. Si el problema continúa, comparte el error en el Discord de la comunidad para revisarlo.',
  },
];

export const GLOSSARY: GlossaryItem[] = [
  {
    term: 'Banda',
    definition:
      'Grupo organizado de jugadores que se reúne para completar una raid. En el portal se publica con horario, gearscore mínimo, roster y reglas.',
  },
  {
    term: 'Roster',
    definition:
      'Lista de miembros de una banda o hermandad, con su clase, rol y rango. RaidDominion lo genera desde el SavedVariables.',
  },
  {
    term: 'Gearscore (GS)',
    definition:
      'Cifra de referencia del equipo de un personaje. El addon permite fijar un GS mínimo por banda para orientar las inscripciones.',
  },
  {
    term: 'SavedVariables',
    definition:
      'Archivo .lua donde World of Warcraft guarda los datos de un addon al cerrar el juego. El de RaidDominion se llama RaidDominion.lua.',
  },
  {
    term: 'Hermandad',
    definition:
      'Guild o comunidad de jugadores. Si su maestro sube el SavedVariables, el portal crea una página pública con roster, bandas y reglas.',
  },
  {
    term: 'iLevel',
    definition:
      'Nivel de objeto promedio del equipo de un personaje. El portal lo muestra como referencia del progreso de equipo.',
  },
  {
    term: 'Rol',
    definition:
      'Función de un jugador en la banda: tanque, sanador o daño (cuerpo a cuerpo o a distancia). El addon permite asignarlos y anunciarlos.',
  },
];
