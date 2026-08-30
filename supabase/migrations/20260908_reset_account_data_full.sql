-- ============================================================
-- RaidDominion Portal — Reset de datos SV: cobertura TOTAL + auditoría
--
-- El reset (canónico 20260829_reset_sv_bands.sql) ya cubre uploads,
-- personajes, hermandades/portal, bandas propias y rol. Decisión
-- (2026-09-06): el reseteo debe cubrir TODAS las tablas y data que el
-- usuario genera en sus operaciones, incluida su propia auditoría
-- (raiddominion_audit_log actor_id = usuario): claims, decisiones de
-- integración y reset se borran junto con el resto.
--
-- Cobertura resultante:
--   * raiddominion_saved_variables  (cascada roster_evidence)
--   * raiddominion_guilds propias    (cascada guild_members + guild_config:
--     portal_snapshot, guild_rules, band_integration_rules, portal_ranks)
--   * bandas propias (personales, de líder y de hermandad ajena)
--   * raiddominion_characters propias
--   * raiddominion_audit_log del propio actor
--   * perfil: limpia personaje principal, desmarca maestro, rol → visitante
--     salvo staff; user_apps sincronizada.
-- El registro del propio reseteo se escribe DESPUÉS de limpiar la auditoría.
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_reset_account_data();
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

    -- Auditoría del propio actor (sus operaciones: claims, integraciones,
    -- resets previos). Las entradas de staff sobre este usuario se conservan.
    DELETE FROM public.raiddominion_audit_log WHERE actor_id = v_user;

    -- Registro del propio reseteo (después de limpiar)
    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'reset_account_data', v_user::text,
            jsonb_build_object('role_previo', v_role));

    -- Hermandades propias (cascada: guild_members, guild_config; bandas con
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