-- ============================================================
-- RaidDominion Portal — Personajes + onboarding visitante→miembro
--
-- Modelo validado con el usuario:
-- 1. Todo personaje nace de un SV subido (registry.player).
-- 2. Un (nombre, reino) solo puede estar vinculado a UNA cuenta
--    (anti-falseo: unicidad global; conflicto → error claro).
-- 3. Nuevas cuentas nacen 'visitante' (trigger sobre perfiles).
-- 4. visitante→member SOLO si su personaje coincide con un roster
--    de hermandad subido por OTRA cuenta (evidencia cruzada).
-- ============================================================

-- ─── raiddominion_characters ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raiddominion_characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sv_upload_id UUID REFERENCES public.raiddominion_saved_variables(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    realm TEXT,
    class TEXT,
    class_file TEXT,
    race TEXT,
    race_file TEXT,
    level INT,
    talent_spec TEXT,
    avg_ilvl NUMERIC(6,1),
    equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    member_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Unicidad global (nombre, reino) con expresiones: requiere índice, no CONSTRAINT
CREATE UNIQUE INDEX IF NOT EXISTS raiddominion_characters_name_realm_unique
    ON public.raiddominion_characters (lower(name), lower(COALESCE(realm, '')));

CREATE INDEX IF NOT EXISTS idx_raiddominion_characters_user ON public.raiddominion_characters(user_id);
CREATE INDEX IF NOT EXISTS idx_raiddominion_characters_name ON public.raiddominion_characters(lower(name));

ALTER TABLE public.raiddominion_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raiddominion_characters_select ON public.raiddominion_characters;
CREATE POLICY raiddominion_characters_select ON public.raiddominion_characters
    FOR SELECT USING (auth.uid() = user_id OR is_public = TRUE);

DROP POLICY IF EXISTS raiddominion_characters_update_own ON public.raiddominion_characters;
CREATE POLICY raiddominion_characters_update_own ON public.raiddominion_characters
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- INSERT/DELETE solo vía RPC SECURITY DEFINER (control anti-falseo)

-- ─── Evidencia de rosters subidos (fuente para promoción) ──────────
-- Una fila por miembro presente en Guild.memberList de cada upload.
-- Sin FK a guilds: la evidencia existe aunque nadie haya reclamado aún.
CREATE TABLE IF NOT EXISTS public.raiddominion_roster_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sv_upload_id UUID NOT NULL REFERENCES public.raiddominion_saved_variables(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    char_name TEXT NOT NULL,
    char_class TEXT,
    rank_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raiddominion_evidence_name ON public.raiddominion_roster_evidence(lower(char_name));

ALTER TABLE public.raiddominion_roster_evidence ENABLE ROW LEVEL SECURITY;
-- Escritura/lectura exclusivamente vía SECURITY DEFINER

-- ─── Nuevas cuentas nacen visitante ────────────────────────────────
-- handle_new_user() es canónica compartida; el ajuste raiddominion vive aquí.
DROP FUNCTION IF EXISTS public.raiddominion_force_visitante();
CREATE OR REPLACE FUNCTION public.raiddominion_force_visitante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.role <> 'visitante' AND NEW.role IS DISTINCT FROM 'guild_master' AND NEW.role IS DISTINCT FROM 'admin' THEN
        NEW.role := 'visitante';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_raiddominion_profiles_visitante ON public.raiddominion_profiles;
CREATE TRIGGER trg_raiddominion_profiles_visitante
    BEFORE INSERT ON public.raiddominion_profiles
    FOR EACH ROW EXECUTE FUNCTION public.raiddominion_force_visitante();

-- ─── Registro de personaje desde upload ────────────────────────────
-- Devuelve 'created' | 'updated' | 'conflict'.
DROP FUNCTION IF EXISTS public.raiddominion_upsert_character(UUID, UUID, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_character(
    p_sv_id UUID,
    p_player JSONB,
    p_saved_at TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_existing UUID;
    v_name TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;

    -- Anti-falseo: ¿el (nombre, reino) ya pertenece a otra cuenta?
    SELECT id INTO v_existing
    FROM public.raiddominion_characters
    WHERE lower(name) = lower(v_name)
      AND lower(COALESCE(realm, '')) = lower(COALESCE(p_player->>'realm', ''))
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.raiddominion_characters WHERE id = v_existing AND user_id = v_user) THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = NULLIF(p_player->>'class', ''),
                class_file = NULLIF(p_player->>'classFile', ''),
                race = NULLIF(p_player->>'race', ''),
                race_file = NULLIF(p_player->>'raceFile', ''),
                level = (p_player->>'level')::int,
                talent_spec = NULLIF(p_player->>'talentSpec', ''),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = COALESCE(p_player->'equipment', '[]'::jsonb),
                updated_at = now()
            WHERE id = v_existing;
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, class, class_file, race, race_file,
        level, talent_spec, avg_ilvl, equipment
    ) VALUES (
        v_user, p_sv_id, v_name, NULLIF(p_player->>'realm', ''),
        NULLIF(p_player->>'class', ''), NULLIF(p_player->>'classFile', ''),
        NULLIF(p_player->>'race', ''), NULLIF(p_player->>'raceFile', ''),
        (p_player->>'level')::int,
        NULLIF(p_player->>'talentSpec', ''),
        (p_player->>'avgIlvl')::numeric,
        COALESCE(p_player->'equipment', '[]'::jsonb)
    );

    RETURN 'created';
END;
$$;

-- ─── Persistir roster del upload como evidencia ─────────────────────
DROP FUNCTION IF EXISTS public.raiddominion_save_roster_evidence(UUID, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_save_roster_evidence(
    p_sv_id UUID,
    p_members JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_count INT := 0;
    m JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.raiddominion_saved_variables WHERE id = p_sv_id AND user_id = v_user) THEN
        RAISE EXCEPTION 'upload no pertenece al usuario';
    END IF;

    DELETE FROM public.raiddominion_roster_evidence WHERE sv_upload_id = p_sv_id;

    FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_members, '[]'::jsonb))
    LOOP
        BEGIN
            INSERT INTO public.raiddominion_roster_evidence (sv_upload_id, uploaded_by, char_name, char_class, rank_label)
            VALUES (
                p_sv_id, v_user,
                trim(m->>'name'),
                NULLIF(m->>'class', ''),
                NULLIF(m->>'rank', '')
            );
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ─── Promoción visitante → member ───────────────────────────────────
-- Requiere: alguno de MIS personajes aparece en evidencia subida por OTRO usuario.
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member();
CREATE OR REPLACE FUNCTION public.raiddominion_try_promote_member()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_char RECORD;
    v_hit RECORD;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin perfil');
    END IF;
    IF v_role <> 'visitante' THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'rol actual no requiere promoción');
    END IF;

    FOR v_char IN
        SELECT c.id, c.name, c.realm
        FROM public.raiddominion_characters c
        WHERE c.user_id = v_user AND c.member_verified = FALSE
    LOOP
        SELECT e.id, e.uploaded_by, e.sv_upload_id
        INTO v_hit
        FROM public.raiddominion_roster_evidence e
        JOIN public.raiddominion_guilds g ON g.id = (
            SELECT guild_id FROM public.raiddominion_saved_variables WHERE id = e.sv_upload_id
        )
        WHERE lower(e.char_name) = lower(v_char.name)
          AND e.uploaded_by <> v_user
          AND g.is_active = TRUE
        LIMIT 1;

        IF v_hit.id IS NOT NULL THEN
            UPDATE public.raiddominion_characters
            SET member_verified = TRUE, verified_at = now()
            WHERE id = v_char.id;

            UPDATE public.raiddominion_profiles SET role = 'member', updated_at = now() WHERE id = v_user;

            UPDATE public.user_apps SET role = 'member'
            WHERE user_id = v_user AND app_slug = 'raiddominion';

            INSERT INTO public.raiddominion_audit_log (actor_id, action, target_type, target_id, details)
            VALUES (v_user, 'promote_visitor_to_member', 'character', v_char.id,
                    jsonb_build_object('char', v_char.name, 'realm', v_char.realm,
                                       'evidence_sv', v_hit.sv_upload_id));

            RETURN jsonb_build_object('promoted', TRUE, 'character', v_char.name);
        END IF;
    END LOOP;

    RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin coincidencia de roster');
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raiddominion_save_roster_evidence(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raiddominion_try_promote_member() TO authenticated;