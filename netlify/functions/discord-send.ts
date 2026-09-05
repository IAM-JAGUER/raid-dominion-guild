// Endpoint de envío manual de un OBJETIVO a Discord desde el panel admin.
// Cada objetivo de mercadeo (raiddominion_marketing) tiene en el panel sus
// dos botones: canal de pruebas (test) o canal público (prod). El motor
// focaliza el mensaje en ese objetivo (generando usuarios/contenido/tráfico
// para el addon), deriva el eje temático del propio objetivo y lo publica.
// En canal 'test' el mensaje NO lleva @everyone pero SÍ lleva logo: va al
// canal admin/pruebas (DISCORD_WEBHOOK_URL) con la IP/UA de quien lo lanzó
// en el pie del embed (monitoreo).
//
// POST /api/discord-send
// body: { goal_key: string, canal: 'test' | 'prod' }
// Devuelve: { ok, sent?, message?, goals?, eje?, goal_key?, error? }
import { runMarketing, ejeForGoal, type MarketingEje, type MarketingCanal } from './_shared/marketing';

const VALID_CANALES = new Set<MarketingCanal>(['test', 'prod']);

export const config = {};

// IP del cliente según Netlify (x-nf-client-connection-ip) o proxies.
function clientIp(req: Request): string | null {
  const raw =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('client-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    null;
  return raw ? raw.trim().slice(0, 64) : null;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      goal_key?: string;
      canal?: string;
    } | null;

    const goalKey = String(body?.goal_key ?? '').trim();
    if (!goalKey) {
      return new Response(JSON.stringify({ ok: false, error: 'goal_key es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const canal: MarketingCanal = body?.canal && VALID_CANALES.has(body.canal as MarketingCanal)
      ? (body.canal as MarketingCanal)
      : 'test';

    const outcome = await runMarketing({
      goalKey,
      canal,
      send: true,
      monitor: {
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
      },
    });
    const eje: MarketingEje = ejeForGoal(goalKey);

    return new Response(
      JSON.stringify({
        ok: true,
        sent: outcome.sent,
        eje,
        goal_key: goalKey,
        message: outcome.message,
        goals: outcome.goals.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('discord-send:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};