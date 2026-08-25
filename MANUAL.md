# MANUAL — Sesiones Paralelas en RaidDominion

> Guia de consulta diaria para trabajar con N terminales simultaneas,
> tele en vivo (`:4321`) y commits oficiales exclusivamente tuyos.

---

## 1. Worktrees

| Worktree | Rama | Editable | Proposito |
|---|---|---|---|
| `.worktrees/zeus` | `sesion/zeus` | ✅ | Sesion de trabajo |
| `.worktrees/poseidon` | `sesion/poseidon` | ✅ | Sesion de trabajo |
| `.worktrees/hades` | `sesion/hades` | ✅ | Sesion de trabajo |
| `.worktrees/integra` | `integracion` | ❌ | Tele en vivo (`:4321`) — **nunca editar** |

**`integra` es solo lectura.** El watcher la resetea a `main` automaticamente
tras cada promocion. Cualquier cambio ahi se pierde.

---

## 2. Flujo

```
zeus/poseidon/hades ──fotos wip──►┐
                                  ├─► integra (tele :4321)
           tu: "commitea"         │         │
                                  ▼         ▼
                                 MAIN ────► Netlify
```

### Iniciar (2 min)

**T1 — la sagrada (server + watcher):**
```bash
scripts/start-tele.sh
```

**Cada sesion de trabajo:**
```bash
cd .worktrees/zeus        # o poseidon, hades
opencode                  # dale su objetivo
```

### Aprobar un turno

1. Deci **«commitea»** en la terminal de la sesion
2. Te muestra diffstat + mensaje → confirmas
3. Watcher promueve a main → Netlify despliega

### Cerrar

`Ctrl+C` en T1 (mata server + watcher). Las fotos wip quedan en disco.

---

## 3. Recuperacion tras corte inesperado

Tu trabajo **sobrevive** — vive en disco, no en memoria:

| Que | Sobrevive |
|---|---|
| Commits oficiales y fotos wip | Si (git) |
| Ediciones sin commitear | Si (archivos en worktree) |
| Conversaciones de opencode | Si (base local) |
| Server y watcher | No — se reviven |

**Retomar (~2 min):**
```bash
scripts/start-tele.sh                          # T1: revive server + watcher
cd .worktrees/zeus && opencode -c              # -c continua la misma conversacion
cd .worktrees/poseidon && opencode -c          # repite por cada sesion activa
cd .worktrees/hades && opencode -c
```

El watcher fotografía lo sucio en ≤30s y la tele vuelve a mostrar todo.

**Si aparece `index.lock`:** borra el `.git/index.lock` y sigue — es un
candado huérfano, no hay pérdida de datos.

---

## 4. Reglas de oro

1. **integra = solo lectura** — el watcher la gestiona automaticamente.
2. **Sesion = worktree** — nace de `new-session.sh`; nunca edites la raíz
   con paralelas activas.
3. **Instala solo en la raíz** — `npm install` una vez; los worktrees lo
   ven por symlink.
4. **Commits oficiales = tuyos** — solo ante «commitea»; uno por turno.

---

## 5. Crear una sesion nueva

```bash
scripts/new-session.sh <nombre>     # nombre: minusculas, numeros, guiones
cd .worktrees/<nombre>
opencode
```

Crea branch `sesion/<nombre>` desde main + worktree con symlinks a
`node_modules` y `.env`. La tele la muestra automaticamente.

---

## 6. Comandos utiles

| Comando | Para que |
|---|---|
| `scripts/start-tele.sh` | Prender tele + watcher |
| `scripts/new-session.sh <n>` | Crear sesion |
| `git log --oneline integracion -10` | Ver fotos en la tele |
| `git log --grep 'Session: <n>'` | Auditoria por sesion |
| `git -C .worktrees/<n> reset --hard main` | Descartar turno |
| `tail -f .worktrees/.watcher.log` | Ver watcher en vivo |

---

## 7. Solucion de problemas

### Promocion fallida: "local changes would be overwritten"
La raíz tiene archivos sucios:
```bash
git status --short          # identificar sobrantes
git stash push -u -m "temp" # stash y reintentar
```

### Conflicto al fusionar sesion
La sesion no se daña. Resuélvelo desde su terminal:
```bash
git -C .worktrees/<n> rebase main
git add -A && git rebase --continue
```

### Puerto 4321 ocupado
```bash
lsof -iTCP:4321 -sTCP:LISTEN   # identificar proceso
# matarlo antes de start-tele.sh
```

### Trabajar en la raíz por error
Si no hay paralelas: funciona (modo solitario). Si las hay: mueve los
cambios a tu worktree o termina rapido.

---

## 8. Un dia en 60 segundos

```bash
# 09:00 encender
scripts/start-tele.sh                          # T1 sagrada
cd .worktrees/zeus && opencode                 # T2
cd .worktrees/hades && opencode                # T3

# durante el dia (no haces nada)
# las fotos wip fluyen a la tele automaticamente

# 12:00 aprobar
tú: «commitea» → sesion muestra diff → tu: si → main avanza

# 13:00 cerrar
Ctrl+C en T1
```
