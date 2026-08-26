-- ============================================================
-- RaidDominion Portal — Ficha pública POR PERSONAJE (/personaje/:slug)
--
-- PROBLEMA: el perfil público (/p/:slug) resolvía al USUARIO y el card
-- principal usaba profile.character_name (el último personaje subido).
-- El slug del personaje identifica a UN personaje concreto.
--
-- Cambios:
--   1) raiddominion_characters.slug (text, unique parcial): hex-8 corto,
--      generado por RPC idempotente. Nunca depende del último SV subido.
--   2) RPC raiddominion_ensure_character_slug(): asigna slug hex-8 único a
--      todos los personajes PROPIOS (idempotente); devuelve [{id, slug}].
--      Solo toca personajes públicos o propios (nunca de otra cuenta).
--   3) RLS de lectura: visible al dueño o si is_public=TRUE (el dueño lo
--      publica). Vista raiddominion_character_public (security_invoker)
--      para resolver el personaje + su dueño (perfil público) en UNA
--      consulta sin FK cruzada (los uploads pueden preceder al perfil).
--   4) Backfill: los públicos actuales quedan enlazables de inmediato.
-- ============================================================

-- ─── Slug público del personaje ──────────────────────────────────────────
ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_raiddominion_characters_slug
    ON public.raiddominion_characters(slug)
    WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raiddominion_characters_public_slug
    ON public.raiddominion_characters(is_public, slug)
    WHERE slug IS NOT NULL;

-- ─── RLS: dueño o público (el dueño permite con is_public) ───────────────
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
        WHERE tablename = 'raiddominion_characters'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.raiddominion_characters', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY raiddominion_characters_select_visible ON public.raiddominion_characters
    FOR SELECT USING (auth.uid() = user_id OR is_public = TRUE);

-- ─── Vista pública: personaje + dueño (perfil) en una consulta ───────────
-- security_invoker: el RLS de raiddominion_characters y de
-- raiddominion_profiles aplica con el rol que consulta. Un perfil privado
-- devuelve columnas profile_* NULL (LEFT JOIN filtrado por RLS), no filtra
-- el personaje público.
DROP VIEW IF EXISTS public.raiddominion_character_public;
CREATE VIEW public.raiddominion_character_public
WITH (security_invoker = true)
AS
SELECT
    c.id,
    c.user_id,
    c.sv_upload_id,
    c.slug,
    c.name,
    c.realm,
    c.class,
    c.class_file,
    c.race,
    c.race_file,
    c.level,
    c.talent_spec,
    c.avg_ilvl,
    c.equipment,
    c.is_public,
    c.member_verified,
    c.sv_guild_name,
    c.sv_guild_rank,
    c.sv_is_gm,
    c.created_at,
    c.updated_at,
    p.id AS profile_id,
    p.slug AS profile_slug,
    p.display_name AS profile_display_name,
    p.character_name AS profile_character_name,
    p.realm AS profile_realm,
    p.role AS profile_role,
    p.is_guild_master AS profile_is_guild_master,
    p.is_public AS profile_is_public
FROM public.raiddominion_characters c
LEFT JOIN public.raiddominion_profiles p ON p.id = c.user_id;

GRANT SELECT ON public.raiddominion_character_public TO anon, authenticated;

-- ─── RPC: slug hex-8 único para personajes propios (SECURITY DEFINER) ────
DROP FUNCTION IF EXISTS public.raiddominion_ensure_character_slug();
CREATE OR REPLACE FUNCTION public.raiddominion_ensure_character_slug()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_char RECORD;
    v_slug TEXT;
    v_out JSONB := '[]'::jsonb;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Idempotente: conserva slugs existentes; solo crea los que faltan.
    -- Alcance: personajes PROPIOS (públicos o no), jamás de otra cuenta.
    FOR v_char IN
        SELECT id, slug FROM public.raiddominion_characters
        WHERE user_id = v_user
    LOOP
        v_slug := v_char.slug;
        IF v_slug IS NULL OR v_slug = '' THEN
            LOOP
                v_slug := left(md5(gen_random_uuid()::text), 8);
                EXIT WHEN NOT EXISTS (
                    SELECT 1 FROM public.raiddominion_characters WHERE slug = v_slug
                );
            END LOOP;
            UPDATE public.raiddominion_characters
            SET slug = v_slug, updated_at = timezone('utc'::text, now())
            WHERE id = v_char.id;
        END IF;
        v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_char.id, 'slug', v_slug));
    END LOOP;

    RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_ensure_character_slug() TO authenticated;

-- ─── Backfill: personajes públicos actuales quedan enlazables ────────────
DO $$
DECLARE c RECORD;
    v_slug TEXT;
BEGIN
    FOR c IN
        SELECT id FROM public.raiddominion_characters
        WHERE (slug IS NULL OR slug = '') AND is_public = TRUE
    LOOP
        LOOP
            v_slug := left(md5(gen_random_uuid()::text), 8);
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM public.raiddominion_characters WHERE slug = v_slug
            );
        END LOOP;
        UPDATE public.raiddominion_characters
        SET slug = v_slug, updated_at = timezone('utc'::text, now())
        WHERE id = c.id;
    END LOOP;
END $$;