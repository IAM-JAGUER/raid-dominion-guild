-- ============================================================
-- RaidDominion Portal — Páginas públicas (Fase 3)
-- 1) Perfil de jugador con slug público (/p/:slug) y lectura
--    pública cuando el member lo publica.
-- 2) Snapshot del portal de hermandad en raiddominion_guild_config
--    (config_key='portal_snapshot') + INSERT para el owner.
-- ============================================================

-- ─── Slug público de perfil ────────────────────────────────────────────
ALTER TABLE public.raiddominion_profiles
    ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_raiddominion_profiles_slug
    ON public.raiddominion_profiles(slug)
    WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raiddominion_profiles_is_public_slug
    ON public.raiddominion_profiles(is_public, slug);

-- ─── RLS: perfil visible al dueño o si está publicado ──────────────────
DROP POLICY IF EXISTS raiddominion_profiles_select_own ON public.raiddominion_profiles;
CREATE POLICY raiddominion_profiles_select_visible ON public.raiddominion_profiles
    FOR SELECT USING (auth.uid() = id OR is_public = TRUE);

-- ─── RLS: owner puede escribir el snapshot de su portal ────────────────
DROP POLICY IF EXISTS raiddominion_guild_config_insert_owner ON public.raiddominion_guild_config;
CREATE POLICY raiddominion_guild_config_insert_owner ON public.raiddominion_guild_config
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.raiddominion_guilds g
            WHERE g.id = guild_id AND g.owner_id = auth.uid()
        )
    );

-- ─── RPC: asegura slug único del propio perfil (SECURITY DEFINER) ──────
CREATE OR REPLACE FUNCTION public.raiddominion_ensure_profile_slug()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    i INT := 1;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT slug INTO candidate
    FROM public.raiddominion_profiles
    WHERE id = auth.uid();

    IF candidate IS NOT NULL AND candidate <> '' THEN
        RETURN candidate;
    END IF;

    SELECT lower(
        regexp_replace(
            coalesce(nullif(display_name, ''), nullif(character_name, ''), 'jugador'),
            '[^a-zA-Z0-9]+', '-', 'g'
        )
    ) INTO base
    FROM public.raiddominion_profiles
    WHERE id = auth.uid();

    base := btrim(coalesce(base, 'jugador'), '-');
    IF base = '' THEN
        base := 'jugador';
    END IF;
    base := left(base, 48);
    candidate := base;

    WHILE EXISTS (
        SELECT 1 FROM public.raiddominion_profiles
        WHERE slug = candidate
    ) LOOP
        i := i + 1;
        candidate := base || '-' || i::text;
    END LOOP;

    UPDATE public.raiddominion_profiles
    SET slug = candidate, updated_at = timezone('utc'::text, now())
    WHERE id = auth.uid();

    RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_ensure_profile_slug() TO authenticated;