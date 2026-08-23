-- 20260823 — Privacidad: strip de officerNote en snapshots públicos ya persistidos.
--
-- buildPortalSnapshot (src/lib/api.ts) ahora construye members por whitelist
-- (name/class/rank/publicNote), pero las filas históricas de portal_snapshot
-- pudieron guardar officerNote y la policy SELECT es pública (USING TRUE).
-- Idempotente: solo reescribe filas donde alguna entrada aún traiga la clave.

UPDATE public.raiddominion_guild_config
SET config_value = jsonb_set(
      config_value,
      '{members}',
      (
        SELECT COALESCE(jsonb_agg(elem - 'officerNote' ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(config_value->'members', '[]'::jsonb))
          WITH ORDINALITY AS t(elem, ord)
      ),
      TRUE
    ),
    updated_at = timezone('utc'::text, now())
WHERE config_key = 'portal_snapshot'
  AND config_value ? 'members'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(config_value->'members', '[]'::jsonb)) e
    WHERE e ? 'officerNote'
  );
