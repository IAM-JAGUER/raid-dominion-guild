import re
import json

def lua_to_json(lua_file, json_file):
    try:
        with open(lua_file, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"⚠ No se encontró el archivo {lua_file}")
        return

    # Buscar bloques { ... }
    blocks = re.findall(r"\{([^{}]+)\}", content, re.DOTALL)

    players = []
    for block in blocks:
        entry = {}

        # Buscar ["clave"] = "valor"
        matches = re.findall(r'\["(.*?)"\]\s*=\s*"([^"]*)"', block)
        for key, value in matches:
            entry[key] = value

        # Validar que tenga los campos obligatorios
        if all(k in entry for k in ("class", "name", "rank")):
            # Asegurar que los campos de notas existan
            if "publicNote" not in entry:
                entry["publicNote"] = ""
            if "officerNote" not in entry:
                entry["officerNote"] = ""
            players.append(entry)

    # Guardar en JSON
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=4)

    print(f"✅ Conversión completada. Se guardó en {json_file}")


if __name__ == "__main__":
    lua_file = "RaidDominion-main.lua"   # Archivo de entrada
    json_file = "output.json"            # Archivo de salida
    lua_to_json(lua_file, json_file)
