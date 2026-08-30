-- ============================================================
-- RaidDominion Portal — Persistir `server` (realmlist) en hermandades
--
-- Bug: la página de reino (/servidor/:server/reino/:realm) no mostraba
-- hermandades, porque raiddominion_claim_from_sv insertaba guilds SIN
-- `server` (solo `realm`), mientras getRealmOverview filtra por
-- `.eq('server', server)`.
--
-- Cambios (sobre la versión canónica 20260902_allow_staff_claim):
--   * `raiddominion_claim_from_sv` persiste server desde la ficha del
--     jugador del registro (v_p->>'server', igual que enumera el parser)
--     en el INSERT y en el UPDATE de re-verificación.
--   * Backfill idempotente para hermandades legacy: server se toma del
--     personaje del dueño (mismo reino primero, luego cualquier público).
--
-- Reglas: solo tablas raiddominion_, IF EXISTS/IF NOT EXISTS, sin tocar
-- handle_new_user() ni otras apps del ecosistema.
-- ============================================================

-- ─── Reclamo de hermandad desde el SV (staff incluido) + server ─────────
DROP FUNCTION IF EXISTS public.raiddominion_claim_from_sv(UUID);
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
    v_server TEXT;
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

    -- member (validado), guild_master y staff pueden reclamar: un maestro
    -- puede reclamar una segunda hermandad en un re-upload.
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado.';
    END IF;
    IF v_role NOT IN ('member', 'guild_master', 'moderator', 'admin') THEN
        RAISE EXCEPTION 'Requiere ser Miembro o Maestro de Hermandad.';
    END IF;

    -- Reclamo con evidencia reforzada: al menos 3 personajes VALIDADOS
    -- ("se activa con la llegada de un tercero"). Un guild_master ya
    -- verificado re-verifica su hermandad o reclama otra sin esta restricción.
    -- Staff (admin/moderator) cumple la misma evidencia que member.
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

        -- Ficha del personaje dueño de este registro (server vive ahí,
        -- como enumera el parser registry.player).
        v_p := v_cand -> 'player';
        v_server := NULLIF(trim(COALESCE(v_p ->> 'server', '')), '');

        -- ¿Ya reclamada por este dueño (mismo nombre)? Re-verifica y sigue.
        SELECT id INTO v_guild_id
        FROM public.raiddominion_guilds
        WHERE owner_id = v_user AND lower(name) = lower(v_guild_name)
        ORDER BY created_at
        LIMIT 1;
        IF FOUND THEN
            UPDATE public.raiddominion_guilds
            SET realm = COALESCE(NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), ''), realm),
                server = COALESCE(v_server, server),
                claim_status = 'verified',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_guild_id;
            PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');
            IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;
            CONTINUE;
        END IF;

        -- Facción del personaje dueño de ese registro (mapa characters)
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
            slug, name, realm, server, faction, owner_id, claim_status, is_public
        )
        VALUES (v_slug, v_guild_name, v_realm, v_server, v_faction, v_user, 'verified', FALSE)
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

    -- Promoción a guild_master SOLO para cuentas member: staff (admin/
    -- moderator) conserva su rol, aunque se marca como maestro de hermandad.
    IF v_role NOT IN ('moderator', 'admin') THEN
        UPDATE public.raiddominion_profiles
        SET role = 'guild_master', is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    ELSE
        UPDATE public.raiddominion_profiles
        SET is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    END IF;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    RETURN v_primary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_from_sv(UUID) TO authenticated;

-- ─── Backfill legacy: server desde el personaje del dueño ──────────────
-- 1) Prioridad: personaje del MISMO reino (el que reclama la hermandad).
-- raiddominion_characters pertenece vía user_id (no owner_id).
UPDATE public.raiddominion_guilds g
SET server = c.server
FROM public.raiddominion_characters c
WHERE g.server IS NULL
  AND c.user_id = g.owner_id
  AND c.server IS NOT NULL
  AND lower(COALESCE(c.realm, '')) = lower(COALESCE(g.realm, ''));

-- 2) Fallback: cualquier personaje público del dueño.
UPDATE public.raiddominion_guilds g
SET server = c.server
FROM public.raiddominion_characters c
WHERE g.server IS NULL
  AND c.user_id = g.owner_id
  AND c.server IS NOT NULL
  AND c.is_public = TRUE;