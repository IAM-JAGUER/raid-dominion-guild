-- ============================================================
-- RaidDominion Portal — Endurecimiento de seguridad (2026-11-06)
--
-- Corrige vectores detectados en la auditoría estática:
--   1) Un usuario autenticado podía cambiar su propio role/is_guild_master
--      con un PATCH directo a raiddominion_profiles (PostgREST), saltándose
--      los RPCs y llegando a admin.
--   2) El INSERT directo permitía nacer con role='admin' porque el trigger
--      visitante lo permitía explícitamente.
--   3) El dueño de una hermandad podía forjar claim_status='verified',
--      owner_id o slug con un UPDATE directo a raiddominion_guilds.
--   4) Seguía existiendo el RPC legacy raiddominion_claim_guild (reclamo
--      manual sin evidencia de SV), que permitía apropiarse de una guild.
--   5) Tablas de mercadeo/cron sin RLS quedaban expuestas a anon.
--
-- ⚠️ APLICACIÓN MANUAL: SQL Editor del proyecto RaidDominion y registro en
--    .opencode/improve/ciclos.json. Ningún agente la ejecuta.
-- ⚠️ Ecosistema multi-app: solo objetos raiddominion_. Idempotente.
-- ============================================================

-- ─── 1) Perfiles: bloquear escalada de role/is_guild_master ──────────────
-- Los RPCs SECURITY DEFINER (claim_from_sv, admin_set_role, promote_member)
-- corren como owner y no se ven afectados: el guard solo actúa cuando la
-- sentencia la ejecuta directamente anon/authenticated vía PostgREST.
CREATE OR REPLACE FUNCTION public.raiddominion_guard_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_actor_role TEXT;
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_guild_master IS DISTINCT FROM OLD.is_guild_master THEN
        SELECT p.role INTO v_actor_role
        FROM public.raiddominion_profiles p
        WHERE p.id = auth.uid();

        IF v_actor_role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'No puedes cambiar tu rol ni tu estado de maestro de hermandad';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raiddominion_profiles_privileges ON public.raiddominion_profiles;
CREATE TRIGGER trg_raiddominion_profiles_privileges
    BEFORE UPDATE ON public.raiddominion_profiles
    FOR EACH ROW EXECUTE FUNCTION public.raiddominion_guard_profile_privileges();

-- ─── 2) Perfiles: toda cuenta creada directamente nace visitante ─────────
-- Sustituye la versión que permitía insertar admin/guild_master. Al no ser
-- SECURITY DEFINER, current_user distingue el INSERT directo (authenticated)
-- del INSERT dentro de un RPC (owner).
DROP TRIGGER IF EXISTS trg_raiddominion_profiles_visitante ON public.raiddominion_profiles;
DROP FUNCTION IF EXISTS public.raiddominion_force_visitante();
CREATE OR REPLACE FUNCTION public.raiddominion_force_visitante()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        NEW.role := 'visitante';
        NEW.is_guild_master := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_raiddominion_profiles_visitante
    BEFORE INSERT ON public.raiddominion_profiles
    FOR EACH ROW EXECUTE FUNCTION public.raiddominion_force_visitante();

-- ─── 3) Hermandades: el dueño no forja verificación, owner ni slug ──────
CREATE OR REPLACE FUNCTION public.raiddominion_guard_guild_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF NEW.claim_status IS DISTINCT FROM OLD.claim_status
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'Solo el staff puede verificar una hermandad o cambiar su dueño/slug';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raiddominion_guilds_privileges ON public.raiddominion_guilds;
CREATE TRIGGER trg_raiddominion_guilds_privileges
    BEFORE UPDATE ON public.raiddominion_guilds
    FOR EACH ROW EXECUTE FUNCTION public.raiddominion_guard_guild_privileges();

-- ─── 4) Retirar el reclamo manual legacy (sin evidencia de SV) ──────────
DROP FUNCTION IF EXISTS public.raiddominion_claim_guild(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ─── 5) Mercadeo y cron: cerrar lectura/escritura directa a anon ────────
-- Tolerante a instalaciones donde las migraciones de mercadeo aún no se
-- aplicaron: solo endurece las tablas que existan.
DO $$
BEGIN
    IF to_regclass('public.raiddominion_marketing') IS NOT NULL THEN
        ALTER TABLE public.raiddominion_marketing ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.raiddominion_marketing FROM anon, authenticated;
    END IF;
    IF to_regclass('public.raiddominion_marketing_images') IS NOT NULL THEN
        ALTER TABLE public.raiddominion_marketing_images ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.raiddominion_marketing_images FROM anon, authenticated;
    END IF;
    IF to_regclass('public.raiddominion_cron_slots') IS NOT NULL THEN
        ALTER TABLE public.raiddominion_cron_slots ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.raiddominion_cron_slots FROM anon, authenticated;
    END IF;
END $$;

-- El cron libera su slot por RPC (no por DELETE directo). Solo permite
-- liberar ventanas recientes para que no se reabran slots históricos.
CREATE OR REPLACE FUNCTION public.raiddominion_cron_release_slot(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_key IS NULL OR p_key = '' THEN
        RETURN;
    END IF;

    DELETE FROM public.raiddominion_cron_slots
    WHERE slot_key = p_key
      AND created_at > timezone('utc'::text, now()) - interval '2 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.raiddominion_cron_release_slot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raiddominion_cron_release_slot(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.raiddominion_cron_release_slot(TEXT)
    IS 'Libera un slot del cron reciente cuando el envío a Discord falló.';
