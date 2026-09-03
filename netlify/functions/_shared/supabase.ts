// Cliente REST de Supabase (PostgREST) para Netlify Functions.
//
// Usa fetch directo (sin @supabase/supabase-js): evita la dependencia de
// WebSocket nativo (Node 22+) que exige supabase-js v2.112+ y que en Netlify
// (Node 20) rompe la función con 500. Además es más ligero.
//
// Anon key + RLS activa: solo lee datos públicos (is_public = TRUE). Nunca usa
// service_role. `Accept-Profile`/`Content-Profile: public` es requerido porque
// la instancia comparte esquema con otras apps (patrón de src/lib/supabase.ts).
import { env } from './env';

function getUrl(): string {
  const url = env('VITE_SUPABASE_URL');
  if (!url) throw new Error('Falta VITE_SUPABASE_URL en las env de la función.');
  return url;
}

function getKey(): string {
  const key = env('VITE_SUPABASE_ANON_KEY');
  if (!key) throw new Error('Falta VITE_SUPABASE_ANON_KEY en las env de la función.');
  return key;
}

function headers(): Record<string, string> {
  const key = getKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
    'Content-Type': 'application/json',
  };
}

async function check(res: Response, ctx: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${ctx} (${res.status}): ${text}`);
  }
}

// SELECT tipado a una tabla pública. `params` es la query string de PostgREST
// (select=..., is_public=eq.true, order=..., limit=...). Devuelve el array crudo.
export async function selectFrom<T = Record<string, unknown>>(table: string, params: string): Promise<T[]> {
  const res = await fetch(`${getUrl()}/rest/v1/${table}?${params}`, { headers: headers() });
  await check(res, `SELECT ${table}`);
  return (await res.json()) as T[];
}

// RPC (SECURITY DEFINER) público, p. ej. raiddominion_public_stats.
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getUrl()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args ?? {}),
  });
  await check(res, `RPC ${fn}`);
  return (await res.json()) as T;
}