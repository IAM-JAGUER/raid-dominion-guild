-- ============================================================
-- RaidDominion Portal — Schema inicial (prefijo raiddominion_)
-- Fase 1: perfiles, hermandades, miembros, uploads y config.
--
-- ⚠️ Ecosistema multi-app: TODA tabla/columna/policy lleva prefijo
--    raiddominion_. NUNCA tocar tablas de otras apps.
-- ⚠️ handle_new_user() / sanitize_signup_role() / ensure_user_app()
--    son canónicas en ../supabase-shared/ — NO redefinir aquí.
-- ⚠️ Funciones DB: SECURITY DEFINER + SET search_path = '' +
--    GRANT EXECUTE TO authenticated.
-- ============================================================

-- ─── raiddominion_profiles ─────────────────────────────────────────────
-- Perfil del usuario dentro del portal. role es la ÚNICA fuente de verdad.
CREATE TABLE IF NOT EXISTS public.raiddominion_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    display_name TEXT,
    character_name TEXT,
    realm TEXT,
    is_guild_master BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT raiddominion_profiles_role_check CHECK (role IN ('member', 'guild_master', 'moderator', 'admin'))
);

-- ─── raiddominion_guilds ───────────────────────────────────────────────
-- Hermandad registrada por un maestro verificado.
CREATE TABLE IF NOT EXISTS public.raiddominion_guilds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    realm TEXT,
    faction TEXT,
    discord_link TEXT,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT FALSE,
    claim_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT raiddominion_guilds_claim_status_check CHECK (claim_status IN ('pending', 'verified', 'rejected'))
);

-- ─── raiddominion_guild_members ─────────────────────────────────────────
-- Roster parseado desde el SavedVariables. Campos públicos vs privados:
-- officer_note es interna (nunca se muestra públicamente).
CREATE TABLE IF NOT EXISTS public.raiddominion_guild_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES public.raiddominion_guilds(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    class TEXT,
    rank TEXT,
    race TEXT,
    public_note TEXT,
    officer_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── raiddominion_saved_variables ──────────────────────────────────────
-- Registro de uploads de RaidDominionDB.
CREATE TABLE IF NOT EXISTS public.raiddominion_saved_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guild_id UUID REFERENCES public.raiddominion_guilds(id) ON DELETE SET NULL,
    addon_version TEXT,
    generated_by TEXT,
    status TEXT NOT NULL DEFAULT 'parsed',
    raw JSONB,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT raiddominion_saved_variables_status_check CHECK (status IN ('parsed', 'verified', 'rejected'))
);

-- ─── raiddominion_guild_config ──────────────────────────────────────────
-- Config extra del SV (bandas, roles, mecánicas, ui) en JSONB.
CREATE TABLE IF NOT EXISTS public.raiddominion_guild_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES public.raiddominion_guilds(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (guild_id, config_key)
);

-- ─── Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_raiddominion_profiles_role ON public.raiddominion_profiles(role);
CREATE INDEX IF NOT EXISTS idx_raiddominion_guilds_is_public ON public.raiddominion_guilds(is_public);
CREATE INDEX IF NOT EXISTS idx_raiddominion_guilds_claim_status ON public.raiddominion_guilds(claim_status);
CREATE INDEX IF NOT EXISTS idx_raiddominion_guild_members_guild ON public.raiddominion_guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_guild_members_name ON public.raiddominion_guild_members(name);
CREATE INDEX IF NOT EXISTS idx_raiddominion_saved_variables_user ON public.raiddominion_saved_variables(user_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_guild_config_guild ON public.raiddominion_guild_config(guild_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Solo auth.uid() = user_id. user_apps NO tiene RLS (compartida).

ALTER TABLE public.raiddominion_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raiddominion_guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raiddominion_guild_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raiddominion_saved_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raiddominion_guild_config ENABLE ROW LEVEL SECURITY;

-- Limpiar policies anteriores (idempotente por migración)
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies
        WHERE tablename LIKE 'raiddominion_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- raiddominion_profiles: el usuario solo ve/edita su propio perfil
CREATE POLICY raiddominion_profiles_select_own ON public.raiddominion_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY raiddominion_profiles_update_own ON public.raiddominion_profiles
    FOR UPDATE USING (auth.uid() = id);

-- raiddominion_saved_variables: el usuario solo ve/inserta sus propios uploads
CREATE POLICY raiddominion_sv_select_own ON public.raiddominion_saved_variables
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY raiddominion_sv_insert_own ON public.raiddominion_saved_variables
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- raiddominion_guilds: lectura pública si is_public; edición solo owner
CREATE POLICY raiddominion_guilds_select_public ON public.raiddominion_guilds
    FOR SELECT USING (is_public = TRUE OR owner_id = auth.uid());
CREATE POLICY raiddominion_guilds_update_owner ON public.raiddominion_guilds
    FOR UPDATE USING (owner_id = auth.uid());

-- raiddominion_guild_members: lectura pública (roster público); sin edición directa
CREATE POLICY raiddominion_guild_members_select_public ON public.raiddominion_guild_members
    FOR SELECT USING (TRUE);

-- raiddominion_guild_config: lectura pública; edición solo owner de la guild
CREATE POLICY raiddominion_guild_config_select_public ON public.raiddominion_guild_config
    FOR SELECT USING (TRUE);
CREATE POLICY raiddominion_guild_config_update_owner ON public.raiddominion_guild_config
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.raiddominion_guilds g
            WHERE g.id = guild_id AND g.owner_id = auth.uid()
        )
    );