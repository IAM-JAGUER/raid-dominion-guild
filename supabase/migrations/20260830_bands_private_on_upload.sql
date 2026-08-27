-- ============================================================
-- RaidDominion Portal — Las bandas del SV NO se publican solas
--
-- Decisión de producto (2026-08-30): una banda detectada en un
-- SavedVariables NO debe hacerse pública de inmediato; el dueño
-- la publica explícitamente desde su dashboard (pestaña Bandas).
-- Antes, raiddominion_upsert_bands espejaba is_public del perfil
-- del owner o de su hermandad, con lo que las bandas quedaban
-- públicas sin intervención. Además, un re-upload pisaba el
-- is_public elegido por el usuario.
--
-- Cambios:
--   1. INSERT de banda → is_public = FALSE (privada por defecto).
--   2. UPDATE de banda → se PRESERVA is_public (nunca se pisa).
--   3. Se elimina la lectura espejo de is_public (perfil/guild).
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_bands(
    p_sv_id UUID,
    p_bands JSONB,
    p_rules JSONB,
    p_owner_rank_index INT DEFAULT NULL,
    p_guild_name TEXT DEFAULT NULL
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

    -- Borrar bandas propias (sin guild) que ya no estén en este SV; las de
    -- guild se gestionan por upsert de nombre a continuación.
    DELETE FROM public.raiddominion_bands
    WHERE owner_id = v_user AND guild_id IS NULL
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
        -- configurada el default es [0] (el maestro integra sus bandas),
        -- preservando el comportamiento previo del snapshot para el GM.
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

        -- Resolver colisión de slug (idempotencia por nombre del owner primero)
        SELECT id, slug INTO v_id, v_slug
        FROM public.raiddominion_bands
        WHERE owner_id = v_user AND lower(name) = lower(v_bname)
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
                players, rules, is_public, owner_rank_index, is_rank_integrated
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
                v_integrated
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
                -- is_public se PRESERVA: la publicación es decisión del dueño
                -- en su dashboard y un re-upload jamás la pisa.
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

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT) TO authenticated;