// Íconos de clase WoW 3.3.5a (fichas JPG provenientes de _dev/guild-portal,
// renombradas a kebab ASCII en public/images/classes/ para URL estables).
// Resuelve el archivo a partir de class_file / nombre localizado esMX,
// con los mismos alias de classColors.ts; clase desconocida → default.png.
import { classKey } from '@/lib/ui/classColors';

export const CLASS_ICON_BASE = '/images/classes/';

// Clave canónica (WARRIOR, MAGE, ...) → archivo kebab.
export const CLASS_ICON_FILES: Record<string, string> = {
  WARRIOR: 'class-guerrero.jpg',
  PALADIN: 'class-paladin.jpg',
  HUNTER: 'class-cazador.jpg',
  ROGUE: 'class-picaro.jpg',
  PRIEST: 'class-sacerdote.jpg',
  DEATHKNIGHT: 'class-caballero-muerte.jpg',
  SHAMAN: 'class-chaman.jpg',
  MAGE: 'class-mago.jpg',
  WARLOCK: 'class-brujo.jpg',
  DRUID: 'class-druida.jpg',
};

export const DEFAULT_CLASS_ICON = `${CLASS_ICON_BASE}default.png`;

export function classIconUrl(className?: string | null, classFile?: string | null): string {
  const key = classKey(className, classFile);
  const file = key ? CLASS_ICON_FILES[key] : undefined;
  return file ? `${CLASS_ICON_BASE}${file}` : DEFAULT_CLASS_ICON;
}

// Crea un <img> de ícono de clase listo para insertar en la UI.
export function classIconEl(
  className?: string | null,
  classFile?: string | null,
  imgClass = 'w-6 h-6 rounded-md border border-gray-700/50 shrink-0 object-cover',
): HTMLImageElement {
  const img = document.createElement('img');
  img.src = classIconUrl(className, classFile);
  img.className = imgClass;
  img.alt = className ? `Clase ${className}` : 'Clase';
  img.loading = 'lazy';
  img.onerror = (): void => {
    const fallback = DEFAULT_CLASS_ICON;
    if (img.src !== fallback) img.src = fallback;
  };
  return img;
}