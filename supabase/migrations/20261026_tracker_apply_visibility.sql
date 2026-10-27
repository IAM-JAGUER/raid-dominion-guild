-- ============================================================
-- RaidDominion Portal — visibilidad masiva del Task Tracker
--
-- Reemplaza public.raiddominion_tracker_apply manteniendo su firma
-- (TEXT, UUID[], UUID[]) para añadir las acciones atómicas `hide` y `show`.
--
-- Reglas:
--   1) hide/show solo tocan raiddominion_character_tracker.hidden (upsert).
--      NO borran ni modifican raiddominion_character_tasks.
--   2) La propiedad de TODOS los personajes se valida contra auth.uid().
--   3) Se conservan SECURITY DEFINER, search_path='' y los grants actuales.
--   4) La respuesta de hide/show es { "<character_id>": { "hidden": bool } }.
--
-- Reglas multi-app: solo objetos raiddominion_, IF EXISTS, sin tocar otras apps.
-- Esta migración se aplica MANUALMENTE desde el SQL Editor del proyecto
-- RaidDominion; el agente no ejecuta SQL contra Supabase.
-- ============================================================

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
    v_hidden BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    IF p_action NOT IN (
        'mark', 'unmark', 'activate', 'deactivate', 'reset',
        'markAll', 'unmarkAll', 'hide', 'show'
    ) THEN
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

    -- Visibilidad masiva: upsert de hidden, sin tocar el estado de las tareas.
    IF p_action IN ('hide', 'show') THEN
        v_hidden := p_action = 'hide';

        INSERT INTO public.raiddominion_character_tracker AS tr
            (character_id, user_id, hidden)
        SELECT c.id, v_user, v_hidden
        FROM unnest(v_chars) AS c(id)
        ON CONFLICT (character_id) DO UPDATE
        SET hidden = EXCLUDED.hidden,
            user_id = v_user,
            updated_at = timezone('utc'::text, now());

        SELECT COALESCE(
            jsonb_object_agg(c.id::text, jsonb_build_object('hidden', v_hidden)),
            '{}'::jsonb
        )
        INTO v_state
        FROM public.raiddominion_characters c
        WHERE c.user_id = v_user AND c.id = ANY(v_chars);

        RETURN v_state;
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
    'Acción masiva del tracker: tareas (activate/mark/unmark/deactivate/reset) y visibilidad (hide/show) en una sola transacción; no borra tareas al ocultar.';

REVOKE ALL ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.raiddominion_tracker_apply(TEXT, UUID[], UUID[]) TO authenticated;
