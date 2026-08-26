-- ============================================================
-- RaidDominion Portal — Campo `server` (realmlist ≠ reino) + tabla raiddominion_bands
--
-- 1. `server` (realmlist real, p.ej. "Lordaeron") se persiste en
--    raiddominion_characters y raiddominion_guilds. Solo vive en
--    registry.player del SV (el roster `characters` de la cuenta NO lo trae).
-- 2. raiddominion_bands: bandas + reglas con guild_id NULLABLE — un jugador
--    puede llevar bandas/reglas SIN hermandad reclamada. El slug es único
--    global; se genera como <ownerSlug>-<banda> o <guildSlug>-<banda>.
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_ en TODO. SECURITY DEFINER +
-- SET search_path='' + GRANT EXECUTE TO authenticated en los RPCs.
-- RLS sin subconsultas (regla RLS #1).
-- ============================================================

-- ─── 1) server en personajes y hermandades ──────────────────────────────
ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS server TEXT;

ALTER TABLE public.raiddominion_guilds
    ADD COLUMN IF NOT EXISTS server TEXT;

-- ─── 2) raiddominion_bands ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_bands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guild_id UUID REFERENCES public.raiddominion_guilds(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    icon TEXT,
    schedule TEXT,
    min_gs NUMERIC,
    players JSONB NOT NULL DEFAULT '[]'::jsonb,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raiddominion_bands_owner ON public.raiddominion_bands(owner_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_bands_guild ON public.raiddominion_bands(guild_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_bands_is_public ON public.raiddominion_bands(is_public);

ALTER TABLE public.raiddominion_bands ENABLE ROW LEVEL SECURITY;

-- Limpiar policies previas (idempotente)
DROP POLICY IF EXISTS raiddominion_bands_select ON public.raiddominion_bands;
DROP POLICY IF EXISTS raiddominion_bands_insert_own ON public.raiddominion_bands;
DROP POLICY IF EXISTS raiddominion_bands_update_own ON public.raiddominion_bands;

-- Lectura: propia o pública (espejo de visibilidad fijado por el RPC de sync)
CREATE POLICY raiddominion_bands_select ON public.raiddominion_bands
    FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);

-- Insert/Update solo del dueño; la escritura real la hace el RPC SECURITY DEFINER
CREATE POLICY raiddominion_bands_insert_own ON public.raiddominion_bands
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY raiddominion_bands_update_own ON public.raiddominion_bands
    FOR UPDATE USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- ─── 3) upsert_character v3: persiste p_player->>'server' ────────────────
DROP FUNCTION IF EXISTS public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_character(
    p_sv_id UUID,
    p_player JSONB,
    p_saved_at TEXT DEFAULT NULL,
    p_guild JSONB DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_existing UUID;
    v_name TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;

    -- Anti-falseo: ¿el (nombre, reino) ya pertenece a otra cuenta?
    SELECT id INTO v_existing
    FROM public.raiddominion_characters
    WHERE lower(name) = lower(v_name)
      AND lower(COALESCE(realm, '')) = lower(COALESCE(p_player->>'realm', ''))
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.raiddominion_characters WHERE id = v_existing AND user_id = v_user) THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = COALESCE(NULLIF(p_player->>'class', ''), class),
                class_file = COALESCE(NULLIF(p_player->>'classFile', ''), class_file),
                race = COALESCE(NULLIF(p_player->>'race', ''), race),
                race_file = COALESCE(NULLIF(p_player->>'raceFile', ''), race_file),
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                sv_guild_name = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
                sv_guild_rank = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
                sv_is_gm = CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END,
                updated_at = now()
            WHERE id = v_existing;
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, server, class, class_file, race, race_file,
        level, talent_spec, avg_ilvl, equipment,
        sv_guild_name, sv_guild_rank, sv_is_gm
    ) VALUES (
        v_user, p_sv_id, v_name, NULLIF(p_player->>'realm', ''),
        NULLIF(trim(p_player->>'server'), ''),
        NULLIF(p_player->>'class', ''), NULLIF(p_player->>'classFile', ''),
        NULLIF(p_player->>'race', ''), NULLIF(p_player->>'raceFile', ''),
        (p_player->>'level')::int,
        NULLIF(p_player->>'talentSpec', ''),
        (p_player->>'avgIlvl')::numeric,
        COALESCE(p_player->'equipment', '[]'::jsonb),
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END
    );

    RETURN 'created';
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- ─── 4) RPC raiddominion_upsert_bands ───────────────────────────────────
-- Persiste las bandas (+ reglas) de un SV para el owner autenticado.
--   * Asocia guild_id cuando el nombre de la banda coincide (insensible a
--     mayúsculas) con una hermandad propia del usuario.
--   * Genera slug único <ownerSlug>-<banda> o <guildSlug>-<banda>; ante
--     colisión de slug añade sufijo numérico.
--   * Upsert por owner desde el SV: borra las bandas propias no presentes
--     y recrea/actualiza las presentes. is_public queda como espejo:
--     guild.is_public si hay guild, si no del perfil del owner.
--   * Respeta la forma real players[{name,class,role,dual,leader,banned,
--     sanction,notes,points}] y rules[{title,content,icon}].
-- Devuelve el número de bandas persistidas.
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_bands(
    p_sv_id UUID,
    p_bands JSONB,
    p_rules JSONB
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
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_is_public BOOLEAN;
    v_count INT := 0;
    v_id UUID;
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

    -- Visibilidad espejo: perfil del owner (fallback si no hay guild)
    SELECT is_public INTO v_is_public
    FROM public.raiddominion_profiles
    WHERE id = v_user;
    v_is_public := COALESCE(v_is_public, FALSE);

    -- Borrar bandas propias (sin guild) que ya no estén en este SV; las de
    -- guild se gestionan por upsert de nombre a continuación.
    DELETE FROM public.raiddominion_bands
    WHERE owner_id = v_user AND guild_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) AS b
          WHERE lower(trim(b->>'name')) = lower(name)
      );

    FOR v_band IN SELECT * FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) LOOP
        v_bname := NULLIF(trim(v_band->>'name'), '');
        CONTINUE WHEN v_bname IS NULL;

        -- ¿Coincide el nombre con una hermandad propia? (insensible a mayúsculas)
        v_guild_id := NULL;
        v_guild_slug := NULL;
        SELECT g.id, g.slug INTO v_guild_id, v_guild_slug
        FROM public.raiddominion_guilds g
        WHERE g.owner_id = v_user AND lower(g.name) = lower(v_bname)
        ORDER BY g.created_at
        LIMIT 1;

        -- Slugs base: <guildSlug>-<banda> si hay guild, si no <ownerSlug>-<banda>
        v_base_slug := COALESCE(v_guild_slug, v_owner_slug);
        v_base_slug := lower(regexp_replace(trim(v_base_slug), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN v_base_slug := 'usuario'; END IF;
        v_base_slug := left(v_base_slug, 24);

        v_slug := v_base_slug || '-' || lower(regexp_replace(trim(v_bname), '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := btrim(v_slug, '-');
        v_slug := left(v_slug, 60);

        -- Visibilidad: espejo de la guild si hay, si no del perfil
        IF v_guild_id IS NOT NULL THEN
            SELECT COALESCE(is_public, FALSE) INTO v_is_public
            FROM public.raiddominion_guilds WHERE id = v_guild_id;
        END IF;

        -- Resolver colisión de slug (idempotencia por nombre del owner primero)
        SELECT id, slug INTO v_id, v_slug
        FROM public.raiddominion_bands
        WHERE owner_id = v_user AND lower(name) = lower(v_bname)
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
                players, rules, is_public
            )
            VALUES (
                v_user, v_guild_id, v_slug, v_bname,
                NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                (v_band->>'minGS')::numeric,
                COALESCE(v_band->'players', '[]'::jsonb),
                COALESCE(p_rules, '[]'::jsonb),
                v_is_public
            )
            RETURNING id INTO v_id;
        ELSE
            UPDATE public.raiddominion_bands SET
                guild_id = v_guild_id,
                slug = v_slug,
                icon = NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                schedule = NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                min_gs = (v_band->>'minGS')::numeric,
                players = COALESCE(v_band->'players', '[]'::jsonb),
                rules = COALESCE(p_rules, '[]'::jsonb),
                is_public = v_is_public,
                updated_at = now()
            WHERE id = v_id;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB) TO authenticated;
