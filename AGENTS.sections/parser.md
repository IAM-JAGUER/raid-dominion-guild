# Formato de SavedVariables — Especificación v3.0.1

> Este archivo complementa `AGENTS.md` §5. Solo leerlo cuando se trabaja con
> el parser de SavedVariables o las guías del addon.

Parser en `src/lib/parser/savedVariables.ts` (evoluciona `public/guildList.py`).

## Estructura de `RaidDominionDB` (formato actualizado 2026-09-30)

Referencias: `D:\WowClient esMX\WTF\Account\IAMM\SavedVariables\RaidDominion.lua`
(formato vigente), IAMM1/JUNGJX (secciones legacy).

```lua
RaidDominionDB = {
  ["registry"] = {                    -- ⭐ FUENTE PRINCIPAL — DOS formas reales:
    -- a) mapa por personaje (config compartida v3, vigente):
    ["Nombre-Reino"] = { ["savedAt"], ["player"] = {...equipamiento...},
      ["objectives"] = {
        ["equipment"] = { {slot, name, itemID?, ilvl?, quality?, done} },
        ["currencies"] = { {name, target, reached} },
      },
      ["guild"], ["assignments"], ["bands"], ["spammer"] },
    -- b) objeto único plano (formato intermedio): ["player"], ["savedAt"],
    --    ["guild"] = { name, numMembers, isGM, rankIndex, rank }
    -- En AMBAS formas, guild de un GM incluye además:
    --    ["memberList"] = { { name, rank, rankIndex, level, class,
    --      classFile, online } }  -- SIN notas pública/oficial (privacidad)
  ["characters"] = {                    -- roster de TODA la cuenta (config compartida)
    ["Nombre-Reino"] = { ["name"], ["realm"], ["faction"], ["className"], ["classFile"],
      ["raceName"], ["level"], ["version"], ["firstSeen"], ["lastSeen"] },
  },
  ["Guild"] = {                       -- LEGACY opcional (evidencia de membresía)
    ["lastUpdate"], ["generatedBy"],
    ["memberList"] = { { ["name"], ["officerNote"], ["class"], ["publicNote"], ["rank"] } },
  },
  ["bands"] = {                       -- bandas VIVAS
    { ["name"], ["icon"], ["schedule"], ["minGS"],
      ["players"] = { { ["name"], ["class"(FILEID)], ["role"], ["dual"], ["leader"], ["banned"], ["sanction"], ["notes"], ["points"] } },
      ["spammer"] = { ...config... } },
  },
  -- NO EXISTEN en archivos reales: attendance, gearScore, Core como fuente.
  ["roles"/"buffs"/"abilities"/"auras"] = { { ["name"], ["icon"] } },
  ["rules"/"mechanics"] = { { ["title"], ["content"], ["icon"] } },
  ["assignments"] = { ["roles"], ["buffs"], ["abilities"], ["auras"] },  -- mapa nombre→jugador
  ["ui"] = { ["showRolesMenu"], ["showBuffsMenu"], ... },   -- submenús editables
  ["chat"] = { ["channel"], ["discordLink"] }, ["general"], ["loot"], ["modules"], ["profiles"],
}
```

`registry["Nombre-Reino"].objectives` es una proyección intencional de la raíz
local `itemGoals`: exporta metas de equipo y de moneda, pero no iconos ni flags
de seguimiento (`itemTracked`, `currencyTracked`, `instancesTracked`). El portal
las conserva en el historial privado del upload **y** las publica en la ficha
pública del personaje (pestaña "Metas"), siempre que la ficha sea pública: la
columna `raiddominion_characters.objectives` se sella con el mismo
`is_public` que el resto de la ficha.

`registry["Nombre-Reino"].assignments` se sigue exportando para que el addon
sincronice cuentas, pero **no es dato comunitario**: el parser no lo expone en
`AccountCharacter`/`CharacterRegistry` y la web no lo persiste ni lo publica.

### Normalización interna del portal

El SV mantiene `objectives` como rama hermana de `player`; el modelo normalizado
del portal la anida bajo el personaje para que todo lo público cuelgue de una
sola entidad:

```
SV:  registry[name].player = {...}   registry[name].objectives = {...}
SV → PlayerCharacter.objectives      (CharacterRegistry ya NO tiene `objectives`)
```

La facción de la hermandad se resuelve con este orden (idéntico en el parser y
en `raiddominion_claim_from_sv`), y el primer valor válido gana:

1. Raza del GM: `raceFile` (token del cliente) y, si faltara, `raceName`, vía el
   mapa de facción por raza — cubre las 11 razas de WotLK en es/en.
2. `characters[*].faction` / `registry[*].guild.faction` declarado, normalizado
   es/en.

`'?'`, vacío y cualquier otro valor NO son facciones: se descartan (antes se
convertían erróneamente en "Alliance"). El backfill en SQL rellena
`raiddominion_guilds.faction` con la misma lógica, incluyendo las filas que
guardaban `'?'`.

`characters["Nombre-Reino"].version` identifica la versión del addon y se
actualiza al iniciar sesión. El parser la conserva en `AccountCharacter`.
Snapshots sin `objectives` se aceptan por compatibilidad: la columna queda
vacía y se muestra el aviso de re-registro.

## Reglas del parser

- Prioridad: **formato oficial v3.0.1** (el de arriba), con compatibilidad para
  SV v3.0.0. El formato v2 (`Guild`
  como único origen, bandas solo en `Core`) NO se parsea como fuente principal.
- Claim de maestro en DOS flujos:
  a) **Primario (v3):** cualquier `registry.*.guild.isGM=true` habilita
     `raiddominion_claim_from_sv` al subir.
  b) **Fallback legacy (v2):** `generatedBy` + `rank` de liderazgo en
     `Guild.memberList` SOLO alimenta evidencia/info legacy; ya NO reclama
     (el reclamo manual `raiddominion_claim_guild` fue ELIMINADO en
     `20260825_claim_gm_guard.sql`).
- Evidencia de membresía: roster GM v3 (`registry.*.guild.memberList`),
  `Guild.memberList` legacy y jugadores de banda.
- Nunca parsear con regex frágil de `{}` (el de guildList.py): usar un parser
  estructural que respete anidación y strings con comillas escapadas.
- No confiar en `officerNote` para mostrar públicamente (puede contener info
  interna) — separar campos públicos vs. privados en `raiddominion_guild_members`.
- Límites: archivos ≤ 2 MB; sanitizar contenido; nunca volcar `raw` completo
  en la UI.
- El rol `guild_master` se asigna SOLO vía RPC SECURITY DEFINER
  (`raiddominion_claim_from_sv`), nunca desde el cliente ni por formulario
  manual: la única vía es que el SV acredite `isGM=true` y se cumpla todo el
  flujo de requisitos.
- Los datos de la ficha de hermandad NO son editables en la plataforma:
  provienen del SV y se actualizan re-subiendo.
