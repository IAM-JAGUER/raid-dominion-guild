import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Sin throw en import: un módulo roto mataría TODOS los scripts de la página
// (formularios caerían a submit nativo exponiendo credenciales en la URL).
//
// Prioridad del puente de entorno:
// 1. window.__RD_ENV__ (Layout.astro, necesario en dev donde import.meta.env
//    no expone VITE_* en módulos cliente)
// 2. import.meta.env.VITE_* (build de producción: reemplazo estático)
interface RdEnvBridge {
  url?: string;
  key?: string;
}

declare global {
  interface Window {
    __RD_ENV__?: RdEnvBridge;
  }
}

const bridged = typeof window !== 'undefined' ? window.__RD_ENV__ : undefined;
const supabaseUrl =
  bridged?.url || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const supabaseAnonKey =
  bridged?.key || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('RaidDominion: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisa .env y reinicia el dev server.');
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    // Este proyecto resuelve por defecto un perfil REST distinto de `public`;
    // fijamos el esquema explícitamente para tablas y RPCs.
    global: {
      headers: {
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    },
  }
);
