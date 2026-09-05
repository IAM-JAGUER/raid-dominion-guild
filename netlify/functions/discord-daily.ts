// Scheduled Function de Netlify: publica mensajes automáticos IA-generados
// en Discord durante el día, usando el motor de mercadeo (_shared/marketing).
//
// Cron de disparo: cada hora (UTC). La PERIODICIDAD real la controla la env
// DISCORD_DAILY_HOURS (horas UTC en que se publica, separadas por coma);
// si la env no está configurada, se usan las horas por defecto 6,10,14,18,22
// (≈ 00-17 esMX: mañana, mediodía, tarde y noche). Así se cambia la cadencia
// sin tocar código ni redeployar.
//
// Flujo:
//   1. Comprueba si la hora UTC actual está habilitada (DISCORD_DAILY_HOURS).
//   2. Lee contexto público de la comunidad (tablas raiddominion_*).
//   3. El motor evalúa objetivos, genera un mensaje dinámico enfocado a la
//      conversión y lo publica en el webhook público de Discord.
//   4. Nunca lanza: ante fallo responde { ok: false } y loguea.
import { buildCommunityContext, contextToText } from './_shared/context';
import { runMarketing } from './_shared/marketing';
import { env } from './_shared/env';

export const config = {
  // Disparo horario; qué horas sí publican lo decide DISCORD_DAILY_HOURS.
  schedule: '0 * * * *',
};

// Horas UTC (separadas por coma) en las que el daily SÍ publica.
const DEFAULT_HOURS = [6, 10, 14, 18, 22];

function enabledHours(): number[] {
  const raw = env('DISCORD_DAILY_HOURS');
  if (!raw) return DEFAULT_HOURS;
  const hours = raw
    .split(',')
    .map((h) => Number.parseInt(h.trim(), 10))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length > 0 ? hours : DEFAULT_HOURS;
}

export default async (): Promise<Response> => {
  try {
    const currentHour = new Date().getUTCHours();
    if (!enabledHours().includes(currentHour)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, hour: currentHour, enabledHours: enabledHours() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const ctx = await buildCommunityContext();

    const outcome = await runMarketing({
      eje: 'jugadores',
      canal: 'prod',
      send: true,
      communityText: contextToText(ctx),
    });

    return new Response(
      JSON.stringify({ ok: true, sent: outcome.sent, length: outcome.message.length, goals: outcome.goals.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('discord-daily:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
