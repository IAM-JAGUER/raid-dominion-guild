-- ============================================================
-- RaidDominion Portal — Corrección de slug legible de personaje
--
-- BUG (20260827_character_slug_readable.sql): raiddominion_make_character_slug
-- usaba lower(regexp_replace(..., '[^a-z0-9]+', '-', 'g')). Como lower() se
-- aplicaba DESPUÉS de regexp_replace y la clase era [^a-z0-9]+ (sin A-Z), las
-- MAYÚSCULAS se interpretaban como "no alfanumérico" y se reemplazaban por '-'
-- en vez de pasarse a minúscula. Resultado: el slug recortaba la primera
-- letra de cada palabra (p. ej. "Guayabera"-"Bennu" → "uayabera-ennu").
--
-- FIX: la clase pasa a [^a-zA-Z0-9]+ (igual que guilds/bandas/perfiles), de
-- modo que las mayúsculas se conservan y luego lower() las minúsculas.
--
-- Backfill: renormaliza TODOS los slugs existentes con el helper corregido
-- (idempotente para los que ya eran correctos).
--
-- ⚠️ Ecosistema multi-app: prefijo raiddominion_. SECURITY DEFINER +
-- SET search_path='' + GRANT EXECUTE TO authenticated. RLS sin subconsultas.
-- ============================================================

-- ─── 1) Helper corregido: conserva mayúsculas y luego minúsculas ──────────
DROP FUNCTION IF EXISTS public.raiddominion_make_character_slug(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_make_character_slug(
    p_name TEXT,
    p_realm TEXT,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base TEXT;
    v_slug TEXT;
    v_i INT := 1;
BEGIN
    v_base := lower(regexp_replace(
        coalesce(nullif(trim(p_name), ''), 'personaje') || '-' ||
        coalesce(nullif(trim(p_realm), ''), 'reino'),
        '[^a-zA-Z0-9]+', '-', 'g'
    ));
    v_base := btrim(v_base, '-');
    IF v_base = '' THEN v_base := 'personaje'; END IF;
    v_base := left(v_base, 56);

    v_slug := v_base;
    WHILE EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE slug = v_slug AND (p_exclude_id IS NULL OR id <> p_exclude_id)
    ) LOOP
        v_i := v_i + 1;
        v_slug := left(v_base, 48) || '-' || v_i::text;
    END LOOP;
    RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_make_character_slug(TEXT, TEXT, UUID) TO authenticated;

-- ─── 2) Backfill: renormaliza slugs existentes (idempotente) ──────────────
DO $$
DECLARE
    c RECORD;
    v_slug TEXT;
BEGIN
    FOR c IN
        SELECT id, name, realm, slug FROM public.raiddominion_characters
    LOOP
        v_slug := public.raiddominion_make_character_slug(c.name, c.realm, c.id);
        IF c.slug IS DISTINCT FROM v_slug THEN
            UPDATE public.raiddominion_characters
            SET slug = v_slug, updated_at = timezone('utc'::text, now())
            WHERE id = c.id;
        END IF;
    END LOOP;
END $$;
