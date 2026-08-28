-- ============================================================
-- RaidDominion Portal — Asignación de bandas a hermandades +
-- propuesta de integración validada por el GM
--
-- Decisión de producto (2026-09-01):
--   1. El dueño de una banda asigna EXPLÍCITAMENTE su banda a una
--      hermandad desde el dashboard (select en "Mis Bandas"). Una
--      hermandad puede tener muchas bandas, una banda una sola
--      hermandad (guild_id único, 1:N). El re-upload NO pisa la
--      elección manual.
--   2. Un miembro con rango autorizado para subir bandas puede
--      "PROPONER INTEGRACIÓN" al maestro: la banda pasa a estado
--      'pending' y es visible para el GM.
--   3. El GM aprueba o rechaza las propuestas desde su dashboard
--      (sección nueva en el tab Hermandad). Solo las aprobadas
--      (is_rank_integrated=true) Y públicas salen en el portal.
--
-- Retirada: la política de rangos (raiddominion_set_band_rank_policy,
-- band_rank_policy) queda deprecada y se elimina: la integración ya
-- no se auto-calculan por índice de rango, sino por propuesta del
-- miembro aprobada por el maestro. Las bandas del GM se auto-aprueban
-- (integrated) en el propio upload.
--
-- Columnas nuevas en raiddominion_bands:
--   * integration_status       TEXT  — 'none' | 'pending' | 'approved' | 'rejected'
--   * integration_proposed_by  UUID  — quién propuso
--   * integration_proposed_at  TIMESTAMPTZ
--   * integration_decided_at   TIMESTAMPTZ
--
-- is_rank_integrated se mantiene sincronizado = (status='approved'):
-- el portal (listGuildPortalBands) sigue funcionando sin cambios.
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_ en TODO. SECURITY
-- DEFINER + SET search_path='' + GRANT EXECUTE TO authenticated.
-- ============================================================

-- ─── 1) Columnas nuevas en raiddominion_bands ──────────────────────────
ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS integration_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS integration_proposed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS integration_proposed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS integration_decided_at TIMESTAMP WITH TIME ZONE;

-- Índice para la vista del GM (propuestas por hermandad)
CREATE INDEX IF NOT EXISTS idx_raiddominion_bands_guild_integration
    ON public.raiddominion_bands(guild_id, integration_status);

-- ─── 2) Retirada: política de rangos deprecada ─────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_set_band_rank_policy(UUID, INT[]);

-- ─── 3) raiddominion_upsert_bands v4 ───────────────────────────────────
-- INSERT: guild_id se auto-asigna desde p_guild_name (hermandad del SV).
--   * Si el subidor es el GM/owner de esa hermandad → 'approved' (auto-
--     integrada, comportamiento previo del maestro).
--   * Si no → 'none' (el miembro decide proponer desde su dashboard).
-- UPDATE (re-upload): se PRESERVAN guild_id (elección manual del dueño),
-- integration_status, is_rank_integrated e is_public. Solo se refrescan
-- los datos del SV (players/rules/icon/horario/GS/rango/atribución).
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
    -- en su SV. Las de otros personajes (GM incluido) y las de hermandad
    -- (guild_id IS NOT NULL) quedan intactas: cada subida gestiona lo suyo.
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
        -- sea o no el owner — así las bandas de un LÍDER (no GM) se asocian
        -- a su hermandad y pueden integrarse al portal. Fallback legacy:
        -- banda cuyo nombre coincide con una hermandad (caso GM "Registrar").
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
        -- auto-aprueban (integrated). Un miembro empieza en 'none' y
        -- propone la integración desde su dashboard.
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
                owner_id, guild_id, slug, name, icon, schedule, min_gs,
                players, rules, is_public, owner_rank_index, is_rank_integrated,
                character_name, character_realm, integration_status
            )
            VALUES (
                v_user, v_guild_id, v_slug, v_bname,
                NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                (v_band->>'minGS')::numeric,
                COALESCE(v_band->'players', '[]'::jsonb),
                COALESCE(p_rules, '[]'::jsonb),
                FALSE,
                p_owner_rank_index,
                (v_initial_status = 'approved'),
                NULLIF(trim(p_character_name), ''),
                NULLIF(trim(p_character_realm), ''),
                v_initial_status
            )
            RETURNING id INTO v_id;
        ELSE
            -- Re-upload: se PRESERVA guild_id (elección manual del dueño),
            -- integration_status, is_rank_integrated e is_public. Solo se
            -- refrescan los datos del SV.
            UPDATE public.raiddominion_bands SET
                slug = v_slug,
                icon = NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                schedule = NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                min_gs = (v_band->>'minGS')::numeric,
                players = COALESCE(v_band->'players', '[]'::jsonb),
                rules = COALESCE(p_rules, '[]'::jsonb),
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

-- ─── 4) RPC raiddominion_set_band_guild ────────────────────────────────
-- El dueño de la banda la asigna a UNA hermandad (1:N; NULL = personal).
-- Valida pertenencia: puede asignar a una hermandad donde aparece como
-- miembro (sv_guild_name de sus personajes) o que él mismo posee.
-- Al CAMBIAR de hermandad se reinicia la integración a 'none': una
-- propuesta era para el maestro de la hermandad anterior y no debe
-- heredarse a la nueva.
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
    v_old_guild UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT guild_id INTO v_old_guild
    FROM public.raiddominion_bands
    WHERE id = p_band_id AND owner_id = v_user;

    IF v_old_guild IS NULL THEN
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

-- ─── 5) RPC raiddominion_propose_band_integration ─────────────────────
-- El dueño de la banda (miembro con rango autorizado) propone integrarla
-- al portal de su hermandad. Requiere banda ya asignada a una hermandad.
-- Si ya está aprobada no hay nada que proponer.
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
    v_guild_id UUID;
    v_status TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT guild_id, integration_status INTO v_guild_id, v_status
    FROM public.raiddominion_bands
    WHERE id = p_band_id AND owner_id = v_user;

    IF v_guild_id IS NULL THEN
        RAISE EXCEPTION 'Asigna la banda a una hermandad antes de proponer la integración';
    END IF;
    IF v_status = 'approved' THEN
        RAISE EXCEPTION 'La banda ya está integrada al portal';
    END IF;
    IF v_status = 'pending' THEN
        RETURN TRUE; -- idempotente
    END IF;

    -- El usuario debe pertenecer a la hermandad de la banda
    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_guilds g
        WHERE g.id = v_guild_id
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

-- ─── 6) RPC raiddominion_set_band_integration ─────────────────────────
-- SOLO el owner de la hermandad (GM) aprueba o rechaza la propuesta.
-- 'approved' → is_rank_integrated=true (sale en el portal si además es
-- pública); 'rejected' o 'none' → is_rank_integrated=false.
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

-- ─── 7) RPC raiddominion_list_guild_band_proposals ────────────────────
-- Vista del GM: todas las bandas de su hermandad con integración propuesta
-- (no 'none'), con el perfil del proponente para mostrarle su nombre o @hex.
-- Solo el owner de la hermandad puede consultar (sortea la RLS de bands,
-- que solo permite owner O públicas, sin subconsultas).
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