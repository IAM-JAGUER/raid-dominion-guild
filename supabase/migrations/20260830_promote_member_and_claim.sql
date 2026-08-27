-- ============================================================
-- RaidDominion Portal — Regla de validación y reclamo (2/3 personajes)
--
-- Decisión de producto (2026-08-30):
--   * VALIDACIÓN (member + member_verified): una cuenta con DOS O MÁS
--     personajes registrados en raiddominion_characters (conteo ACUMULADO,
--     sin importar si pertenecen a la misma hermandad o no) valida TODOS
--     sus personajes. Los personajes que entren después heredan el validado
--     porque el conteo es acumulativo en la tabla, no del SV actual.
--   * RECLAMO de hermandad (guild_master): se activa "con la llegada de un
--     tercero" — exige AL MENOS 3 personajes VALIDADOS (evidencia más fuerte
--     anti-falso-positivo) además de que el SV acredite isGM. Un maestro ya
--     verificado no queda bloqueado (re-verifica su hermandad o reclama otra).
--
-- Se mantiene TODO lo vigente del claim: multi-GM (todas las candidatas con
-- isGM), guard anti-falso-positivo (descartar candidata ya registrada por otro
-- maestro) y persistencia de ranks en el portal_snapshot.
-- ============================================================

-- ─── 1) Promoción a member por conteo de personajes (>= 2) ──────────────
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member();
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_try_promote_member(p_sv_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_char_count INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin perfil');
    END IF;

    -- Regla (20260830): cuenta con >= 2 personajes en raiddominion_characters
    -- (acumulado de todos sus uploads, sin importar hermandad) → valida TODOS
    -- sus personajes y promueve a member si sigue en visitante. Jamás degrada.
    SELECT COUNT(*) INTO v_char_count
    FROM public.raiddominion_characters
    WHERE user_id = v_user;

    IF v_char_count >= 2 THEN
        UPDATE public.raiddominion_characters
        SET member_verified = TRUE, verified_at = now()
        WHERE user_id = v_user AND member_verified = FALSE;

        IF v_role = 'visitante' THEN
            UPDATE public.raiddominion_profiles SET role = 'member', updated_at = now() WHERE id = v_user;

            UPDATE public.user_apps SET role = 'member'
            WHERE user_id = v_user AND app_slug = 'raiddominion';
        END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'promote_multi_char', COALESCE(p_sv_id::text, v_user::text),
                jsonb_build_object('characters', v_char_count));

        RETURN jsonb_build_object('promoted', TRUE, 'reason', 'multi_char');
    END IF;

    RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin suficientes personajes');
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_try_promote_member(UUID) TO authenticated;

-- ─── 2) Reclamo de hermandad: multi-GM + guard + ranks + >= 3 validados ───
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
    v_char_count INT;
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

    -- Reclamo con evidencia reforzada: al menos 3 personajes VALIDADOS
    -- ("se activa con la llegada de un tercero"). Un guild_master ya
    -- verificado re-verifica su hermandad o reclama otra sin esta restricción.
    IF v_role <> 'guild_master' THEN
        SELECT COUNT(*) INTO v_char_count
        FROM public.raiddominion_characters
        WHERE user_id = v_user AND member_verified = TRUE;
        IF v_char_count < 3 THEN
            RAISE EXCEPTION 'Se requieren al menos 3 personajes validados para reclamar una hermandad.';
        END IF;
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