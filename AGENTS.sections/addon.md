# Addon RaidDominion — Contrato entre repos

> Este archivo complementa `AGENTS.md` §11. Solo leerlo cuando se trabaja con
> el parser de SavedVariables, las guías del addon o la sincronía portal↔addon.

El addon dev vive en `D:\WowClient esMX\Interface\AddOns\RaidDominion`
(v3.0.1, con sus propios agentes y harness). Su SavedVariables
`RaidDominionDB` es LA API pública que este portal consume.

1. **Productor del contrato:** el árbol `registry["Nombre-Reino"]` lo escribe
   el ítem de menú **"Registrar"** (`RD_Utils_Registry.lua`) y el roster de
   cuenta lo escribe `RD_Utils_Characters.lua`. Sin "Registrar" NO hay
   `registry.player`: las guías y `/upload` deben guiar al usuario a pulsarlo.
2. **Sincronía obligatoria:** renombrar/mover claves de `registry`,
   `characters`, `bands` o `Guild` en el addon exige actualizar en el MISMO
   ciclo `src/lib/parser/savedVariables.ts` + `src/types/parser.ts`; y viceversa.
   El addon puede escribir textos con markup de chat (`|c…|H…|h[Etiqueta]|h|r`;
   p. ej. `bands[].name` = enlace del logro): el portal lo limpia con
   `src/lib/wowLink.ts` y conserva el enlace solo para el preview (detalle en
   `parser.md` → «Markup de chat»). No hay que cambiar el addon por esto.
3. **Objetivos:** `registry["Nombre-Reino"].objectives` exporta metas de equipo
   (`equipment[]`: `slot`, `name`, `itemID?`, `ilvl?`, `quality?`, `done`) y metas
   de moneda (`currencies[]`: `name`, `target`, `reached`) desde `itemGoals`.
   No se comparten iconos ni flags de seguimiento. El portal las publica en la
   ficha pública del personaje (pestaña "Metas") cuando la ficha es pública, y
   las guarda selladas en `raiddominion_characters.objectives` con el mismo
   `is_public`. El SV las deja como rama hermana de `player`; el modelo
   normalizado del portal las anida en `PlayerCharacter.objectives`.
4. **Privacidad de hermandad:** `registry.guild.memberList` (roster GM) viaja SIN
   notas pública/oficial por diseño; jamás exponer notas de oficio en el portal.
5. **Notas de jugadores de banda:** `bands[].players[].notes` SÍ viaja en el SV
   (las cura el líder), pero en el portal se guardan SIEMPRE en
   `raiddominion_band_notes` (privada, RLS del dueño) y solo se proyectan al row
   público cuando el líder activa "Notas públicas" (`raiddominion_bands.notes_public`,
   apagado por defecto). Ese interruptor es independiente de `hide_players`.
6. **Fuente de verdad dual:** formato vivo = `AGENTS.sections/parser.md` +
   `RD_Utils_Registry.lua`. Ante duda, leer ambos antes de tocar parser o guías.
7. Slash commands vigentes del addon: `/rd`, `/rdc`, `/rdh`, `/rdloot`
   (`RD_Init.lua`). Las guías (`src/data/addonGuides.ts`) deben reflejar
   EXACTAMENTE menús (`MENU_DEFINITIONS`) y comandos de `RD_Constants.lua`.
8. **Facción inferida:** si el SV no trae facción de hermandad, el portal la
   deduce de la raza del GM (`characters[*].raceName`/`raceFile`). El addon no
   necesita cambios para esto, pero `raceFile` debe seguir exportándose en
   `characters[*]` para que el fallback sea posible.
9. **Nota e instancias:** `registry["Nombre-Reino"].player` exporta `note`
   (nota global del personaje; `""` = borrarla). Clave ausente = SV anterior a
   3.1.0 (el portal conserva lo ya guardado). La nota se almacena SIEMPRE en
   `raiddominion_character_notes` (privada, RLS del dueño) y solo se proyecta a
   la ficha pública con el interruptor propio `notes_public` (por defecto
   apagado) **y** la ficha pública.
10. **Datos pasivos (addon v3.2.0):** equipo, `equipmentCount`, `avgIlvl`,
    instancias, nivel y raza/clase viven en `characters["Nombre-Reino"]` y se
    refrescan sin "Registrar". El parser los superpone al `PlayerCharacter`
    normalizado de cada entrada de `registry`; `registry[].player.equipment` e
    `instances` solo se usan como fallback si `characters` aún no tiene el
    snapshot (los SV ≤ v3.1.0 siguen funcionando; su `instances = {}` solo se
    interpreta como limpieza si `characters.version` es ≥ 3.2.0). `characters`
    NUNCA crea registros: sin entrada en `registry` el personaje no se publica.
    Las instancias viajan con la RLS de la ficha (`is_public`).
