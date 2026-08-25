# 📖 MANUAL — Sesiones Paralelas en RaidDominion

> Guía de consulta diaria para trabajar con N terminales simultáneas,
> tele en vivo (`:4321`) y commits oficiales exclusivamente tuyos.
> Detalle técnico completo en `AGENTS.md` §9.

---

## 1. El concepto en 30 segundos

| Elemento | Analogía | Realidad |
|---|---|---|
| **Cuaderno oficial** | Lo aprobado | Branch `main` → Netlify despliega |
| **La tele** | Vista en vivo de todo | Worktree `.worktrees/integra`, server `:4321` |
| **Cuadernos de borrador** | Una copia por niño | `.worktrees/<nombre>/` + branch `sesion/<nombre>` |
| **El robot cartero** | Toma fotos y pega | `scripts/watch-integra.sh` |
| **Foto borrador** | Snapshot desechable | Commit automático `wip(...)` — jamás llega a main |
| **Tu firma** | Aprobación oficial | 1 commit tuyo por turno, squash, formato profesional |

```
sesion/guias ──fotos──►┐
sesion/dash ──fotos──► ├─► integracion (:4321 TELE EN VIVO)
                       │         │
        tú: "commitea" │         │ (sincronía)
                       ▼         ▼
                      MAIN ────► Netlify
```

---

## 2. Inicio del día (~2 minutos)

**Terminal 1 — LA SAGRADA (server + robot, nunca la tocan las sesiones):**
```bash
scripts/start-tele.sh
# Prende watcher + astro dev en http://localhost:4321
# Apagar: Ctrl+C (mata ambos)
```

**Cada terminal de trabajo (una por objetivo):**
```bash
scripts/new-session.sh guias          # nombre corto, minúsculas-con-guiones
cd .worktrees/guias
opencode                              # ahí le das su objetivo / /verifica N "..."
```
La copia privada ya trae `node_modules` y `.env` enlazados: Supabase y deps
funcionan sin instalar nada.

---

## 3. Durante el día (no haces nada)

- Las sesiones editan su copia **en paralelo**, sin pisarse.
- El watcher fotografía cada ~30s lo sucio de cada sesión → commit `wip(...)`
  → lo fusiona a `integracion` → **la tele muestra todo combinado al instante**.
- Si una fusión choca con otra: el watcher aborta y avisa; nada se daña.

Ver actividad cuando quieras:
```bash
tail -f .worktrees/.watcher.log      # lo que está haciendo el robot ahora
git log --oneline integracion -10    # fotos recientes por sesión
git log --oneline sesion/guias -8    # historia de una sesión
```

---

## 4. Aprobar un turno (el momento tuyo)

Cuando una sesión terminó y revisaste su trabajo en la tele o en su copia:

1. Le dices: **«commitea»**
2. La sesión prepara el squash del turno completo y te MUESTRA:
   diffstat + mensaje propuesto (formato `feat(alcance): resumen` +
   cuerpo detallado + trailers `Session:`/`Round:`/`Agentes:`)
3. Tú confirmas → crea **UN commit** limpio en su branch
4. El watcher detecta la punta oficial (sin prefijo `wip(`) → **avanza `main`**
   → Netlify despliega automáticamente

> ⚠️ Sin tu orden explícita, ninguna sesión commitea nada oficial. Nunca.

---

## 5. Cierre del día

```bash
# En cada terminal de sesión: cerrar opencode (Ctrl+C / exit).
# El trabajo pendiente quedó guardado como fotos wip en su branch:
git worktree remove .worktrees/guias       # opcional: libera la carpeta
git branch -D sesion/guias                 # opcional SOLO si no lo quieres más
```
Al día siguiente `new-session.sh guias` la recrea fresca desde main.

---

## 6. Las reglas de oro

1. **La tele solo tú** — nadie más ejecuta `astro dev` ni toca el :4321.
2. **Sesión = worktree** — toda sesión autónoma nace de `new-session.sh`;
   nunca edites la raíz mientras hay paralelas activas.
3. **Instala solo en la raíz** — `npm install` únicamente en el proyecto
   principal; los worktrees lo ven al instante por symlink.
4. **Commits oficiales = tuyos** — solo ante «commitea»; uno por turno.
5. **Raíz limpia** — la carpeta principal no acumula cambios sueltos;
   ensuciarla bloquea las promociones a main.

---

## 7. Solución de problemas

### Se fue la energía con N terminales abiertas 💡
Tu trabajo vive en DISCO, no en memoria — casi todo sobrevive:

| Qué | ¿Sobrevive? |
|---|---|
| Commits oficiales y fotos wip | ✅ (git las escribió en disco) |
| Ediciones sin commitear de cada sesión | ✅ (archivos en su worktree) |
| Conversaciones de cada terminal | ✅ (base local de opencode) |
| Server y watcher | ❌ eran procesos → se reviven |

**Retomar (~2 min):**
```bash
scripts/start-tele.sh                      # T1: revives server + robot
cd .worktrees/guias && opencode -c         # por cada terminal:
                                           # -c continúa la MISMA conversación
```
El watcher fotografía lo que quedó sucio en ≤30s y la tele vuelve a mostrarlo todo.
Si alguna terminal grita `index.lock: File exists` (corte en mitad de una
operación git): borra ese `.git/index.lock` y sigue — es un candado huérfano,
no pérdida de datos. Peor caso imaginable: un archivo corrupto por un corte
en la escritura exacta → la última foto wip tiene la versión anterior buena.

### «NO se pudo promover X a main: local changes would be overwritten»
La raíz tiene archivos sucios que el turno también toca. Limpia la raíz:
```bash
cd raíz && git status --short     # identifica sobrantes
git stash push -u -m "temp"       # o commitea/elimina según corresponda
# el watcher promoverá en el próximo ciclo (≤30s); luego: git stash pop
```

### «CONFLICTO» al fusionar una sesión (raro: dos tocaron lo mismo)
El turno de esa sesión sigue intacto en su branch. Resuélvelo desde SU terminal:
```bash
git -C .worktrees/<nombre> rebase main     # o merge de main
git add -A && git rebase --continue        # resuelve y continúa
```

### El puerto 4321 está ocupado
Otro server ajeno a la tele lo tomó. `start-tele.sh` se niega a arrancar:
cierra ese proceso antes (`lsof -iTCP:4321 -sTCP:LISTEN` lo identifica).

### Abrí una sesión directo en la raíz por error
Si no hay otras sesiones activas: funciona igual (modo solitario). Si las hay:
mueve tus cambios a tu worktree o termina rápido — editar la raíz con
paralelas vivas rompe el aislamiento.

### Quiero descartar TODO el turno de una sesión
```bash
git -C .worktrees/<nombre> reset --hard main   # borra borradores y wips
```

### Empezar un turno nuevo sobre la misma sesión
```bash
git -C .worktrees/<nombre> reset --hard main   # branch limpia sobre main actual
```

### ¿Qué hizo cada sesión? (auditoría)
```bash
git log --format='%h %s' main ^origin/main    # commits oficiales locales
git log --grep 'Session: guias'               # turnos firmados por esa sesión
```

---

## 8. Modo solitario (sin sistema)

¿Un solo objetivo, sin paralelos? Trabaja en la raíz como siempre:
tu `astro dev`, tus commits manuales. Única regla vigente: los commits
oficiales siguen requiriendo tu orden explícita. Si la tele está prendida,
tus cambios en la raíz NO aparecen en ella (mira su propia copia).

---

## 9. Referencia rápida

| Comando | Para qué |
|---|---|
| `scripts/start-tele.sh` | Prender tele + watcher (T1 sagrada) |
| `scripts/new-session.sh <nombre>` | Crear sesión paralela |
| `scripts/watch-integra.sh [seg] \| --once` | Watcher solo (debug/pruebas) |
| `git log --oneline integracion` | Ver fotos en la tele |
| `git log --grep 'Session: <nombre>'` | Auditoría por sesión |
| `git -C .worktrees/<n> reset --hard main` | Reiniciar/descartar turno |

## 10. Detalles técnicos (por si algún día preguntas «¿cómo?»)

- **Symlinks**: cada worktree enlaza `node_modules` y `.env` del principal;
  por eso `.gitignore` usa `node_modules` SIN slash (cubre el symlink).
- **Detección de oficial**: branch con punta que NO empieza por `wip(` y
  commits por delante de main → el watcher la fusiona a main.
- **Fotos**: solo si hay cambios sin commitear (`status --porcelain`);
  usan `git add -A` dentro del worktree de la sesión.
- **Instancia única**: el watcher usa `flock` (`.worktrees/.watcher.lock`) —
  dos watchers no pueden convivir.
- **Conflicto ≠ daño**: toda fusión problemática termina en `merge --abort`;
  branches de sesión e `integracion` nunca quedan corruptas.

---

## 11. Un día en 60 segundos

```bash
# 09:00 encender
scripts/start-tele.sh                          # T1 sagrada
scripts/new-session.sh guias                   # T2 → cd .worktrees/guias → opencode
scripts/new-session.sh upload-flow             # T3 → ídem con su objetivo

# 10:30 mientras tanto (sin que hagas nada)
📷 foto guias → 📺 tele actualizada            # localhost:4321 lo ve todo combinado

# 12:00 aprobar un turno (en la terminal de esa sesión)
tú: «commitea»
sesión: muestra diffstat + mensaje profesional  ← tú: sí
watcher: ✅ promovido a main · Netlify desplegará

# 13:00 cerrar
Ctrl+C en T1 · cierras opencode de cada sesión  # las fotos wip esperan al lunes
```
