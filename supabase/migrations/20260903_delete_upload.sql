-- ============================================================
-- RaidDominion Portal — Borrado individual de un upload (SV)
--
-- El dashboard /dashboard#registro permite ver el historial de
-- SavedVariables subidos (selector "Análisis N/total"). Se añade
-- la posibilidad de ELIMINAR un análisis individual con confirmación
-- modal.
--
-- Solo el dueño puede borrar su propio upload (auth.uid() = user_id).
-- Efectos:
--   * raiddominion_saved_variables: se borra la fila (cascada →
--     roster_evidence vía sv_upload_id ON DELETE CASCADE).
--   * raiddominion_characters.sv_upload_id → ON DELETE SET NULL: los
--     personajes detectados sobreviven (no se pierde el roster).
--   * Bandas (raiddominion_bands) no dependen del upload (solo
--     owner_id), así que no se tocan.
--   * Roles: no se re-evalúa la promoción member/guild_master aquí;
--     los personajes persisten y las evidencias de OTROS uploads y de
--     hermandades ajenas siguen intactas. Un re-upload reconstruye el
--     registro.
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_delete_upload(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_delete_upload(p_sv_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner UUID;
    v_generated_by TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT user_id, generated_by INTO v_owner, v_generated_by
    FROM public.raiddominion_saved_variables
    WHERE id = p_sv_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'El análisis no existe';
    END IF;

    IF v_owner <> v_user THEN
        RAISE EXCEPTION 'No puedes eliminar un análisis que no te pertenece';
    END IF;

    -- Auditoría previa (actor queda vinculado)
    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (v_user, 'delete_upload', p_sv_id::text,
            jsonb_build_object('generated_by', v_generated_by));

    -- Borra el upload (cascada: roster_evidence; characters → SET NULL)
    DELETE FROM public.raiddominion_saved_variables WHERE id = p_sv_id AND user_id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_delete_upload(UUID) TO authenticated;