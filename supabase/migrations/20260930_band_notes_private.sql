-- ============================================================
-- RaidDominion Portal — Notas de banda privadas con interruptor propio
--
-- PROBLEMA: `raiddominion_bands.players[].notes` viajaba dentro del row
-- PÚBLICO de la banda. El interruptor `hide_players` ("Ocultar jugadores")
-- solo se aplicaba en el navegador: la fila entera —notas incluidas— era
-- legible por cualquiera mediante el REST de Supabase siempre que la banda
-- tuviera `is_public = TRUE`. Es decir, el usuario no decidía nada.
--
-- DECISIÓN DE PRODUCTO (2026-09-30): las notas SIEMPRE se conservan, pero su
-- publicación la decide el líder de banda con su propio interruptor
-- ("Notas públicas"), apagado por defecto.
--
--   * `raiddominion_band_notes` (nueva): una fila por (banda, jugador) con el
--     texto de la nota. Solo el DUEÑO de la banda puede leerla o escribirla;
--     anon NO tiene ningún permiso sobre la tabla. Es el almacén fiable: las
--     notas no se pierden aunque la banda sea privada o no se publiquen.
--   * `raiddominion_bands.notes_public` (nueva): interruptor del líder. Por
--     defecto FALSE.
--   * El row público `players[]` lleva las notas SOLO si `notes_public` está
--     activo. Al desactivarlo se borran del row en el acto (no basta con
--     ocultarlas en el front).
--
-- MIGRACIÓN DE DATOS: las notas que ya vivían en `players[]` se copian a la
-- tabla privada y se limpian del row público, porque el default es privado. El
-- líder que quiera verlas de nuevo las reactiva desde su panel; el texto está a
-- salvo en la tabla privada mientras tanto.
--
-- ⚠️ Es la ÚNICA forma de proteger el dato: el RLS de Postgres filtra filas,
-- no columnas, así que una columna JSON con notas no se puede ocultar en
-- lectura. Por eso el texto vive en otra tabla y se inyecta en el row solo
-- cuando el usuario lo autoriza.
--
-- Base canónica reescrita ÍNTEGRAMENTE: 20260911 raiddominion_upsert_bands v5
-- (combinación por nombre+schedule).
--
-- Reglas: solo tablas raiddominion_, IF EXISTS, SECURITY DEFINER +
-- SET search_path='', GRANT EXECUTE TO authenticated. Sin tocar otras apps.
-- ============================================================

-- ─── 1) Interruptor del líder ─────────────────────────────────────────
ALTER TABLE public.raiddominion_bands
    ADD COLUMN IF NOT EXISTS notes_public BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.raiddominion_bands.notes_public IS
    'Decisión del líder de banda: si es TRUE, players[].notes viaja en el row público.';

-- ─── 2) Almacén privado de notas ─────────────────────────────────────
-- Notas SIEMPRE guardadas aquí. Escriben/leen el dueño de la banda y los RPC
-- SECURITY DEFINER; el anónimo no tiene permiso alguno (ni SELECT).
CREATE TABLE IF NOT EXISTS public.raiddominion_band_notes (
    band_id UUID NOT NULL REFERENCES public.raiddominion_bands(id) ON DELETE CASCADE,
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (band_id, player_key)
);

COMMENT ON TABLE public.raiddominion_band_notes IS
    'Notas privadas de los jugadores de una banda. Solo el dueño de la banda accede; se publican en players[] solo si raiddominion_bands.notes_public.';

CREATE INDEX IF NOT EXISTS idx_raiddominion_band_notes_band
    ON public.raiddominion_band_notes(band_id);

ALTER TABLE public.raiddominion_band_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_band_notes_select ON public.raiddominion_band_notes;
DROP POLICY IF EXISTS raiddominion_band_notes_modify ON public.raiddominion_band_notes;

CREATE POLICY raiddominion_band_notes_select ON public.raiddominion_band_notes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.raiddominion_bands b
            WHERE b.id = band_id AND b.owner_id = auth.uid()
        )
    );

-- El texto se escribe por el RPC SECURITY DEFINER (upsert_bands), que valida
-- propiedad; este policy cubre el caso futuro de escritura directa del dueño.
CREATE POLICY raiddominion_band_notes_modify ON public.raiddominion_band_notes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.raiddominion_bands b
            WHERE b.id = band_id AND b.owner_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.raiddominion_bands b
            WHERE b.id = band_id AND b.owner_id = auth.uid()
        )
    );

-- ─── 3) Helpers de proyección ───────────────────────────────────────
-- Quita la clave `notes` de cada jugador del array.
DROP FUNCTION IF EXISTS public.raiddominion_strip_player_notes(JSONB);
CREATE FUNCTION public.raiddominion_strip_player_notes(p_players JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
               jsonb_agg(p - 'notes' ORDER BY ord),
               '[]'::jsonb
           )
    FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_players) = 'array'
                  THEN p_players
                  ELSE '[]'::jsonb
             END
         ) WITH ORDINALITY AS x(p, ord);
$$;

COMMENT ON FUNCTION public.raiddominion_strip_player_notes(JSONB) IS
    'Devuelve players[] sin la clave notes de ningún jugador.';

-- Inyecta las notas guardadas en los jugadores que coincidan por nombre. Lo
-- usa el interruptor al ACTIVAR la publicación (las notas viven en la tabla
-- privada, no en el row).
DROP FUNCTION IF EXISTS public.raiddominion_restore_player_notes(UUID, JSONB);
CREATE FUNCTION public.raiddominion_restore_player_notes(p_band_id UUID, p_players JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
               jsonb_agg(
                   CASE
                       WHEN n.player_key IS NULL THEN x.p
                       WHEN n.notes = ''          THEN x.p - 'notes'
                       ELSE jsonb_set(x.p, '{notes}', to_jsonb(n.notes), true)
                   END
                   ORDER BY x.ord
               ),
               '[]'::jsonb
           )
    FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_players) = 'array'
                  THEN p_players
                  ELSE '[]'::jsonb
             END
         ) WITH ORDINALITY AS x(p, ord)
    LEFT JOIN public.raiddominion_band_notes n
      ON n.band_id = p_band_id
     AND n.player_key = lower(trim(COALESCE(x.p ->> 'name', '')))
    WHERE jsonb_typeof(x.p) = 'object';
$$;

COMMENT ON FUNCTION public.raiddominion_restore_player_notes(UUID, JSONB) IS
    'Inyecta en players[] las notas guardadas en raiddominion_band_notes para los jugadores que coincidan por nombre.';

-- Sincroniza el almacén privado con el payload del SV y devuelve players[] con
-- las notas ya aplicadas según el interruptor. Es el ÚNICO punto donde se
-- decide si el texto viaja en el row público.
--   * p_players NULL = solo reproyectar (no tocar el almacén privado).
DROP FUNCTION IF EXISTS public.raiddominion_apply_band_notes(UUID, JSONB);
CREATE FUNCTION public.raiddominion_apply_band_notes(p_band_id UUID, p_players JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_notes_public BOOLEAN;
    v_players JSONB;
BEGIN
    SELECT notes_public INTO v_notes_public
    FROM public.raiddominion_bands
    WHERE id = p_band_id;

    IF NOT FOUND THEN
        RETURN public.raiddominion_strip_player_notes(COALESCE(p_players, '[]'::jsonb));
    END IF;

    v_players := COALESCE(
        p_players,
        (SELECT players FROM public.raiddominion_bands WHERE id = p_band_id),
        '[]'::jsonb
    );
    v_players := CASE WHEN jsonb_typeof(v_players) = 'array' THEN v_players ELSE '[]'::jsonb END;

    IF p_players IS NOT NULL THEN
        -- Guardar lo que el SV trae (máx. 500 caracteres por nota).
        INSERT INTO public.raiddominion_band_notes (band_id, player_key, player_name, notes)
        SELECT p_band_id,
               lower(trim(x.p ->> 'name')),
               trim(x.p ->> 'name'),
               left(trim(COALESCE(x.p ->> 'notes', '')), 500)
        FROM jsonb_array_elements(v_players) AS x(p)
        WHERE jsonb_typeof(x.p) = 'object'
          AND trim(COALESCE(x.p ->> 'name', '')) <> ''
          AND trim(COALESCE(x.p ->> 'notes', '')) <> ''
        ON CONFLICT (band_id, player_key) DO UPDATE
        SET notes = EXCLUDED.notes,
            player_name = EXCLUDED.player_name,
            updated_at = timezone('utc'::text, now());

        -- El SV manda: una nota vaciada en el juego se borra del almacén.
        DELETE FROM public.raiddominion_band_notes n
        WHERE n.band_id = p_band_id
          AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(v_players) AS x(p)
              WHERE jsonb_typeof(x.p) = 'object'
                AND trim(COALESCE(x.p ->> 'name', '')) <> ''
                AND trim(COALESCE(x.p ->> 'notes', '')) <> ''
                AND lower(trim(x.p ->> 'name')) = n.player_key
          );
    END IF;

    RETURN CASE
        WHEN COALESCE(v_notes_public, FALSE)
            THEN public.raiddominion_restore_player_notes(p_band_id, v_players)
        ELSE public.raiddominion_strip_player_notes(v_players)
    END;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_apply_band_notes(UUID, JSONB) IS
    'Sincroniza players[].notes con el almacén privado y devuelve players[] con las notas aplicadas según notes_public.';

-- ─── 4) Migración de datos: notas existentes → almacén privado ──────
INSERT INTO public.raiddominion_band_notes (band_id, player_key, player_name, notes)
SELECT b.id,
       lower(trim(x.p ->> 'name')),
       trim(x.p ->> 'name'),
       left(trim(COALESCE(x.p ->> 'notes', '')), 500)
FROM public.raiddominion_bands b
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(b.players) = 'array' THEN b.players ELSE '[]'::jsonb END
) AS x(p)
WHERE b.notes_public = FALSE
  AND jsonb_typeof(x.p) = 'object'
  AND trim(COALESCE(x.p ->> 'name', '')) <> ''
  AND trim(COALESCE(x.p ->> 'notes', '')) <> ''
ON CONFLICT (band_id, player_key) DO UPDATE
SET notes = EXCLUDED.notes,
    player_name = EXCLUDED.player_name,
    updated_at = timezone('utc'::text, now());

-- El default es privado: fuera del row público.
UPDATE public.raiddominion_bands
SET players = public.raiddominion_strip_player_notes(players)
WHERE notes_public = FALSE;

-- ─── 5) upsert_bands v6: notas siempre guardadas, publicadas a elección ─
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
    'Sincroniza las bandas del SV: conserva visibilidad/integración/reglas, combina players por nombre+schedule y guarda las notas en el almacén privado.';

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_bands(UUID, JSONB, JSONB, INT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 6) RPC del interruptor "Notas públicas" ─────────────────────────
-- Activa o desactiva la publicación. Al activar, las notas se toman del
-- almacén privado (no estaban en el row); al desactivar, se BORRAN del row
-- en el acto y siguen intactas en el almacén.
DROP FUNCTION IF EXISTS public.raiddominion_set_band_notes_public(UUID, BOOLEAN);
CREATE FUNCTION public.raiddominion_set_band_notes_public(
    p_band_id UUID,
    p_public BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_owner UUID;
    v_public BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT owner_id, notes_public INTO v_owner, v_public
    FROM public.raiddominion_bands
    WHERE id = p_band_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Banda no encontrada.';
    END IF;
    IF v_owner <> v_user THEN
        RAISE EXCEPTION 'No eres el dueño de la banda.';
    END IF;

    v_public := COALESCE(p_public, FALSE);

    -- Dos statements separados a propósito: dentro de un único UPDATE las
    -- lecturas del helper verían el snapshot ANTIGUO y reproyectarían con el
    -- flag anterior. Paso 1: sincronizar el almacén con lo que hoy hay en el
    -- row. Paso 2: fijar el flag y reproyectar (p_players NULL = no reescribir
    -- el almacén, solo volver a pintar players[]).
    UPDATE public.raiddominion_bands
    SET players = public.raiddominion_apply_band_notes(id, players)
    WHERE id = p_band_id;

    UPDATE public.raiddominion_bands
    SET notes_public = v_public,
        players = public.raiddominion_apply_band_notes(id, NULL),
        updated_at = now()
    WHERE id = p_band_id;

    RETURN v_public;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_set_band_notes_public(UUID, BOOLEAN) IS
    'Interruptor del líder de banda: publica (TRUE) o retira (FALSE) las notas de jugadores en la ficha pública. El texto siempre queda en el almacén privado.';

GRANT EXECUTE ON FUNCTION public.raiddominion_set_band_notes_public(UUID, BOOLEAN) TO authenticated;

-- ─── 7) Permisos de las funciones de notas ────────────────────────────
-- PostgreSQL otorga EXECUTE a PUBLIC por defecto, y Supabase expone las
-- funciones de public vía RPC a anon y authenticated. Estas dos helper son
-- SECURITY DEFINER: sin REVOKE, un cliente anónimo podría leer las notas
-- privadas de cualquier banda (restore) o manipularlas (apply). Se dejan
-- ejecutables solo por el dueño de la tabla, que es quien las invoca desde
-- raiddominion_upsert_bands y raiddominion_set_band_notes_public.
REVOKE ALL ON FUNCTION public.raiddominion_restore_player_notes(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_restore_player_notes(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_restore_player_notes(UUID, JSONB) FROM authenticated;

REVOKE ALL ON FUNCTION public.raiddominion_apply_band_notes(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_apply_band_notes(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_apply_band_notes(UUID, JSONB) FROM authenticated;

REVOKE ALL ON FUNCTION public.raiddominion_strip_player_notes(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_strip_player_notes(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_strip_player_notes(JSONB) FROM authenticated;

-- El interruptor sí se llama desde el dashboard, pero con validación de
-- propietario; se le cierra el acceso genérico antes del GRANT explícito.
REVOKE ALL ON FUNCTION public.raiddominion_set_band_notes_public(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_set_band_notes_public(UUID, BOOLEAN) FROM anon;

-- ─── 8) Limpieza de notas al borrar la cuenta ────────────────────────
-- El reset de cuenta borra las bandas; el ON DELETE CASCADE de la tabla de
-- notas se encarga. Se re-lanza aquí para despliegues donde la FK se creó
-- después de alguna fila huérfana.
DELETE FROM public.raiddominion_band_notes n
WHERE NOT EXISTS (SELECT 1 FROM public.raiddominion_bands b WHERE b.id = n.band_id);
