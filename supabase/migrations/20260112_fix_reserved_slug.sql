-- ============================================================
-- RaidDominion Portal — Slugs reservados en perfiles
-- 1) ensure_profile_slug v2: nunca devuelve una palabra reservada
--    (rutas del portal); regenera con sufijo si hace falta.
-- 2) Repara filas existentes cuyo slug colisiona con rutas
--    (quedan NULL para regenerarse en el próximo ensure).
-- 3) Base determinista cuando el usuario no tiene nombre visible:
--    'perfil-<8 chars del uid>' en vez de 'jugador'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.raiddominion_ensure_profile_slug()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    i INT := 1;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT slug INTO candidate
    FROM public.raiddominion_profiles
    WHERE id = auth.uid();

    -- Válido solo si existe y NO choca con rutas del portal
    IF candidate IS NOT NULL AND candidate <> ''
       AND candidate NOT IN ('upload','login','dashboard','admin','moderate',
                             'guilds','api','assets','portal','jugador','personajes','p') THEN
        RETURN candidate;
    END IF;

    SELECT lower(
        regexp_replace(
            coalesce(nullif(display_name, ''), nullif(character_name, ''), ''),
            '[^a-zA-Z0-9]+', '-', 'g'
        )
    ) INTO base
    FROM public.raiddominion_profiles
    WHERE id = auth.uid();

    base := btrim(coalesce(base, ''), '-');
    IF base = '' OR base IN ('upload','login','dashboard','admin','moderate',
                             'guilds','api','assets','portal','jugador','personajes','p') THEN
        base := 'perfil-' || left(replace(auth.uid()::text, '-', ''), 8);
    END IF;
    base := left(base, 48);

    candidate := base;
    WHILE EXISTS (
        SELECT 1 FROM public.raiddominion_profiles
        WHERE slug = candidate AND id <> auth.uid()
    ) LOOP
        i := i + 1;
        candidate := base || '-' || i::text;
    END LOOP;

    UPDATE public.raiddominion_profiles
    SET slug = candidate, updated_at = timezone('utc'::text, now())
    WHERE id = auth.uid();

    RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_ensure_profile_slug() TO authenticated;

UPDATE public.raiddominion_profiles
SET slug = NULL
WHERE slug IN ('upload','login','dashboard','admin','moderate',
               'guilds','api','assets','portal','jugador','personajes','p');