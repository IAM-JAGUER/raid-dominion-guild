// Íconos de clase WoW 3.3.5a: recortes optimizados (128×128 WebP) del sheet
// `wowClasses-removebg-preview.png`, en public/images/classes/. Resuelve el
// archivo a partir de class_file / nombre localizado esMX, con los mismos
// alias de classColors.ts; clase desconocida → default.webp.
import { classKey } from '@/lib/ui/classColors';

export const CLASS_ICON_BASE = '/images/classes/';

// Clave canónica (WARRIOR, MAGE, ...) → archivo kebab.
export const CLASS_ICON_FILES: Record<string, string> = {
  WARRIOR: 'class-guerrero.webp',
  PALADIN: 'class-paladin.webp',
  HUNTER: 'class-cazador.webp',
  ROGUE: 'class-picaro.webp',
  PRIEST: 'class-sacerdote.webp',
  DEATHKNIGHT: 'class-caballero-muerte.webp',
  SHAMAN: 'class-chaman.webp',
  MAGE: 'class-mago.webp',
  WARLOCK: 'class-brujo.webp',
  DRUID: 'class-druida.webp',
};

export const DEFAULT_CLASS_ICON = `${CLASS_ICON_BASE}default.webp`;

export function classIconUrl(className?: string | null, classFile?: string | null): string {
  const key = classKey(className, classFile);
  const file = key ? CLASS_ICON_FILES[key] : undefined;
  return file ? `${CLASS_ICON_BASE}${file}` : DEFAULT_CLASS_ICON;
}

// Crea un <img> de ícono de clase listo para insertar en la UI.
export function classIconEl(
  className?: string | null,
  classFile?: string | null,
  imgClass = 'w-6 h-6 rounded-full shrink-0 object-contain',
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