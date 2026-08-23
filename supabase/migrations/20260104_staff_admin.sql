-- ============================================================
-- RaidDominion Portal — Staff: admin, moderación y auditoría
-- Fase 3.5:
--   1) raiddominion_audit_log (solo lectura staff; escritura vía RPC)
--   2) RPCs SECURITY DEFINER para admin/moderador
--   3) Corrección: raiddominion_verify_guild_claim ya NO guarda
--      officer_note (tabla de lectura pública; nunca exponerla).
-- ============================================================

-- ─── Tabla de auditoría ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raiddominion_audit_created
    ON public.raiddominion_audit_log(created_at DESC);

ALTER TABLE public.raiddominion_audit_log ENABLE ROW LEVEL SECURITY;

-- Limpiar policies anteriores de la tabla (idempotente)
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
        WHERE tablename = 'raiddominion_audit_log'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.raiddominion_audit_log', pol.policyname);
    END LOOP;
END $$;

-- Solo staff lee la auditoría; sin policies de escritura (RPCs definer)
CREATE POLICY raiddominion_audit_select_staff ON public.raiddominion_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.raiddominion_profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'moderator')
        )
    );

-- ─── Corrección de fuga: sin officer_note en roster público ────────────
UPDATE public.raiddominion_guild_members SET officer_note = NULL;
ALTER TABLE public.raiddominion_guild_members ALTER COLUMN officer_note DROP DEFAULT;

-- ─── raiddominion_verify_guild_claim (v2) ──────────────────────────────
-- Igual que v1 pero: sincroniza el roster desde el SV más reciente del
-- owner cuando p_members es NULL y NUNCA persiste officer_note.
CREATE OR REPLACE FUNCTION public.raiddominion_verify_guild_claim(
    p_guild_id UUID,
    p_approved BOOLEAN,
    p_members JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_owner uuid;
    v_raw jsonb;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role NOT IN ('moderator', 'admin') THEN
        RAISE EXCEPTION 'No autorizado: se requiere moderador o admin.';
    END IF;

    UPDATE public.raiddominion_guilds
    SET claim_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
        is_public = CASE WHEN p_approved THEN TRUE ELSE FALSE END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_guild_id;

    SELECT owner_id INTO v_owner FROM public.raiddominion_guilds WHERE id = p_guild_id;

    IF p_approved THEN
        IF p_members IS NOT NULL THEN
            INSERT INTO public.raiddominion_guild_members (guild_id, name, class, rank, race, public_note)
            SELECT p_guild_id,
                   (m ->> 'name')::text,
                   (m ->> 'class')::text,
                   (m ->> 'rank')::text,
                   (m ->> 'race')::text,
                   (m ->> 'publicNote')::text
            FROM jsonb_array_elements(p_members) AS m
            WHERE (m ->> 'name') IS NOT NULL;
        ELSIF v_owner IS NOT NULL THEN
            SELECT raw INTO v_raw
            FROM public.raiddominion_saved_variables
            WHERE user_id = v_owner AND raw IS NOT NULL
            ORDER BY parsed_at DESC
            LIMIT 1;

            IF v_raw IS NOT NULL THEN
                DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
                INSERT INTO public.raiddominion_guild_members (guild_id, name, class, rank, race, public_note)
                SELECT p_guild_id,
                       (m ->> 'name')::text,
                       (m ->> 'class')::text,
                       (m ->> 'rank')::text,
                       (m ->> 'race')::text,
                       (m ->> 'publicNote')::text
                FROM jsonb_array_elements(v_raw -> 'guild' -> 'members') AS m
                WHERE (m ->> 'name') IS NOT NULL;
            END IF;
        END IF;
    ELSE
        DELETE FROM public.raiddominion_guild_members WHERE guild_id = p_guild_id;
    END IF;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        CASE WHEN p_approved THEN 'guild_claim_verified' ELSE 'guild_claim_rejected' END,
        p_guild_id::text,
        jsonb_build_object('roster_synced', COALESCE(p_members IS NOT NULL, v_raw IS NOT NULL))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_verify_guild_claim(UUID, BOOLEAN, JSONB) TO authenticated;

-- ─── raiddominion_staff_list_guilds ────────────────────────────────────
-- Moderador/admin ven TODAS las hermandades (incluye pendientes/privadas).
CREATE OR REPLACE FUNCTION public.raiddominion_staff_list_guilds()
RETURNS TABLE(
    id UUID,
    slug TEXT,
    name TEXT,
    realm TEXT,
    faction TEXT,
    description TEXT,
    claim_status TEXT,
    is_public BOOLEAN,
    owner_email TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT g.id, g.slug, g.name, g.realm, g.faction, g.description,
           g.claim_status, g.is_public,
           u.email AS owner_email,
           g.updated_at
    FROM public.raiddominion_guilds g
    LEFT JOIN auth.users u ON u.id = g.owner_id
    WHERE EXISTS (
        SELECT 1 FROM public.raiddominion_profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'moderator')
    )
    ORDER BY g.created_at DESC
    LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_staff_list_guilds() TO authenticated;

-- ─── raiddominion_staff_set_guild_public ───────────────────────────────
-- Takedown / republicación por staff.
CREATE OR REPLACE FUNCTION public.raiddominion_staff_set_guild_public(
    p_guild_id UUID,
    p_is_public BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role NOT IN ('moderator', 'admin') THEN
        RAISE EXCEPTION 'No autorizado: se requiere moderador o admin.';
    END IF;

    UPDATE public.raiddominion_guilds
    SET is_public = p_is_public, updated_at = timezone('utc'::text, now())
    WHERE id = p_guild_id;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        CASE WHEN p_is_public THEN 'guild_published' ELSE 'guild_takedown' END,
        p_guild_id::text,
        NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_staff_set_guild_public(UUID, BOOLEAN) TO authenticated;

-- ─── raiddominion_admin_list_users ─────────────────────────────────────
-- Admin lista usuarios con su rol (fuente de verdad: profiles.role).
CREATE OR REPLACE FUNCTION public.raiddominion_admin_list_users()
RETURNS TABLE(
    id UUID,
    email TEXT,
    display_name TEXT,
    character_name TEXT,
    realm TEXT,
    slug TEXT,
    role TEXT,
    is_public BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, u.email, p.display_name, p.character_name, p.realm,
           p.slug, p.role, p.is_public, p.created_at
    FROM public.raiddominion_profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE EXISTS (
        SELECT 1 FROM public.raiddominion_profiles me
        WHERE me.id = auth.uid() AND me.role = 'admin'
    )
    ORDER BY p.created_at DESC
    LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_list_users() TO authenticated;

-- ─── raiddominion_admin_set_role ───────────────────────────────────────
-- Admin cambia el rol; sincroniza user_apps. Prohibido auto-modificarse.
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_role(
    p_user_id UUID,
    p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puedes cambiar tu propio rol desde aquí.';
    END IF;

    IF p_role NOT IN ('member', 'guild_master', 'moderator', 'admin') THEN
        RAISE EXCEPTION 'Rol inválido.';
    END IF;

    UPDATE public.raiddominion_profiles
    SET role = p_role,
        is_guild_master = (p_role = 'guild_master'),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado.';
    END IF;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (p_user_id, 'raiddominion', p_role, 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = EXCLUDED.role;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (auth.uid(), 'user_role_changed', p_user_id::text, jsonb_build_object('new_role', p_role));
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_role(UUID, TEXT) TO authenticated;