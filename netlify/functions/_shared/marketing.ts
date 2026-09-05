// Motor de mercadeo inteligente de RaidDominion.
//
// Convierte el estado real de los objetivos de la web en un mensaje de
// Discord enfocado a la conversión. Flujo por invocación:
//   1. Lee el snapshot de métricas (raiddominion_marketing_stats).
//   2. Evalúa objetivos contra el histórico persistido
//      (raiddominion_marketing_evaluate) → tendencia (up/hold/down) y
//      focus_boost (objetivo que va bajo y conviene empujar).
//   3. Groq redacta un mensaje de conversión con la data real, priorizando
//      los objetivos en foco y el eje elegido.
//   4. Publica en el webhook de Discord según canal (test/prod).
//
// Es el MISMO motor que usa el cron (discord-daily) y el panel de /admin
// (envío manual "cuando quiera"). No persiste mensajes; solo estado de
// objetivos.
import { rpc } from './supabase';
import { groqChat } from './groq';
import { env } from './env';

export type MarketingEje = 'bandas' | 'hermandades' | 'jugadores';
export type MarketingCanal = 'test' | 'prod';

// URL canónica del portal y del logo grande (sobreescribibles por env).
const SITE_URL: string = env('SITE_URL') || 'https://raid-dominion.netlify.app';
const LOGO_URL = `${SITE_URL}/logo.png`;
// Ámbar dorado del tema WoW del portal.
const EMBED_COLOR = 0xff8c00;

export interface MarketingGoal {
  goal_key: string;
  label: string;
  enabled: boolean;
  target: number;
  trend: 'up' | 'hold' | 'down';
  current_value: number;
  previous_value: number;
  focus_boost: boolean;
}

interface MarketingStats {
  uploads_sv: number;
  visitante_to_member: number;
  member_to_guild_master: number;
  guilds_public: number;
  chars_validated: number;
  players_public: number;
  players_active: number;
  visits_weekly: number;
  visitors_30d: number;
  visits_upload_7d: number;
  visits_directory_7d: number;
}

const EJE_GIROS: Record<MarketingEje, string> = {
  bandas: 'bandas y su programación de raids',
  hermandades: 'hermandades y sus comunidades',
  jugadores: 'jugadores y sus personajes activos',
};

const EJE_LLAMADA: Record<MarketingEje, string> = {
  bandas: 'registra tus bandas y deja que la comunidad encuentre tu raid',
  hermandades: 'haz público tu portal de hermandad y acerca nuevos integrantes',
  jugadores: 'valida tu personaje (≥2) y haz público tu perfil para que te encuentren',
};

// Enlace útil de la plataforma con CTA, por eje. Va en el embed (título
// clicable) y como línea markdown dentro del contenido del mensaje.
interface EjeCta {
  label: string;
  url: string;
  action: string;
}

const EJE_CTA: Record<MarketingEje, EjeCta> = {
  jugadores: {
    label: 'Sube tu SavedVariables y valida tu personaje',
    url: `${SITE_URL}/upload`,
    action: 'Activa tu perfil público para que la hermandad te encuentre',
  },
  hermandades: {
    label: 'Haz público tu portal de hermandad',
    url: `${SITE_URL}/hermandades`,
    action: 'Atrae nuevos integrantes a tu comunidad',
  },
  bandas: {
    label: 'Registra tu banda',
    url: `${SITE_URL}/bandas`,
    action: 'Deja que la comunidad encuentre tu raid',
  },
};

// Eje temático de cada objetivo (para nombrar el mensaje y la llamada a la
// acción cuando se envía un objetivo concreto desde el panel admin).
const GOAL_EJES: Record<string, MarketingEje> = {
  uploads_sv: 'jugadores',
  visitante_to_member: 'jugadores',
  member_to_guild_master: 'hermandades',
  guilds_public: 'hermandades',
  chars_validated: 'jugadores',
  players_public: 'jugadores',
  players_active: 'jugadores',
  visits_weekly: 'jugadores',
  visitors_30d: 'jugadores',
  visits_upload_7d: 'jugadores',
  visits_directory_7d: 'jugadores',
};

export function ejeForGoal(goalKey: string): MarketingEje {
  return GOAL_EJES[goalKey] ?? 'jugadores';
}

function usernameFor(eje: MarketingEje): string {
  return eje === 'bandas'
    ? 'RaidDominion · Bandas'
    : eje === 'hermandades'
      ? 'RaidDominion · Hermandades'
      : 'RaidDominion · Jugadores';
}

// Publica contenido en el webhook de Discord según canal.
//   - 'test' → webhook privado DISCORD_WEBHOOK_URL (canal admin/pruebas)
//   - 'prod' → DISCORD_PUBLIC_WEBHOOK_URL / DISCORD_WEBHOOK_URL
//              (canal público / chat general)
// Ambos canales llevan el LOGO GRANDE del portal como imagen del embed.
// La mención @everyone va SOLO en el canal público (prod); el canal
// de pruebas/admin no menciona a nadie y, si se pasa `monitor`, incluye
// la IP/UA desde la que se lanzó la prueba en el pie del embed.
// Solo el aviso de VISITAS (visit.ts → canal admin) va SIN logo.
// Devuelve el contenido final publicado (o que se publicaría). Nunca lanza.
export async function sendContent(
  eje: MarketingEje,
  body: string,
  canal: MarketingCanal,
  monitor?: { ip?: string | null; userAgent?: string | null },
): Promise<{ sent: boolean; content: string }> {
  let webhookUrl: string | undefined;
  if (canal === 'test') {
    // El canal de pruebas/admin usa DISCORD_WEBHOOK_URL (privado), el MISMO
    // webhook que recibe las visitas: 1475343307210100758.
    const { getWebhookUrl } = await import('./discord');
    webhookUrl = getWebhookUrl('private');
    if (!webhookUrl) {
      console.warn('marketing: DISCORD_WEBHOOK_URL no configurada (canal admin/pruebas). Se omite el envío de prueba.');
      return { sent: false, content: body };
    }
  } else {
    const { getWebhookUrl } = await import('./discord');
    webhookUrl = getWebhookUrl('public');
  }
  if (!webhookUrl) return { sent: false, content: body };

  const cta = EJE_CTA[eje];
  const ctaLine = `➜ **${cta.label}**: ${cta.url}`;
  // @everyone solo en el canal público (prod); en el canal de pruebas/admin
  // no se menciona a nadie para no spamear a la comunidad.
  const isProd = canal === 'prod';
  const content = isProd
    ? `@everyone\n${body.trim()}\n\n${ctaLine}`
    : `${body.trim()}\n\n${ctaLine}`;

  const embedFooter = isProd
    ? { text: 'RaidDominion · Portal comunitario' }
    : { text: `Prueba desde ${monitor?.ip ?? 'n/d'}${monitor?.userAgent ? ` · ${monitor.userAgent.slice(0, 60)}` : ''}` };

  const payload = {
    username: usernameFor(eje),
    content,
    allowed_mentions: { parse: isProd ? ['everyone'] : [] },
    embeds: [
      {
        color: EMBED_COLOR,
        title: isProd ? `🌐 ${cta.label}` : `🧪 ${cta.label}`,
        url: cta.url,
        description: cta.action,
        // El logo grande del portal va en TODOS los mensajes de mercadeo
        // (públicos y de prueba). Solo las visitas (visit.ts) van sin logo.
        image: { url: LOGO_URL },
        footer: embedFooter,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`marketing: error HTTP ${res.status}: ${errText}`);
      return { sent: false, content };
    }
    return { sent: true, content };
  } catch (err) {
    console.error('marketing: error de red al enviar:', err);
    return { sent: false, content };
  }
}

// Lee el snapshot de métricas desde la vista agregada (RLS agnóstico, solo
// conteos) y lo devuelve como objeto plano indexado por goal_key.
// PostgREST envuelve las funciones RETURNS TABLE en un array de una fila.
async function fetchStats(): Promise<Partial<MarketingStats>> {
  const data = await rpc<MarketingStats[]>('raiddominion_marketing_stats');
  return (Array.isArray(data) ? data[0] : data) ?? {};
}

// Persiste la evaluación y devuelve los objetivos actualizados.
export async function evaluateGoals(): Promise<MarketingGoal[]> {
  const stats = await fetchStats();
  const goals = await rpc<MarketingGoal[]>('raiddominion_marketing_evaluate', {
    p_stats: stats,
  });
  return Array.isArray(goals) ? goals : [];
}

// Describe brevemente el estado de los objetivos para el prompt.
function goalsToText(goals: MarketingGoal[]): string {
  const lines = goals.map((g) => {
    const estado = g.trend === 'up' ? 'en alza' : g.trend === 'down' ? 'en baja' : 'estable';
    return `- ${g.label}: ${g.current_value} (objetivo ${g.target}) · ${estado}${g.focus_boost ? ' · PRIORIZAR' : ''}`;
  });
  return lines.join('\n');
}

export interface MarketingOutcome {
  message: string;
  goals: MarketingGoal[];
  eje: MarketingEje;
  sent: boolean;
}

// Evalúa los objetivos y envía el resultado al canal elegido.
// - goalKey: si se indica, el mensaje se focaliza en ese objetivo y el eje se
//   deriva de él (bandas/hermandades/jugadores). Si no, se priorizan los
//   objetivos en focus_boost del eje indicado.
export async function runMarketing(opts: {
  eje?: MarketingEje;
  goalKey?: string;
  canal?: MarketingCanal;
  send?: boolean;
  communityText?: string;
  monitor?: { ip?: string | null; userAgent?: string | null };
}): Promise<MarketingOutcome> {
  const canal: MarketingCanal = opts.canal ?? 'prod';
  const goals = await evaluateGoals();

  let eje: MarketingEje;
  let focusText: string;
  if (opts.goalKey) {
    eje = ejeForGoal(opts.goalKey);
    const g = goals.find((x) => x.goal_key === opts.goalKey)
      ?? goals.find((x) => x.enabled);
    focusText = g ? `${g.label} (actual ${g.current_value} de objetivo ${g.target})` : opts.goalKey;
  } else {
    eje = opts.eje ?? 'jugadores';
    const inFocus = goals.filter((g) => g.focus_boost && g.enabled);
    focusText = inFocus.length > 0
      ? inFocus.map((g) => g.label).join(', ')
      : goals.filter((g) => g.enabled && g.trend === 'up').slice(0, 1).map((g) => g.label).join(', ') || 'crecimiento sostenido';
  }

  const ctx = opts.communityText || '';
  const prompt = [
    `Eres el estratega de comunidad de RaidDominion, un addon para World of Warcraft 3.3.5a (WotLK).`,
    `Tu prioridad estratégica es generar NUEVOS USUARIOS del addon, CONTENIDO para el ecosistema y TRÁFICO ORGÁNICO (nuevas visitas y visitantes únicos según las estadísticas de visitas): descargas y uso del addon, subidas de SavedVariables, personajes validados, bandas/hermandades registradas y más gente llegando a la web. No persigas solo visibilidad: empuja a dar el siguiente paso práctico.`,
    `Redacta un mensaje para Discord (#general) ENFOCADO A LA CONVERSIÓN: 1 línea de apertura con gancho, máximo 3 viñetas cortas y una llamada a la acción final.`,
    `Formato atractivo y balanceado: usa negritas para resaltar las cifras o el paso clave, sin exagerar el relleno. Iconos con mesura: entre 1 y 3 emojis como máximo, colocados en puntos clave, nunca más de 2 seguidos.`,
    `NO incluyas URLs ni enlaces: el enlace de la plataforma con su CTA se agrega automáticamente al mensaje. Menciónalo de forma natural ("entra al portal", "súbela ahora") sin inventar rutas.`,
    `Objetivos de la plataforma (estado real):`,
    goalsToText(goals),
    '',
    `Esta invocación debe dar visibilidad y empujar a: ${focusText}.`,
    `Tema: ${EJE_GIROS[eje]}.`,
    `Llamada a la acción sugerida: ${EJE_LLAMADA[eje]}.`,
    ctx ? `Contexto de la comunidad (usa cifras/nombres reales cuando aplique, no inventes):\n${ctx}` : '',
    'Devuelve SOLO el cuerpo del mensaje (sin "Hola @everyone", el cuerpo empieza con el gancho), sin razonamientos previos, encabezados ni explicaciones.',
    'Cierra con una frase corta, sin hashtags, con tono de hermandad y energía.',
  ].filter((l) => l).join('\n');
  const body = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.85, maxTokens: 400 });

  let sent = false;
  let message = body;
  if (opts.send !== false) {
    const result = await sendContent(eje, body, canal, opts.monitor);
    sent = result.sent;
    message = result.content;
  }

  return { message, goals, eje, sent };
}

export { EJE_GIROS, EJE_LLAMADA };