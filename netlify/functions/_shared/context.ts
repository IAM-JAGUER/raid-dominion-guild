// Contexto de comunidad para prompts de IA: fotografía compacta y pública
// de las tablas raiddominion_* que alimenta al chat y a los mensajes de
// Discord. Solo lee datos públicos (RLS activa vía anon key) y jamás toca
// officer_note / datos privados.
import { getSupabase } from './supabase';

export interface CommunityContext {
  stats: { guilds: number; characters: number };
  guilds: Array<{ name: string; realm: string | null; faction: string | null }>;
  topCharacters: Array<{ name: string; realm: string | null; class: string | null; avg_ilvl: number | null }>;
  topBands: Array<{ name: string; realm: string | null; schedule: string | null; min_gs: number | null }>;
}

// Construye el contexto actual de la comunidad (stats + top públicos).
export async function buildCommunityContext(): Promise<CommunityContext> {
  const supabase = getSupabase();

  const [statsRes, guildsRes, charsRes, bandsRes] = await Promise.all([
    supabase.rpc('raiddominion_public_stats'),
    supabase
      .from('raiddominion_guilds')
      .select('name, realm, faction')
      .eq('is_public', true)
      .order('name', { ascending: true })
      .limit(20),
    supabase
      .from('raiddominion_characters')
      .select('name, realm, class, avg_ilvl')
      .eq('is_public', true)
      .order('avg_ilvl', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from('raiddominion_bands')
      .select('name, character_realm, schedule, min_gs')
      .eq('is_public', true)
      .limit(10),
  ]);

  const statsRow = Array.isArray(statsRes.data) ? (statsRes.data[0] as { guilds?: number; characters?: number } | undefined) : undefined;

  return {
    stats: {
      guilds: Number(statsRow?.guilds) || 0,
      characters: Number(statsRow?.characters) || 0,
    },
    guilds: (guildsRes.data as CommunityContext['guilds']) ?? [],
    topCharacters: (charsRes.data as CommunityContext['topCharacters']) ?? [],
    topBands: ((bandsRes.data as Array<{ name: string; character_realm: string | null; schedule: string | null; min_gs: number | null }>) ?? []).map((b) => ({
      name: b.name,
      realm: b.character_realm ?? null,
      schedule: b.schedule ?? null,
      min_gs: b.min_gs ?? null,
    })),
  };
}

// Serializa el contexto a texto legible para el system prompt.
export function contextToText(ctx: CommunityContext): string {
  const lines: string[] = [];
  lines.push(`Estadísticas de la comunidad: ${ctx.stats.guilds} hermandades públicas y ${ctx.stats.characters} personajes validados.`);
  if (ctx.guilds.length > 0) {
    lines.push('Hermandades públicas:');
    ctx.guilds.forEach((g) => lines.push(`- ${g.name}${g.realm ? ` (${g.realm})` : ''}${g.faction ? ` — ${g.faction}` : ''}`));
  }
  if (ctx.topCharacters.length > 0) {
    lines.push('Personajes con mayor ilvl:');
    ctx.topCharacters.forEach((c) => lines.push(`- ${c.name}${c.realm ? ` (${c.realm})` : ''}${c.class ? ` — ${c.class}` : ''}${c.avg_ilvl ? ` — ilvl ${c.avg_ilvl}` : ''}`));
  }
  if (ctx.topBands.length > 0) {
    lines.push('Bandas públicas:');
    ctx.topBands.forEach((b) => lines.push(`- ${b.name}${b.realm ? ` (${b.realm})` : ''}${b.schedule ? ` — ${b.schedule}` : ''}${b.min_gs ? ` — mínimo ${b.min_gs}` : ''}`));
  }
  return lines.join('\n');
}