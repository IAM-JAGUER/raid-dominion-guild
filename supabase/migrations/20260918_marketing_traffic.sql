-- ============================================================
-- RaidDominion Portal — Objetivos de tráfico orgánico
-- Ampliación del sistema de mercadeo (20260913) con métricas de
-- VISITAS (raiddominion_visits, creada por 20260915_visits.sql):
--   1) Nuevos objetivos: visits_weekly (tráfico 7d), visitors_30d
--      (alcance único), visits_upload_7d (funnel subida) y
--      visits_directory_7d (directorios públicos).
--   2) raiddominion_marketing_stats(): snapshot ampliado con las
--      estadísticas de visitas para el motor (_shared/marketing.ts).
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ DROP previo del stats(): cambia el tipo de retorno (patrón de
--    20260913); si el archivo de mercadeo ya se aplicó, esto la
--    reemplaza sin perder los objetivos existentes.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Nuevos objetivos de visitas ─────────────────────────────────────
INSERT INTO public.raiddominion_marketing (goal_key, label, target, enabled)
SELECT * FROM (VALUES
    ('visits_weekly',       'Visitas a la web (7 días)',       30, TRUE),
    ('visitors_30d',        'Visitantes únicos (30 días)',     15, TRUE),
    ('visits_upload_7d',    'Visitas a subir SV (7 días)',      6, TRUE),
    ('visits_directory_7d', 'Visitas a directorios (7 días)',   8, TRUE)
) AS v(goal_key, label, target, enabled)
WHERE NOT EXISTS (
    SELECT 1 FROM public.raiddominion_marketing WHERE goal_key = v.goal_key
);

-- ─── 2) Snapshot de métricas + visitas (solo conteos) ───────────────────
DROP FUNCTION IF EXISTS public.raiddominion_marketing_stats();
CREATE OR REPLACE FUNCTION public.raiddominion_marketing_stats()
RETURNS TABLE(
    uploads_sv BIGINT,
    visitante_to_member BIGINT,
    member_to_guild_master BIGINT,
    guilds_public BIGINT,
    chars_validated BIGINT,
    players_public BIGINT,
    players_active BIGINT,
    visits_weekly BIGINT,
    visitors_30d BIGINT,
    visits_upload_7d BIGINT,
    visits_directory_7d BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.raiddominion_saved_variables),
        (SELECT COUNT(*) FROM public.raiddominion_profiles
            WHERE role IN ('member', 'guild_master', 'moderator', 'admin')),
        (SELECT COUNT(*) FROM public.raiddominion_profiles WHERE role = 'guild_master'),
        (SELECT COUNT(*) FROM public.raiddominion_guilds WHERE is_public = TRUE),
        (SELECT COUNT(*) FROM public.raiddominion_characters WHERE member_verified = TRUE),
        (SELECT COUNT(*) FROM public.raiddominion_profiles
            WHERE is_public = TRUE AND role IN ('member', 'guild_master', 'moderator', 'admin')),
        (SELECT COUNT(DISTINCT user_id) FROM public.raiddominion_saved_variables
            WHERE parsed_at >= timezone('utc'::text, now()) - interval '7 days'),
        (SELECT COUNT(*) FROM public.raiddominion_visits
            WHERE created_at >= timezone('utc'::text, now()) - interval '7 days'),
        (SELECT COUNT(DISTINCT visitor_id) FROM public.raiddominion_visits
            WHERE visitor_id IS NOT NULL
              AND created_at >= timezone('utc'::text, now()) - interval '30 days'),
        (SELECT COUNT(*) FROM public.raiddominion_visits
            WHERE path LIKE '/upload%'
              AND created_at >= timezone('utc'::text, now()) - interval '7 days'),
        (SELECT COUNT(*) FROM public.raiddominion_visits
            WHERE (path = '/hermandades' OR path = '/jugadores' OR path = '/bandas'
                   OR path LIKE '/hermandad/%' OR path LIKE '/jugador/%' OR path LIKE '/banda/%')
              AND created_at >= timezone('utc'::text, now()) - interval '7 days');
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_marketing_stats() TO anon, authenticated;