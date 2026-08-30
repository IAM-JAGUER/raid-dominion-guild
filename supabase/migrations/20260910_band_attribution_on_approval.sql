-- ============================================================
-- RaidDominion Portal — La atribución de banda a hermandad SOLO ante aprobación
--
-- Decisión (2026-09-10): cambiar el select "Hermandad" de Mis Bandas (o la
-- subida de un SV de un MIEMBRO) estaba escribiendo YA guild_id en la banda,
-- es decir, atribuyéndola a la hermandad antes de que el GM aprobara. Ese
-- comportamiento se corregirá así:
--
--   * NUEVA columna integration_target_guild_id = "a qué hermandad se
--     solicita la integración". El dueño de la banda la fija con el select;
--     es el DESTINO de la propuesta, NO atribución.
--   * guild_id solo se escribe al APROBAR el GM (raiddominion_set_band_integration
--     'approved' → guild_id = target). 'rejected'/'none' lo retira.
--   * raiddominion_set_band_guild ya no toca guild_id: guarda el target y
--     deja/retira la atribución según corresponda (si la banda seguía en la
--     MISMA hermandad ya aprobada, la conserva; si cambia de guild o pasa a
--     personal, la retira hasta nueva aprobación).
--   * raiddominion_propose_band_integration lee el target (no guild_id).
--   * list_guild_band_proposals filtra por target (con fallback legacy para
--     bandas ya atribuidas antes de esta migración).
--   * upsert_bands: un MIEMBRO (no GM) inserta sus bandas con guild_id NULL +
--     integration_target_guild_id (propuestas pendientes de su GM); el GM/owner
--     mantiene su auto-aprobación (guild_id + approved, bandas propias del
--     portal). El re-upload conserva guild_id/estado (elección del dueño).
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_ en TODO. SECURITY
-- DEFINER + SET search_path='' + GRANT EXECUTE TO authenticated.
-- ============================================================

-- ─── 1) Columna de destino de la propuesta ────────────────────────────────
ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS integration_target_guild_id UUID
    REFERENCES public.raiddominion_guilds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS raiddominion_bands_target_guild_idx
    ON public.raiddominion_bands(integration_target_guild_id, integration_status);

-- ─── 2) set_band_guild v3: fija el DESTINO, no atribuye ──────────────────
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
    v_owner UUID;
    v_old_guild UUID;
    v_old_target UUID;
    v_changed BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    -- Propiedad: la banda debe existir y pertenecer al usuario.
    SELECT owner_id, guild_id, integration_target_guild_id
    INTO v_owner, v_old_guild, v_old_target
    FROM public.raiddominion_bands
    WHERE id = p_band_id;
    IF v_owner IS NULL OR v_owner <> v_user THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    IF p_guild_id IS NOT NULL THEN
        -- El usuario debe pertenecer a esa hermandad (como miembro vía sus
        -- personajes o como owner) para poder proponerla.
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

    -- ¿Cambia el destino real (target o atribución previa)? Si el dueño
    -- re-elige la MISMA hermandad ya aprobada, se conserva el estado; en
    -- cualquier otro caso la banda vuelve a 'none' sin guild_id hasta que el
    -- GM apruebe la nueva propuesta.
    v_changed := p_guild_id IS DISTINCT FROM COALESCE(v_old_target, v_old_guild);

    UPDATE public.raiddominion_bands
    SET integration_target_guild_id = p_guild_id,
        guild_id = CASE
            WHEN p_guild_id IS NULL THEN NULL
            WHEN v_old_guild IS NOT DISTINCT FROM p_guild_id THEN v_old_guild
            ELSE NULL
        END,
        integration_status = CASE
            WHEN v_changed THEN 'none'
            ELSE integration_status
        END,
        is_rank_integrated = CASE
            WHEN p_guild_id IS NULL OR v_old_guild IS DISTINCT FROM p_guild_id THEN FALSE
            ELSE is_rank_integrated
        END,
        integration_proposed_by = CASE WHEN v_changed THEN NULL ELSE integration_proposed_by END,
        integration_proposed_at = CASE WHEN v_changed THEN NULL ELSE integration_proposed_at END,
        integration_decided_at = CASE WHEN v_changed THEN NULL ELSE integration_decided_at END,
        updated_at = now()
    WHERE id = p_band_id AND owner_id = v_user;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_guild(UUID, UUID) TO authenticated;

-- ─── 3) propose_band_integration v2: usa el DESTINO (target) ──────────────
DROP FUNCTION IF EXISTS public.raiddominion_propose_band_integration(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_propose_band_integration(
    p_band_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_target UUID;
    v_status TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT integration_target_guild_id, integration_status
    INTO v_target, v_status
    FROM public.raiddominion_bands
    WHERE id = p_band_id AND owner_id = v_user;

    IF v_target IS NULL THEN
        RAISE EXCEPTION 'Elige una hermandad antes de proponer la integración';
    END IF;
    IF v_status = 'approved' THEN
        RAISE EXCEPTION 'La banda ya está integrada al portal';
    END IF;
    IF v_status = 'pending' THEN
        RETURN TRUE; -- idempotente
    END IF;

    -- El usuario debe pertenecer a la hermandad del destino
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds g
        WHERE g.id = v_target
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

    UPDATE public.raiddominion_bands
    SET integration_status = 'pending',
        integration_proposed_by = v_user,
        integration_proposed_at = timezone('utc'::text, now()),
        integration_decided_at = NULL,
        updated_at = now()
    WHERE id = p_band_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_propose_band_integration(UUID) TO authenticated;

-- ─── 4) set_band_integration v4: atribuye SOLO al aprobar ────────────────
-- 'approved'  → guild_id = target + is_rank_integrated = true (la banda
--               "entra" a la hermandad y al portal si además es pública).
-- 'rejected'  → retira guild_id (la banda vuelve a personal hasta re-propuesta).
-- 'none'      → quita estado/integración.
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
    v_target UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    IF p_status NOT IN ('approved', 'rejected', 'none') THEN
        RAISE EXCEPTION 'Estado inválido';
    END IF;

    -- Destino de la propuesta: target (modelo actual) o guild_id (legacy).
    SELECT guild_id, integration_target_guild_id
    INTO v_guild_id, v_target
    FROM public.raiddominion_bands
    WHERE id = p_band_id;

    v_target := COALESCE(v_target, v_guild_id);

    IF v_target IS NULL THEN
        RAISE EXCEPTION 'La banda no está asociada a una hermandad';
    END IF;

    -- Solo el GM (owner) de la hermandad decide
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds
        WHERE id = v_target AND owner_id = v_user
    ) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    UPDATE public.raiddominion_bands
    SET integration_status = p_status,
        integration_target_guild_id = v_target,
        guild_id = CASE WHEN p_status = 'approved' THEN v_target ELSE NULL END,
        is_rank_integrated = (p_status = 'approved'),
        integration_decided_at = timezone('utc'::text, now()),
        updated_at = now()
    WHERE id = p_band_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_integration(UUID, TEXT) TO authenticated;

-- ─── 5) list_guild_band_proposals v4: filtra por DESTINO (target) ────────
-- Fallback legacy: bandas de antes de esta migración que aún tienen guild_id
-- pero target NULL (pending/approved pendientes de normalizar).
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
    WHERE (
            b.integration_target_guild_id = p_guild_id
            OR (b.integration_target_guild_id IS NULL AND b.guild_id = p_guild_id)
          )
      AND b.integration_status <> 'none';

    RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_list_guild_band_proposals(UUID) TO authenticated;

-- ─── 6) upsert_bands v2: miembro propone, GM aprueba ──────────────────────
-- Un MIEMBRO (no GM) inserta sus bandas SIN guild_id — el destino se guarda
-- en integration_target_guild_id y su GM decide. El GM/owner de la hermandad
-- conserva la auto-aprobación de la subida (bandas inmediatas al portal).
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT);
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_bands(
    p_sv_id UUID,
    p_bands JSONB,
    p_rules JSONB,
    p_owner_rank_index INT DEFAULT NULL,
    p_guild_name TEXT DEFAULT NULL,
    p_character_name TEXT DEFAULT NULL,
    p_character_realm TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner_slug TEXT;
    v_band JSONB;
    v_bname TEXT;
    v_guild_id UUID;
    v_guild_slug TEXT;
    v_guild_match TEXT;
    v_is_gm BOOLEAN;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_count INT := 0;
    v_id UUID;
    v_initial_status TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    -- El SV debe pertenecer al usuario
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_saved_variables
        WHERE id = p_sv_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'SV no pertenece al usuario';
    END IF;

    -- Slug base del owner desde su perfil (raíz de los slugs de banda)
    SELECT slug INTO v_owner_slug
    FROM public.raiddominion_profiles
    WHERE id = v_user;
    v_owner_slug := COALESCE(NULLIF(trim(v_owner_slug), ''), 'usuario');

    -- Borrar SOLO las bandas personales de ESTE PERSONAJE que ya no estén
    -- en su SV. Las de otros personajes (GM incluido) y las atribuidas a una
    -- hermandad (guild_id IS NOT NULL) quedan intactas.
    DELETE FROM public.raiddominion_bands
    WHERE owner_id = v_user
      AND COALESCE(character_name, '') = COALESCE(p_character_name, '')
      AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
      AND guild_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) AS b
          WHERE lower(trim(b->>'name')) = lower(name)
      );

    FOR v_band IN SELECT * FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) LOOP
        v_bname := NULLIF(trim(v_band->>'name'), '');
        CONTINUE WHEN v_bname IS NULL;

        -- Hermandad de la banda: la del dueño (registry.guild.name del SV),
        -- sea o no el owner. Fallback legacy: banda cuyo nombre coincide con
        -- una hermandad (caso GM "Registrar").
        v_guild_id := NULL;
        v_guild_slug := NULL;
        v_guild_match := NULLIF(trim(COALESCE(p_guild_name, v_bname)), '');
        IF v_guild_match IS NOT NULL THEN
            SELECT g.id, g.slug INTO v_guild_id, v_guild_slug
            FROM public.raiddominion_guilds g
            WHERE lower(g.name) = lower(v_guild_match)
            ORDER BY g.created_at
            LIMIT 1;
        END IF;

        -- ¿El subidor es el GM/owner de esa hermandad? Sus bandas se
        -- auto-aprueban (attribuidas + integradas al portal). Un MIEMBRO
        -- queda en 'none' con el target fijado: su GM decide.
        v_is_gm := FALSE;
        IF v_guild_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.raiddominion_guilds
                WHERE id = v_guild_id AND owner_id = v_user
            ) INTO v_is_gm;
        END IF;
        v_initial_status := CASE WHEN v_guild_id IS NOT NULL AND v_is_gm THEN 'approved' ELSE 'none' END;

        -- Slugs base: <guildSlug>-<banda> si hay guild, si no <ownerSlug>-<banda>
        v_base_slug := COALESCE(v_guild_slug, v_owner_slug);
        v_base_slug := lower(regexp_replace(trim(v_base_slug), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN v_base_slug := 'usuario'; END IF;
        v_base_slug := left(v_base_slug, 24);

        v_slug := v_base_slug || '-' || lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := btrim(v_slug, '-');
        v_slug := left(v_slug, 60);

        -- Resolver colisión: la idempotencia es POR PERSONAJE (el mismo
        -- personaje que ya subió la banda la actualiza, nunca otro).
        SELECT id, slug INTO v_id, v_slug
        FROM public.raiddominion_bands
        WHERE owner_id = v_user
          AND COALESCE(character_name, '') = COALESCE(p_character_name, '')
          AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
          AND lower(name) = lower(v_bname)
        ORDER BY created_at
        LIMIT 1;
        IF NOT FOUND THEN
            v_i := 1;
            v_slug := v_base_slug || '-' || lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g'));
            v_slug := btrim(v_slug, '-');
            v_slug := left(v_slug, 60);
            WHILE EXISTS (SELECT 1 FROM public.raiddominion_bands WHERE slug = v_slug) LOOP
                v_i := v_i + 1;
                v_slug := left(v_base_slug, 24) || '-' ||
                          lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || v_i::text;
                v_slug := btrim(v_slug, '-');
                v_slug := left(v_slug, 60);
            END LOOP;
            INSERT INTO public.raiddominion_bands (
                owner_id, guild_id, integration_target_guild_id, slug, name, icon, schedule,
                min_gs, players, rules, is_public, owner_rank_index, is_rank_integrated,
                character_name, character_realm, integration_status
            )
            VALUES (
                v_user,
                CASE WHEN v_initial_status = 'approved' THEN v_guild_id ELSE NULL END,
                v_guild_id,
                v_slug, v_bname,
                NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                (v_band->>'minGS')::numeric,
                COALESCE(v_band->'players', '[]'::jsonb),
                '[]'::jsonb,
                FALSE,
                p_owner_rank_index,
                (v_initial_status = 'approved'),
                NULLIF(trim(p_character_name), ''),
                NULLIF(trim(p_character_realm), ''),
                v_initial_status
            )
            RETURNING id INTO v_id;
        ELSE
            -- Re-upload: se PRESERVAN guild_id, integration_target_guild_id,
            -- integration_status, is_rank_integrated, is_public Y rules
            -- (elección manual del dueño / decisión del GM). Solo SV data.
            UPDATE public.raiddominion_bands SET
                slug = v_slug,
                icon = NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                schedule = NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                min_gs = (v_band->>'minGS')::numeric,
                players = COALESCE(v_band->'players', '[]'::jsonb),
                owner_rank_index = COALESCE(p_owner_rank_index, owner_rank_index),
                updated_at = now()
            WHERE id = v_id;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT) TO authenticated;