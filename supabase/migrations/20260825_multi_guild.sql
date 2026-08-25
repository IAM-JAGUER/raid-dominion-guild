-- ============================================================
-- RaidDominion Portal — Soporte multi-hermandad (multi-GM)
--
-- Un jugador puede tener personajes en varias hermandades y ser
-- maestro (GM) de más de una. Los datos provienen del SV:
-- registries[*].guild (por personaje) y registryGuild (plano).
--
-- Cambios:
--   1. raiddominion_claim_from_sv ahora reclama (idempotente) TODAS
--      las hermandades del SV con isGM=true, en vez de una única.
--   2. raiddominion_claim_guild (legacy) ya no exige hermandad única.
--   3. Índice por owner_id en raiddominion_guilds.
-- ============================================================

-- ─── Reclamo multi-GM desde el SV ─────────────────────────────────────────
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

        IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'guild_claim_from_sv', v_guild_id::text,
                jsonb_build_object('sv', p_sv_id, 'slug', v_slug,
                                   'guild', v_guild_name));
    END LOOP;

    IF v_primary IS NULL THEN
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

-- ─── Reclamo legacy (formulario manual): quita el límite de hermandad única ──
CREATE OR REPLACE FUNCTION public.raiddominion_claim_guild(
    p_slug TEXT,
    p_name TEXT,
    p_realm TEXT DEFAULT NULL,
    p_faction TEXT DEFAULT NULL,
    p_discord_link TEXT DEFAULT NULL,
    p_generated_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_guild_id uuid;
    v_role text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Solo member/guild_master pueden reclamar (un maestro puede reclamar otra)
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado; registra tu cuenta primero.';
    END IF;
    IF v_role NOT IN ('member', 'guild_master') THEN
        RAISE EXCEPTION 'Requiere ser Miembro o Maestro de Hermandad.';
    END IF;

    -- Slug único; si existe, falla para evitar colisión
    INSERT INTO public.raiddominion_guilds (
        slug, name, realm, faction, discord_link, owner_id,
        claim_status, is_public
    )
    VALUES (
        lower(regexp_replace(p_slug, '[^a-z0-9-]', '-', 'g')),
        p_name, p_realm, p_faction, p_discord_link, v_user,
        'pending', FALSE
    )
    RETURNING id INTO v_guild_id;

    -- Promover a guild_master y sincronizar user_apps
    UPDATE public.raiddominion_profiles
    SET role = 'guild_master', is_guild_master = TRUE, character_name = p_generated_by
    WHERE id = v_user;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    RETURN v_guild_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_guild(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Índice para consultas por dueño (multi-hermandad)
CREATE INDEX IF NOT EXISTS idx_raiddominion_guilds_owner ON public.raiddominion_guilds(owner_id);