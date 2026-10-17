-- ═══════════════════════════════════════════════════════════════════════════
-- Limpieza de nombres de banda con markup de chat de WoW.
--
-- PROBLEMA: el SV del addon guarda `bands[].name` como enlace del juego
-- (p. ej. el logro de la mazmorra):
--   |cffffff00|Hachievement:4608:0000000000174C82:1:11:9:25:…|h[ICC25N]|h|r
-- El portal lo guardaba tal cual en `raiddominion_bands.name` y el slug se
-- construía con `regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')` (RPC v5),
-- produciendo un nombre ilegible y un slug basura. El parser ya limpia el
-- markup (PARSER_VERSION v3.4.0, `src/lib/wowLink.ts`), pero las filas YA
-- guardadas conservarían el nombre sucio: la idempotencia del RPC es por
-- (cuenta, nombre, schedule) y el re-upload con el nombre limpio CREARÍA UNA
-- BANDA DUPLICADA. Esta migración pone al día las filas existentes.
--
-- Alcance: SOLO filas de `raiddominion_bands` cuyo nombre traiga markup.
-- Reconstruye `name` (texto visible del enlace, sin corchetes) y `slug` con
-- las MISMAS reglas del RPC `raiddominion_upsert_bands` v5 (base = slug de la
-- hermandad o del perfil dueño, sufijo = nombre slugificado, tope 60 y
-- resolución de colisión con `-N`).
--
-- Seguridad multi-app: solo toca la tabla con prefijo `raiddominion_`.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_rec RECORD;
    v_name TEXT;
    v_base TEXT;
    v_band_part TEXT;
    v_slug TEXT;
    v_i INT;
BEGIN
    FOR v_rec IN
        SELECT b.id, b.name, b.guild_id, b.owner_id
        FROM public.raiddominion_bands b
        WHERE b.name ~ '\|c[0-9a-fA-F]{8}|\|H[^|]*\|h|\|r|\|T[^|]*\|t'
    LOOP
        -- Texto visible: desescapar `||` y quitar colores, enlaces y texturas.
        v_name := replace(v_rec.name, '||', '|');
        v_name := regexp_replace(v_name, '\|c[0-9a-fA-F]{8}', '', 'g');
        v_name := regexp_replace(v_name, '\|r', '', 'g');
        v_name := regexp_replace(v_name, '\|H[^|]*\|h', '', 'g');
        v_name := regexp_replace(v_name, '\|h', '', 'g');
        v_name := regexp_replace(v_name, '\|T[^|]*\|t', '', 'g');
        v_name := btrim(v_name);
        -- Etiqueta de enlace: [ICC25N] → ICC25N (solo si venía de un enlace).
        IF v_rec.name ~ '\|H' THEN
            v_name := regexp_replace(v_name, '^\[(.*)\]$', '\1');
        END IF;
        CONTINUE WHEN v_name = '';

        -- Base del slug: hermandad atribuida o slug del perfil dueño.
        SELECT COALESCE(
                   NULLIF(trim((
                       SELECT g.slug FROM public.raiddominion_guilds g
                       WHERE g.id = v_rec.guild_id
                   )), ''),
                   NULLIF(trim((
                       SELECT p.slug FROM public.raiddominion_profiles p
                       WHERE p.id = v_rec.owner_id
                   )), ''),
                   'usuario'
               )
        INTO v_base;
        v_base := lower(regexp_replace(trim(v_base), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base := btrim(v_base, '-');
        IF v_base = '' THEN v_base := 'usuario'; END IF;
        v_base := left(v_base, 24);

        v_band_part := lower(regexp_replace(trim(v_name), '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := btrim(left(v_base || '-' || v_band_part, 60), '-');
        v_i := 1;
        WHILE EXISTS (
            SELECT 1 FROM public.raiddominion_bands
            WHERE slug = v_slug AND id <> v_rec.id
        ) LOOP
            v_i := v_i + 1;
            v_slug := btrim(left(v_base || '-' || v_band_part || '-' || v_i::text, 60), '-');
        END LOOP;

        UPDATE public.raiddominion_bands
        SET name = v_name,
            slug = v_slug,
            updated_at = now()
        WHERE id = v_rec.id;
    END LOOP;
END $$;
