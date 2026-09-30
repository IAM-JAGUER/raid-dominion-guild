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
3. **Objetivos:** `registry["Nombre-Reino"].objectives` exporta metas de equipo
   (`equipment[]`: `slot`, `name`, `itemID?`, `ilvl?`, `quality?`, `done`) y metas
   de moneda (`currencies[]`: `name`, `target`, `reached`) desde `itemGoals`.
   No se comparten iconos ni flags de seguimiento. El portal conserva la rama en
   el historial privado del upload; no la expone en perfiles públicos.
4. **Privacidad:** `registry.guild.memberList` (roster GM) viaja SIN notas
   pública/oficial por diseño; jamás exponer notas de oficio en el portal.
5. **Fuente de verdad dual:** formato vivo = `AGENTS.sections/parser.md` +
   `RD_Utils_Registry.lua`. Ante duda, leer ambos antes de tocar parser o guías.
6. Slash commands vigentes del addon: `/rd`, `/rdc`, `/rdh`, `/rdloot`
   (`RD_Init.lua`). Las guías (`src/data/addonGuides.ts`) deben reflejar
   EXACTAMENTE menús (`MENU_DEFINITIONS`) y comandos de `RD_Constants.lua`.
