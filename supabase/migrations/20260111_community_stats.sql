-- ============================================================
-- RaidDominion Portal — Estadísticas públicas de comunidad
-- Indicador del hero: hermandades públicas + personajes validados.
-- SECURITY DEFINER para agregar SIN abrir RLS ni exponer datos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.raiddominion_public_stats()
RETURNS TABLE(guilds BIGINT, characters BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.raiddominion_guilds WHERE is_public = TRUE),
        (SELECT COUNT(*) FROM public.raiddominion_characters WHERE member_verified = TRUE);
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_public_stats() TO anon, authenticated;