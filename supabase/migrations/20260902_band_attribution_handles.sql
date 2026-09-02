-- ============================================================
-- RaidDominion Portal — Handles públicos para atribución de bandas
--
-- Problema: una banda personal (guild_id NULL) cuyo dueño tiene perfil
-- PRIVADO (is_public = FALSE) no se atribuía en /bandas ni en las vistas.
-- La RLS de raiddominion_profiles (auth.uid() = id OR is_public = TRUE)
-- oculta por completo el perfil al cliente anon, incluido su slug/handle y
-- el reino de sus personajes.
--
-- Solución: vista SECURITY DEFINER que expone SOLO la superficie mínima de
-- atribución/agrupación de TODOS los perfiles, pública o privada:
--   * id  → vincula al dueño.
--   * slug → handle @hex (playernames.handleFromSlug).
--   * realm → reino principal del dueño (del personaje más relevante) para
--     agrupar bandas personales en su reino /servidor/:server/reino/:realm.
--   * principal_name → nombre del personaje PRINCIPAL (perfil.character_name)
--     SOLO cuando ese personaje es PÚBLICO; NULL si lo es privado. Permite
--     atribuir una banda a un personaje únicamente cuando coincide con el
--     principal visible, sin filtrar nombres de personajes privados.
-- No filtra display_name, rol, ni personajes no-principales.
--
-- Decisión (20260902): exponer el reino principal del dueño de una banda
-- pública es aceptable — publicar una banda ya revela la actividad del
-- dueño, y el reino (a diferencias de los nombres/equipos) no identifica a
-- la persona. Anula la restricción previa de "reino solo si personaje
-- público": así la banda de fallback (dueño privado) aparece en su reino.
-- ============================================================

-- ─── Vista de handles + reino/principal públicos (SECURITY DEFINER) ─────
DROP VIEW IF EXISTS public.raiddominion_profile_handles;
CREATE VIEW public.raiddominion_profile_handles AS
    SELECT
        p.id,
        p.slug,
        (
            SELECT co.realm
            FROM public.raiddominion_characters co
            WHERE co.user_id = p.id
              AND co.realm IS NOT NULL AND co.realm <> ''
            ORDER BY
                (CASE WHEN co.sv_is_gm THEN 1 ELSE 0 END) DESC,
                COALESCE(co.avg_ilvl, 0) DESC,
                co.name ASC
            LIMIT 1
        ) AS realm,
        (
            SELECT co.name
            FROM public.raiddominion_characters co
            WHERE co.user_id = p.id
              AND co.is_public = TRUE
              AND co.name = p.character_name
            LIMIT 1
        ) AS principal_name
    FROM public.raiddominion_profiles p
    WHERE p.slug IS NOT NULL AND p.slug <> '';

-- Por defecto las vistas corren con los permisos del owner (postgres), que
-- NO está restringido por RLS → ve todas las filas. Solo se proyectan
-- id, slug, realm y principal_name; no se exponen display_name, rol, ni
-- personajes no-principales ni privados.
ALTER VIEW public.raiddominion_profile_handles SET (security_invoker = false);

GRANT SELECT ON public.raiddominion_profile_handles TO anon, authenticated;
