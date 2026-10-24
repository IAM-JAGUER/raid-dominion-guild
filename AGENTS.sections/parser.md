# Formato de SavedVariables — Especificación v3.1.0

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
    ["Nombre-Reino"] = { ["savedAt"], ["player"] = {...equipamiento...,
        -- v3.1.0: proyecciones del editor "Jugador" (nota + instancias)
        ["note"] = "texto" | "",        -- nota global; "" = borrar lo publicado
        ["instances"] = { {name, difficulty?, resetAt?, extended?} },
      },                                -- resetAt = época absoluta del reinicio
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
      ["raceName"], ["level"], ["version"], ["firstSeen"], ["lastSeen"],
      ["currencies"] = { { name, quantity, money? } }, ["money"] },
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

`registry["Nombre-Reino"].player.note` y `.instances` (addon v3.1.0) viajan
DENTRO de `player` (no son ramas hermanas). Semántica de las claves, idéntica
para ambas:
- **ausente** → SV anterior a 3.1.0: el parser no inventa la clave y el RPC
  CONSERVA lo ya guardado en la web.
- **presente** (aunque vaya vacía: `note=""`, `instances={}`) → el SV manda:
  la nota se sincroniza (vaciar = borrar) y las instancias expiradas se limpian.

La nota se publica SOLO con el interruptor propio del dueño
(`raiddominion_characters.notes_public`, apagado por defecto) **y** la ficha
pública; las instancias siguen la RLS de la ficha (`is_public`), igual que
equipo/metas.

### Normalización interna del portal

El SV mantiene `objectives` como rama hermana de `player`; el modelo normalizado
del portal la anida bajo el personaje para que todo lo público cuelgue de una
sola entidad:

```
SV:  registry[name].player = {...}   registry[name].objectives = {...}
SV → PlayerCharacter.objectives      (CharacterRegistry ya NO tiene `objectives`)
SV:  registry[name].player.note / .instances
SV → PlayerCharacter.note / PlayerCharacter.instances
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
Desde el parser v3.6.0 también conserva `currencies` (`{name, quantity,
money?}`), `money` del roster y `itemID` del equipamiento. Son la fuente de
la pestaña Monedas, del detalle del Task Tracker y de los tooltips de equipo
(UltimoWoW, mismo método que `wow-rd`). Los datos de monedas se sincronizan en
`raiddominion_character_tracker` (tabla privada) al subir el SV; NO se publican
en la ficha pública ni sustituyen al GS local de `wow-rd` (el portal no lee
`GearScore.lua`). Las piezas guardadas antes de este cambio no tienen `itemID`:
se muestran como texto plano y recuperan el tooltip al re-subir el SV.

La nota (`player.note`) conserva su texto limpio y además `noteRich` (tokens
`{type:'text'|'link',...}`). Los tokens se guardan en la columna privada
`raiddominion_character_notes.note_rich` y se publican solo con `notes_public`
+ `is_public`, igual que la nota. Los nombres de banda conservan `nameLink` y
se persisten en `raiddominion_bands.name_link` para el tooltip público.
Snapshots sin `objectives` se aceptan por compatibilidad: la columna queda
vacía y se muestra el aviso de re-registro. Los registros con `objectives` pero
sin `note`/`instances` (addon 3.0.1) disparan un aviso de re-registro propio.

### Markup de chat / enlaces del juego (2026-10-17)

Los campos de texto del SV pueden traer markup del cliente WoW: colores
(`|cAARRGGBB…|r`), enlaces (`|Htipo:datos|h[Etiqueta]|h`), texturas (`|T…|t`)
y el pipe escapado (`||`). Caso real: `bands[].name` es el enlace del logro
de la mazmorra (`|cffffff00|Hachievement:4608:…|h[ICC25N]|h|r`).

- **Parseo único**: `src/lib/wowLink.ts` (`stripWowMarkup`, `parseWowLink`,
  `tokenizeWowText`, `richTextTokens`, `normalizeWowLink`, `isWowMarkup`).
  Módulo puro, sin DOM.
- **Regla**: NINGÚN campo visible/persistido conserva markup — el parser lo
  pasa por `toCleanStr` (texto visible, `[ICC25N]` → `ICC25N`). Los ids viajan
  como tokens estructurados (`name_link`, `note_rich`), nunca como markup.
- **Enlaces persistidos**: `Band.nameLink` conserva el enlace estructurado
  (`{type, id, label, color}`) y viaja a `raiddominion_bands.name_link`; la
  nota conserva `noteRich` y viaja a `note_rich`. El render usa el widget de
  UltimoWoW (`src/lib/ui/wowhead.ts`), igual que `wow-rd`.
- **Nombres limpios**: el texto visible sigue siendo `name`/`note`; el markup
  crudo nunca se persiste. Las filas antiguas sin `name_link`/`note_rich`
  muestran texto limpio hasta una nueva subida.
- **Filas ya guardadas**: si la base tiene bandas con markup en `name`, hay
  que aplicar la limpieza `20261017_bands_name_wow_markup_cleanup.sql` ANTES
  de re-subir SV: la idempotencia del RPC es por nombre y el nombre limpio
  duplicaría la banda sucia.

## Reglas del parser

- Prioridad: **formato oficial v3.1.0** (el de arriba), con compatibilidad para
  SV v3.0.0/v3.0.1. El formato v2 (`Guild`
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
