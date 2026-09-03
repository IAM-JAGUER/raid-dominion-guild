// Scheduled Function de Netlify: publica mensajes automáticos IA-generados
// en Discord durante el día.
//
// Cron en UTC (espacio esMX): mañana, mediodía, tarde y noche.
// El body de una invocación programada trae { next_run } (ISO-8601).
//
// Flujo:
//   1. Lee contexto público de la comunidad (tablas raiddominion_*).
//   2. Groq redacta un mensaje corto con ese contexto real.
//   3. Se publica en el webhook público de Discord (o el privado si no hay).
//   4. Nunca lanza: ante fallo de Groq/Discord responde { ok: false } y loguea.
import { buildCommunityContext, contextToText } from './_shared/context';
import { groqChat } from './_shared/groq';
import { sendDiscord } from './_shared/discord';

export const config = {
  // Cada 4 horas desde las 06:00 UTC (06, 10, 14, 18, 22 UTC ≈ 00-17 esMX).
  schedule: '0 6,10,14,18,22 * * *',
};

// Saludos por franja horaria UTC.
function greetingForHour(hour: number): string {
  if (hour >= 6 && hour < 12) return 'buenos días';
  if (hour >= 12 && hour < 18) return 'buenas tardes';
  if (hour >= 18 && hour < 24) return 'buenas noches';
  return 'buen amanecer';
}

export default async (): Promise<Response> => {
  try {
    const ctx = await buildCommunityContext();
    const now = new Date();
    const hour = now.getUTCHours();
    const dayName = now.toLocaleDateString('es-ES', { weekday: 'long' });

    const prompt = [
      `Eres el cronista de la comunidad de RaidDominion, un addon para World of Warcraft 3.3.5a (WotLK).`,
      `Escribe un mensaje corto y cálido (máximo 3-4 frases) para el Discord de la comunidad.`,
      `Es ${dayName} y ${greetingForHour(hour)}.`,
      `Usa datos REALES de la comunidad para darle vida (menciona cifras o nombres cuando aplique):`,
      contextToText(ctx),
      '',
      'No inventes datos. Mantén el tono de hermandad, cercano y con energía WoW.',
      'No uses hashtags. Termina con una frase de cierre breve.',
    ].join('\n');

    const message = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.9, maxTokens: 350 });

    const ok = await sendDiscord(
      {
        username: 'RaidDominion',
        content: message,
      },
      'public',
    );

    return new Response(JSON.stringify({ ok, sent: ok, length: message.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('discord-daily:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};