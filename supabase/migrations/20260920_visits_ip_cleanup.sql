-- ============================================================
-- RaidDominion Portal — Visitas: columna IP + limpieza dev/test
-- Refuerzo del filtro de tráfico local en la MISMA base:
--   1) Columna `ip` en raiddominion_visits.
--   2) Limpieza de los registros previos SIN ip (todos eran
--      dev/pruebas de este mismo día: se crearon antes del
--      filtro). El feature es nuevo, la tabla solo tenía esos
--      datos, así que se vacía.
--   3) raiddominion_register_visit(p_ip) REHUSA registrar IPs
--      locales (loopback, RFC1918, link-local, unique-local) y
--      guarda la IP del resto. Así nunca entra localhost, aunque
--      una ruta pasara por alto el filtro del endpoint.
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ Debido al cambio de firma (nuevo parámetro p_ip), se hace
--    DROP de la versión 3-arg previa.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Columna ip ──────────────────────────────────────────────────────
ALTER TABLE public.raiddominion_visits ADD COLUMN IF NOT EXISTS ip TEXT;

CREATE INDEX IF NOT EXISTS idx_raiddominion_visits_ip
    ON public.raiddominion_visits (ip);

-- ─── 2) Limpieza de registros previos (todos dev/pruebas sin ip) ────────
DELETE FROM public.raiddominion_visits WHERE ip IS NULL;

-- ─── 3) RPC con p_ip + rechazo de tráfico local ─────────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_register_visit(text, text, text);
CREATE OR REPLACE FUNCTION public.raiddominion_register_visit(
    p_visitor_id TEXT,
    p_path TEXT,
    p_page TEXT,
    p_ip TEXT DEFAULT NULL
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

    -- Rechaza tráfico local/pruebas: loopback, RFC1918, link-local,
    -- unique-local (mismo criterio que isLocalIp del endpoint).
    IF p_ip IS NOT NULL AND (
        p_ip IN ('127.0.0.1', '::1', '0.0.0.0', '::', 'localhost')
        OR p_ip LIKE '10.%'
        OR p_ip LIKE '192.168.%'
        OR p_ip LIKE '169.254.%'
        OR p_ip LIKE '172.16.%' OR p_ip LIKE '172.17.%' OR p_ip LIKE '172.18.%'
        OR p_ip LIKE '172.19.%' OR p_ip LIKE '172.20.%' OR p_ip LIKE '172.21.%'
        OR p_ip LIKE '172.22.%' OR p_ip LIKE '172.23.%' OR p_ip LIKE '172.24.%'
        OR p_ip LIKE '172.25.%' OR p_ip LIKE '172.26.%' OR p_ip LIKE '172.27.%'
        OR p_ip LIKE '172.28.%' OR p_ip LIKE '172.29.%' OR p_ip LIKE '172.30.%'
        OR p_ip LIKE '172.31.%'
        OR p_ip LIKE 'f%'
    ) THEN
        RETURN jsonb_build_object('notify', false);
    END IF;

    INSERT INTO public.raiddominion_visits (visitor_id, path, page, ip)
    VALUES (
        p_visitor_id,
        left(p_path, 512),
        left(p_page, 128),
        left(p_ip, 64)
    );

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

GRANT EXECUTE ON FUNCTION public.raiddominion_register_visit(text, text, text, text) TO anon, authenticated;