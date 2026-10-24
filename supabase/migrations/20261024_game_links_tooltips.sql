-- ============================================================
-- RaidDominion Portal — Tooltips de UltimoWoW para enlaces del juego
--
-- DECISIÓN DE PRODUCTO (2026-10-24): el portal usa el MISMO método de tooltip
-- que el tracker local wow-rd:
--   * power.js de https://wotlk.ultimowow.com (carga perezosa en
--     src/lib/ui/wowhead.ts).
--   * enlaces `data-wowhead="kind=id"` y URL https://wotlk.ultimowow.com/es/?kind=id.
--   * equipamiento/metas con itemID del SV.
--   * notas del juego y nombres de banda con tokens ricos persistidos.
--
-- 1) `raiddominion_character_notes.note_rich`: tokens JSONB de los enlaces de
--    la nota. La nota de texto y su visibilidad (notes_public + is_public) no
--    cambian; la vista pública expone note_rich con el MISMO gate.
-- 2) `raiddominion_bands.name_link`: enlace del juego del nombre de banda
--    (logro de la mazmorra). Es dato público de la banda.
-- 3) Saneadores y RPC de sincronización de tokens. Sin tocar otras apps.
--
-- Filas ya guardadas: name_link/note_rich nacen vacíos porque el markup crudo
-- no se persistió; se rellenan al re-subir el SV con el parser v3.6.0.
--
-- Reglas: solo tablas raiddominion_, IF EXISTS/IF NOT EXISTS, SECURITY DEFINER
-- + SET search_path='', sin tocar otras apps.
-- ============================================================

-- ─── 1) Columnas ───────────────────────────────────────────────────────
ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS name_link JSONB;

COMMENT ON COLUMN public.raiddominion_bands.name_link IS
    'Enlace del juego del nombre de banda (logro de la mazmorra) saneado: {type,id,label,color?}.';

ALTER TABLE public.raiddominion_character_notes
    ADD COLUMN IF NOT EXISTS note_rich JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.raiddominion_character_notes.note_rich IS
    'Tokens ricos de la nota (texto + enlaces del juego). Privado; la vista pública lo expone solo con notes_public + is_public.';

-- ─── 2) Saneadores ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_sanitize_wow_link(JSONB);
CREATE FUNCTION public.raiddominion_sanitize_wow_link(p_link JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN jsonb_typeof(p_link) <> 'object' THEN NULL
        WHEN lower(trim(COALESCE(p_link ->> 'type', ''))) NOT IN (
            'item', 'spell', 'achievement', 'quest', 'currency',
            'npc', 'object', 'itemset', 'event', 'enchant', 'glyph', 'talent'
        ) THEN NULL
        WHEN (p_link ->> 'id') !~ '^[0-9]{1,12}$' THEN NULL
        WHEN (p_link ->> 'id')::int <= 0 THEN NULL
        WHEN btrim(COALESCE(p_link ->> 'label', '')) = '' THEN NULL
        ELSE jsonb_strip_nulls(jsonb_build_object(
            'type', lower(trim(p_link ->> 'type')),
            'id', (p_link ->> 'id')::int,
            'label', left(btrim(p_link ->> 'label'), 200),
            'color', CASE WHEN (p_link ->> 'color') ~ '^[0-9a-fA-F]{6}$'
                          THEN lower(p_link ->> 'color') END
        ))
    END;
$$;

COMMENT ON FUNCTION public.raiddominion_sanitize_wow_link(JSONB) IS
    'Normaliza un enlace del juego a {type,id,label,color?}; NULL si es inválido.';

REVOKE ALL ON FUNCTION public.raiddominion_sanitize_wow_link(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_wow_link(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_wow_link(JSONB) FROM authenticated;

DROP FUNCTION IF EXISTS public.raiddominion_sanitize_rich_text(JSONB);
CREATE FUNCTION public.raiddominion_sanitize_rich_text(p_tokens JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(jsonb_agg(tok ORDER BY ord), '[]'::jsonb)
    FROM (
        SELECT
            CASE
                WHEN e ->> 'type' = 'text' THEN jsonb_build_object(
                    'type', 'text',
                    'text', left(COALESCE(e ->> 'text', ''), 2000)
                )
                WHEN e ->> 'type' = 'link' THEN public.raiddominion_sanitize_wow_link(
                    jsonb_build_object(
                        'type', e ->> 'kind',
                        'id', e ->> 'id',
                        'label', e ->> 'label',
                        'color', e ->> 'color'
                    )
                )
                ELSE NULL
            END AS tok,
            ord
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_tokens) = 'array'
                      THEN p_tokens
                      ELSE '[]'::jsonb
                 END
             ) WITH ORDINALITY AS x(e, ord)
        WHERE jsonb_typeof(e) = 'object'
        ORDER BY ord
        LIMIT 200
    ) s
    WHERE tok IS NOT NULL
      AND NOT (tok ->> 'type' = 'text' AND btrim(COALESCE(tok ->> 'text', '')) = '');
$$;

COMMENT ON FUNCTION public.raiddominion_sanitize_rich_text(JSONB) IS
    'Normaliza tokens ricos de nota (texto + enlaces) con límites de tamaño.';

REVOKE ALL ON FUNCTION public.raiddominion_sanitize_rich_text(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_rich_text(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_rich_text(JSONB) FROM authenticated;

-- ─── 3) Sincronizar tokens de la nota del personaje ────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_sync_character_note_rich(TEXT, TEXT, JSONB);
CREATE FUNCTION public.raiddominion_sync_character_note_rich(
    p_name TEXT,
    p_realm TEXT,
    p_note_rich JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_char UUID;
    v_tokens JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    SELECT id INTO v_char
    FROM public.raiddominion_characters
    WHERE user_id = v_user
      AND lower(name) = lower(btrim(COALESCE(p_name, '')))
      AND lower(COALESCE(realm, '')) = lower(btrim(COALESCE(p_realm, '')))
    ORDER BY created_at, id
    LIMIT 1;

    IF v_char IS NULL THEN
        SELECT id INTO v_char
        FROM public.raiddominion_characters
        WHERE user_id = v_user
          AND lower(name) = lower(btrim(COALESCE(p_name, '')))
          AND (NULLIF(btrim(COALESCE(p_realm, '')), '') IS NULL
               OR NULLIF(btrim(COALESCE(realm, '')), '') IS NULL)
        ORDER BY created_at, id
        LIMIT 1;
    END IF;

    IF v_char IS NULL THEN
        RETURN FALSE;
    END IF;

    v_tokens := public.raiddominion_sanitize_rich_text(p_note_rich);

    UPDATE public.raiddominion_character_notes
    SET note_rich = v_tokens,
        updated_at = timezone('utc'::text, now())
    WHERE character_id = v_char AND user_id = v_user;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_sync_character_note_rich(TEXT, TEXT, JSONB) IS
    'Sincroniza los tokens ricos de la nota del propio personaje; no toca la nota de texto.';

REVOKE ALL ON FUNCTION public.raiddominion_sync_character_note_rich(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_sync_character_note_rich(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_sync_character_note_rich(TEXT, TEXT, JSONB) TO authenticated;

-- ─── 4) Helper público de tokens (mismo gate que la nota) ──────────────
DROP FUNCTION IF EXISTS public.raiddominion_get_character_note_rich(UUID);
CREATE FUNCTION public.raiddominion_get_character_note_rich(p_character_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN c.notes_public AND c.is_public
                THEN COALESCE(n.note_rich, '[]'::jsonb)
                ELSE NULL END
    FROM public.raiddominion_characters c
    LEFT JOIN public.raiddominion_character_notes n ON n.character_id = c.id
    WHERE c.id = p_character_id;
$$;

COMMENT ON FUNCTION public.raiddominion_get_character_note_rich(UUID) IS
    'Devuelve los tokens de la nota solo si notes_public e is_public están activos.';

REVOKE ALL ON FUNCTION public.raiddominion_get_character_note_rich(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raiddominion_get_character_note_rich(UUID) TO anon, authenticated;

-- ─── 5) upsert_bands: persiste name_link ───────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.raiddominion_upsert_bands(
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
    v_name_link JSONB;
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
    -- (ON DELETE CASCADE se lleva sus notas privadas con ellas.)
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
        v_name_link := public.raiddominion_sanitize_wow_link(v_band -> 'nameLink');

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
        -- auto-aprueban (atribuidas + integradas al portal). Un MIEMBRO
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
                owner_id, guild_id, integration_target_guild_id, slug, name, name_link, icon, schedule,
                min_gs, players, rules, is_public, owner_rank_index, is_rank_integrated,
                character_name, character_realm, integration_status
            )
            VALUES (
                v_user,
                CASE WHEN v_initial_status = 'approved' THEN v_guild_id ELSE NULL END,
                v_guild_id,
                v_slug, v_bname, v_name_link,
                NULLIF(trim(COALESCE(v_band->>'icon', '')), ''),
                NULLIF(trim(COALESCE(v_band->>'schedule', '')), ''),
                (v_band->>'minGS')::numeric,
                -- Roster entrante TAL CUAL (con sus notas): el paso de
                -- apply_band_notes posterior las guarda en el almacén privado
                -- y devuelve players[] ya saneado. Todo ocurre dentro de esta
                -- misma transacción, así que el texto nunca queda expuesto.
                CASE WHEN jsonb_typeof(v_band->'players') = 'array'
                     THEN v_band->'players' ELSE '[]'::jsonb END,
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
                name_link = v_name_link,
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

        -- Notas: se guardan SIEMPRE en el almacén privado del dueño y solo
        -- quedan en players[] si la banda tiene "Notas públicas" activo.
        UPDATE public.raiddominion_bands b
        SET players = public.raiddominion_apply_band_notes(b.id, b.players)
        WHERE b.id = v_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT) IS
    'Sincroniza bandas del SV (incluye el enlace del nombre), conserva visibilidad/integración/reglas y guarda notas privadas.';

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 6) Vista pública: expone note_rich con el mismo gate que note ─────
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
