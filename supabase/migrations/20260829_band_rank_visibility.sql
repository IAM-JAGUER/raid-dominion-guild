-- ============================================================
-- RaidDominion Portal — Visibilidad y control de bandas
--
-- Integra las bandas de un líder de banda en el portal de su
-- hermandad cuando su RANGO (por índice, no por label) está
-- autorizado por el maestro, y permite ocultar número y lista
-- de jugadores al público de forma global por banda.
--
-- Columnas nuevas en raiddominion_bands:
--   * owner_rank_index  INT  — índice del rango del dueño dentro de la
--     hermandad (registry.guild.rankIndex del SV; 0 = líder). Se persiste
--     en el upsert y NO se pisa en re-uploads que no lo traigan.
--   * hide_players      BOOL — oculta número y lista de jugadores al
--     público en TODOS los sitios (global). Decisión del líder de banda.
--   * is_rank_integrated BOOL — true si el dueño tiene un rango autorizado
--     por el GM y por tanto la banda cuenta/se muestra en el portal de la
--     hermandad. Se recalcula al guardar la política y en el upsert.
--
-- Almacén de política del GM en raiddominion_guild_config:
--   config_key='band_rank_policy'  →  { authorized_rank_indices: [0,1,2] }
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_ en TODO. SECURITY DEFINER +
-- SET search_path='' + GRANT EXECUTE TO authenticated en los RPCs.
-- ============================================================

-- ─── 1) Columnas nuevas en raiddominion_bands ──────────────────────────
ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS owner_rank_index INT,
    ADD COLUMN IF NOT EXISTS hide_players BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_rank_integrated BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2) upsert_bands v2: persiste owner_rank_index del dueño ───────────
-- El RPC recibe p_owner_rank_index (registry.guild.rankIndex del SV; NULL
-- si el dueño no pertenece a una hermandad o el SV no lo trae). En cada
-- upsert se actualiza owner_rank_index y se re-evalúa is_rank_integrated
-- contra la política vigente de la hermandad asociada. NUNCA se pisan
-- hide_players (decisión del líder) en re-uploads.
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
    v_is_public BOOLEAN;
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

    -- Visibilidad espejo: perfil del owner (fallback si no hay guild)
    SELECT is_public INTO v_is_public
    FROM public.raiddominion_profiles
    WHERE id = v_user;
    v_is_public := COALESCE(v_is_public, FALSE);

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

        -- Visibilidad: espejo de la guild si hay, si no del perfil
        IF v_guild_id IS NOT NULL THEN
            SELECT COALESCE(is_public, FALSE) INTO v_is_public
            FROM public.raiddominion_guilds WHERE id = v_guild_id;
        END IF;

        -- ¿Integra la banda al portal? Solo si el dueño tiene un rango
        -- autorizado (por índice) en la hermandad asociada. Sin política
        -- configurada el default es [0] (el maestro integra sus bandas),
        -- preservando el comportamiento previo del snapshot para el GM.
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
                v_is_public,
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
                is_public = v_is_public,
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

-- ─── 3) RPC raiddominion_set_band_rank_policy ──────────────────────────
-- El GM autoriza qué índices de rango integran bandas al portal. Guarda en
-- raiddominion_guild_config(config_key='band_rank_policy') y re-evalúa
-- is_rank_integrated de las bandas de la hermandad en el mismo acto.
-- Solo el owner de la hermandad puede llamarlo (verifica en el cuerpo).
DROP FUNCTION IF EXISTS public.raiddominion_set_band_rank_policy(UUID, INT[]);
CREATE OR REPLACE FUNCTION public.raiddominion_set_band_rank_policy(
    p_guild_id UUID,
    p_authorized INT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_policy JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds
        WHERE id = p_guild_id AND owner_id = v_user
    ) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    -- Normalizar: únicos, no nulos, >= 0
    SELECT COALESCE(
        jsonb_agg(DISTINCT e ORDER BY e),
        '[]'::jsonb
    ) INTO v_policy
    FROM unnest(COALESCE(p_authorized, '{}'::int[])) e
    WHERE e IS NOT NULL AND e >= 0;

    INSERT INTO public.raiddominion_guild_config (guild_id, config_key, config_value, updated_at)
    VALUES (p_guild_id, 'band_rank_policy', jsonb_build_object('authorized_rank_indices', v_policy), now())
    ON CONFLICT (guild_id, config_key)
    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now();

    -- Re-evaluar integración de todas las bandas de la hermandad
    UPDATE public.raiddominion_bands b
    SET is_rank_integrated = (
        b.owner_rank_index IS NOT NULL
        AND b.owner_rank_index = ANY(COALESCE(p_authorized, '{}'::int[]))
    )
    WHERE b.guild_id = p_guild_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_rank_policy(UUID, INT[]) TO authenticated;

-- ─── 4) RPC raiddominion_set_band_hide_players ─────────────────────────
-- El líder de banda decide ocultar (globalmente) el número y la lista de
-- jugadores de su banda al público. Solo el owner de la banda.
DROP FUNCTION IF EXISTS public.raiddominion_set_band_hide_players(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.raiddominion_set_band_hide_players(
    p_band_id UUID,
    p_hide BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    UPDATE public.raiddominion_bands
    SET hide_players = COALESCE(p_hide, FALSE), updated_at = now()
    WHERE id = p_band_id AND owner_id = v_user;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_hide_players(UUID, BOOLEAN) TO authenticated;
