-- ============================================================
-- RaidDominion Portal — Limpieza del sistema de "mensajes fijados".
--
-- La sección de mensajes automáticos fijados de mercadeo
-- (raiddominion_marketing_messages + RPCs CRUD admin) quedó fuera de
-- alcance (2026-09-04): el panel de /admin solo envía los objetivos al
-- canal principal o de pruebas. Este archivo elimina los objetos que
-- pudo haber creado la versión inicial de 20260913_marketing_goals.sql.
--
-- Solo aplica si la base ya tenía esos objetos; si nunca existieron,
-- ejecutarlo no hace nada (todo IF EXISTS + prefijo raiddominion_).
--
-- ⚠️ Aplicación MANUAL: se ejecuta en el SQL Editor del proyecto
--    RaidDominion y se registra en .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: solo toca objetos con prefijo raiddominion_.
-- ============================================================

DROP FUNCTION IF EXISTS public.raiddominion_marketing_message_delete(uuid);
DROP FUNCTION IF EXISTS public.raiddominion_marketing_message_upsert(uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.raiddominion_marketing_messages_admin();
DROP TABLE IF EXISTS public.raiddominion_marketing_messages;