// Registro de visitas a las secciones del portal, estilo guild-portal.
// El beacon del Layout (Layout.astro) hace POST /api/visit con
// { path, page, visitorId } al cargar cada página. Esta función:
//   1. Filtra tráfico LOCAL: no se registran visitas de localhost, IPs
//      privadas/RFC1918/link-local ni las IPs de la env RD_IGNORED_IPS
//      ("mi IP"). Así tu propio navegador (dev o LAN) jamás infla las
//      métricas ni avisa al canal admin.
//   2. Registra la visita en raiddominion_visits vía RPC SECURITY DEFINER
//      (única vía de escritura; RLS bloquea el acceso directo).
//   3. Si el RPC dice "notify" (1ª visita de ese visitante a esa sección en
//      una ventana de 60 min), avisa al CANAL ADMIN de Discord
//      (DISCORD_TEST_WEBHOOK_URL). Sin webhook, omite: nunca falla la página.
//
// POST /api/visit
// body: { path: string, page?: string, visitorId?: string }
// Devuelve: { ok, notify } | { ok: true, skipped: true }
import { rpc } from './_shared/supabase';
import { env } from './_shared/env';

const SITE_URL = env('SITE_URL') || 'https://raid-dominion.netlify.app';

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// IPs extra a ignorar (env RD_IGNORED_IPS, separadas por coma): p. ej. tu IP
// pública para que tu navegación a producción tampoco cuente.
function ignoredIps(): string[] {
  const raw = env('RD_IGNORED_IPS');
  return raw
    ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
}

function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  let v = ip.trim();
  if (v.startsWith('::ffff:')) v = v.slice(7);
  if (v.startsWith('[')) v = v.slice(1, -1);
  v = v.split('%')[0];
  return v.toLowerCase() || null;
}

// ¿Es tráfico local/pruebas? Loopback, RFC1918, link-local, unique-local.
function isLocalIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::' || ip === 'localhost') return true;
  if (ip.includes(':')) {
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true; // fe80::/10 link-local
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

// IP del cliente según Netlify (x-nf-client-connection-ip) o proxies.
function clientIp(req: Request): string | null {
  const raw =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('client-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    null;
  return normalizeIp(raw);
}

// Avisa al canal admin (webhook privado DISCORD_WEBHOOK_URL) con la visita bien
// presentada: IP y datos del visitante en un embed SIN logo. Nunca lanza.
async function notifyAdmin(info: {
  ip: string | null;
  path: string;
  page: string;
  visitorId: string | null;
  userAgent: string | null;
  referrer: string | null;
}): Promise<void> {
  const webhookUrl = env('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) {
    console.warn('visit: DISCORD_WEBHOOK_URL no configurada (canal admin/pruebas). Se omite el aviso.');
    return;
  }
  const label = info.page || 'Visita';
  const embedFields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: '🌐 IP', value: info.ip ?? 'desconocida', inline: true },
    { name: '🆔 Visitante', value: info.visitorId ? info.visitorId.slice(0, 8) : 'anónimo', inline: true },
    { name: '📱 Navegador', value: info.userAgent ? info.userAgent.slice(0, 160) : 'n/a', inline: false },
    {
      name: '↩ Origen',
      value: info.referrer ? info.referrer.slice(0, 200) : 'directo',
      inline: false,
    },
  ];

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'RaidDominion · Visitas',
        content: `👀 **${label}** — visita a ${info.path}`,
        embeds: [
          {
            color: 0xff8c00,
            description: `${SITE_URL}${info.path}`,
            fields: embedFields,
            footer: { text: `RaidDominion · ${new Date().toLocaleString('es-MX')} UTC` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) console.error(`visit: error HTTP ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error('visit: error de red al avisar al canal admin:', err);
  }
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
      path?: string;
      page?: string;
      visitorId?: string;
    } | null;

    const path = clean(body?.path, 512);
    const page = clean(body?.page, 128);
    const visitorId = clean(body?.visitorId, 64) || undefined;

    if (!path) {
      return new Response(JSON.stringify({ ok: false, error: 'path es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Excluye cualquier tráfico local/pruebas: loopback, IPs privadas
    // (RFC1918/link-local) y las IPs de la env RD_IGNORED_IPS ("mi IP").
    const ip = clientIp(req);
    const ignored = ignoredIps();
    if (ip && (isLocalIp(ip) || ignored.includes(ip))) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'local' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let notify = false;
    try {
      const result = await rpc<{ notify?: boolean }>('raiddominion_register_visit', {
        p_visitor_id: visitorId ?? null,
        p_path: path,
        p_page: page || null,
        p_ip: ip,
      });
      notify = Boolean(result?.notify);
    } catch (err) {
      console.error('visit: error al registrar visita:', err);
    }

    if (notify) {
      await notifyAdmin({
        ip,
        path,
        page,
        visitorId,
        userAgent: req.headers.get('user-agent'),
        referrer: req.headers.get('referer'),
      });
    }

    return new Response(JSON.stringify({ ok: true, notify }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('visit:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};