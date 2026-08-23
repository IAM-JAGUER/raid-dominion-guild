-- ============================================================
-- RaidDominion Portal — Reclamo de hermandad 100% desde el SV
--
-- Regla del operador: NO existen formularios de registro de
-- hermandad. El proceso está estrictamente limitado a subir un SV
-- que lo valide; los datos de la ficha no son editables en la
-- plataforma (solo en el juego) y cada re-upload los actualiza.
--
-- raiddominion_claim_from_sv(p_sv_id):
--   1. auth + role 'member' (personaje validado por evidencia cruzada)
--   2. Lee registry.guild DESDE EL JSONB GUARDADO del upload propio
--      (no confía en argumentos del cliente)
--   3. Exige isGM = true
--   4. Crea la hermandad con datos EXACTOS del SV (slug autogenerado,
--      colisiones resueltas con sufijo), claim_status='verified'
--   5. Promueve a guild_master (+ user_apps) y audita
-- ============================================================

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
    v_rg JSONB;
    v_player JSONB;
    v_guild_name TEXT;
    v_realm TEXT;
    v_faction TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT := 1;
    v_guild_id UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Solo un miembro con personaje validado puede reclamar
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado.';
    END IF;
    IF v_role <> 'member' THEN
        RAISE EXCEPTION 'Requiere ser Miembro con personaje validado por evidencia cruzada.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE owner_id = v_user) THEN
        RAISE EXCEPTION 'Ya tienes una hermandad registrada.';
    END IF;

    -- El SV debe pertenecer al usuario
    SELECT raw INTO v_raw
    FROM public.raiddominion_saved_variables
    WHERE id = p_sv_id AND user_id = v_user AND raw IS NOT NULL
    LIMIT 1;
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'SV no encontrado en tu historial.';
    END IF;

    -- Validación ESTRICTA contra el JSONB guardado (no args del cliente)
    v_rg := v_raw -> 'registryGuild';
    IF v_rg IS NULL OR COALESCE((v_rg ->> 'isGM')::boolean, FALSE) <> TRUE THEN
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    v_guild_name := trim(v_rg ->> 'name');
    IF v_guild_name IS NULL OR length(v_guild_name) < 2 OR length(v_guild_name) > 60 THEN
        RAISE EXCEPTION 'Nombre de hermandad inválido en el SV.';
    END IF;

    v_player := v_raw -> 'player';
    v_realm := NULLIF(trim(v_player ->> 'realm'), '');
    v_faction := NULL;

    -- Facción: del roster de personajes de la cuenta, el activo
    IF v_player ? 'name' AND v_raw ? 'characters' THEN
        SELECT value ->> 'faction' INTO v_faction
        FROM jsonb_each(v_raw -> 'characters')
        WHERE lower(split_part(key, '-', 1)) = lower(v_player ->> 'name')
          AND (v_realm IS NULL OR lower(COALESCE(value ->> 'realm', '')) = lower(v_realm))
        LIMIT 1;
    END IF;
    v_faction := NULLIF(trim(COALESCE(v_faction, '')), '');

    -- Slug desde el nombre REAL de la hermandad; colisiones con sufijo
    v_base_slug := lower(regexp_replace(
        trim(v_guild_name),
        '[^a-zA-Z0-9]+', '-', 'g'
    ));
    v_base_slug := btrim(v_base_slug, '-');
    IF v_base_slug = '' THEN
        RAISE EXCEPTION 'No se pudo derivar slug del nombre de la hermandad.';
    END IF;
    v_base_slug := left(v_base_slug, 40);

    v_slug := v_base_slug;
    WHILE EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE slug = v_slug) LOOP
        v_i := v_i + 1;
        v_slug := v_base_slug || '-' || v_i::text;
    END LOOP;

    INSERT INTO public.raiddominion_guilds (
        slug, name, realm, faction, owner_id, claim_status, is_public
    )
    VALUES (
        v_slug, v_guild_name, v_realm, v_faction, v_user,
        'verified', FALSE
    )
    RETURNING id INTO v_guild_id;

    UPDATE public.raiddominion_profiles
    SET role = 'guild_master', is_guild_master = TRUE,
        character_name = COALESCE(v_player ->> 'name', character_name),
        updated_at = now()
    WHERE id = v_user;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'guild_claim_from_sv', v_guild_id::text,
            jsonb_build_object('sv', p_sv_id, 'slug', v_slug,
                               'guild', v_guild_name, 'members', v_rg ->> 'numMembers'));

    RETURN v_guild_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_from_sv(UUID) TO authenticated;

-- ─── Limpieza del camino manual (obsoleto por diseño) ───────────────
DROP FUNCTION IF EXISTS public.raiddominion_request_guild(TEXT, TEXT, TEXT, TEXT, TEXT);
