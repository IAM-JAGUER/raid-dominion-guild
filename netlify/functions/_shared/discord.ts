// Helper de Discord (webhooks) para Netlify Functions.
// Usa DISCORD_WEBHOOK_URL (privado) y DISCORD_PUBLIC_WEBHOOK_URL (público),
// igual que guild-portal. Si la env no está configurada, no falla: avisa y omite.
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
}

// Devuelve el webhook a usar según el tipo: 'public' o 'private' (default).
export function getWebhookUrl(type: 'public' | 'private' = 'private'): string | undefined {
  if (type === 'public') {
    return process.env.DISCORD_PUBLIC_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  }
  return process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_PUBLIC_WEBHOOK_URL;
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