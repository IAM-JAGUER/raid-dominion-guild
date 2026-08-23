-- ============================================================
-- RaidDominion Portal — Perfil público del member
-- El member decide si sus datos y perfil son públicos
-- (control básico de cuenta, estilo agendalisto/cliente).
-- ============================================================

ALTER TABLE public.raiddominion_profiles
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_raiddominion_profiles_is_public
    ON public.raiddominion_profiles(is_public);
