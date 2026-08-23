-- ============================================================
-- RaidDominion Portal — Claim de hermandad para el formato nuevo
--
-- Los SV actuales ya no traen Guild.memberList/generatedBy, así que
-- el claim automático legacy es insuficiente. Vía alternativa:
--   member (con personaje validado) SOLICITA su hermandad
--   → queda 'pending' SIN cambio de rol
--   → moderador/admin aprueba en /moderate (verify v3)
--   → al aprobar se le promueve a guild_master (+ user_apps + audit).
-- El claim legacy automático (raiddominion_claim_guild) sigue vigente.
-- ============================================================

-- ─── Solicitud de hermandad (member con personaje validado) ─────────
CREATE OR REPLACE FUNCTION public.raiddominion_request_guild(
    p_slug TEXT,
    p_name TEXT,
    p_realm TEXT DEFAULT NULL,
    p_faction TEXT DEFAULT NULL,
    p_discord_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_role text;
    v_guild_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado; registra tu cuenta primero.';
    END IF;
    IF v_role <> 'member' THEN
        RAISE EXCEPTION 'Solo un miembro validado puede solicitar una hermandad.';
    END IF;

    -- Anti-falseo: requiere al menos un personaje validado por evidencia cruzada
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE user_id = v_user AND member_verified = TRUE
    ) THEN
        RAISE EXCEPTION 'Necesitas un personaje validado antes de solicitar tu hermandad.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE owner_id = v_user) THEN
        RAISE EXCEPTION 'Ya tienes una hermandad registrada.';
    END IF;

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

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'guild_request_created', v_guild_id::text,
            jsonb_build_object('slug', p_slug, 'name', p_name));

    RETURN v_guild_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_request_guild(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── verify v3: al aprobar, promueve al owner si aún no es GM ────────
-- Igual que v2 (sync roster desde SV más reciente, sin officer_note)
-- más la promoción del dueño para solicitudes del formato nuevo.
DROP FUNCTION IF EXISTS public.raiddominion_verify_guild_claim(UUID, BOOLEAN, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_verify_guild_claim(
    p_guild_id UUID,
    p_approved BOOLEAN,
    p_members JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_owner uuid;
    v_raw jsonb;
    v_roster_synced boolean := FALSE;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role NOT IN ('moderator', 'admin') THEN
        RAISE EXCEPTION 'No autorizado: se requiere moderador o admin.';
    END IF;

    UPDATE public.raiddominion_guilds
    SET claim_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
        is_public = CASE WHEN p_approved THEN TRUE ELSE FALSE END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_guild_id;

    SELECT owner_id INTO v_owner FROM public.raiddominion_guilds WHERE id = p_guild_id;

    IF p_approved THEN
        IF p_members IS NOT NULL THEN
            DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
            INSERT INTO public.raiddominion_guild_members (guild_id, name, class, rank, race, public_note)
            SELECT p_guild_id,
                   (m ->> 'name')::text,
                   (m ->> 'class')::text,
                   (m ->> 'rank')::text,
                   (m ->> 'race')::text,
                   (m ->> 'publicNote')::text
            FROM jsonb_array_elements(p_members) AS m
            WHERE (m ->> 'name') IS NOT NULL;
            v_roster_synced := TRUE;
        ELSIF v_owner IS NOT NULL THEN
            SELECT raw INTO v_raw
            FROM public.raiddominion_saved_variables
            WHERE user_id = v_owner AND raw IS NOT NULL
            ORDER BY parsed_at DESC
            LIMIT 1;

            IF v_raw IS NOT NULL THEN
                DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
                INSERT INTO public.raiddominion_guild_members (guild_id, name, class, rank, race, public_note)
                SELECT p_guild_id,
                       (m ->> 'name')::text,
                       (m ->> 'class')::text,
                       (m ->> 'rank')::text,
                       (m ->> 'race')::text,
                       (m ->> 'publicNote')::text
                FROM jsonb_array_elements(v_raw -> 'guild' -> 'members') AS m
                WHERE (m ->> 'name') IS NOT NULL;
                v_roster_synced := TRUE;
            END IF;
        END IF;

        -- Promoción del owner (solicitud formato nuevo: seguía siendo member)
        IF v_owner IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.raiddominion_profiles
            WHERE id = v_owner AND role IN ('visitante', 'member')
        ) THEN
            UPDATE public.raiddominion_profiles
            SET role = 'guild_master', is_guild_master = TRUE, updated_at = timezone('utc'::text, now())
            WHERE id = v_owner;

            INSERT INTO public.user_apps (user_id, app_slug, role, status)
            VALUES (v_owner, 'raiddominion', 'guild_master', 'active')
            ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';
        END IF;
    ELSE
        DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
    END IF;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        CASE WHEN p_approved THEN 'guild_claim_verified' ELSE 'guild_claim_rejected' END,
        p_guild_id::text,
        jsonb_build_object('roster_synced', v_roster_synced, 'owner_promoted', p_approved)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_verify_guild_claim(UUID, BOOLEAN, JSONB) TO authenticated;