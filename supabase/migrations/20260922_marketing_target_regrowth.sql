-- ============================================================
-- RaidDominion Portal — Regeneración de metas de mercadeo
-- Modifica raiddominion_marketing_evaluate (20260913):
--   al CUMPLIRSE una meta (current_value >= target), el objetivo
--   "renace" con una meta nueva más exigente:
--       new_target = GREATEST(target + 1, ceil(target * 1.5))
--   p.ej. 1→2, 2→3, 3→5, 8→12, 10→15, 30→45.
-- Sin esto, un objetivo cumplido quedaba fuera de focus_boost para
-- siempre. Con este cambio, al estancarse bajo la nueva meta vuelve
-- a priorizarse (focus_boost), cerrando el ciclo de crecimiento.
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_ y solo
--    se toca la función de esta app (se preserva la firma jsonb).
-- ============================================================

CREATE OR REPLACE FUNCTION public.raiddominion_marketing_evaluate(p_stats jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_goal RECORD;
    v_value BIGINT;
    v_new_target BIGINT;
    v_result jsonb;
BEGIN
    IF p_stats IS NULL OR jsonb_typeof(p_stats) <> 'object' THEN
        RAISE EXCEPTION 'p_stats inválido';
    END IF;

    FOR v_goal IN
        SELECT * FROM public.raiddominion_marketing WHERE enabled = TRUE
        ORDER BY goal_key
    LOOP
        v_value := COALESCE((p_stats->>v_goal.goal_key)::BIGINT, 0);
        v_new_target := NULL;

        IF v_value > v_goal.previous_value THEN
            v_goal.trend := 'up';
        ELSIF v_value < v_goal.previous_value THEN
            v_goal.trend := 'down';
        ELSE
            v_goal.trend := 'hold';
        END IF;

        -- Regeneración de meta: al cumplirse se fija una meta nueva
        -- (mínimo +1, recomendado ceil(target * 1.5)) para que el
        -- objetivo siga siendo un reto alcanzable.
        IF v_value >= v_goal.target THEN
            v_new_target := GREATEST(v_goal.target + 1, CEIL(v_goal.target * 1.5));
        END IF;

        -- El focus se evalúa contra la meta vigente (la nueva si se
        -- regeneró: al quedar current < target, un objetivo estancado
        -- vuelve a ser prioridad).
        v_goal.focus_boost := (v_goal.trend = 'down')
            OR (v_goal.trend = 'hold' AND v_value < COALESCE(v_new_target, v_goal.target));

        UPDATE public.raiddominion_marketing
            SET previous_value = v_goal.current_value,
                current_value  = v_value,
                trend          = v_goal.trend,
                focus_boost    = v_goal.focus_boost,
                target         = COALESCE(v_new_target, target),
                updated_at     = timezone('utc'::text, now())
            WHERE goal_key = v_goal.goal_key;
    END LOOP;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'goal_key', g.goal_key,
            'label', g.label,
            'enabled', g.enabled,
            'target', g.target,
            'trend', g.trend,
            'current_value', g.current_value,
            'previous_value', g.previous_value,
            'focus_boost', g.focus_boost
        ) ORDER BY g.goal_key
    ), '[]'::jsonb)
    INTO v_result
    FROM public.raiddominion_marketing g
    WHERE g.enabled = TRUE;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_marketing_evaluate(jsonb) TO anon, authenticated;