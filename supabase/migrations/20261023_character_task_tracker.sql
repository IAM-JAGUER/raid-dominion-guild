-- ============================================================
-- RaidDominion Portal — Task Tracker por personaje (modelo wow-rd)
--
-- DECISIÓN DE PRODUCTO (2026-10-23): el dashboard de usuario incorpora el
-- Task Tracker del proyecto local (C:\xampp\htdocs\wow-rd) adaptado al portal.
-- Reglas:
--   1) Los DATOS del personaje vienen SIEMPRE de las subidas del SV (no hay
--      escaneo de WTF). El GearScore local NO existe en el portal.
--   2) El catálogo de tareas es POR CUENTA de usuario (no por hermandad) y
--      manual, igual que en el tracker local.
--   3) El estado del tracker (activa/marcada), la nota local y el oculto son
--      PRIVADOS: viven en tablas exclusivas del dueño. NO se añaden columnas
--      privadas a `raiddominion_characters`, que es legible por anon cuando
--      `is_public = TRUE` (un SELECT directo filtraría monedas/notas/oculto).
--   4) Monedas/money/fechas/versión del roster de la cuenta (`characters[]`
--      del SV) se sincronizan aquí para la ficha del tracker; no se publican.
--   5) Escrituras SOLO por RPC SECURITY DEFINER con check explícito de dueño.
--      Las tablas nuevas solo conceden SELECT (RLS auth.uid() = user_id).
--
-- Reglas multi-app: solo tablas raiddominion_, IF EXISTS/IF NOT EXISTS,
-- SECURITY DEFINER + SET search_path='', sin tocar otras apps.
-- ============================================================

-- ─── 1) Catálogo manual de tareas (por usuario) ────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_tracker_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT raiddominion_tracker_catalog_label_chk
        CHECK (char_length(btrim(label)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.raiddominion_tracker_catalog IS
    'Catálogo manual de tareas del Task Tracker, privado de cada cuenta.';

CREATE INDEX IF NOT EXISTS idx_raiddominion_tracker_catalog_user
    ON public.raiddominion_tracker_catalog(user_id, position, created_at);

ALTER TABLE public.raiddominion_tracker_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_tracker_catalog_select ON public.raiddominion_tracker_catalog;
CREATE POLICY raiddominion_tracker_catalog_select ON public.raiddominion_tracker_catalog
    FOR SELECT USING (auth.uid() = user_id);

-- ─── 2) Estado privado por personaje (oculto, nota local y meta del SV) ─
CREATE TABLE IF NOT EXISTS public.raiddominion_character_tracker (
    character_id UUID PRIMARY KEY
        REFERENCES public.raiddominion_characters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT NOT NULL DEFAULT '',
    -- Monedas del roster `characters["Nombre-Reino"]` del SV:
    --   [{ name, quantity, money }] (money = cantidad de oro en cobre).
    currencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    money BIGINT NOT NULL DEFAULT 0,
    first_seen BIGINT,
    last_seen BIGINT,
    sv_saved_at TEXT,
    addon_version TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT raiddominion_character_tracker_note_chk
        CHECK (char_length(note) <= 4000),
    CONSTRAINT raiddominion_character_tracker_money_chk
        CHECK (money >= 0)
);

COMMENT ON TABLE public.raiddominion_character_tracker IS
    'Estado privado del tracker por personaje: oculto, nota local, monedas y metadatos del SV. Solo el dueño lo lee.';

CREATE INDEX IF NOT EXISTS idx_raiddominion_character_tracker_user
    ON public.raiddominion_character_tracker(user_id);

ALTER TABLE public.raiddominion_character_tracker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_character_tracker_select ON public.raiddominion_character_tracker;
CREATE POLICY raiddominion_character_tracker_select ON public.raiddominion_character_tracker
    FOR SELECT USING (auth.uid() = user_id);

-- ─── 3) Estado de cada tarea por personaje (activa / marcada) ─────────
CREATE TABLE IF NOT EXISTS public.raiddominion_character_tasks (
    character_id UUID NOT NULL
        REFERENCES public.raiddominion_characters(id) ON DELETE CASCADE,
    task_id UUID NOT NULL
        REFERENCES public.raiddominion_tracker_catalog(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    marked BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (character_id, task_id),
    CONSTRAINT raiddominion_character_tasks_marked_active_chk
        CHECK (NOT marked OR active)
);

COMMENT ON TABLE public.raiddominion_character_tasks IS
    'Estado activo/marcado de cada tarea del tracker por personaje. Solo el dueño lo lee.';

CREATE INDEX IF NOT EXISTS idx_raiddominion_character_tasks_task
    ON public.raiddominion_character_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_character_tasks_user
    ON public.raiddominion_character_tasks(user_id);

ALTER TABLE public.raiddominion_character_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_character_tasks_select ON public.raiddominion_character_tasks;
CREATE POLICY raiddominion_character_tasks_select ON public.raiddominion_character_tasks
    FOR SELECT USING (auth.uid() = user_id);

-- Permisos: lectura autenticada; escrituras solo por RPC.
REVOKE ALL ON TABLE public.raiddominion_tracker_catalog FROM PUBLIC;
REVOKE ALL ON TABLE public.raiddominion_tracker_catalog FROM anon;
REVOKE ALL ON TABLE public.raiddominion_tracker_catalog FROM authenticated;
GRANT SELECT ON TABLE public.raiddominion_tracker_catalog TO authenticated;

REVOKE ALL ON TABLE public.raiddominion_character_tracker FROM PUBLIC;
REVOKE ALL ON TABLE public.raiddominion_character_tracker FROM anon;
REVOKE ALL ON TABLE public.raiddominion_character_tracker FROM authenticated;
GRANT SELECT ON TABLE public.raiddominion_character_tracker TO authenticated;

REVOKE ALL ON TABLE public.raiddominion_character_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.raiddominion_character_tasks FROM anon;
REVOKE ALL ON TABLE public.raiddominion_character_tasks FROM authenticated;
GRANT SELECT ON TABLE public.raiddominion_character_tasks TO authenticated;

-- ─── 4) Saneado de monedas del roster ─────────────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_sanitize_tracker_currencies(JSONB);
CREATE FUNCTION public.raiddominion_sanitize_tracker_currencies(p_currencies JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'name', c.name,
                'quantity', c.quantity,
                'money', c.money
            )
            ORDER BY c.ord
        ),
        '[]'::jsonb
    )
    FROM (
        SELECT
            left(btrim(e ->> 'name'), 120) AS name,
            CASE WHEN (e ->> 'quantity') ~ '^[0-9]{1,15}$'
                 THEN (e ->> 'quantity')::bigint ELSE 0 END AS quantity,
            CASE WHEN lower(COALESCE(e ->> 'money', ''))
                      IN ('true', 't', '1', 'yes', 'y')
                 THEN TRUE ELSE FALSE END AS money,
            ord
        FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_currencies) = 'array'
                      THEN p_currencies
                      ELSE '[]'::jsonb
                 END
             ) WITH ORDINALITY AS x(e, ord)
        WHERE jsonb_typeof(e) = 'object'
          AND btrim(COALESCE(e ->> 'name', '')) <> ''
        ORDER BY ord
        LIMIT 40
    ) c;
$$;

COMMENT ON FUNCTION public.raiddominion_sanitize_tracker_currencies(JSONB) IS
    'Normaliza characters[].currencies del SV a [{name, quantity, money}] (máx. 40).';

REVOKE ALL ON FUNCTION public.raiddominion_sanitize_tracker_currencies(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_tracker_currencies(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_sanitize_tracker_currencies(JSONB) FROM authenticated;

-- Helper interno: catálogo completo del usuario, ordenado.
DROP FUNCTION IF EXISTS public.raiddominion_tracker_catalog_json(UUID);
CREATE FUNCTION public.raiddominion_tracker_catalog_json(p_user UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'label', t.label,
                'position', t.position
            )
            ORDER BY t.position, t.created_at, t.id
        ),
        '[]'::jsonb
    )
    FROM public.raiddominion_tracker_catalog t
    WHERE t.user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public.raiddominion_tracker_catalog_json(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_catalog_json(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_catalog_json(UUID) FROM authenticated;

-- ─── 5) RPC: catálogo (add / rename / remove / duplicate / reorder) ───
DROP FUNCTION IF EXISTS public.raiddominion_tracker_catalog(TEXT, UUID, UUID[], TEXT, UUID[]);
CREATE FUNCTION public.raiddominion_tracker_catalog(
    p_op TEXT,
    p_task_id UUID DEFAULT NULL,
    p_task_ids UUID[] DEFAULT NULL,
    p_label TEXT DEFAULT NULL,
    p_order UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_label TEXT;
    v_ids UUID[];
    v_source public.raiddominion_tracker_catalog%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    IF p_op = 'add' THEN
        v_label := left(btrim(COALESCE(p_label, '')), 120);
        IF v_label = '' THEN
            RAISE EXCEPTION 'La tarea necesita una etiqueta.';
        END IF;
        INSERT INTO public.raiddominion_tracker_catalog (user_id, label, position)
        VALUES (
            v_user,
            v_label,
            COALESCE((SELECT max(position) + 1 FROM public.raiddominion_tracker_catalog WHERE user_id = v_user), 1)
        );

    ELSIF p_op = 'rename' THEN
        v_label := left(btrim(COALESCE(p_label, '')), 120);
        IF p_task_id IS NULL OR v_label = '' THEN
            RAISE EXCEPTION 'Faltan la tarea o la etiqueta.';
        END IF;
        UPDATE public.raiddominion_tracker_catalog
        SET label = v_label,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_task_id AND user_id = v_user;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tarea no encontrada.';
        END IF;

    ELSIF p_op = 'remove' THEN
        SELECT array_agg(DISTINCT u.id)
        INTO v_ids
        FROM unnest(
            COALESCE(p_task_ids, ARRAY[]::UUID[]) ||
            CASE WHEN p_task_id IS NULL THEN ARRAY[]::UUID[] ELSE ARRAY[p_task_id] END
        ) AS u(id);

        IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'Falta la tarea a eliminar.';
        END IF;

        DELETE FROM public.raiddominion_tracker_catalog
        WHERE user_id = v_user AND id = ANY(v_ids);

    ELSIF p_op = 'duplicate' THEN
        IF p_task_id IS NULL THEN
            RAISE EXCEPTION 'Falta la tarea a duplicar.';
        END IF;
        SELECT * INTO v_source
        FROM public.raiddominion_tracker_catalog
        WHERE id = p_task_id AND user_id = v_user;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tarea no encontrada.';
        END IF;

        v_label := left(btrim(COALESCE(NULLIF(p_label, ''), v_source.label || ' (copia)')), 120);
        IF v_label = '' THEN
            RAISE EXCEPTION 'La tarea necesita una etiqueta.';
        END IF;

        -- Hueco justo detrás de la original; el reorden final normaliza 1..N.
        UPDATE public.raiddominion_tracker_catalog
        SET position = position + 1
        WHERE user_id = v_user AND position > v_source.position;

        INSERT INTO public.raiddominion_tracker_catalog (user_id, label, position)
        VALUES (v_user, v_label, v_source.position + 1);

    ELSIF p_op = 'reorder' THEN
        IF p_order IS NULL OR array_length(p_order, 1) IS NULL THEN
            RAISE EXCEPTION 'Falta el orden del catálogo.';
        END IF;

        WITH ordered AS (
            SELECT id, row_number() OVER (ORDER BY ord) AS rn
            FROM unnest(p_order) WITH ORDINALITY AS x(id, ord)
        )
        UPDATE public.raiddominion_tracker_catalog c
        SET position = ordered.rn,
            updated_at = timezone('utc'::text, now())
        FROM ordered
        WHERE c.id = ordered.id AND c.user_id = v_user;

        -- Tareas no incluidas en el orden explícito quedan al final.
        WITH rest AS (
            SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rn
            FROM public.raiddominion_tracker_catalog
            WHERE user_id = v_user
              AND NOT (id = ANY(p_order))
        )
        UPDATE public.raiddominion_tracker_catalog c
        SET position = (SELECT COALESCE(max(position), 0) FROM public.raiddominion_tracker_catalog WHERE user_id = v_user)
                       + rest.rn
        FROM rest
        WHERE c.id = rest.id AND c.user_id = v_user;

    ELSE
        RAISE EXCEPTION 'Operación de catálogo no soportada: %', p_op;
    END IF;

    -- Normaliza posiciones 1..N tras cualquier mutación.
    WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rn
        FROM public.raiddominion_tracker_catalog
        WHERE user_id = v_user
    )
    UPDATE public.raiddominion_tracker_catalog c
    SET position = ordered.rn
    FROM ordered
    WHERE c.id = ordered.id AND c.user_id = v_user;

    RETURN public.raiddominion_tracker_catalog_json(v_user);
END;
$$;

COMMENT ON FUNCTION public.raiddominion_tracker_catalog(TEXT, UUID, UUID[], TEXT, UUID[]) IS
    'CRUD atómico del catálogo manual del tracker; valida auth.uid() en cada operación.';

REVOKE ALL ON FUNCTION public.raiddominion_tracker_catalog(TEXT, UUID, UUID[], TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_catalog(TEXT, UUID, UUID[], TEXT, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_tracker_catalog(TEXT, UUID, UUID[], TEXT, UUID[]) TO authenticated;

-- ─── 6) RPC: guardar oculto / nota local del personaje ────────────────
DROP FUNCTION IF EXISTS public.raiddominion_tracker_save(UUID, BOOLEAN, TEXT);
CREATE FUNCTION public.raiddominion_tracker_save(
    p_character_id UUID,
    p_hidden BOOLEAN DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_note TEXT;
    v_row public.raiddominion_character_tracker%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE id = p_character_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Personaje no encontrado.';
    END IF;

    v_note := CASE WHEN p_note IS NULL THEN NULL ELSE left(btrim(p_note), 4000) END;

    INSERT INTO public.raiddominion_character_tracker AS tr (character_id, user_id, hidden, note)
    VALUES (p_character_id, v_user, COALESCE(p_hidden, FALSE), COALESCE(v_note, ''))
    ON CONFLICT (character_id) DO UPDATE
    SET hidden = COALESCE(p_hidden, tr.hidden),
        note = CASE WHEN v_note IS NULL THEN tr.note ELSE v_note END,
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'character_id', v_row.character_id,
        'hidden', v_row.hidden,
        'note', v_row.note
    );
END;
$$;

COMMENT ON FUNCTION public.raiddominion_tracker_save(UUID, BOOLEAN, TEXT) IS
    'Guarda el oculto y/o la nota LOCAL del tracker; nunca toca la nota del juego.';

REVOKE ALL ON FUNCTION public.raiddominion_tracker_save(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_save(UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_tracker_save(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── 7) RPC: mutación de una tarea de un personaje ────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_tracker_set_task(UUID, UUID, BOOLEAN, BOOLEAN);
CREATE FUNCTION public.raiddominion_tracker_set_task(
    p_character_id UUID,
    p_task_id UUID,
    p_active BOOLEAN,
    p_marked BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_active BOOLEAN := COALESCE(p_active, FALSE);
    v_marked BOOLEAN := COALESCE(p_marked, FALSE) AND COALESCE(p_active, FALSE);
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE id = p_character_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Personaje no encontrado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.raiddominion_tracker_catalog
        WHERE id = p_task_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Tarea no encontrada.';
    END IF;

    IF NOT v_active THEN
        DELETE FROM public.raiddominion_character_tasks
        WHERE character_id = p_character_id AND task_id = p_task_id AND user_id = v_user;
    ELSE
        INSERT INTO public.raiddominion_character_tasks
            (character_id, task_id, user_id, active, marked)
        VALUES (p_character_id, p_task_id, v_user, TRUE, v_marked)
        ON CONFLICT (character_id, task_id) DO UPDATE
        SET active = TRUE,
            marked = v_marked,
            user_id = v_user,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN jsonb_build_object('active', v_active, 'marked', v_marked);
END;
$$;

COMMENT ON FUNCTION public.raiddominion_tracker_set_task(UUID, UUID, BOOLEAN, BOOLEAN) IS
    'Activa/marca una tarea de un personaje propio; desactivar borra la fila.';

REVOKE ALL ON FUNCTION public.raiddominion_tracker_set_task(UUID, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_set_task(UUID, UUID, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_tracker_set_task(UUID, UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- ─── 8) RPC: acciones masivas (tareas × personajes) ───────────────────
DROP FUNCTION IF EXISTS public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]);
CREATE FUNCTION public.raiddominion_tracker_apply(
    p_action TEXT,
    p_task_ids UUID[] DEFAULT NULL,
    p_character_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_chars UUID[];
    v_tasks UUID[];
    v_expected INT;
    v_owned INT;
    v_state JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    IF p_action NOT IN ('mark', 'unmark', 'activate', 'deactivate', 'reset', 'markAll', 'unmarkAll') THEN
        RAISE EXCEPTION 'Acción no soportada: %', p_action;
    END IF;

    SELECT array_agg(DISTINCT u.id) INTO v_chars
    FROM unnest(COALESCE(p_character_ids, ARRAY[]::UUID[])) AS u(id);
    IF v_chars IS NULL OR array_length(v_chars, 1) IS NULL THEN
        RAISE EXCEPTION 'No hay personajes válidos.';
    END IF;
    v_expected := array_length(v_chars, 1);
    SELECT count(*) INTO v_owned
    FROM public.raiddominion_characters
    WHERE user_id = v_user AND id = ANY(v_chars);
    IF v_owned <> v_expected THEN
        RAISE EXCEPTION 'Hay personajes que no pertenecen a tu cuenta.';
    END IF;

    IF p_action IN ('mark', 'unmark', 'activate', 'deactivate') THEN
        SELECT array_agg(DISTINCT u.id) INTO v_tasks
        FROM unnest(COALESCE(p_task_ids, ARRAY[]::UUID[])) AS u(id);
        IF v_tasks IS NULL OR array_length(v_tasks, 1) IS NULL THEN
            RAISE EXCEPTION 'No hay tareas válidas.';
        END IF;
        SELECT count(*) INTO v_owned
        FROM public.raiddominion_tracker_catalog
        WHERE user_id = v_user AND id = ANY(v_tasks);
        IF v_owned <> array_length(v_tasks, 1) THEN
            RAISE EXCEPTION 'Hay tareas que no pertenecen a tu catálogo.';
        END IF;
    END IF;

    IF p_action = 'reset' THEN
        DELETE FROM public.raiddominion_character_tasks
        WHERE user_id = v_user AND character_id = ANY(v_chars);

    ELSIF p_action = 'deactivate' THEN
        DELETE FROM public.raiddominion_character_tasks
        WHERE user_id = v_user
          AND character_id = ANY(v_chars)
          AND task_id = ANY(v_tasks);

    ELSIF p_action = 'activate' THEN
        INSERT INTO public.raiddominion_character_tasks
            (character_id, task_id, user_id, active, marked)
        SELECT c.id, t.id, v_user, TRUE, FALSE
        FROM unnest(v_chars) AS c(id)
        CROSS JOIN unnest(v_tasks) AS t(id)
        ON CONFLICT (character_id, task_id) DO UPDATE
        SET active = TRUE,
            user_id = v_user,
            updated_at = timezone('utc'::text, now());

    ELSIF p_action = 'mark' THEN
        INSERT INTO public.raiddominion_character_tasks
            (character_id, task_id, user_id, active, marked)
        SELECT c.id, t.id, v_user, TRUE, TRUE
        FROM unnest(v_chars) AS c(id)
        CROSS JOIN unnest(v_tasks) AS t(id)
        ON CONFLICT (character_id, task_id) DO UPDATE
        SET active = TRUE,
            marked = TRUE,
            user_id = v_user,
            updated_at = timezone('utc'::text, now());

    ELSIF p_action = 'unmark' THEN
        UPDATE public.raiddominion_character_tasks
        SET marked = FALSE,
            updated_at = timezone('utc'::text, now())
        WHERE user_id = v_user
          AND character_id = ANY(v_chars)
          AND task_id = ANY(v_tasks);

    ELSIF p_action = 'markAll' THEN
        INSERT INTO public.raiddominion_character_tasks
            (character_id, task_id, user_id, active, marked)
        SELECT c.id, t.id, v_user, TRUE, TRUE
        FROM unnest(v_chars) AS c(id)
        CROSS JOIN public.raiddominion_tracker_catalog t
        WHERE t.user_id = v_user
        ON CONFLICT (character_id, task_id) DO UPDATE
        SET active = TRUE,
            marked = TRUE,
            user_id = v_user,
            updated_at = timezone('utc'::text, now());

    ELSIF p_action = 'unmarkAll' THEN
        UPDATE public.raiddominion_character_tasks
        SET marked = FALSE,
            updated_at = timezone('utc'::text, now())
        WHERE user_id = v_user AND character_id = ANY(v_chars);
    END IF;

    SELECT COALESCE(
        jsonb_object_agg(
            c.id::text,
            jsonb_build_object(
                'active', COALESCE((
                    SELECT jsonb_agg(t.task_id ORDER BY cat.position, cat.created_at)
                    FROM public.raiddominion_character_tasks t
                    JOIN public.raiddominion_tracker_catalog cat ON cat.id = t.task_id
                    WHERE t.character_id = c.id AND t.active AND t.user_id = v_user
                ), '[]'::jsonb),
                'marked', COALESCE((
                    SELECT jsonb_agg(t.task_id ORDER BY cat.position, cat.created_at)
                    FROM public.raiddominion_character_tasks t
                    JOIN public.raiddominion_tracker_catalog cat ON cat.id = t.task_id
                    WHERE t.character_id = c.id AND t.marked AND t.user_id = v_user
                ), '[]'::jsonb)
            )
        ),
        '{}'::jsonb
    )
    INTO v_state
    FROM public.raiddominion_characters c
    WHERE c.user_id = v_user AND c.id = ANY(v_chars);

    RETURN v_state;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) IS
    'Acción masiva del tracker (tareas × personajes) en una sola transacción; devuelve estados por personaje.';

REVOKE ALL ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) TO authenticated;

-- ─── 9) RPC: sincronizar meta del roster (subida SV) ──────────────────
DROP FUNCTION IF EXISTS public.raiddominion_sync_character_tracker_meta(TEXT, TEXT, JSONB);
CREATE FUNCTION public.raiddominion_sync_character_tracker_meta(
    p_name TEXT,
    p_realm TEXT,
    p_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_char UUID;
    v_currencies JSONB;
    v_money BIGINT;
    v_first BIGINT;
    v_last BIGINT;
    v_saved_at TEXT;
    v_version TEXT;
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

    -- Reconciliación tolerante: un reino vacío es falta de dato, no otro reino.
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
        RETURN NULL;
    END IF;

    v_currencies := CASE
        WHEN jsonb_typeof(p_meta -> 'currencies') = 'array'
            THEN public.raiddominion_sanitize_tracker_currencies(p_meta -> 'currencies')
        ELSE NULL
    END;
    v_money := CASE
        WHEN (p_meta ->> 'money') ~ '^[0-9]{1,18}$' THEN (p_meta ->> 'money')::bigint
        ELSE NULL
    END;
    v_first := CASE
        WHEN (p_meta ->> 'firstSeen') ~ '^[0-9]{1,12}$' THEN (p_meta ->> 'firstSeen')::bigint
        ELSE NULL
    END;
    v_last := CASE
        WHEN (p_meta ->> 'lastSeen') ~ '^[0-9]{1,12}$' THEN (p_meta ->> 'lastSeen')::bigint
        ELSE NULL
    END;
    v_saved_at := NULLIF(left(btrim(COALESCE(p_meta ->> 'savedAt', '')), 64), '');
    v_version := NULLIF(left(btrim(COALESCE(p_meta ->> 'version', '')), 32), '');

    INSERT INTO public.raiddominion_character_tracker AS tr
        (character_id, user_id, currencies, money, first_seen, last_seen, sv_saved_at, addon_version)
    VALUES (
        v_char, v_user,
        COALESCE(v_currencies, '[]'::jsonb),
        COALESCE(v_money, 0),
        v_first, v_last, v_saved_at, v_version
    )
    ON CONFLICT (character_id) DO UPDATE
    SET currencies = CASE WHEN v_currencies IS NULL THEN tr.currencies ELSE v_currencies END,
        money = CASE WHEN v_money IS NULL THEN tr.money ELSE v_money END,
        first_seen = CASE WHEN v_first IS NULL THEN tr.first_seen ELSE v_first END,
        last_seen = CASE WHEN v_last IS NULL THEN tr.last_seen ELSE v_last END,
        sv_saved_at = CASE WHEN v_saved_at IS NULL THEN tr.sv_saved_at ELSE v_saved_at END,
        addon_version = CASE WHEN v_version IS NULL THEN tr.addon_version ELSE v_version END,
        updated_at = timezone('utc'::text, now());

    RETURN v_char;
END;
$$;

COMMENT ON FUNCTION public.raiddominion_sync_character_tracker_meta(TEXT, TEXT, JSONB) IS
    'Sincroniza monedas/money/fechas/versión del roster del SV en el tracker privado del personaje propio.';

REVOKE ALL ON FUNCTION public.raiddominion_sync_character_tracker_meta(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_sync_character_tracker_meta(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_sync_character_tracker_meta(TEXT, TEXT, JSONB) TO authenticated;
