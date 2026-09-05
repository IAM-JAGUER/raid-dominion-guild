-- ============================================================
-- RaidDominion Portal — Deduplicación del envío del cron de Discord
--
-- Problema: Netlify Scheduled Functions son "at-least-once"; si una
-- invocación tarda (el cron hace varias llamadas HTTP) o la plataforma
-- reintenta, se publica el MISMO mensaje dos veces.
--
-- Solución: un lock persistente por ventana horaria (slot_key):
--   - slot_key = YYYYMMDD-HH (UTC). El cron intenta insertarlo con
--     ON CONFLICT DO NOTHING ANTES de enviar.
--   - Si el INSERT no afecta filas → esa ventana ya se publicó → SKIP.
--   - Si el INSERT sí inserta → es la invocación que envía → el resto
--     de reintentos de la misma ventana lo verán ocupado y no envían.
--
-- El INSERT condicional es atómico a nivel de fila, así que aunque
-- dos invocaciones lleguen a la vez, solo una gana y publica.
--
-- RPC: raiddominion_cron_claim_slot(p_key) → booleano (true = ganó el
-- slot, puede enviar; false = ya estaba tomado, NO enviar).
-- SECURITY DEFINER + esquema públicas por RLS (anon ya puede ejecutar
-- RPCs SECURITY DEFINER de solo-escritura controlada).
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

-- ─── 1) Tabla de slots del cron (una fila por ventana horaria) ──────────
CREATE TABLE IF NOT EXISTS public.raiddominion_cron_slots (
    slot_key TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mantiene la tabla pequeña: limpia slots con más de 48h (solo el cron
-- los escribe en la ventana activa). Guardia de saneamiento.
DELETE FROM public.raiddominion_cron_slots
WHERE created_at < timezone('utc'::text, now()) - interval '48 hours';

-- ─── 2) RPC de reclamación de slot (atómico) ─────────────────────────────
-- Devuelve true SOLO si este llamador gana la ventana (pudo insertar).
-- Cualquier reintento posterior de la misma ventana vuelve false.
CREATE OR REPLACE FUNCTION public.raiddominion_cron_claim_slot(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_key IS NULL OR p_key = '' THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.raiddominion_cron_slots (slot_key)
    VALUES (p_key)
    ON CONFLICT (slot_key) DO NOTHING;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_cron_claim_slot(text) TO anon, authenticated;
