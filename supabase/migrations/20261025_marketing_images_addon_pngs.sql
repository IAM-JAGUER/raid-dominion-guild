-- ============================================================
-- RaidDominion Portal — Nuevas capturas del addon en la rotación
-- de mensajes de Discord.
--
-- Contexto: se reubicaron 6 capturas PNG desde public/gallery a
-- public/images/addon. Como el motor de mercadeo rota las capturas
-- vía el RPC raiddominion_marketing_pick_image (que lee SOLO la tabla
-- raiddominion_marketing_images), estas keys deben existir también en
-- la base para entrar en la rotación balanceada.
--
-- Esta migración solo INSERTA/ACTUALIZA el catálogo de capturas; NO
-- toca usage_count ni last_used_at (si la key ya existía, conserva su
-- historial de rotación). Las filas nuevas nacen con enabled = TRUE.
--
-- ⚠️ Aplicación MANUAL: SQL Editor del proyecto RaidDominion y
--    registro en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: TODO lleva prefijo raiddominion_.
-- ============================================================

INSERT INTO public.raiddominion_marketing_images (key, label, ejes)
SELECT * FROM (VALUES
    ('menu-habilidades-roles', 'Menú de habilidades y roles', ARRAY['general', 'jugadores']),
    ('menu-reglas-mecanicas',  'Menú de reglas y mecánicas',  ARRAY['general', 'bandas', 'hermandades', 'jugadores']),
    ('roster-roles-banda',     'Roster de roles de banda',    ARRAY['bandas', 'jugadores']),
    ('buffs-banda',            'Buffs de banda',              ARRAY['bandas', 'jugadores']),
    ('habilidades-utilidad',   'Habilidades de utilidad',     ARRAY['bandas', 'jugadores']),
    ('habilidades-duales',     'Habilidades duales',          ARRAY['bandas', 'jugadores'])
) AS v(key, label, ejes)
ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        ejes = EXCLUDED.ejes,
        updated_at = timezone('utc'::text, now());
