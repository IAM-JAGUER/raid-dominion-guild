-- ============================================================
-- RaidDominion Portal — Nota por personaje (privada) + instancias guardadas
--
-- DECISIÓN DE PRODUCTO (2026-10-15): el addon v3.1.0 exporta, al pulsar
-- "Registrar", dos datos nuevos dentro de `registry["Nombre-Reino"].player`:
--   * `note` (string): la nota global del personaje (RD_Utils_PlayerNotes).
--   * `instances` (array): snapshot de las instancias guardadas
--     (`{ name, difficulty?, resetAt?, extended? }`, `resetAt` = época absoluta).
--
-- 1) NOTA PRIVADA POR DEFECTO. `raiddominion_characters` es legible por anon
--    cuando `is_public = TRUE` (policy 20260825), así que una columna `note`
--    se filtraría igual que pasó con las notas de banda (20260930). La nota
--    vive en `raiddominion_character_notes` (solo el dueño; anon sin permiso)
--    y se publica SOLO si el dueño activa su interruptor propio
--    `raiddominion_characters.notes_public` (FALSE por defecto) Y la ficha es
--    pública. La vista la inyecta vía helper SECURITY DEFINER autoguardado.
-- 2) INSTANCIAS con la MISMA RLS que el resto de la ficha: viajan en la
--    columna `instances` y solo se ven si el personaje es público (igual que
--    `equipment`/`objectives`).
-- 3) El SV manda: si el payload trae `note` (aunque sea vacío) se sincroniza
--    (vaciar = borrar); si NO trae la rama (addon < 3.1.0), se conserva lo ya
--    guardado. Lo mismo para `instances`.
--
-- Base canónica reescrita ÍNTEGRAMENTE: 20260930 upsert_character y vista
-- raiddominion_character_public (mismo cuerpo + nota/instancias).
--
-- Reglas: solo tablas raiddominion_, IF EXISTS, SECURITY DEFINER +
-- SET search_path='', GRANT EXECUTE TO authenticated. Sin tocar otras apps.
-- ============================================================

-- ─── 1) Interruptor del dueño ─────────────────────────────────────────
ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS notes_public BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.raiddominion_characters.notes_public IS
    'Decisión del dueño: si es TRUE (y la ficha es pública), la nota del personaje viaja en raiddominion_character_public.note.';

-- ─── 2) Instancias guardadas (snapshot del SV) ────────────────────────
ALTER TABLE public.raiddominion_characters
    ADD COLUMN IF NOT EXISTS instances JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.raiddominion_characters.instances IS
    'Snapshot de instancias guardadas del SV (registry[*].player.instances saneadas). Vacío si el SV es anterior a 3.1.0.';

-- ─── 3) Almacén privado de la nota ────────────────────────────────────
-- La nota SIEMPRE se conserva aquí. Escribe/lee el dueño y los RPC SECURITY
-- DEFINER; el anónimo no tiene permiso alguno (ni SELECT).
CREATE TABLE IF NOT EXISTS public.raiddominion_character_notes (
    character_id UUID NOT NULL REFERENCES public.raiddominion_characters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (character_id)
);

COMMENT ON TABLE public.raiddominion_character_notes IS
    'Nota privada del personaje. Solo el dueño accede; se proyecta a la vista pública solo con notes_public activo y ficha pública.';

CREATE INDEX IF NOT EXISTS idx_raiddominion_character_notes_user
    ON public.raiddominion_character_notes(user_id);

ALTER TABLE public.raiddominion_character_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_character_notes_select ON public.raiddominion_character_notes;
DROP POLICY IF EXISTS raiddominion_character_notes_modify ON public.raiddominion_character_notes;

CREATE POLICY raiddominion_character_notes_select ON public.raiddominion_character_notes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY raiddominion_character_notes_modify ON public.raiddominion_character_notes
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─── 4) Saneado de instancias ─────────────────────────────────────────
-- Proyecta el payload a la forma pública del contrato SV:
--   { name, difficulty?, resetAt?, extended? }
-- Descarta todo lo demás (ids, estado de bloqueo, restos locales), valida los
-- tipos con regex ANTES de castear (un casting inválido aborta la función) y
-- acota a 60 entradas / longitudes.
DROP FUNCTION IF EXISTS public.raiddominion_sanitize_instances(JSONB);
CREATE FUNCTION public.raiddominion_sanitize_instances(p_instances JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_strip_nulls(jsonb_build_object(
                'name',       i.name,
                'difficulty', i.difficulty,
                'resetAt',    i.reset_at,
                'extended',   i.extended))
            ORDER BY i.ord
        ),
        '[]'::jsonb
    )
    FROM (
        SELECT
            left(trim(e ->> 'name'), 120) AS name,
            NULLIF(left(trim(COALESCE(e ->> 'difficulty', '')), 8), '') AS difficulty,
            CASE WHEN (e ->> 'resetAt') ~ '^[0-9]{1,12}$'
                 THEN (e ->> 'resetAt')::bigint END AS reset_at,
            CASE WHEN lower(COALESCE(e ->> 'extended', ''))
                      IN ('true', 't', '1', 'yes', 'y')
                 THEN TRUE ELSE NULL END AS extended,
            ord
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_instances) = 'array'
                      THEN p_instances
                      ELSE '[]'::jsonb
                 END
             ) WITH ORDINALITY AS x(e, ord)
        WHERE jsonb_typeof(e) = 'object'
          AND trim(COALESCE(e ->> 'name', '')) <> ''
        ORDER BY ord
        LIMIT 60
    ) i;
$$;

COMMENT ON FUNCTION public.raiddominion_sanitize_instances(JSONB) IS
    'Normaliza registry[*].player.instances a la forma pública del contrato SV (máx. 60, name obligatorio).';

-- ─── 5) Helpers de la nota ───────────────────────────────────────────
-- Sincroniza el almacén privado con el payload. p_note NULL = el SV no trae
-- la rama (addon < 3.1.0): no se toca. p_note '' = el usuario la borró: se
-- elimina la fila. Máx. 500 caracteres.
DROP FUNCTION IF EXISTS public.raiddominion_apply_character_note(UUID, TEXT);
CREATE FUNCTION public.raiddominion_apply_character_note(
    p_character_id UUID,
    p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_note IS NULL THEN
        RETURN;
    END IF;

    IF trim(p_note) = '' THEN
        DELETE FROM public.raiddominion_character_notes
        WHERE character_id = p_character_id;
        RETURN;
    END IF;

    INSERT INTO public.raiddominion_character_notes (character_id, user_id, note)
    SELECT p_character_id, c.user_id, left(trim(p_note), 500)
    FROM public.raiddominion_characters c
    WHERE c.id = p_character_id
    ON CONFLICT (character_id) DO UPDATE
    SET note = EXCLUDED.note,
        updated_at = timezone('utc'::text, now());
END;
$$;

COMMENT ON FUNCTION public.raiddominion_apply_character_note(UUID, TEXT) IS
    'Sincroniza la nota privada del personaje: NULL conserva, vacío borra, texto guarda (máx. 500).';

-- Lectura pública autoguardada: devuelve la nota SOLO si el dueño activó
-- notes_public Y la ficha es pública. Sin esa doble condición, una llamada
-- directa al RPC filtraría notas de fichas privadas. La consume la vista.
DROP FUNCTION IF EXISTS public.raiddominion_get_character_note(UUID);
CREATE FUNCTION public.raiddominion_get_character_note(p_character_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN c.notes_public AND c.is_public THEN n.note ELSE NULL END
    FROM public.raiddominion_characters c
    LEFT JOIN public.raiddominion_character_notes n ON n.character_id = c.id
    WHERE c.id = p_character_id;
$$;

COMMENT ON FUNCTION public.raiddominion_get_character_note(UUID) IS
    'Devuelve la nota del personaje solo si notes_public e is_public están activos; NULL en cualquier otro caso.';

-- ─── 6) upsert_character: persiste nota e instancias ─────────────────
-- Base canónica: 20260930 (metas públicas + facción por raza). Cambios:
--   * `instances` saneadas (NULL si el SV no trae la rama → no se tocan).
--   * `note` sincronizada en el almacén privado (NULL si no viene → no se toca).
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
        level, talent_spec, avg_ilvl, equipment, objectives, instances,
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
    'Registra/actualiza el personaje del SV (anti-falseo por nombre+reino), sus metas/instancias públicas y su nota privada.';

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- ─── 7) RPC del interruptor "Nota pública" ───────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_set_character_notes_public(UUID, BOOLEAN);
CREATE FUNCTION public.raiddominion_set_character_notes_public(
    p_character_id UUID,
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

    SELECT user_id INTO v_owner
    FROM public.raiddominion_characters
    WHERE id = p_character_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Personaje no encontrado.';
    END IF;
    IF v_owner <> v_user THEN
        RAISE EXCEPTION 'No eres el dueño del personaje.';
    END IF;

    v_public := COALESCE(p_public, FALSE);

    UPDATE public.raiddominion_characters
    SET notes_public = v_public,
        updated_at = now()
    WHERE id = p_character_id;

    RETURN v_public;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_set_character_notes_public(UUID, BOOLEAN) IS
    'Interruptor del dueño del personaje: publica (TRUE) o retira (FALSE) su nota en la ficha pública. El texto siempre queda en el almacén privado.';

-- ─── 8) Vista pública: nota (condicionada) + instancias ──────────────
-- Base canónica: 20260930 (metas + facción). La nota va por el helper
-- autoguardado (notes_public + is_public); `instances` viaja por la MISMA RLS
-- que el resto de la ficha.
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

-- ─── 9) Permisos de los helpers de nota ──────────────────────────────
-- `apply` es SECURITY DEFINER y escribe el almacén privado: solo lo invoca
-- upsert_character (que ya validó al dueño). Sin REVOKE, un cliente podría
-- escribir/borrar la nota de personajes ajenos por RPC directo.
REVOKE ALL ON FUNCTION public.raiddominion_apply_character_note(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_apply_character_note(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_apply_character_note(UUID, TEXT) FROM authenticated;

-- `get` la consume la VISTA (security_invoker): debe ser ejecutable por
-- anon/authenticated. Es seguro: se autoguarda con notes_public + is_public.
REVOKE ALL ON FUNCTION public.raiddominion_get_character_note(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raiddominion_get_character_note(UUID) TO anon, authenticated;

-- El interruptor se llama desde el dashboard; se cierra el acceso genérico
-- antes del GRANT explícito.
REVOKE ALL ON FUNCTION public.raiddominion_set_character_notes_public(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_set_character_notes_public(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_set_character_notes_public(UUID, BOOLEAN) TO authenticated;

-- ─── 10) Limpieza de notas huérfanas ─────────────────────────────────
-- El reset de cuenta borra los personajes; el ON DELETE CASCADE de la tabla de
-- notas se encarga. Se re-lanza aquí para despliegues donde la FK se creó
-- después de alguna fila huérfana.
DELETE FROM public.raiddominion_character_notes n
WHERE NOT EXISTS (SELECT 1 FROM public.raiddominion_characters c WHERE c.id = n.character_id);
