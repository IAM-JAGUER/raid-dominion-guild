-- ============================================================
-- RaidDominion Portal — Bandas por personaje (atribución y coexistencia)
--
-- Decisión de producto (2026-08-31): las bandas detectadas en un
-- SavedVariables se gestionan POR PERSONAJE (no por account). Así:
--   * Cada personaje/cuenta maneja SOLO sus propias bandas; la subida
--     de un personaje rank > 0 NUNCA borra ni pisa las bandas del
--     maestro ni de otros personajes (bug: una subida de otro rango
--     barria las bandas previamente establecidas).
--   * Se distingue "de quién es cada banda" (character_name/realm).
--   * La integración al portal sigue siendo decisión del GM vía la
--     política de rangos (band_rank_policy); el portal solo muestra
--     bandas integradas Y públicas.
--
-- Cambios:
--   1. Columnas character_name / character_realm en raiddominion_bands
--      (personaje que subió la banda; NULL para bandas legacy).
--   2. raiddominion_upsert_bands recibe p_character_name / p_character_realm:
--      el DELETE y el match de upsert se acotan por personaje; el INSERT
--      guarda la atribución.
--   3. Se mantiene is_public = FALSE en INSERT y se PRESERVA en UPDATE
--      (20260830): la publicación es decisión del dueño en su dashboard.
-- ============================================================

ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS character_name TEXT,
    ADD COLUMN IF NOT EXISTS character_realm TEXT;

-- Índice para el match por personaje (idempotencia del upsert)
CREATE INDEX IF NOT EXISTS idx_raiddominion_bands_owner_character
    ON public.raiddominion_bands(owner_id, character_name, character_realm);

DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_bands(
    p_sv_id UUID,
    p_bands JSONB,
    p_rules JSONB,
    p_owner_rank_index INT DEFAULT NULL,
    p_guild_name TEXT DEFAULT NULL,
    p_character_name TEXT DEFAULT NULL,
    p_character_realm TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner_slug TEXT;
    v_band JSONB;
    v_bname TEXT;
    v_guild_id UUID;
    v_guild_slug TEXT;
    v_guild_match TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_count INT := 0;
    v_id UUID;
    v_policy JSONB;
    v_authorized INT[];
    v_integrated BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    -- El SV debe pertenecer al usuario
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_saved_variables
        WHERE id = p_sv_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'SV no pertenece al usuario';
    END IF;

    -- Slug base del owner desde su perfil (raíz de los slugs de banda)
    SELECT slug INTO v_owner_slug
    FROM public.raiddominion_profiles
    WHERE id = v_user;
    v_owner_slug := COALESCE(NULLIF(trim(v_owner_slug), ''), 'usuario');

    -- Borrar SOLO las bandas personales de ESTE PERSONAJE que ya no estén
    -- en su SV. Las de otros personajes (GM incluido) y las de hermandad
    -- (guild_id IS NOT NULL) quedan intactas: cada subida gestiona lo suyo.
    DELETE FROM public.raiddominion_bands
    WHERE owner_id = v_user
      AND COALESCE(character_name, '') = COALESCE(p_character_name, '')
      AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
      AND guild_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) AS b
          WHERE lower(trim(b->>'name')) = lower(name)
      );

    FOR v_band IN SELECT * FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) LOOP
        v_bname := NULLIF(trim(v_band->>'name'), '');
        CONTINUE WHEN v_bname IS NULL;

        -- Hermandad de la banda: la del dueño (registry.guild.name del SV),
        -- sea o no el owner — así las bandas de un LÍDER (no GM) se asocian
        -- a su hermandad y pueden integrarse al portal. Fallback legacy:
        -- banda cuyo nombre coincide con una hermandad (caso GM "Registrar").
        v_guild_id := NULL;
        v_guild_slug := NULL;
        v_guild_match := NULLIF(trim(COALESCE(p_guild_name, v_bname)), '');
        IF v_guild_match IS NOT NULL THEN
            SELECT g.id, g.slug INTO v_guild_id, v_guild_slug
            FROM public.raiddominion_guilds g
            WHERE lower(g.name) = lower(v_guild_match)
            ORDER BY g.created_at
            LIMIT 1;
        END IF;

        -- Slugs base: <guildSlug>-<banda> si hay guild, si no <ownerSlug>-<banda>
        v_base_slug := COALESCE(v_guild_slug, v_owner_slug);
        v_base_slug := lower(regexp_replace(trim(v_base_slug), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN v_base_slug := 'usuario'; END IF;
        v_base_slug := left(v_base_slug, 24);

        v_slug := v_base_slug || '-' || lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := btrim(v_slug, '-');
        v_slug := left(v_slug, 60);

        -- ¿Integra la banda al portal? Solo si el dueño tiene un rango
        -- autorizado (por índice) en la hermandad asociada. Sin política
        -- configurada el default es [0] (el maestro integra sus bandas).
        -- La INTEGRACIÓN es independiente de is_public: el portal solo
        -- muestra bandas integradas Y públicas (decisión del dueño).
        v_authorized := NULL;
        v_integrated := FALSE;
        IF v_guild_id IS NOT NULL AND p_owner_rank_index IS NOT NULL THEN
            SELECT config_value->'authorized_rank_indices' INTO v_policy
            FROM public.raiddominion_guild_config
            WHERE guild_id = v_guild_id AND config_key = 'band_rank_policy';
            IF v_policy IS NOT NULL AND jsonb_typeof(v_policy) = 'array' THEN
                SELECT ARRAY(
                    SELECT (e::text)::int
                    FROM jsonb_array_elements(v_policy) e
                ) INTO v_authorized;
            ELSE
                v_authorized := ARRAY[0];
            END IF;
            IF p_owner_rank_index = ANY(v_authorized) THEN
                v_integrated := TRUE;
            END IF;
        END IF;

        -- Resolver colisión: la idempotencia es POR PERSONAJE (el mismo
        -- personaje que ya subió la banda la actualiza, nunca otro).
        SELECT id, slug INTO v_id, v_slug
        FROM public.raiddominion_bands
        WHERE owner_id = v_user
          AND COALESCE(character_name, '') = COALESCE(p_character_name, '')
          AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
          AND lower(name) = lower(v_bname)
        ORDER BY created_at
        LIMIT 1;
        IF NOT FOUND THEN
            v_i := 1;
            v_slug := v_base_slug || '-' || lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g'));
            v_slug := btrim(v_slug, '-');
            v_slug := left(v_slug, 60);
            WHILE EXISTS (SELECT 1 FROM public.raiddominion_bands WHERE slug = v_slug) LOOP
                v_i := v_i + 1;
                v_slug := left(v_base_slug, 24) || '-' ||
                          lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || v_i::text;
                v_slug := btrim(v_slug, '-');
                v_slug := left(v_slug, 60);
            END LOOP;
            INSERT INTO public.raiddominion_bands (
                owner_id, guild_id, slug, name, icon, schedule, min_gs,
                players, rules, is_public, owner_rank_index, is_rank_integrated,
                character_name, character_realm
            )
            VALUES (
                v_user, v_guild_id, v_slug, v_bname,
                NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                (v_band->>'minGS')::numeric,
                COALESCE(v_band->'players', '[]'::jsonb),
                COALESCE(p_rules, '[]'::jsonb),
                FALSE,
                p_owner_rank_index,
                v_integrated,
                NULLIF(trim(p_character_name), ''),
                NULLIF(trim(p_character_realm), '')
            )
            RETURNING id INTO v_id;
        ELSE
            UPDATE public.raiddominion_bands SET
                guild_id = v_guild_id,
                slug = v_slug,
                icon = NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                schedule = NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                min_gs = (v_band->>'minGS')::numeric,
                players = COALESCE(v_band->'players', '[]'::jsonb),
                rules = COALESCE(p_rules, '[]'::jsonb),
                -- is_public y la atribución del personaje se PRESERVAN.
                owner_rank_index = COALESCE(p_owner_rank_index, owner_rank_index),
                is_rank_integrated = CASE
                    WHEN v_guild_id IS NULL OR p_owner_rank_index IS NULL THEN is_rank_integrated
                    ELSE v_integrated
                END,
                updated_at = now()
            WHERE id = v_id;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT) TO authenticated;