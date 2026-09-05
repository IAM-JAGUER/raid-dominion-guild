-- ============================================================
-- RaidDominion Portal — Registro de visitas a la web
-- 1) raiddominion_visits: log de visitas a las secciones del
--    portal (path + rótulo de sección + visitante anónimo).
-- 2) raiddominion_register_visit(): registro vía SECURITY
--    DEFINER (única vía de escritura; anon NO tiene grants
--    directos). Además calcula si conviene notificar al canal
--    admin de Discord: dedupe por visitante+página en una
--    ventana de 60 min — la 1ª visita a cada sección notifica,
--    las repeticiones de navegación no (evita spam).
--
-- ⚠️ Aplicación MANUAL: se ejecuta en el SQL Editor del proyecto
--    RaidDominion y se registra en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Tabla de visitas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_visits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visitor_id TEXT,
    path TEXT NOT NULL,
    page TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raiddominion_visits_visitor_page
    ON public.raiddominion_visits (visitor_id, page, created_at);

CREATE INDEX IF NOT EXISTS idx_raiddominion_visits_created_at
    ON public.raiddominion_visits (created_at DESC);

-- Sin acceso directo por REST: solo el RPC SECURITY DEFINER escribe y lee.
ALTER TABLE public.raiddominion_visits ENABLE ROW LEVEL SECURITY;

-- ─── 2) Registro + decisión de notificación ─────────────────────────────
CREATE OR REPLACE FUNCTION public.raiddominion_register_visit(
    p_visitor_id TEXT,
    p_path TEXT,
    p_page TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cache_hit BOOLEAN;
BEGIN
    IF p_path IS NULL OR length(p_path) = 0 THEN
        RAISE EXCEPTION 'p_path inválido';
    END IF;

    INSERT INTO public.raiddominion_visits (visitor_id, path, page)
    VALUES (p_visitor_id, left(p_path, 512), left(p_page, 128));

    -- ¿Este visitante ya visitó esta misma sección en los últimos 60 min
    -- (sin contar la fila recién insertada)? OFFSET 1 excluye el insert.
    v_cache_hit := EXISTS (
        SELECT 1
        FROM public.raiddominion_visits
        WHERE visitor_id = p_visitor_id
          AND page = p_page
          AND created_at > timezone('utc'::text, now()) - interval '60 minutes'
        LIMIT 1 OFFSET 1
    );

    RETURN jsonb_build_object('notify', NOT v_cache_hit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_register_visit(text, text, text) TO anon, authenticated;