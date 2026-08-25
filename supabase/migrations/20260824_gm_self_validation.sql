-- ============================================================
-- RaidDominion Portal — Promoción a member por auto-validación GM
--
-- Regla de producto (2026-08-24): un SV que acredite maestría de
-- hermandad (registry.guild.isGM) con MÁS DE DOS personajes
-- registrados promueve la cuenta a 'member' SIN evidencia cruzada
-- (no se pide que otro usuario suba un roster).
--
-- p_sv_id es OPCIONAL: si la página vieja lo invoca sin argumento,
-- la función usa el upload más reciente del usuario (ORDER BY
-- parsed_at DESC). Así basta aplicar esta migración en la DB, sin
-- depender del deploy del frontend.
--
-- NOTA: se retiró la rama de evidencia cruzada (uploaded_by <>
-- auth.uid()); la promoción a member depende SOLO de esta regla.
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member();
CREATE OR REPLACE FUNCTION public.raiddominion_try_promote_member(p_sv_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_sv UUID;
    v_raw JSONB;
    v_rg JSONB;
    v_n_registries INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin perfil');
    END IF;

    -- p_sv_id opcional: si no llega, usar el upload más reciente del usuario
    v_sv := p_sv_id;
    IF v_sv IS NULL THEN
        SELECT id INTO v_sv
        FROM public.raiddominion_saved_variables
        WHERE user_id = v_user AND raw IS NOT NULL
        ORDER BY parsed_at DESC
        LIMIT 1;
    END IF;

    -- ── Auto-validación GM + >2 personajes ───────────────────────────
    IF v_sv IS NOT NULL THEN
        SELECT raw INTO v_raw
        FROM public.raiddominion_saved_variables
        WHERE id = v_sv AND user_id = v_user AND raw IS NOT NULL
        LIMIT 1;

        IF v_raw IS NOT NULL THEN
            v_rg := v_raw -> 'registryGuild';
            v_n_registries := jsonb_array_length(COALESCE(v_raw -> 'registries', '[]'::jsonb));

            IF COALESCE((v_rg ->> 'isGM')::boolean, FALSE) = TRUE AND v_n_registries > 2 THEN
                UPDATE public.raiddominion_characters
                SET member_verified = TRUE, verified_at = now()
                WHERE user_id = v_user AND member_verified = FALSE;

                -- Solo se promueve el rol si sigue en visitante; jamás degrada.
                IF v_role = 'visitante' THEN
                    UPDATE public.raiddominion_profiles SET role = 'member', updated_at = now() WHERE id = v_user;

                    UPDATE public.user_apps SET role = 'member'
                    WHERE user_id = v_user AND app_slug = 'raiddominion';
                END IF;

                INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
                VALUES (v_user, 'promote_gm_self_validation', v_sv::text,
                        jsonb_build_object('registries', v_n_registries));

                RETURN jsonb_build_object('promoted', TRUE, 'reason', 'sv_gm_multi_char');
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin auto-validación GM');
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_try_promote_member(UUID) TO authenticated;