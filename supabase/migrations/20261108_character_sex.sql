-- ─── Sexo real del personaje (addon v3.3.0) ──────────────────────────
-- Base canónica previa: 20261015 (upsert_character con nota/instancias) y
-- 20261024 (vista pública con note_rich).
--   * Nueva columna `sex` ('Male'/'Female') escrita SOLO al pulsar
--     "Registrar" desde `registry[].player.sex` (UnitSex). Los SV antiguos
--     no traen la clave y conservan lo ya guardado (COALESCE).
--   * La vista pública expone `sex` para que la ficha use el retrato real
--     en lugar de inferir el género desde el nombre de raza.

ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('Male', 'Female'));

-- ─── upsert_character: persiste el sexo ──────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB);
CREATE FUNCTION public.raiddominion_upsert_character(
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
    v_owner UUID;
    v_name TEXT;
    v_realm TEXT;
    v_objectives JSONB;
    v_instances JSONB;
    v_note TEXT;
    v_sex TEXT;
    v_new_id UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;
    v_realm := NULLIF(trim(p_player->>'realm'), '');
    -- Metas/instancias/nota: NULL si el SV no trae la rama (addons anteriores)
    -- → no se tocan. Con la rama presente, el SV manda (incluido vacío).
    v_objectives := CASE
        WHEN jsonb_typeof(p_player -> 'objectives') = 'object'
            THEN public.raiddominion_sanitize_objectives(p_player -> 'objectives')
        ELSE NULL
    END;
    v_instances := CASE
        WHEN jsonb_typeof(p_player -> 'instances') = 'array'
            THEN public.raiddominion_sanitize_instances(p_player -> 'instances')
        ELSE NULL
    END;
    v_note := CASE
        WHEN jsonb_typeof(p_player -> 'note') = 'string'
            THEN p_player ->> 'note'
        ELSE NULL
    END;
    -- Sexo: solo tokens válidos; NULL si el SV es anterior a 3.3.0.
    v_sex := CASE
        WHEN (p_player ->> 'sex') IN ('Male', 'Female')
            THEN p_player ->> 'sex'
        ELSE NULL
    END;

    -- 1) Anti-falseo: ¿el (nombre, reino) ya pertenece a otra cuenta?
    SELECT id, user_id INTO v_existing, v_owner
    FROM public.raiddominion_characters
    WHERE lower(name) = lower(v_name)
      AND lower(COALESCE(realm, '')) = lower(COALESCE(v_realm, ''))
    ORDER BY created_at, id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        IF v_owner = v_user THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = COALESCE(NULLIF(p_player->>'class', ''), class),
                class_file = COALESCE(NULLIF(p_player->>'classFile', ''), class_file),
                race = COALESCE(NULLIF(p_player->>'race', ''), race),
                race_file = COALESCE(NULLIF(p_player->>'raceFile', ''), race_file),
                sex = COALESCE(v_sex, sex),
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                objectives = COALESCE(v_objectives, objectives),
                instances = COALESCE(v_instances, instances),
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
            PERFORM public.raiddominion_apply_character_note(v_existing, v_note);
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    -- 2) Reconciliación por NOMBRE cuando al menos UN lado no declaró reino.
    --    Un reino vacío es falta de dato, no un reino distinto: si el mismo
    --    nombre existe con reino NULL/'' (o el incoming viene sin reino),
    --    se trata del MISMO personaje. Cierra el duplicado entre cuentas
    --    ("X"/'' vs "X"/"Bennu") y el doble registro dentro de una cuenta.
    IF v_realm IS NULL THEN
        SELECT id, user_id INTO v_existing, v_owner
        FROM public.raiddominion_characters
        WHERE lower(name) = lower(v_name)
        ORDER BY created_at, id
        LIMIT 1;
    ELSE
        SELECT id, user_id INTO v_existing, v_owner
        FROM public.raiddominion_characters
        WHERE lower(name) = lower(v_name)
          AND NULLIF(trim(realm), '') IS NULL
        ORDER BY created_at, id
        LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
        IF v_owner = v_user THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = COALESCE(NULLIF(p_player->>'class', ''), class),
                class_file = COALESCE(NULLIF(p_player->>'classFile', ''), class_file),
                race = COALESCE(NULLIF(p_player->>'race', ''), race),
                race_file = COALESCE(NULLIF(p_player->>'raceFile', ''), race_file),
                sex = COALESCE(v_sex, sex),
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                realm = COALESCE(realm, v_realm),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                objectives = COALESCE(v_objectives, objectives),
                instances = COALESCE(v_instances, instances),
                sv_guild_name = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
                sv_guild_rank = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
                sv_is_gm = CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END,
                slug = CASE
                           WHEN COALESCE(realm, v_realm) IS DISTINCT FROM realm
                             OR lower(name) <> lower(v_name)
                           THEN public.raiddominion_make_character_slug(v_name, COALESCE(realm, v_realm), id)
                           ELSE slug
                       END,
                updated_at = now()
            WHERE id = v_existing;
            PERFORM public.raiddominion_apply_character_note(v_existing, v_note);
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, server, slug, class, class_file, race, race_file,
        sex, level, talent_spec, avg_ilvl, equipment, objectives, instances,
        sv_guild_name, sv_guild_rank, sv_is_gm
    ) VALUES (
        v_user, p_sv_id, v_name, v_realm,
        NULLIF(trim(p_player->>'server'), ''),
        public.raiddominion_make_character_slug(v_name, v_realm),
        NULLIF(p_player->>'class', ''), NULLIF(p_player->>'classFile', ''),
        NULLIF(p_player->>'race', ''), NULLIF(p_player->>'raceFile', ''),
        v_sex,
        (p_player->>'level')::int,
        NULLIF(p_player->>'talentSpec', ''),
        (p_player->>'avgIlvl')::numeric,
        COALESCE(p_player->'equipment', '[]'::jsonb),
        COALESCE(v_objectives, '{"equipment":[],"currencies":[]}'::jsonb),
        COALESCE(v_instances, '[]'::jsonb),
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END
    )
    RETURNING id INTO v_new_id;

    PERFORM public.raiddominion_apply_character_note(v_new_id, v_note);

    RETURN 'created';
END;
$$;

COMMENT ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) IS
    'Registra/actualiza el personaje del SV (anti-falseo por nombre+reino), sus metas/instancias públicas, su nota privada y su sexo real.';

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- ─── Vista pública: expone sex para el retrato real ──────────────────
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
    c.class,
    c.class_file,
    c.race,
    c.race_file,
    c.sex,
    c.level,
    c.talent_spec,
    c.avg_ilvl,
    c.equipment,
    c.objectives,
    c.instances,
    public.raiddominion_get_character_note(c.id) AS note,
    public.raiddominion_get_character_note_rich(c.id) AS note_rich,
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
