-- ═══════════════════════════════════════════════════════════════════════════
-- raiddominion_upsert_bands v5: COMBINACIÓN de bandas al re-subir un SV.
--
-- PROBLEMA: la idempotencia era SOLO por NOMBRE. Un SV que repite una banda
-- con distinta hora/día colapsaba ambos turnos en UNA fila (datos perdidos), y
-- el re-upload pisaba `players` entero en vez de combinar. Además, los
-- archivos de personajes distintos de la MISMA cuenta no se combinaban.
--
-- NUEVO CONTRATO:
--   1) Clave de coincidencia = (cuenta, nombre, schedule) — schedule codifica
--      hora y día ("DIA 20:00"). La banda es de la CUENTA: aunque venga de
--      otro personaje del mismo owner se combina en la misma fila (se prioriza
--      una fila del mismo personaje; si no, cualquiera de la cuenta). Dos
--      turnos con el mismo nombre NO se pisan.
--   2) En coincidencia SE COMBINA sin redundancia:
--        · players: unión de rosters deduplicada por personaje (nombre en
--          minúsculas). El re-upload aporta los datos NUEVOS y rellena lo que
--          al existente le faltaba; si el campo nuevo viene vacío se conserva
--          el existente.
--        · icon / schedule / min_gs: se rellenan solo si falta (COALESCE).
--      Se PRESERVAN guild_id, integration_target_guild_id, integration_status,
--      is_rank_integrated, is_public, rules (elección del dueño / GM) y la
--      atribución de personaje/origen de la primera fila.
--   3) El borrado de bandas personales de ESTE PERSONAJE también usa la clave
--      (nombre, schedule): quitar un turno del SV lo elimina sin tocar los
--      turnos de otros personajes.
-- ═══════════════════════════════════════════════════════════════════════════

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
    v_bschedule TEXT;
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
    v_new_players JSONB;
    v_merged JSONB;
    v_p JSONB;
    v_kv RECORD;
    v_match JSONB;
    v_merged_elem JSONB;
    v_rest JSONB;
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
    -- en su SV con su (nombre, schedule) exacto. Quitar de una sola se lleva
    -- solo ese turno; las de otros personajes (GM incluido) y las atribuidas
    -- a una hermandad (guild_id IS NOT NULL) quedan intactas.
    DELETE FROM public.raiddominion_bands
    WHERE owner_id = v_user
      AND COALESCE(character_name, '') = COALESCE(p_character_name, '')
      AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
      AND guild_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) AS b
          WHERE lower(trim(b->>'name')) = lower(name)
            AND lower(trim(COALESCE(b->>'schedule', ''))) = lower(trim(COALESCE(schedule, '')))
      );

    FOR v_band IN SELECT * FROM jsonb_array_elements(COALESCE(p_bands, '[]'::jsonb)) LOOP
        v_bname := NULLIF(trim(v_band->>'name'), '');
        CONTINUE WHEN v_bname IS NULL;
        v_bschedule := lower(trim(COALESCE(v_band->>'schedule', '')));

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

        -- Resolver colisión: la idempotencia es DE LA CUENTA (owner) por
        -- (nombre, schedule): un personaje que ya subió ese turno lo COMBINA,
        -- y si viene de OTRO personaje de la misma cuenta también se combina
        -- en la misma fila (se prioriza la del mismo personaje, origen intacto).
        -- Dos turnos distintos (hora/día) conviven como bandas nuevas.
        SELECT id, slug INTO v_id, v_slug
        FROM public.raiddominion_bands
        WHERE owner_id = v_user
          AND lower(name) = lower(v_bname)
          AND lower(trim(COALESCE(schedule, ''))) = v_bschedule
        ORDER BY
          CASE WHEN COALESCE(character_name, '') = COALESCE(p_character_name, '')
                AND COALESCE(character_realm, '') = COALESCE(p_character_realm, '')
               THEN 0 ELSE 1 END,
          created_at
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
            -- Re-upload: COMBINAR sin redundancia. Se PRESERVAN guild_id,
            -- integration_target_guild_id, integration_status,
            -- is_rank_integrated, is_public Y rules (elección del dueño/GM).
            -- Los datos del nuevo SV dominan; lo que llegue vacío conserva lo
            -- existente. players = unión deduplicada por personaje.
            v_new_players := COALESCE(v_band->'players', '[]'::jsonb);
            v_merged := COALESCE((SELECT players FROM public.raiddominion_bands WHERE id = v_id), '[]'::jsonb);
            FOR v_p IN SELECT * FROM jsonb_array_elements(v_new_players) LOOP
                IF v_p->>'name' IS NULL THEN CONTINUE; END IF;
                SELECT j INTO v_match
                FROM jsonb_array_elements(v_merged) j
                WHERE lower(trim(j->>'name')) = lower(trim(v_p->>'name'))
                LIMIT 1;
                IF v_match IS NULL THEN
                    v_merged := v_merged || v_p;
                ELSE
                    -- Rellenar del nuevo lo que el existente no tenga; dejar
                    -- las identidades del existente si el nuevo trae vacío.
                    v_merged_elem := v_match;
                    FOR v_kv IN SELECT * FROM jsonb_each(v_p) LOOP
                        IF v_kv.value IS NOT NULL AND v_kv.value <> to_jsonb('') THEN
                            v_merged_elem := v_merged_elem || jsonb_build_object(v_kv.key, v_kv.value);
                        END IF;
                    END LOOP;
                    SELECT jsonb_agg(j ORDER BY ord) INTO v_rest
                    FROM (
                        SELECT j, ord
                        FROM jsonb_array_elements(v_merged) WITH ORDINALITY AS x(j, ord)
                        WHERE lower(trim(j->>'name')) <> lower(trim(v_p->>'name'))
                    ) t;
                    v_merged := COALESCE(v_rest, '[]'::jsonb) || COALESCE(v_merged_elem, '{}'::jsonb);
                END IF;
            END LOOP;

            UPDATE public.raiddominion_bands SET
                slug = v_slug,
                icon = CASE
                    WHEN NULLIF(trim(COALESCE(v_band->>'icon', '')), '') IS NULL THEN icon
                    ELSE NULLIF(trim(COALESCE(v_band->>'icon', '')), '')
                END,
                schedule = CASE
                    WHEN NULLIF(trim(COALESCE(v_band->>'schedule', '')), '') IS NULL THEN schedule
                    ELSE NULLIF(trim(COALESCE(v_band->>'schedule', '')), '')
                END,
                min_gs = CASE
                    WHEN (v_band->>'minGS')::numeric IS NULL THEN min_gs
                    ELSE (v_band->>'minGS')::numeric
                END,
                players = v_merged,
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