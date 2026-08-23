-- ============================================================
-- RaidDominion Portal — Alta de perfil propio al vuelo
-- Usuarios de otras apps del ecosistema inician sesión con su
-- cuenta compartida pero pueden no tener fila en
-- raiddominion_profiles (creados antes del bloque raiddominion).
-- getMyProfile() la crea al vuelo; RLS necesita policy de INSERT.
-- ============================================================

DROP POLICY IF EXISTS raiddominion_profiles_insert_own ON public.raiddominion_profiles;
CREATE POLICY raiddominion_profiles_insert_own ON public.raiddominion_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);