-- ============================================================
-- RaidDominion Portal — Correcciones QA post-onboarding (20260106/07)
--
-- 1) El CHECK de raiddominion_profiles.role no incluía 'visitante':
--    el trigger trg_raiddominion_profiles_visitante rompería todo
--    INSERT de perfil nuevo. Se amplía la restricción.
-- 2) admin_set_role: permitir asignar 'visitante' manualmente.
-- 3) try_promote_member: audit_log tiene columna `target` (TEXT),
--    no target_type/target_id; y la evidencia NO debe exigir que el
--    SV de origen pertenezca a una hermandad reclamada (basta que lo
--    haya subido OTRO usuario). Sin join a guilds/is_active.
-- ============================================================

-- ─── 1) CHECK de roles con visitante ────────────────────────────────
ALTER TABLE public.raiddominion_profiles
    DROP CONSTRAINT IF EXISTS raiddominion_profiles_role_check;

ALTER TABLE public.raiddominion_profiles
    ADD CONSTRAINT raiddominion_profiles_role_check
    CHECK (role IN ('visitante', 'member', 'guild_master', 'moderator', 'admin'));

-- ─── 2) admin_set_role v2: acepta visitante ─────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_admin_set_role(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_role(
    p_user_id UUID,
    p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_role text;
    v_current_role text;
BEGIN
    SELECT role INTO v_actor_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    IF p_role NOT IN ('visitante', 'member', 'guild_master', 'moderator', 'admin') THEN
        RAISE EXCEPTION 'Rol inválido.';
    END IF;

    SELECT role INTO v_current_role FROM public.raiddominion_profiles WHERE id = p_user_id;
    IF v_current_role IS NULL THEN
        RAISE EXCEPTION 'Usuario sin perfil raiddominion.';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puedes cambiar tu propio rol.';
    END IF;

    UPDATE public.raiddominion_profiles SET role = p_role, updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id;

    UPDATE public.user_apps SET role = p_role
    WHERE user_id = p_user_id AND app_slug = 'raiddominion';

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (auth.uid(), 'admin_set_role', p_user_id::text, jsonb_build_object('new_role', p_role));
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_role(UUID, TEXT) TO authenticated;

-- ─── 3) try_promote_member corregido ────────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member();
CREATE OR REPLACE FUNCTION public.raiddominion_try_promote_member()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_char RECORD;
    v_hit RECORD;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin perfil');
    END IF;
    IF v_role <> 'visitante' THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'rol actual no requiere promoción');
    END IF;

    FOR v_char IN
        SELECT c.id, c.name, c.realm
        FROM public.raiddominion_characters c
        WHERE c.user_id = v_user AND c.member_verified = FALSE
    LOOP
        -- La evidencia vale aunque su SV provenga de una hermandad aún no reclamada:
        -- basta que otro usuario haya subido un roster que incluya al personaje.
        SELECT e.id, e.sv_upload_id
        INTO v_hit
        FROM public.raiddominion_roster_evidence e
        WHERE lower(e.char_name) = lower(v_char.name)
          AND e.uploaded_by <> v_user
          AND EXISTS (
              SELECT 1 FROM public.raiddominion_saved_variables sv
              WHERE sv.id = e.sv_upload_id AND sv.status <> 'rejected'
          )
        LIMIT 1;

        IF v_hit.id IS NOT NULL THEN
            UPDATE public.raiddominion_characters
            SET member_verified = TRUE, verified_at = now()
            WHERE id = v_char.id;

            UPDATE public.raiddominion_profiles SET role = 'member', updated_at = now() WHERE id = v_user;

            UPDATE public.user_apps SET role = 'member'
            WHERE user_id = v_user AND app_slug = 'raiddominion';

            INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
            VALUES (v_user, 'promote_visitor_to_member', v_char.id::text,
                    jsonb_build_object('char', v_char.name, 'realm', v_char.realm,
                                       'evidence_sv', v_hit.sv_upload_id));

            RETURN jsonb_build_object('promoted', TRUE, 'character', v_char.name);
        END IF;
    END LOOP;

    RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin coincidencia de roster');
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_try_promote_member() TO authenticated;