-- ============================================================
-- RaidDominion Portal — Sistema de mercadeo inteligente
-- 1) raiddominion_marketing: estado persistente de objetivos de
--    conversión y tendencia (up / hold / down), alimentado por el
--    motor de mercadeo (_shared/marketing.ts).
-- 2) raiddominion_marketing_stats(): snapshot de métricas (solo
--    conteos) para las Netlify Functions.
-- 3) raiddominion_marketing_evaluate(p_stats): evalúa objetivos,
--    calcula tendencia/focus y persiste el estado (SECURITY
--    DEFINER). Es la ÚNICA vía de escritura a la tabla de
--    objetivos: anon NO tiene grants directos sobre ella.
--
-- Nota (2026-09-04): la sección de "mensajes automáticos fijados"
-- (raiddominion_marketing_messages + RPCs CRUD) fue ELIMINADA del
-- alcance: el panel de /admin solo envía los objetivos. Si esta base
-- llegó a tener esos objetos aplicados, ejecutar
-- 20260913_marketing_remove_messages.sql para limpiarlos.
--
-- ⚠️ Aplicación MANUAL: se ejecuta en el SQL Editor del proyecto
--    RaidDominion y se registra en .opencode/improve/ciclos.json.
--    Si ya existe una versión previa, este archivo la reemplaza.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Objetivos de mercadeo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_marketing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target BIGINT NOT NULL DEFAULT 1,
    trend TEXT NOT NULL DEFAULT 'hold' CHECK (trend IN ('up', 'hold', 'down')),
    current_value BIGINT NOT NULL DEFAULT 0,
    previous_value BIGINT NOT NULL DEFAULT 0,
    focus_boost BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raiddominion_marketing_enabled
    ON public.raiddominion_marketing(enabled);

INSERT INTO public.raiddominion_marketing (goal_key, label, target, enabled)
SELECT * FROM (VALUES
    ('uploads_sv',             'Subidas de SavedVariables',           3, TRUE),
    ('visitante_to_member',    'Conversión visitante → member',       1, TRUE),
    ('member_to_guild_master', 'Conversión member → maestro',          1, TRUE),
    ('guilds_public',          'Hermandades con portal público',       1, TRUE),
    ('chars_validated',        'Personajes validados',               10, TRUE),
    ('players_public',         'Jugadores con perfil público',         2, TRUE),
    ('players_active',         'Jugadores públicos activos',           2, TRUE)
) AS v(goal_key, label, target, enabled)
WHERE NOT EXISTS (SELECT 1 FROM public.raiddominion_marketing);

-- ─── 2) Snapshot de métricas (solo conteos; no expone filas) ───────────
-- ⚠️ DROP previo: la versión anterior (8 columnas) cambia de tipo de
--    retorno y CREATE OR REPLACE no lo permite.
DROP FUNCTION IF EXISTS public.raiddominion_marketing_stats();
CREATE OR REPLACE FUNCTION public.raiddominion_marketing_stats()
RETURNS TABLE(
    uploads_sv BIGINT,
    visitante_to_member BIGINT,
    member_to_guild_master BIGINT,
    guilds_public BIGINT,
    chars_validated BIGINT,
    players_public BIGINT,
    players_active BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.raiddominion_saved_variables),
        (SELECT COUNT(*) FROM public.raiddominion_profiles
            WHERE role IN ('member', 'guild_master', 'moderator', 'admin')),
        (SELECT COUNT(*) FROM public.raiddominion_profiles WHERE role = 'guild_master'),
        (SELECT COUNT(*) FROM public.raiddominion_guilds WHERE is_public = TRUE),
        (SELECT COUNT(*) FROM public.raiddominion_characters WHERE member_verified = TRUE),
        (SELECT COUNT(*) FROM public.raiddominion_profiles
            WHERE is_public = TRUE AND role IN ('member', 'guild_master', 'moderator', 'admin')),
        (SELECT COUNT(DISTINCT user_id) FROM public.raiddominion_saved_variables
            WHERE parsed_at >= timezone('utc'::text, now()) - interval '7 days');
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_marketing_stats() TO anon, authenticated;

-- ─── 3) Evaluación y persistencia de objetivos (SECURITY DEFINER) ───────
CREATE OR REPLACE FUNCTION public.raiddominion_marketing_evaluate(p_stats jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_goal RECORD;
    v_value BIGINT;
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

        IF v_value > v_goal.previous_value THEN
            v_goal.trend := 'up';
        ELSIF v_value < v_goal.previous_value THEN
            v_goal.trend := 'down';
        ELSE
            v_goal.trend := 'hold';
        END IF;

        v_goal.focus_boost := (v_goal.trend = 'down')
            OR (v_goal.trend = 'hold' AND v_value < v_goal.target);

        UPDATE public.raiddominion_marketing
            SET previous_value = v_goal.current_value,
                current_value  = v_value,
                trend          = v_goal.trend,
                focus_boost    = v_goal.focus_boost,
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