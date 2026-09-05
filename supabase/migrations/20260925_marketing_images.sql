-- ============================================================
-- RaidDominion Portal — Rotación balanceada de capturas del addon
-- en los mensajes de mercadeo (Discord).
--
-- Contexto: el embed de Discord de los mensajes de mercadeo mostraba
-- siempre el logo. Ahora puede mostrar CAPTURAS reales del addon
-- (public/images/addon/*.jpg) elegidas según el eje del mensaje
-- (bandas/hermandades/jugadores) y rotadas de forma balanceada para
-- que no se repita la misma captura seguidas.
--
-- Solución:
--   1. raiddominion_marketing_images: catálogo de capturas (cada una
--      con uno o más ejes + contador de usos). VIVE EN CÓDIGO también
--      (netlify/functions/_shared/addonImages.ts); la tabla solo
--      persiste el estado de rotación (último uso / total de usos).
--   2. raiddominion_marketing_pick_image(p_eje): devuelve la captura
--      MENOS usada recientemente que coincida con el eje (priorizando
--      coincidencia de eje; si ninguna coincide, cualquier captura).
--      Marca el uso ANTES de devolver (update atómico al seleccionar).
--      Es la ÚNICA vía de escritura a la tabla de rotación (anon no
--      tiene grants directos).
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Catálogo y estado de rotación de capturas ────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_marketing_images (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    ejes TEXT[] NOT NULL DEFAULT '{general}',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Si cambia el catálogo en addonImages.ts, re-aplicar esta migración
-- actualiza labels/ejes sin tocar los contadores de uso.
INSERT INTO public.raiddominion_marketing_images (key, label, ejes)
SELECT * FROM (VALUES
    ('menu-flotante',         'Menú flotante del addon',              ARRAY['general']),
    ('configuracion-bandas',  'Configuración de bandas',              ARRAY['bandas']),
    ('configuracion-reglas',  'Reglas de banda/hermandad',            ARRAY['bandas', 'hermandades']),
    ('editar-elemento',       'Editor de mecánicas y reglas',         ARRAY['bandas']),
    ('editar-jugador',        'Roster y gestor de jugador',           ARRAY['bandas', 'jugadores']),
    ('gestor-botin',          'Gestor de botín',                      ARRAY['bandas', 'jugadores']),
    ('lista-jugadores-banda', 'Lista de jugadores de la banda',       ARRAY['bandas', 'jugadores']),
    ('sanciones',             'Sancionados',                          ARRAY['bandas']),
    ('selector-icono',        'Selector de icono',                    ARRAY['general']),
    ('spammer-bandas',        'Spammer de banda',                     ARRAY['bandas', 'hermandades']),
    ('spammer-reglas',        'Spammer de reglas',                    ARRAY['bandas', 'hermandades'])
) AS v(key, label, ejes)
ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        ejes = EXCLUDED.ejes,
        updated_at = timezone('utc'::text, now());

-- ─── 2) RPC de selección balanceada (SECURITY DEFINER) ───────────────────
-- Devuelve la key de la captura elegida y marca el uso. Prioriza:
--   1) capturas habilitadas cuyo eje coincida con p_eje, ordenadas por
--      la menos usada recientemente (last_used_at ASC, uso_total ASC);
--   2) si no hay ninguna del eje, la menos usada de las 'general';
--   3) si tampoco, la menos usada de TODAS.
-- En cada llamada incrementa usage_count + last_used_at de la elegida.
CREATE OR REPLACE FUNCTION public.raiddominion_marketing_pick_image(p_eje TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_key TEXT;
BEGIN
    IF p_eje IS NULL OR p_eje = '' THEN
        p_eje := 'general';
    END IF;

    SELECT key INTO v_key
        FROM public.raiddominion_marketing_images
        WHERE enabled = TRUE AND p_eje = ANY(ejes)
        ORDER BY last_used_at ASC NULLS FIRST, usage_count ASC, key ASC
        LIMIT 1;

    IF v_key IS NULL THEN
        SELECT key INTO v_key
            FROM public.raiddominion_marketing_images
            WHERE enabled = TRUE AND 'general' = ANY(ejes)
            ORDER BY last_used_at ASC NULLS FIRST, usage_count ASC, key ASC
            LIMIT 1;
    END IF;

    IF v_key IS NULL THEN
        SELECT key INTO v_key
            FROM public.raiddominion_marketing_images
            WHERE enabled = TRUE
            ORDER BY last_used_at ASC NULLS FIRST, usage_count ASC, key ASC
            LIMIT 1;
    END IF;

    IF v_key IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.raiddominion_marketing_images
        SET usage_count = usage_count + 1,
            last_used_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE key = v_key;

    RETURN v_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_marketing_pick_image(text) TO anon, authenticated;