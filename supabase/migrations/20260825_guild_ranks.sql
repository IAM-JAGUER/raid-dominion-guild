-- ============================================================
-- RaidDominion Portal — Rangos de hermandad (registry.guild.ranks)
--
-- El addon v3 escribe registry["Nombre-Reino"].guild.ranks =
--   { { index = 0..N-1, name = "..." } } (BuildGuildRanks, RD_Utils_Registry)
-- para CUALQUIER miembro con hermandad, no solo el GM: índice 0 = líder,
-- jerarquía descendente hasta N-1. El parser lo extrae en RegistryGuild.ranks.
--
-- Este dato habilitará más adelante que un GM habilite rangos específicos
-- al publicar listas de bandas. Aquí SOLO se deja disponible en el snapshot
-- público (raiddominion_guild_config.config_key='portal_snapshot' →
-- config_value.ranks); NO se implementa todavía esa UI de permisos.
--
-- Cambios:
--   1. raiddominion_claim_from_sv persiste los ranks de cada hermandad
--      reclamada/verificada en su portal_snapshot (merge sin pisar roster).
--   2. Backfill: los portal_snapshot históricos sin 'ranks' se rellenan
--      desde el SV más reciente del dueño (match por nombre de hermandad).
-- ============================================================

-- ─── Reclamo desde el SV: persiste ranks en el snapshot público ───────────
-- Replica 20260825_claim_gm_guard.sql (antifalso-positivo + sin reclamo
-- manual) y añade la persistencia de registry.guild.ranks.
CREATE OR REPLACE FUNCTION public.raiddominion_claim_from_sv(p_sv_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_raw JSONB;
    v_primary UUID;
    v_candidates JSONB;
    v_cand JSONB;
    v_rg JSONB;
    v_p JSONB;
    v_guild_name TEXT;
    v_realm TEXT;
    v_faction TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_guild_id UUID;
    v_skipped_other_gm INT := 0;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- member (validado) y guild_master pueden reclamar: un maestro puede
    -- reclamar una segunda hermandad en un re-upload.
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado.';
    END IF;
    IF v_role NOT IN ('member', 'guild_master') THEN
        RAISE EXCEPTION 'Requiere ser Miembro o Maestro de Hermandad.';
    END IF;

    -- El SV debe pertenecer al usuario
    SELECT raw INTO v_raw
    FROM public.raiddominion_saved_variables
    WHERE id = p_sv_id AND user_id = v_user AND raw IS NOT NULL
    LIMIT 1;
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'SV no encontrado en tu historial.';
    END IF;

    -- Candidatas: todas las hermandades del SV donde isGM=true.
    -- Formato v3: registries[*].guild ; fallback plano: registryGuild.
    IF jsonb_typeof(v_raw -> 'registries') = 'array' THEN
        SELECT jsonb_agg(jsonb_build_object('guild', e -> 'guild', 'player', e -> 'player'))
        INTO v_candidates
        FROM jsonb_array_elements(v_raw -> 'registries') AS e
        WHERE e -> 'guild' ? 'name'
          AND COALESCE((e -> 'guild' ->> 'isGM')::boolean, FALSE) = TRUE;
    END IF;
    IF v_candidates IS NULL
       AND v_raw -> 'registryGuild' ? 'name'
       AND COALESCE((v_raw -> 'registryGuild' ->> 'isGM')::boolean, FALSE) = TRUE THEN
        v_candidates := jsonb_build_array(jsonb_build_object(
            'guild', v_raw -> 'registryGuild', 'player', v_raw -> 'player'));
    END IF;

    IF v_candidates IS NULL OR jsonb_array_length(v_candidates) = 0 THEN
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    FOR v_cand IN SELECT value FROM jsonb_array_elements(v_candidates) LOOP
        v_rg := v_cand -> 'guild';
        v_guild_name := trim(COALESCE(v_rg ->> 'name', ''));
        CONTINUE WHEN v_guild_name = '' OR length(v_guild_name) < 2;

        -- ¿Ya reclamada por este dueño (mismo nombre)? Re-verifica y sigue.
        SELECT id INTO v_guild_id
        FROM public.raiddominion_guilds
        WHERE owner_id = v_user AND lower(name) = lower(v_guild_name)
        ORDER BY created_at
        LIMIT 1;
        IF FOUND THEN
            UPDATE public.raiddominion_guilds
            SET realm = COALESCE(NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), ''), realm),
                claim_status = 'verified',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_guild_id;
            PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');
            IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;
            CONTINUE;
        END IF;

        -- Facción del personaje dueño de ese registro (mapa characters)
        v_p := v_cand -> 'player';
        v_faction := NULL;
        IF v_p ? 'name' AND jsonb_typeof(v_raw -> 'characters') = 'object' THEN
            SELECT value ->> 'faction' INTO v_faction
            FROM jsonb_each(v_raw -> 'characters')
            WHERE lower(split_part(key, '-', 1)) = lower(v_p ->> 'name')
              AND (NULLIF(trim(COALESCE(v_p ->> 'realm', '')), '') IS NULL
                   OR lower(COALESCE(value ->> 'realm', '')) = lower(v_p ->> 'realm'))
            LIMIT 1;
        END IF;
        v_faction := NULLIF(trim(COALESCE(v_faction, '')), '');

        v_realm := NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), '');
        IF v_realm IS NULL AND v_p ? 'realm' THEN
            v_realm := NULLIF(trim(v_p ->> 'realm'), '');
        END IF;

        -- ANTIFALSO-POSITIVO: si OTRO maestro ya registró una hermandad con
        -- este nombre, el candidato se descarta (nunca se crea un duplicado).
        -- La coincidencia es por nombre insensible a mayúsculas; si el SV
        -- aporta reino, se exige que el existente no tenga reino o lo iguale.
        IF EXISTS (
            SELECT 1 FROM public.raiddominion_guilds
            WHERE owner_id <> v_user
              AND lower(name) = lower(v_guild_name)
              AND (v_realm IS NULL
                   OR NULLIF(realm, '') IS NULL
                   OR lower(realm) = lower(v_realm))
        ) THEN
            v_skipped_other_gm := v_skipped_other_gm + 1;
            INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
            VALUES (v_user, 'guild_claim_skipped_existing_gm', v_guild_name,
                    jsonb_build_object('sv', p_sv_id, 'reason', 'gm ya registrado'));
            CONTINUE;
        END IF;

        -- Slug desde el nombre REAL; colisiones con sufijo
        v_base_slug := lower(regexp_replace(trim(v_guild_name), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN CONTINUE; END IF;
        v_base_slug := left(v_base_slug, 40);
        v_slug := v_base_slug;
        v_i := 1;
        WHILE EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE slug = v_slug) LOOP
            v_i := v_i + 1;
            v_slug := v_base_slug || '-' || v_i::text;
        END LOOP;

        INSERT INTO public.raiddominion_guilds (
            slug, name, realm, faction, owner_id, claim_status, is_public
        )
        VALUES (v_slug, v_guild_name, v_realm, v_faction, v_user, 'verified', FALSE)
        RETURNING id INTO v_guild_id;

        PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');

        IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'guild_claim_from_sv', v_guild_id::text,
                jsonb_build_object('sv', p_sv_id, 'slug', v_slug,
                                   'guild', v_guild_name));
    END LOOP;

    IF v_primary IS NULL THEN
        IF v_skipped_other_gm > 0 THEN
            RAISE EXCEPTION 'Esa hermandad ya tiene un maestro registrado en el portal.';
        END IF;
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    UPDATE public.raiddominion_profiles
    SET role = 'guild_master', is_guild_master = TRUE,
        character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
        updated_at = now()
    WHERE id = v_user;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    RETURN v_primary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_from_sv(UUID) TO authenticated;

-- ─── Helper: persiste ranks en el snapshot público (merge sin pisar) ──────
-- SECURITY DEFINER: escribe raiddominion_guild_config en nombre del claim.
-- Si p_ranks no es un array no vacío no hace nada (legacy sin jerarquía).
CREATE OR REPLACE FUNCTION public.raiddominion_set_snapshot_ranks(p_guild_id UUID, p_ranks JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_guild_id IS NULL THEN
        RETURN;
    END IF;
    IF p_ranks IS NULL OR jsonb_typeof(p_ranks) <> 'array' OR jsonb_array_length(p_ranks) = 0 THEN
        RETURN;
    END IF;

    INSERT INTO public.raiddominion_guild_config (guild_id, config_key, config_value, updated_at)
    VALUES (p_guild_id, 'portal_snapshot', jsonb_build_object('ranks', p_ranks),
            timezone('utc'::text, now()))
    ON CONFLICT (guild_id, config_key)
    DO UPDATE SET
        config_value = COALESCE(raiddominion_guild_config.config_value, '{}'::jsonb) || EXCLUDED.config_value,
        updated_at = timezone('utc'::text, now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_snapshot_ranks(UUID, JSONB) TO authenticated;

-- ─── Backfill de snapshots existentes ─────────────────────────────────────
-- Los portal_snapshot históricos no traen 'ranks'; se rellenan desde el SV
-- más reciente del dueño (registries[*].guild.ranks o registryGuild.ranks),
-- con match por nombre de hermandad (insensible a mayúsculas).
UPDATE public.raiddominion_guild_config gc
SET config_value = jsonb_set(
        COALESCE(gc.config_value, '{}'::jsonb),
        '{ranks}',
        COALESCE(r.v_ranks, '[]'::jsonb),
        TRUE
    ),
    updated_at = timezone('utc'::text, now())
FROM public.raiddominion_guilds g
CROSS JOIN LATERAL (
    SELECT COALESCE(
        (SELECT e -> 'guild' -> 'ranks'
         FROM public.raiddominion_saved_variables s
         CROSS JOIN LATERAL jsonb_array_elements(
             COALESCE(s.raw -> 'registries', '[]'::jsonb)) AS e
         WHERE s.user_id = g.owner_id
           AND s.raw IS NOT NULL
           AND lower(e -> 'guild' ->> 'name') = lower(g.name)
           AND jsonb_typeof(e -> 'guild' -> 'ranks') = 'array'
         ORDER BY s.parsed_at DESC
         LIMIT 1),
        (SELECT s.raw -> 'registryGuild' -> 'ranks'
         FROM public.raiddominion_saved_variables s
         WHERE s.user_id = g.owner_id
           AND s.raw IS NOT NULL
           AND lower(s.raw -> 'registryGuild' ->> 'name') = lower(g.name)
           AND jsonb_typeof(s.raw -> 'registryGuild' -> 'ranks') = 'array'
         ORDER BY s.parsed_at DESC
         LIMIT 1)
    ) AS v_ranks
) r
WHERE gc.config_key = 'portal_snapshot'
  AND NOT gc.config_value ? 'ranks'
  AND g.id = gc.guild_id
  AND r.v_ranks IS NOT NULL;