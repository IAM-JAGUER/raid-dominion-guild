// Cliente Supabase server-side para Netlify Functions.
//
// Usa la MISMA anon key que el frontend (VITE_*) → RLS activo: las funciones
// SOLO pueden leer datos públicos (is_public = TRUE), nunca datos privados.
// No usar service_role aquí (rompería RLS y expondría datos de otras apps).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en las env de la función.');
  }

  client = createClient(url, key);
  return client;
}