-- ============================================================
-- RaidDominion Portal — Personaje principal desde el SV +
-- Eliminación de cuenta (solo RaidDominion)
--
-- 1) El personaje principal del perfil ya no es texto libre:
--    el cliente lo ofrecerá como <select> alimentado SOLO por
--    raiddominion_characters (personajes detectados en el SV).
--    No hace falta cambio de schema (profile.character_name se
--    mantiene y se rellena desde el personaje elegido).
--
-- 2) Eliminación de cuenta: decisión de producto (2026-08-24)
--    en ecosistema multi-app con auth compartido. Se borran SOLO
--    los datos raiddominion_* del usuario y su membresía en
--    user_apps (app_slug='raiddominion'). NO se toca auth.users
--    ni datos de otras apps (lexigo, agendaya, ...).
-- ============================================================

-- ─── Eliminar cuenta (solo RaidDominion) ───────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_delete_account();
CREATE OR REPLACE FUNCTION public.raiddominion_delete_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Auditoría previa (actor queda vinculado: el auth.user sigue vivo)
    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'delete_account', v_user::text,
            jsonb_build_object('scope', 'raiddominion'));

    -- Hermandades propias (cascada: guild_members, guild_config;
    -- saved_variables.guild_id es ON DELETE SET NULL, no las toca)
    DELETE FROM public.raiddominion_guilds WHERE owner_id = v_user;

    -- Uploads (cascada: roster_evidence vía sv_upload_id)
    DELETE FROM public.raiddominion_saved_variables WHERE user_id = v_user;

    -- Personajes y perfil
    DELETE FROM public.raiddominion_characters WHERE user_id = v_user;
    DELETE FROM public.raiddominion_profiles WHERE id = v_user;

    -- Membresía del app en la matriz compartida (solo raiddominion)
    DELETE FROM public.user_apps WHERE user_id = v_user AND app_slug = 'raiddominion';
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_delete_account() TO authenticated;