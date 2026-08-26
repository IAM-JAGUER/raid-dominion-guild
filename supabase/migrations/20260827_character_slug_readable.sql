-- ============================================================
-- RaidDominion Portal — Slug legible de personaje (name-reino) + RLS UPDATE
--
-- Correcciones sobre 20260825_character_slug.sql y 20260826_bands_server.sql:
--   1) Restaura la policy UPDATE de raiddominion_characters (character_slug
--      la eliminó → setCharacterVisibility quedaba denegado).
--   2) Slugs LEGIBLES "name-reino" en vez de hex-8, generados por un helper
--      único. upsert_character v4 los asigna AL INSERTAR (auto-slug) y al
--      cambiar nombre/reino; el RPC ensure los normaliza.
--   3) Backfill: normaliza slugs existentes (hex-8 o NULL) a legibles.
--   4) La vista pública de personaje ahora expone c.server (realmlist), que
--      es DISTINTO de realm (capa servidor ≠ reino).
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_. SECURITY DEFINER +
-- SET search_path='' + GRANT EXECUTE TO authenticated. RLS sin subconsultas.
-- ============================================================

-- ─── 1) RLS: UPDATE propio restaurado ────────────────────────────────────
DROP POLICY IF EXISTS raiddominion_characters_update_own ON public.raiddominion_characters;
CREATE POLICY raiddominion_characters_update_own ON public.raiddominion_characters
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─── 2) Helper: slug legible único "name-reino" ──────────────────────────
-- La unicidad de (name, realm) garantiza un slug estable; el loop resuelve
-- colisiones por normalización (p. ej. reinos con espacios/guiones).
DROP FUNCTION IF EXISTS public.raiddominion_make_character_slug(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_make_character_slug(
    p_name TEXT,
    p_realm TEXT,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base TEXT;
    v_slug TEXT;
    v_i INT := 1;
BEGIN
    v_base := lower(regexp_replace(
        coalesce(nullif(trim(p_name), ''), 'personaje') || '-' ||
        coalesce(nullif(trim(p_realm), ''), 'reino'),
        '[^a-z0-9]+', '-', 'g'
    ));
    v_base := btrim(v_base, '-');
    IF v_base = '' THEN v_base := 'personaje'; END IF;
    v_base := left(v_base, 56);

    v_slug := v_base;
    WHILE EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE slug = v_slug AND (p_exclude_id IS NULL OR id <> p_exclude_id)
    ) LOOP
        v_i := v_i + 1;
        v_slug := left(v_base, 48) || '-' || v_i::text;
    END LOOP;
    RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_make_character_slug(TEXT, TEXT, UUID) TO authenticated;

-- ─── 3) upsert_character v4: auto-slug legible ───────────────────────────
-- Conserva TODO de v3 (server, sv_guild_*, equipment, anti-falseo) y añade
-- el slug en el INSERT (y si cambia name/realm en el UPDATE).
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
    v_realm TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;
    v_realm := NULLIF(trim(p_player->>'realm'), '');

    -- Anti-falseo: ¿el (nombre, reino) ya pertenece a otra cuenta?
    SELECT id INTO v_existing
    FROM public.raiddominion_characters
    WHERE lower(name) = lower(v_name)
      AND lower(COALESCE(realm, '')) = lower(COALESCE(v_realm, ''))
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
                slug = CASE
                           WHEN lower(COALESCE(realm, '')) <> lower(COALESCE(v_realm, ''))
                             OR lower(name) <> lower(v_name)
                           THEN public.raiddominion_make_character_slug(v_name, v_realm, id)
                           ELSE slug
                       END,
                updated_at = now()
            WHERE id = v_existing;
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, server, slug, class, class_file, race, race_file,
        level, talent_spec, avg_ilvl, equipment,
        sv_guild_name, sv_guild_rank, sv_is_gm
    ) VALUES (
        v_user, p_sv_id, v_name, v_realm,
        NULLIF(trim(p_player->>'server'), ''),
        public.raiddominion_make_character_slug(v_name, v_realm),
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

-- ─── 4) ensure_character_slug: normaliza a legible (idempotente) ─────────
DROP FUNCTION IF EXISTS public.raiddominion_ensure_character_slug();
CREATE OR REPLACE FUNCTION public.raiddominion_ensure_character_slug()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_char RECORD;
    v_slug TEXT;
    v_out JSONB := '[]'::jsonb;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Idempotente: conserva slugs correctos; normaliza hex-8/NULL a legible.
    FOR v_char IN
        SELECT id, name, realm, slug FROM public.raiddominion_characters
        WHERE user_id = v_user
    LOOP
        v_slug := public.raiddominion_make_character_slug(v_char.name, v_char.realm, v_char.id);
        IF v_char.slug IS DISTINCT FROM v_slug THEN
            UPDATE public.raiddominion_characters
            SET slug = v_slug, updated_at = timezone('utc'::text, now())
            WHERE id = v_char.id;
        END IF;
        v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_char.id, 'slug', v_slug));
    END LOOP;

    RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_ensure_character_slug() TO authenticated;

-- ─── 5) Vista pública: expone server (realmlist ≠ reino) ─────────────────
DROP VIEW IF EXISTS public.raiddominion_character_public;
CREATE VIEW public.raiddominion_character_public
WITH (security_invoker = true)
AS
SELECT
    c.id,
    c.user_id,
    c.sv_upload_id,
    c.slug,
    c.name,
    c.realm,
    c.server,
    c.class,
    c.class_file,
    c.race,
    c.race_file,
    c.level,
    c.talent_spec,
    c.avg_ilvl,
    c.equipment,
    c.is_public,
    c.member_verified,
    c.sv_guild_name,
    c.sv_guild_rank,
    c.sv_is_gm,
    c.created_at,
    c.updated_at,
    p.id AS profile_id,
    p.slug AS profile_slug,
    p.display_name AS profile_display_name,
    p.character_name AS profile_character_name,
    p.realm AS profile_realm,
    p.role AS profile_role,
    p.is_guild_master AS profile_is_guild_master,
    p.is_public AS profile_is_public
FROM public.raiddominion_characters c
LEFT JOIN public.raiddominion_profiles p ON p.id = c.user_id;

GRANT SELECT ON public.raiddominion_character_public TO anon, authenticated;

-- ─── 6) Backfill: normaliza a slug legible ───────────────────────────────
-- Hex-8 ("d4f3a1b2") o NULL → "name-reino". Se recalcula para personajes
-- públicos (el RPC ensure cubre los propios de cada usuario).
DO $$
DECLARE
    c RECORD;
    v_slug TEXT;
BEGIN
    FOR c IN
        SELECT id, name, realm, slug FROM public.raiddominion_characters
        WHERE is_public = TRUE
    LOOP
        v_slug := public.raiddominion_make_character_slug(c.name, c.realm, c.id);
        IF c.slug IS DISTINCT FROM v_slug THEN
            UPDATE public.raiddominion_characters
            SET slug = v_slug, updated_at = timezone('utc'::text, now())
            WHERE id = c.id;
        END IF;
    END LOOP;
END $$;