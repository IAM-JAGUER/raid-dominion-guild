-- ============================================================
-- RaidDominion Portal — Reset de datos SV: cubre raiddominion_bands
--
-- El reset original (20260824_reset_sv_data.sql) borraba uploads,
-- personajes, hermandades/portal y volvía el rol a visitante, pero NO
-- borraba raiddominion_bands de forma explícita:
--   * Las bandas de un GM se borraban en cascada vía guilds (guild_id ON
--     DELETE CASCADE), pero
--   * las bandas de un LÍDER DE BANDA (asociadas a una hermandad ajena
--     por guild_id) y las bandas PERSONALES (guild_id NULL) SOBREVIVÍAN.
-- La regla de producto es "borra TODO lo derivado del SavedVariables";
-- este reemplazo añade DELETE por owner_id para cubrirlas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.raiddominion_reset_account_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Sin perfil';
    END IF;

    -- Auditoría previa
    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'reset_account_data', v_user::text,
            jsonb_build_object('role_previo', v_role));

    -- Hermandades propias (cascada: guild_members, guild_config, bandas con
    -- guild_id de la hermandad; saved_variables.guild_id es ON DELETE SET NULL)
    DELETE FROM public.raiddominion_guilds WHERE owner_id = v_user;

    -- Uploads (cascada: roster_evidence vía sv_upload_id)
    DELETE FROM public.raiddominion_saved_variables WHERE user_id = v_user;

    -- Bandas propias: personales (guild_id NULL) y de líder (asociadas a
    -- hermandades ajenas), que NO caen en cascada desde la hermandad.
    DELETE FROM public.raiddominion_bands WHERE owner_id = v_user;

    -- Personajes detectados en el SV
    DELETE FROM public.raiddominion_characters WHERE user_id = v_user;

    -- Perfil: limpia personaje principal, desmarca maestro y vuelve a
    -- visitante salvo staff (moderator/admin conservan su rol)
    UPDATE public.raiddominion_profiles
    SET character_name = NULL,
        is_guild_master = FALSE,
        role = CASE WHEN role IN ('moderator', 'admin') THEN role ELSE 'visitante' END,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user;

    -- Sincronizar la matriz compartida con el rol efectivo
    UPDATE public.user_apps
    SET role = CASE WHEN v_role IN ('moderator', 'admin') THEN v_role ELSE 'visitante' END
    WHERE user_id = v_user AND app_slug = 'raiddominion';
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_reset_account_data() TO authenticated;