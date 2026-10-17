#!/usr/bin/env python3
# Genera el sprite normalizado de los 65 iconos temáticos de RaidDominion
# a partir de la fuente maestra public/images/icons.png (rejilla irregular).
#
# - Detecta cada icono por componentes conectados (alfa > 24, 4-vecinos).
# - Recorta por su bbox exacto (con margen) y lo normaliza a una celda cuadrada
#   uniforme (contain + centrado) para lograr tamaño óptico parejo.
# - Reflowa a una rejilla limpia 8 col × 9 filas (72 celdas, 65 usadas) y emite
#   public/icons/rd-icons.webp (+ .png de respaldo), consumidos por el
#   contrato src/lib/ui/icons.ts (CSS sprite).
# - Imprime la tabla TS lista para el contrato y un contact-sheet de QA en
#   /tmp/opencode (no versionado).
#
# Uso: python3 scripts/icons-sheet.py
#
# Requisitos: Pillow (ya usado por el proyecto). Sin numpy.
import io
import json
import os
import sys
from collections import defaultdict

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'images', 'icons.png')
OUT_DIR = os.path.join(ROOT, 'public', 'icons')
QA_DIR = '/tmp/opencode'

CELL = 96           # lado de celda del sprite normalizado
PAD = 6             # margen interior de cada celda
COLS = 8
ROWS = 9
ALPHA_MIN = 24      # umbral de contenido (ignora ruido de glow casi invisible)
MIN_AREA = 40       # componentes menores se descartan (ruido)
MARGIN = 3          # margen extra alrededor del bbox antes de recortar

# Orden canónico 1..65 (fila por fila, izquierda a derecha) = tabla del autor.
ICONS = [
    ('emblema', 'Emblema de RaidDominion'),
    ('ciudadela', 'Ciudadela'),
    ('personaje', 'Personaje / héroe'),
    ('estandarte', 'Estandarte'),
    ('perfil', 'Perfil individual'),
    ('hermandad', 'Grupo / hermandad'),
    ('portal', 'Portal'),
    ('libro', 'Libro / guía'),
    ('subir', 'Subir archivo'),
    ('descargar', 'Descargar'),
    ('perfil-alt', 'Perfil'),
    ('jugadores', 'Lista de jugadores'),
    ('calendario', 'Calendario / horario'),
    ('escudo', 'Escudo / protección'),
    ('sanacion', 'Sanación / apoyo'),
    ('arma', 'Arma / combate'),
    ('espadas', 'Espadas cruzadas'),
    ('cristal', 'Cristal mágico'),
    ('corona', 'Corona / rango'),
    ('brujula', 'Brújula'),
    ('confirmacion', 'Confirmación'),
    ('medalla', 'Medalla'),
    ('advertencia', 'Advertencia'),
    ('cofre', 'Cofre / botín'),
    ('dados', 'Dados'),
    ('pergamino', 'Pergamino'),
    ('balanza', 'Balanza / equidad'),
    ('validado', 'Confirmación circular'),
    ('reloj', 'Reloj de arena'),
    ('vientos', 'Rosa de los vientos'),
    ('discord', 'Voz / Discord'),
    ('nota', 'Nota / mensaje'),
    ('engranajes', 'Engranajes'),
    ('fuego', 'Fuego mágico'),
    ('portal-circular', 'Portal circular'),
    ('estrella', 'Estrella'),
    ('ajustes', 'Ajustes'),
    ('ayuda', 'Ayuda'),
    ('sincronizar', 'Sincronizar / actualizar'),
    ('visibilidad', 'Visibilidad'),
    ('navegacion', 'Navegación'),
    ('megafono', 'Megáfono'),
    ('diamante', 'Diamante / calidad'),
    ('facciones', 'Facciones'),
    ('trofeo', 'Trofeo'),
    ('editar-perfil', 'Editar perfil'),
    ('compartir', 'Compartir'),
    ('buscar', 'Buscar'),
    ('filtrar', 'Filtrar'),
    ('notificaciones', 'Notificaciones'),
    ('correcto', 'Estado correcto'),
    ('alerta', 'Alerta'),
    ('error', 'Error / cancelar'),
    ('info', 'Información'),
    ('bloqueo', 'Bloqueo'),
    ('bloqueo-alt', 'Bloqueo alternativo'),
    ('bandeja', 'Bandeja / archivo'),
    ('energia', 'Energía / remolino'),
    ('anadir', 'Añadir'),
    ('editar', 'Editar'),
    ('eliminar', 'Eliminar'),
    ('enlace', 'Abrir enlace'),
    ('servidor', 'Servidor / base de datos'),
    ('sincronizacion', 'Sincronización'),
    ('brujula-alt', 'Brújula alternativa'),
]


def components(im):
    """Componentes conectados (4-vecinos) del canal alfa; devuelve bboxes."""
    w, h = im.size
    alpha = im.getchannel('A')
    px = alpha.load()
    mask = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            mask[base + x] = 1 if px[x, y] > ALPHA_MIN else 0

    parent = list(range(w * h))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    labels = [-1] * (w * h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not mask[i]:
                continue
            left = labels[i - 1] if x > 0 else -1
            up = labels[i - w] if y > 0 else -1
            if left < 0 and up < 0:
                labels[i] = i
            elif left >= 0 and up < 0:
                labels[i] = left
            elif left < 0 and up >= 0:
                labels[i] = up
            else:
                labels[i] = left
                union(left, up)

    groups = defaultdict(lambda: [10**9, 10**9, -1, -1, 0])
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if labels[i] < 0:
                continue
            g = groups[find(labels[i])]
            if x < g[0]:
                g[0] = x
            if y < g[1]:
                g[1] = y
            if x > g[2]:
                g[2] = x
            if y > g[3]:
                g[3] = y
            g[4] += 1
    boxes = [(v[0], v[1], v[2], v[3], v[4]) for v in groups.values()]
    return [b for b in boxes if b[4] >= MIN_AREA]


def sort_reading_order(boxes):
    """Ordena por bandas horizontales (filas reales del sprite) y luego x."""
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        for r in rows:
            if abs(r[0] - cy) < 70:
                r[1].append(b)
                r[0] = (r[0] * (len(r[1]) - 1) + cy) / len(r[1])
                break
        else:
            rows.append([cy, [b]])
    rows.sort(key=lambda r: r[0])
    out = []
    for _, rboxes in rows:
        rboxes.sort(key=lambda b: b[0])
        out.extend(rboxes)
    return out


def normalize(im, box):
    """Recorta el icono y lo centra en una celda cuadrada (contain)."""
    x0, y0, x1, y1, _ = box
    x0 = max(0, x0 - MARGIN)
    y0 = max(0, y0 - MARGIN)
    x1 = min(im.width - 1, x1 + MARGIN)
    y1 = min(im.height - 1, y1 + MARGIN)
    crop = im.crop((x0, y0, x1 + 1, y1 + 1)).convert('RGBA')

    # Pinta los píxeles 100% transparentes con el color promedio del icono:
    # al reescalar, los halos tienden al color del arte y no a negro.
    alpha = crop.getchannel('A')
    mask = alpha.point(lambda v: 255 if v > 128 else 0)
    avg = (0, 0, 0)
    if mask.getbbox():
        stat = ImageStat.Stat(crop.convert('RGB'), mask)
        avg = tuple(int(round(c)) for c in stat.mean)
    bg = Image.new('RGBA', crop.size, (*avg, 0))
    crop = Image.alpha_composite(bg, crop)

    inner = CELL - PAD * 2
    scale = min(inner / crop.width, inner / crop.height)
    new = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(new, Image.LANCZOS)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cell.paste(crop, ((CELL - new[0]) // 2, (CELL - new[1]) // 2))
    return cell


def main():
    if not os.path.exists(SRC):
        sys.exit(f'Falta la fuente {SRC}')
    im = Image.open(SRC).convert('RGBA')
    boxes = sort_reading_order(components(im))
    if len(boxes) != len(ICONS):
        sys.exit(f'Esperados {len(ICONS)} iconos, detectados {len(boxes)}. ¿Cambió {SRC}?')

    sheet = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    table = []
    for n, (box, (slug, label)) in enumerate(zip(boxes, ICONS), start=1):
        cell = normalize(im, box)
        row, col = (n - 1) // COLS, (n - 1) % COLS
        sheet.paste(cell, (col * CELL, row * CELL))
        x0, y0, x1, y1, _ = box
        table.append({
            'slug': slug,
            'label': label,
            'row': row,
            'col': col,
            'crop': [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
            'center': [(x0 + x1) // 2, (y0 + y1) // 2],
        })

    os.makedirs(OUT_DIR, exist_ok=True)
    webp = os.path.join(OUT_DIR, 'rd-icons.webp')
    png = os.path.join(OUT_DIR, 'rd-icons.png')
    sheet.save(webp, 'WEBP', quality=90, method=6, exact=True)
    sheet.save(png, 'PNG', optimize=True)
    print(f'sheet {sheet.width}x{sheet.height} · webp {os.path.getsize(webp)} B · png {os.path.getsize(png)} B')

    # Contact-sheet de QA (con número y slug) fuera del repo.
    os.makedirs(QA_DIR, exist_ok=True)
    try:
        font = ImageFont.load_default(size=13)
    except TypeError:
        font = ImageFont.load_default()
    band = 18
    qa = Image.new('RGBA', (COLS * CELL, ROWS * (CELL + band)), (17, 17, 17, 255))
    d = ImageDraw.Draw(qa)
    for i, meta in enumerate(table):
        row, col = meta['row'], meta['col']
        x, y = col * CELL, row * (CELL + band)
        qa.alpha_composite(sheet.crop((x, row * CELL, x + CELL, row * CELL + CELL)), (x, y))
        d.text((x + 4, y + CELL + 2), f"{i + 1:02d} {meta['slug']}", fill=(250, 204, 21), font=font)
    qa_path = os.path.join(QA_DIR, 'icons-contact.png')
    qa.save(qa_path)
    print(f'QA: {qa_path}')

    print('\n// tabla para src/lib/ui/icons.ts')
    print(json.dumps(table, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
