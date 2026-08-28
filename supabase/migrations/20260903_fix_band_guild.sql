-- ============================================================
-- RaidDominion Portal — Fix: asignación de hermandad a banda personal
--
-- Decisión (2026-09-03): corregir raiddominion_set_band_guild. La versión
-- 20260901 leía el guild_id actual en v_old_guild y, si la banda estaba
-- personal (guild_id IS NULL), lanzaba 'No autorizado' — confundiendo "banda
-- no encontrada / no es tuya" con "la banda aún no tiene hermandad". La
-- PRIMERA asignación de una banda personal siempre fallaba, bloqueando además
-- la propuesta de integración (propose requiere guild_id).
--
-- Corrección: separar la comprobación de propiedad (banda existe y es del
-- dueño) de la lectura del guild actual (NULL = personal, válido). Se conserva
-- el chequeo de pertenencia: solo puede asignar a una hermandad donde el
-- usuario aparece como miembro (sv_guild_name de sus personajes) o que él
-- mismo posee.
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_set_band_guild(UUID, UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_set_band_guild(
    p_band_id UUID,
    p_guild_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_band_owner UUID;
    v_old_guild UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    -- Propiedad: la banda debe existir y pertenecer al usuario. Separada de la
    -- lectura del guild actual (que puede ser NULL = banda personal).
    SELECT owner_id, guild_id INTO v_band_owner, v_old_guild
    FROM public.raiddominion_bands
    WHERE id = p_band_id;
    IF v_band_owner IS NULL OR v_band_owner <> v_user THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    IF p_guild_id IS NOT NULL THEN
        -- El usuario debe pertenecer a esa hermandad (como miembro vía sus
        -- personajes o como owner) para poder asignarle la banda.
        IF NOT EXISTS (
            SELECT 1 FROM public.raiddominion_guilds g
            WHERE g.id = p_guild_id
              AND (
                  g.owner_id = v_user
                  OR EXISTS (
                      SELECT 1 FROM public.raiddominion_characters c
                      WHERE c.user_id = v_user
                        AND lower(COALESCE(c.sv_guild_name, '')) = lower(g.name)
                  )
              )
        ) THEN
            RAISE EXCEPTION 'No perteneces a esa hermandad';
        END IF;
    END IF;

    UPDATE public.raiddominion_bands
    SET guild_id = p_guild_id,
        updated_at = now(),
        integration_status = CASE
            WHEN p_guild_id IS DISTINCT FROM v_old_guild THEN 'none'
            ELSE integration_status
        END,
        is_rank_integrated = CASE
            WHEN p_guild_id IS DISTINCT FROM v_old_guild THEN FALSE
            ELSE is_rank_integrated
        END,
        integration_proposed_by = CASE
            WHEN p_guild_id IS DISTINCT FROM v_old_guild THEN NULL
            ELSE integration_proposed_by
        END,
        integration_proposed_at = CASE
            WHEN p_guild_id IS DISTINCT FROM v_old_guild THEN NULL
            ELSE integration_proposed_at
        END,
        integration_decided_at = CASE
            WHEN p_guild_id IS DISTINCT FROM v_old_guild THEN NULL
            ELSE integration_decided_at
        END
    WHERE id = p_band_id AND owner_id = v_user;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_guild(UUID, UUID) TO authenticated;