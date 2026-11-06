-- ============================================================
-- RaidDominion Portal — Privacidad server-side de rosters (hide_players)
--
-- Cierra el hallazgo C2 de la auditoría: `hide_players` se aplicaba solo en
-- el cliente, así que un GET directo a PostgREST podía leer el JSONB
-- `players` de una banda pública con roster oculto.
--
-- Solución:
--   1) Vista `raiddominion_bands_public` con la MISMA forma que la tabla,
--      pero `players = '[]'` cuando `hide_players` y el llamador no es dueño.
--   2) La vista incluye filas públicas + las propias del dueño (para que el
--      dashboard siga leyendo sus bandas privadas completas).
--   3) Se revoca SELECT de la tabla a anon/authenticated y se concede solo
--      sobre la vista. Las escrituras siguen yendo a la tabla por UPDATE/RLS
--      y por RPCs SECURITY DEFINER.
--
-- ⚠️ APLICACIÓN MANUAL: SQL Editor del proyecto RaidDominion y registro en
--    .opencode/improve/ciclos.json.
-- ⚠️ Ecosistema multi-app: solo objetos raiddominion_. Idempotente.
-- ============================================================

CREATE OR REPLACE VIEW public.raiddominion_bands_public AS
SELECT
    b.id,
    b.owner_id,
    b.guild_id,
    b.slug,
    b.name,
    b.name_link,
    b.icon,
    b.schedule,
    b.min_gs,
    CASE
        WHEN b.hide_players AND b.owner_id IS DISTINCT FROM auth.uid()
            THEN '[]'::jsonb
        ELSE COALESCE(b.players, '[]'::jsonb)
    END AS players,
    b.rules,
    b.is_public,
    b.owner_rank_index,
    b.hide_players,
    b.notes_public,
    b.is_rank_integrated,
    b.character_name,
    b.character_realm,
    b.integration_status,
    b.integration_proposed_by,
    b.integration_proposed_at,
    b.integration_decided_at,
    b.integration_target_guild_id,
    b.created_at,
    b.updated_at
FROM public.raiddominion_bands AS b
WHERE b.is_public OR b.owner_id = auth.uid();

COMMENT ON VIEW public.raiddominion_bands_public IS
    'Bandas visibles para el llamador (públicas o propias) con players[] vacío si hide_players y no es el dueño.';

GRANT SELECT ON public.raiddominion_bands_public TO anon, authenticated;

-- La tabla directa deja de exponer `players` a los clientes. Se conserva
-- SELECT por columna (sin players) para que los UPDATE del dueño sigan
-- pudiendo evaluar WHERE id / RLS owner_id, pero un `select=*` o
-- `select=players` por PostgREST falle con permission denied.
REVOKE SELECT ON public.raiddominion_bands FROM anon, authenticated;
GRANT SELECT (
    id, owner_id, guild_id, slug, name, name_link, icon, schedule, min_gs,
    rules, is_public, owner_rank_index, hide_players, notes_public,
    is_rank_integrated, character_name, character_realm, integration_status,
    integration_proposed_by, integration_proposed_at, integration_decided_at,
    integration_target_guild_id, created_at, updated_at
) ON public.raiddominion_bands TO anon, authenticated;
