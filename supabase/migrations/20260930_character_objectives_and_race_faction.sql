-- ============================================================
-- RaidDominion Portal — Metas del personaje + facción deducida de la raza
--
-- Decisiones de producto (2026-09-30):
--   1) METAS PÚBLICAS: `registry["Nombre-Reino"].objectives` deja de vivir
--      solo dentro de `raiddominion_saved_variables.raw` (historial privado).
--      Se proyecta a `raiddominion_characters.objectives` y de ahí a la vista
--      `raiddominion_character_public`, que respeta el MISMO interruptor
--      `is_public` que el equipo registrado: si el personaje es privado, sus
--      metas no son públicas (no se filtran datos por una vía paralela).
--      El cliente envía las metas anidadas en `p_player.objectives` (mismo
--      scope que el personaje: una sola carga, un solo registro).
--   2) FACCIÓN POR RAZA: `characters["Nombre-Reino"].faction` venía de
--      UnitFactionGroup y podía quedar como "?"/NULL; además la búsqueda
--      comparaba `split_part(key,'-',1)` con el nombre, lo que falla con
--      nombres que contienen guion. Ahora la facción se DEDUCE de la raza
--      (`raceFile` del registry, con `race` como red de seguridad) y el
--      `faction` del SV queda solo como último recurso.
--   3) SANEADO: las metas se filtran en la base (slots 0-19, longitudes
--      acotadas, sin iconos ni flags de seguimiento) igual que hace el parser
--      del cliente. La DB no confía en el payload.
--
-- Bases canónicas reescritas ÍNTEGRAS (patrón del repo, no editar las
-- migraciones previas): 20260925 claim_from_sv / upsert_character,
-- 20260827 character_public.
--
-- Reglas: solo tablas raiddominion_, IF EXISTS, SECURITY DEFINER +
-- SET search_path='', GRANT EXECUTE TO authenticated. Sin tocar otras apps.
-- ============================================================

-- ─── 1) Facción deducida de la raza ────────────────────────────────────
-- Token de raza -> facción. Acepta el token del cliente (`NightElf`,
-- `BloodElf`, `Scourge`) y el nombre localizado (`Elfo de la noche`,
-- `No muerto`, `Trol`). Normaliza a minúsculas sin acentos ni separadores,
-- de modo que "Elfo de la Sangre" y "bloodelf" colapsan al mismo valor.
-- Devuelve NULL si la raza no es una de las 11 de WotLK (no se inventa).
DROP FUNCTION IF EXISTS public.raiddominion_faction_from_race(TEXT);
CREATE FUNCTION public.raiddominion_faction_from_race(p_race TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN n.race_key IN ('human', 'humano', 'dwarf', 'enano',
                            'nightelf', 'elfodelanoche', 'gnome', 'gnomo',
                            'draenei')
            THEN 'Alliance'
        WHEN n.race_key IN ('orc', 'orco', 'undead', 'nomuerto', 'scourge',
                            'necro', 'tauren', 'taurenen', 'troll', 'trol',
                            'bloodelf', 'elfodesangre', 'elfodelasangre',
                            'elfosangre')
            THEN 'Horde'
        ELSE NULL
    END
    FROM (
        SELECT regexp_replace(
                   lower(translate(
                       COALESCE(p_race, ''),
                       'áàäâÁÀÄéèëêÉÈËíìïîÍÌÏóòöôÓÒÖúùüûÚÙÜñÑçÇ',
                       'aaaaAAAeeeeEEEiiiiIIIooooOOOuuuuUUUnnCc'
                   )),
                   '[^a-z0-9]', '', 'g'
               ) AS race_key
    ) n;
$$;

COMMENT ON FUNCTION public.raiddominion_faction_from_race(TEXT) IS
    'Deduce Alianza/Horda a partir del token o nombre de raza de WotLK; NULL si la raza es desconocida.';

-- ─── 2) Saneado de metas ───────────────────────────────────────────────
-- Proyecta el payload a la forma pública del contrato SV:
--   equipment[] = { slot 0-19, name, done, itemID?, ilvl?, quality? }
--   currencies[] = { name, target > 0, reached }
-- Descarta todo lo demás (icon, detalleLocal, flags de seguimiento).
DROP FUNCTION IF EXISTS public.raiddominion_sanitize_objectives(JSONB);
CREATE FUNCTION public.raiddominion_sanitize_objectives(p_objectives JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'equipment', COALESCE((
            SELECT jsonb_agg(
                       jsonb_strip_nulls(jsonb_build_object(
                           'slot',    g.slot,
                           'name',    g.name,
                           'done',    g.done,
                           'itemID',  g.item_id,
                           'ilvl',    g.ilvl,
                           'quality', g.quality)),
                       jsonb_build_array()
                       ORDER BY g.slot, g.name
                   )
            FROM (
                SELECT
                    (e ->> 'slot')::int AS slot,
                    left(trim(e ->> 'name'), 120) AS name,
                    COALESCE((e ->> 'done')::boolean, FALSE) AS done,
                    CASE WHEN (e ->> 'itemID') ~ '^[0-9]+$'
                         THEN (e ->> 'itemID')::int END AS item_id,
                    CASE WHEN (e ->> 'ilvl') ~ '^[0-9]+$'
                         THEN (e ->> 'ilvl')::int END AS ilvl,
                    CASE WHEN (e ->> 'quality') ~ '^[0-9]+$'
                         THEN (e ->> 'quality')::int END AS quality
                FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(p_objectives -> 'equipment') = 'array'
                              THEN p_objectives -> 'equipment'
                              ELSE '[]'::jsonb
                         END
                     ) AS e
                WHERE jsonb_typeof(e) = 'object'
                  AND (e ->> 'slot') ~ '^-?[0-9]+$'
                  AND trim(COALESCE(e ->> 'name', '')) <> ''
            ) g
            WHERE g.slot BETWEEN 0 AND 19
              AND g.name <> ''
        ), '[]'::jsonb),
        'currencies', COALESCE((
            SELECT jsonb_agg(
                       jsonb_strip_nulls(jsonb_build_object(
                           'name',    c.name,
                           'target',  c.target,
                           'reached', c.reached)),
                       jsonb_build_array()
                       ORDER BY lower(c.name)
                   )
            FROM (
                SELECT
                    left(trim(cu ->> 'name'), 120) AS name,
                    (cu ->> 'target')::int AS target,
                    COALESCE((cu ->> 'reached')::boolean, FALSE) AS reached
                FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(p_objectives -> 'currencies') = 'array'
                              THEN p_objectives -> 'currencies'
                              ELSE '[]'::jsonb
                         END
                     ) AS cu
                WHERE jsonb_typeof(cu) = 'object'
                  AND trim(COALESCE(cu ->> 'name', '')) <> ''
                  AND (cu ->> 'target') ~ '^[0-9]+$'
            ) c
            WHERE c.target > 0
        ), '[]'::jsonb)
    );
$$;

COMMENT ON FUNCTION public.raiddominion_sanitize_objectives(JSONB) IS
    'Normaliza registry[*].objectives a la forma pública del contrato SV (equipment 0-19 + currencies con target > 0).';

-- ─── 3) Columna objectives en el personaje ─────────────────────────────
ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS objectives JSONB NOT NULL
        DEFAULT '{"equipment":[],"currencies":[]}'::jsonb;

-- ─── 4) upsert_character: persiste las metas del personaje ────────────
-- Base canónica: 20260925 (upsert_character con reconciliación por nombre).
-- Cambio único: guarda `objectives` (saneadas). Si el SV NO trae la rama
-- (addons anteriores a 3.0.1) se conserva la ya guardada: importar un
-- snapshot viejo no borra metas que el usuario registró después.
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
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;
    v_realm := NULLIF(trim(p_player->>'realm'), '');
    -- Metas: NULL si el SV no trae la rama (addon < 3.0.1) → no se tocan.
    v_objectives := CASE
        WHEN jsonb_typeof(p_player -> 'objectives') = 'object'
            THEN public.raiddominion_sanitize_objectives(p_player -> 'objectives')
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
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                objectives = COALESCE(v_objectives, objectives),
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
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                realm = COALESCE(realm, v_realm),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                objectives = COALESCE(v_objectives, objectives),
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
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, server, slug, class, class_file, race, race_file,
        level, talent_spec, avg_ilvl, equipment, objectives,
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
        COALESCE(v_objectives, '{"equipment":[],"currencies":[]}'::jsonb),
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END
    );

    RETURN 'created';
END;
$$;

COMMENT ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) IS
    'Registra/actualiza el personaje del SV (anti-falseo por nombre+reino) y persiste sus metas públicas (objectives).';

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- ─── 5) claim_from_sv: facción deducida de la raza ────────────────────
-- Base canónica: 20260925 (claim con 1 personaje validado + guard de SV ajeno).
-- Cambio único en la resolución de facción: raza primero, roster del SV como
-- último recurso y comparado por el campo `name` de cada entrada (antes
-- `split_part(key,'-',1)`, que parte mal los nombres con guion).
DROP FUNCTION IF EXISTS public.raiddominion_claim_from_sv(UUID);
CREATE FUNCTION public.raiddominion_claim_from_sv(p_sv_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_raw JSONB;
    v_primary UUID;
    v_candidates JSONB;
    v_cand JSONB;
    v_rg JSONB;
    v_p JSONB;
    v_guild_name TEXT;
    v_realm TEXT;
    v_server TEXT;
    v_faction TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_guild_id UUID;
    v_skipped_other_gm INT := 0;
    v_char_count INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado.';
    END IF;
    IF v_role NOT IN ('member', 'guild_master', 'moderator', 'admin') THEN
        RAISE EXCEPTION 'Requiere ser Miembro o Maestro de Hermandad.';
    END IF;

    -- Reclamo (20260925): el SV con isGM valida con UN personaje validado
    -- (decisión de producto). Un guild_master verificado re-verifica o reclama
    -- otra sin esta restricción. Staff (admin/moderator) cumple igual.
    IF v_role <> 'guild_master' THEN
        SELECT COUNT(*) INTO v_char_count
        FROM public.raiddominion_characters
        WHERE user_id = v_user AND member_verified = TRUE;
        IF v_char_count < 1 THEN
            RAISE EXCEPTION 'Para reclamar una hermandad se requiere al menos un personaje validado.';
        END IF;
    END IF;

    -- El SV debe pertenecer al usuario
    SELECT raw INTO v_raw
    FROM public.raiddominion_saved_variables
    WHERE id = p_sv_id AND user_id = v_user AND raw IS NOT NULL
    LIMIT 1;
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'SV no encontrado en tu historial.';
    END IF;

    -- GUARD (20260925): si el personaje PRINCIPAL del SV pertenece a OTRA
    -- cuenta, la hermandad no se reclama desde aquí. Evita que una cuenta
    -- validada con cualquier personaje reclame la guild de un SV ajeno.
    IF v_raw -> 'player' ? 'name' THEN
        IF EXISTS (
            SELECT 1 FROM public.raiddominion_characters
            WHERE user_id <> v_user
              AND lower(name) = lower(v_raw -> 'player' ->> 'name')
              AND (NULLIF(trim(COALESCE(v_raw -> 'player' ->> 'realm', '')), '') IS NULL
                   OR NULLIF(trim(realm), '') IS NULL
                   OR lower(COALESCE(realm, '')) = lower(COALESCE(v_raw -> 'player' ->> 'realm', '')))
        ) THEN
            RAISE EXCEPTION 'El personaje principal de este SavedVariables pertenece a otra cuenta; no puedes reclamar su hermandad.';
        END IF;
    END IF;

    -- Candidatas: todas las hermandades del SV donde isGM=true.
    IF jsonb_typeof(v_raw -> 'registries') = 'array' THEN
        SELECT jsonb_agg(jsonb_build_object('guild', e -> 'guild', 'player', e -> 'player'))
        INTO v_candidates
        FROM jsonb_array_elements(v_raw -> 'registries') AS e
        WHERE e -> 'guild' ? 'name'
          AND COALESCE((e -> 'guild' ->> 'isGM')::boolean, FALSE) = TRUE;
    END IF;
    IF v_candidates IS NULL
       AND v_raw -> 'registryGuild' ? 'name'
       AND COALESCE((v_raw -> 'registryGuild' ->> 'isGM')::boolean, FALSE) = TRUE THEN
        v_candidates := jsonb_build_array(jsonb_build_object(
            'guild', v_raw -> 'registryGuild', 'player', v_raw -> 'player'));
    END IF;

    IF v_candidates IS NULL OR jsonb_array_length(v_candidates) = 0 THEN
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    FOR v_cand IN SELECT value FROM jsonb_array_elements(v_candidates) LOOP
        v_rg := v_cand -> 'guild';
        v_guild_name := trim(COALESCE(v_rg ->> 'name', ''));
        CONTINUE WHEN v_guild_name = '' OR length(v_guild_name) < 2;

        v_p := v_cand -> 'player';
        v_server := NULLIF(trim(COALESCE(v_p ->> 'server', '')), '');

        SELECT id INTO v_guild_id
        FROM public.raiddominion_guilds
        WHERE owner_id = v_user AND lower(name) = lower(v_guild_name)
        ORDER BY created_at
        LIMIT 1;
        IF FOUND THEN
            UPDATE public.raiddominion_guilds
            SET realm = COALESCE(NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), ''), realm),
                server = COALESCE(v_server, server),
                claim_status = 'verified',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_guild_id;
            PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');
            IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;
            CONTINUE;
        END IF;

        -- Facción: la RAZA manda (token del cliente y, por si faltara, el
        -- nombre localizado). El `faction` del roster del SV es el último
        -- recurso y se busca por el campo `name` de la entrada: comparar
        -- split_part(key,'-',1) parte mal los nombres que llevan guion.
        v_faction := public.raiddominion_faction_from_race(COALESCE(
            NULLIF(trim(COALESCE(v_p ->> 'raceFile', '')), ''),
            NULLIF(trim(COALESCE(v_p ->> 'race', '')), '')
        ));
        IF v_faction IS NULL
           AND v_p ? 'name'
           AND jsonb_typeof(v_raw -> 'characters') = 'object' THEN
            SELECT value ->> 'faction' INTO v_faction
            FROM jsonb_each(v_raw -> 'characters')
            WHERE lower(trim(COALESCE(value ->> 'name', ''))) = lower(v_p ->> 'name')
              AND (NULLIF(trim(COALESCE(v_p ->> 'realm', '')), '') IS NULL
                   OR lower(trim(COALESCE(value ->> 'realm', ''))) = lower(v_p ->> 'realm'))
            LIMIT 1;
        END IF;
        v_faction := NULLIF(trim(COALESCE(v_faction, '')), '');

        v_realm := NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), '');
        IF v_realm IS NULL AND v_p ? 'realm' THEN
            v_realm := NULLIF(trim(v_p ->> 'realm'), '');
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.raiddominion_guilds
            WHERE owner_id <> v_user
              AND lower(name) = lower(v_guild_name)
              AND (v_realm IS NULL
                   OR NULLIF(realm, '') IS NULL
                   OR lower(realm) = lower(v_realm))
        ) THEN
            v_skipped_other_gm := v_skipped_other_gm + 1;
            INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
            VALUES (v_user, 'guild_claim_skipped_existing_gm', v_guild_name,
                    jsonb_build_object('sv', p_sv_id, 'reason', 'gm ya registrado'));
            CONTINUE;
        END IF;

        v_base_slug := lower(regexp_replace(trim(v_guild_name), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN CONTINUE; END IF;
        v_base_slug := left(v_base_slug, 40);
        v_slug := v_base_slug;
        v_i := 1;
        WHILE EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE slug = v_slug) LOOP
            v_i := v_i + 1;
            v_slug := v_base_slug || '-' || v_i::text;
        END LOOP;

        INSERT INTO public.raiddominion_guilds (
            slug, name, realm, server, faction, owner_id, claim_status, is_public
        )
        VALUES (v_slug, v_guild_name, v_realm, v_server, v_faction, v_user, 'verified', FALSE)
        RETURNING id INTO v_guild_id;

        PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');

        IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'guild_from_sv', v_guild_id::text,
                jsonb_build_object('sv', p_sv_id, 'slug', v_slug,
                                   'guild', v_guild_name));
    END LOOP;

    IF v_primary IS NULL THEN
        IF v_skipped_other_gm > 0 THEN
            RAISE EXCEPTION 'Esa hermandad ya tiene un maestro registrado en el portal.';
        END IF;
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    IF v_role NOT IN ('moderator', 'admin') THEN
        UPDATE public.raiddominion_profiles
        SET role = 'guild_master', is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    ELSE
        UPDATE public.raiddominion_profiles
        SET is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    END IF;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    RETURN v_primary;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_claim_from_sv(UUID) IS
    'Reclama/verifica la hermandad del SV subido; la facción se deduce de la raza del personaje acreditado.';

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_from_sv(UUID) TO authenticated;

-- ─── 6) Vista pública: expone las metas junto al resto de la ficha ─────
-- Base canónica: 20260827 (v4 legible). `objectives` viaja por la MISMA RLS
-- que el resto de la ficha: si el personaje es privado, sus metas no lo son.
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

-- ─── 7) Backfill de facción en hermandades reclamadas ─────────────────
-- Rellena la facción de las hermandades ya verificadas que quedaron sin dato
-- (o con '?' del SV) usando la raza del personaje que la acreditó.
UPDATE public.raiddominion_guilds g
SET faction = src.faction,
    updated_at = timezone('utc'::text, now())
FROM (
    SELECT DISTINCT ON (g2.id) g2.id,
           public.raiddominion_faction_from_race(COALESCE(
               NULLIF(trim(COALESCE(c.race_file, '')), ''),
               NULLIF(trim(COALESCE(c.race, '')), '')
           )) AS faction
    FROM public.raiddominion_guilds g2
    JOIN public.raiddominion_characters c
      ON c.user_id = g2.owner_id
     AND c.member_verified = TRUE
     AND lower(COALESCE(c.sv_guild_name, '')) = lower(g2.name)
    ORDER BY g2.id, c.created_at
) src
WHERE src.id = g.id
  AND src.faction IS NOT NULL
  -- '?' es el marcador de "desconocido" que usa el addon: también se rellena.
  AND COALESCE(NULLIF(trim(COALESCE(g.faction, '')), ''), '?') = '?';

-- ─── 8) Nota de contrato ──────────────────────────────────────────────
-- `assignments` (registry[*].assignments) sigue exportándose en el SV como
-- estado transitorio del addon para sincronizar cuentas, pero NO es dato
-- comunitario: ni el parser lo consume ni la web lo publica.
COMMENT ON COLUMN public.raiddominion_characters.objectives IS
    'Metas públicas del personaje (registry[*].objectives saneadas). Vacías si el SV es anterior a 3.0.1.';
