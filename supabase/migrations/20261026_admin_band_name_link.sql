-- RaidDominion Portal — Admin: exponer el enlace de juego del nombre de banda
--
-- La ficha /banda/:slug enriquece el nombre con name_link (tooltip de
-- UltimoWoW). El panel admin lista bandas de cualquier usuario y necesita el
-- mismo dato para renderizar el nombre y ofrecer el CTA "Ver banda".
--
-- Solo cambia la forma del JSON de raiddominion_admin_get_user_entities:
-- agrega 'name_link' a cada banda. No toca datos, RLS ni permisos.
--
-- Aplicación manual en el SQL Editor del proyecto RaidDominion.

CREATE OR REPLACE FUNCTION public.raiddominion_admin_get_user_entities(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_profile jsonb;
    v_chars jsonb;
    v_guilds jsonb;
    v_bands jsonb;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    -- Perfil público del usuario (sin email; el email ya lo trae el listado)
    SELECT COALESCE(jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'character_name', p.character_name,
        'realm', p.realm,
        'slug', p.slug,
        'role', p.role,
        'is_public', p.is_public,
        'created_at', p.created_at
    ), '{}'::jsonb)
    INTO v_profile
    FROM public.raiddominion_profiles p
    WHERE p.id = p_user_id;

    -- Personajes del usuario
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'realm', c.realm,
        'server', c.server,
        'class', c.class,
        'level', c.level,
        'avg_ilvl', c.avg_ilvl,
        'slug', c.slug,
        'is_public', c.is_public,
        'member_verified', c.member_verified,
        'sv_is_gm', c.sv_is_gm,
        'sv_guild_name', c.sv_guild_name,
        'created_at', c.created_at
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_chars
    FROM public.raiddominion_characters c
    WHERE c.user_id = p_user_id;

    -- Hermandades del usuario (donde es owner)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'slug', g.slug,
        'name', g.name,
        'realm', g.realm,
        'server', g.server,
        'faction', g.faction,
        'claim_status', g.claim_status,
        'is_public', g.is_public,
        'created_at', g.created_at
    ) ORDER BY g.created_at DESC), '[]'::jsonb)
    INTO v_guilds
    FROM public.raiddominion_guilds g
    WHERE g.owner_id = p_user_id;

    -- Bandas del usuario (todas, integradas o no). guild_id = atribución real
    -- al portal (se escribe al aprobar el GM); integration_status muestra la
    -- propuesta. Se incluyen ambos para que el admin vea el estado completo.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'slug', b.slug,
        'name', b.name,
        'name_link', b.name_link,
        'icon', b.icon,
        'schedule', b.schedule,
        'guild_id', b.guild_id,
        'integration_target_guild_id', b.integration_target_guild_id,
        'is_public', b.is_public,
        'integration_status', b.integration_status,
        'character_name', b.character_name,
        'character_realm', b.character_realm,
        'created_at', b.created_at
    ) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO v_bands
    FROM public.raiddominion_bands b
    WHERE b.owner_id = p_user_id;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'characters', v_chars,
        'guilds', v_guilds,
        'bands', v_bands
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_get_user_entities(UUID) TO authenticated;
