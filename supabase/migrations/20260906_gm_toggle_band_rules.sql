-- ============================================================
-- RaidDominion Portal — El GM TOGGLEA las reglas de la banda propuesta
--
-- Decisión (2026-09-06, revisada):
--   * Las reglas de una banda propuesta viven SOLO en la banda del
--     proponente (su SavedVariables). El GM NO las elimina ni las "graba"
--     en su propia data: la interfaz de /dashboard#hermandad las muestra
--     como tags con el nombre del personaje que las propone, y el GM las
--     TOGGLEA (las que quedan activas son las que se publican). La
--     selección se persiste en guild_config(config_key='band_integration_rules')
--     — data del GM, no del proponente — y al publicar se lee SIEMPRE de
--     la banda del proponente filtrando por esa selección.
--   * set_band_integration v3 (UUID, TEXT): aprobar/rechazar ya NO recibe
--     reglas NI toca bands.rules. Solo mueve el estado de integración
--     (integration_status / is_rank_integrated / integration_decided_at).
--   * list_guild_band_proposals v3: expone las reglas del proponente
--     (bands.rules) y su character_name para atribuir cada regla.
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_ en TODO. SECURITY
-- DEFINER + SET search_path='' + GRANT EXECUTE TO authenticated.
-- ============================================================

-- ─── 1) set_band_integration v3: solo estado, NUNCA toca reglas ───────
DROP FUNCTION IF EXISTS public.raiddominion_set_band_integration(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.raiddominion_set_band_integration(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.raiddominion_set_band_integration(
    p_band_id UUID,
    p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_guild_id UUID;
    v_approved BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    IF p_status NOT IN ('approved', 'rejected', 'none') THEN
        RAISE EXCEPTION 'Estado inválido';
    END IF;

    SELECT guild_id INTO v_guild_id
    FROM public.raiddominion_bands
    WHERE id = p_band_id;

    IF v_guild_id IS NULL THEN
        RAISE EXCEPTION 'La banda no está asociada a una hermandad';
    END IF;

    -- Solo el GM (owner) de la hermandad decide
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds
        WHERE id = v_guild_id AND owner_id = v_user
    ) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    v_approved := (p_status = 'approved');

    UPDATE public.raiddominion_bands
    SET integration_status = p_status,
        is_rank_integrated = v_approved,
        integration_decided_at = timezone('utc'::text, now()),
        updated_at = now()
    WHERE id = p_band_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_integration(UUID, TEXT) TO authenticated;

-- ─── 2) list_guild_band_proposals v3: reglas del proponente + atribución ─
DROP FUNCTION IF EXISTS public.raiddominion_list_guild_band_proposals(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_list_guild_band_proposals(
    p_guild_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_rows JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds
        WHERE id = p_guild_id AND owner_id = v_user
    ) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', b.id,
                'name', b.name,
                'slug', b.slug,
                'is_public', b.is_public,
                'integration_status', b.integration_status,
                'integration_proposed_by', b.integration_proposed_by,
                'integration_proposed_at', b.integration_proposed_at,
                'integration_decided_at', b.integration_decided_at,
                'owner_id', b.owner_id,
                'rules', b.rules,
                'proposer', CASE WHEN p.id IS NULL THEN NULL ELSE
                    jsonb_build_object(
                        'slug', p.slug,
                        'display_name', p.display_name,
                        'character_name', p.character_name,
                        'is_public', p.is_public
                    )
                END
            )
            ORDER BY b.integration_proposed_at NULLS LAST
        ),
        '[]'::jsonb
    ) INTO v_rows
    FROM public.raiddominion_bands b
    LEFT JOIN public.raiddominion_profiles p ON p.id = b.integration_proposed_by
    WHERE b.guild_id = p_guild_id
      AND b.integration_status <> 'none';

    RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_list_guild_band_proposals(UUID) TO authenticated;