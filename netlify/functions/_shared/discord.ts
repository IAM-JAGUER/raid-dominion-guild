// Helper de Discord (webhooks) para Netlify Functions.
// Usa DISCORD_WEBHOOK_URL (privado) y DISCORD_PUBLIC_WEBHOOK_URL (público),
// igual que guild-portal. Si la env no está configurada, no falla: avisa y omite.
import { env } from './env';

// Canales del Discord comunitario de RaidDominion (solo referencia):
//   - Canal admin/pruebas + visitas . 1475336305075552488  (DISCORD_WEBHOOK_URL → 1475343307210100758)
//   - Canal público / chat general .. 1432919639003758632  (DISCORD_PUBLIC_WEBHOOK_URL → 1475350391960109108)
// Un webhook se identifica por su URL completa (id + token), visible en
// Ajustes del canal → Integraciones → Webhooks → Nueva webhook → Copiar URL.
// El ID de canal no basta para publicar; los IDs de aquí sirven para verificar
// que cada entorno (test/prod) apunta al canal correcto.

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPayload {
  username?: string;
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: { parse?: string[]; users?: string[]; roles?: string[] };
}

// Devuelve el webhook a usar según el tipo: 'public' o 'private' (default).
export function getWebhookUrl(type: 'public' | 'private' = 'private'): string | undefined {
  if (type === 'public') {
    return env('DISCORD_PUBLIC_WEBHOOK_URL') || env('DISCORD_WEBHOOK_URL');
  }
  return env('DISCORD_WEBHOOK_URL') || env('DISCORD_PUBLIC_WEBHOOK_URL');
}

// Envía un mensaje al webhook. Nunca lanza: ante error de red o HTTP devuelve false.
export async function sendDiscord(payload: DiscordPayload, type: 'public' | 'private' = 'private'): Promise<boolean> {
  const webhookUrl = getWebhookUrl(type);
  if (!webhookUrl) {
    console.warn('Discord: webhook no configurado (DISCORD_WEBHOOK_URL / DISCORD_PUBLIC_WEBHOOK_URL). Se omite el envío.');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Discord: error HTTP ${response.status}: ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Discord: error de red al enviar:', err);
    return false;
  }
}