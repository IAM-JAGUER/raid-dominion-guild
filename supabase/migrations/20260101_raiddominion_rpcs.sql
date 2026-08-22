-- ============================================================
-- RaidDominion Portal — RPCs de hermandad (prefijo raiddominion_)
-- Fase 2: crear/reclamar hermandad y asignar rol guild_master.
--
-- ⚠️ El rol guild_master se asigna SOLO vía RPC SECURITY DEFINER,
--    nunca desde el cliente. El usuario empieza como 'member'.
-- ============================================================

-- ─── raiddominion_claim_guild ──────────────────────────────────────────
-- Crea/reclama una hermandad a partir de un SavedVariables verificado.
-- Parámetros: slug, nombre, reino, enlace de discord, generatedBy.
-- Devuelve el id de la guild creada y promueve al usuario a guild_master.
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

    -- Solo member puede reclamar (no staff re-claimando otra)
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado; registra tu cuenta primero.';
    END IF;

    -- Un usuario no puede tener más de una hermandad reclamada
    IF EXISTS (
        SELECT 1 FROM public.raiddominion_guilds WHERE owner_id = v_user
    ) THEN
        RAISE EXCEPTION 'Ya tienes una hermandad registrada.';
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

-- ─── raiddominion_verify_guild_claim ───────────────────────────────────
-- Solo moderadores/admin: verifica (o rechaza) un claim pendiente y
-- actualiza el roster guardado.
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
BEGIN
    v_role := (SELECT role FROM public.raiddominion_profiles WHERE id = auth.uid());

    IF v_role NOT IN ('moderator', 'admin') THEN
        RAISE EXCEPTION 'No autorizado: se requiere moderador o admin.';
    END IF;

    UPDATE public.raiddominion_guilds
    SET claim_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
        is_public = CASE WHEN p_approved THEN TRUE ELSE is_public END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_guild_id;

    IF p_approved AND p_members IS NOT NULL THEN
        DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
        INSERT INTO public.raiddominion_guild_members (guild_id, name, class, rank, race, public_note, officer_note)
        SELECT p_guild_id,
               (m ->> 'name')::text,
               (m ->> 'class')::text,
               (m ->> 'rank')::text,
               (m ->> 'race')::text,
               (m ->> 'publicNote')::text,
               (m ->> 'officerNote')::text
        FROM jsonb_array_elements(p_members) AS m
        WHERE (m ->> 'name') IS NOT NULL;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_verify_guild_claim(UUID, BOOLEAN, JSONB) TO authenticated;