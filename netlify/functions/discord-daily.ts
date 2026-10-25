// Scheduled Function de Netlify: publica mensajes automáticos IA-generados
// en Discord durante el día, usando el motor de mercadeo (_shared/marketing).
//
// Cron de disparo: cada hora (UTC). La campaña está limitada a DOS mensajes
// por día; las horas salen de DISCORD_DAILY_HOURS (horas UTC separadas por
// coma). Si la env no está configurada se usan 14 y 22 UTC (≈ 08:00 y 16:00
// esMX). Si trae más de dos horas se conservan los dos extremos (la más
// temprana y la más tardía) para repartir la campaña a lo largo del día.
//
// De los dos mensajes diarios, SOLO UNO (elegido pseudoaleatoriamente por
// fecha) lleva @everyone; el otro se publica sin mención para no saturar al
// servidor. La elección es estable durante el día, así que no depende de qué
// invocación corra primero.
//
// Flujo:
//   1. Comprueba si la hora UTC actual está habilitada (DISCORD_DAILY_HOURS).
//   2. Reclama el slot de idempotencia de la ventana horaria
//      (raiddominion_cron_claim_slot): si otro disparo/reintento ya lo tomó,
//      responde skipped y NO envía → garantiza un solo mensaje por ventana.
//   3. Lee contexto público de la comunidad (tablas raiddominion_*).
//   4. El motor evalúa objetivos, genera un mensaje dinámico enfocado a la
//      conversión y lo publica en el webhook público de Discord.
//   5. Nunca lanza: ante fallo responde { ok: false } y loguea.
import { buildCommunityContext, contextToText } from './_shared/context';
import { runMarketing, type MarketingOutcome } from './_shared/marketing';
import { env } from './_shared/env';
import { rpc, deleteFrom } from './_shared/supabase';

// Slot de idempotencia: clave YYYYMMDD-HH (UTC). Garantiza que aunque
// Netlify reintente la función (at-least-once) dentro de una misma ventana
// horaria, solo una invocación publique el mensaje (raiddominion_cron_slots).
function slotKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}-${h}`;
}

export const config = {
  // Disparo horario; qué horas sí publican lo decide DISCORD_DAILY_HOURS.
  schedule: '0 * * * *',
};

// Dos mensajes diarios como máximo. 14 y 22 UTC ≈ 08:00 y 16:00 esMX.
const MAX_DAILY_MESSAGES = 2;
const DEFAULT_HOURS = [14, 22];

function enabledHours(): number[] {
  const raw = env('DISCORD_DAILY_HOURS');
  if (!raw) return DEFAULT_HOURS;
  const hours = [
    ...new Set(
      raw
        .split(',')
        .map((h) => Number.parseInt(h.trim(), 10))
        .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23),
    ),
  ].sort((a, b) => a - b);
  // Menos de dos horas configuradas: se ignora la config parcial y se usa el
  // par por defecto (la campaña siempre tiene dos ventanas diarias).
  if (hours.length < 2) return DEFAULT_HOURS;
  // Con más horas configuradas se conservan los extremos para mantener el
  // reparto a lo largo del día y no duplicar envíos.
  return [hours[0], hours[hours.length - 1]].slice(0, MAX_DAILY_MESSAGES);
}

// FNV-1a de 32 bits: elige de forma pseudoaleatoria (pero estable por día)
// cuál de los dos mensajes lleva @everyone. Cambia cada jornada y garantiza
// exactamente un mention si ambos envíos se concretan.
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mentionHour(hours: number[]): number {
  const now = new Date();
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return hours[hash32(day) % hours.length];
}

export default async (): Promise<Response> => {
  try {
    const hours = enabledHours();
    const currentHour = new Date().getUTCHours();
    if (!hours.includes(currentHour)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, hour: currentHour, enabledHours: hours }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // Solo una de las dos ventanas del día menciona a @everyone.
    const withMention = currentHour === mentionHour(hours);

    // Idempotencia: reclama el slot de esta ventana horaria. Si otro disparo
    // (o un reintento de Netlify) ya lo tomó, no enviamos de nuevo.
    const key = slotKey();
    let claimed = false;
    try {
      claimed = (await rpc<boolean>('raiddominion_cron_claim_slot', { p_key: key })) === true;
    } catch (err) {
      // Si el RPC falla (p. ej. migración aún no aplicada o fallo de red) no
      // podemos verificar el slot: preferimos PUBLICAR a quedarnos en
      // silencio. El slot se libera más abajo si el envío no se concreta.
      console.warn('discord-daily: no se pudo verificar el slot de idempotencia; se publica igual:', err);
      claimed = true;
    }
    if (!claimed) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'slot_already_claimed', slot: key }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // A partir de aquí el slot está reclamado. Si el envío no se concreta
    // (error en contexto/motor o webhook caído) liberamos el slot para que
    // la ventana no quede quemada sin mensaje publicado.
    const releaseSlot = async () => {
      try {
        await deleteFrom('raiddominion_cron_slots', `slot_key=eq.${encodeURIComponent(key)}`);
      } catch (err) {
        console.warn('discord-daily: no se pudo liberar el slot tras un envío fallido:', err);
      }
    };

    let outcome: MarketingOutcome;
    try {
      const ctx = await buildCommunityContext();

      outcome = await runMarketing({
        eje: 'jugadores',
        canal: 'prod',
        send: true,
        mention: withMention,
        communityText: contextToText(ctx),
      });
    } catch (err) {
      await releaseSlot();
      throw err;
    }

    if (!outcome.sent) {
      await releaseSlot();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: outcome.sent,
        mention: withMention,
        length: outcome.message.length,
        goals: outcome.goals.length,
      }),
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
