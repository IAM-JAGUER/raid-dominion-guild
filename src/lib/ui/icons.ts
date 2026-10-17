/**
 * Sistema de iconos temáticos de RaidDominion — CONTRATO ÚNICO.
 *
 * Los 65 iconos viven en un sprite normalizado (rejilla uniforme 8×9,
 * celdas de 96px) generado por `scripts/icons-sheet.py` a partir de la
 * fuente maestra `public/images/icons.png`. NO escribas iconos sueltos en
 * otros archivos: importa `Icon.astro` (template) o `iconEl` (render JS).
 *
 * `crop`/`center` son la trazabilidad con la fuente maestra (rectángulo de
 * recorte y centro en píxeles de icons.png); `row`/`col` son la celda final
 * en el sprite normalizado (lo que consume el CSS-sprite).
 *
 * Los iconos son arte a color: NO se recolorean con `text-*`; el tamaño se
 * controla con las clases `rd-ico-*` (tokens `ui.icon` de design.ts).
 */
export const ICON_SHEET = {
  src: '/icons/rd-icons.webp',
  fallback: '/icons/rd-icons.png',
  cols: 8,
  rows: 9,
  cell: 96,
} as const;

export interface IconMeta {
  readonly label: string;
  readonly row: number;
  readonly col: number;
  readonly crop: readonly [number, number, number, number];
  readonly center: readonly [number, number];
}

export const ICONS = {
  emblema: { label: 'Emblema de RaidDominion', row: 0, col: 0, crop: [35, 15, 115, 157], center: [92, 93] },
  ciudadela: { label: 'Ciudadela', row: 0, col: 1, crop: [182, 10, 138, 158], center: [250, 88] },
  personaje: { label: 'Personaje / héroe', row: 0, col: 2, crop: [347, 15, 140, 154], center: [416, 91] },
  estandarte: { label: 'Estandarte', row: 0, col: 3, crop: [530, 9, 115, 160], center: [587, 88] },
  perfil: { label: 'Perfil individual', row: 0, col: 4, crop: [687, 29, 146, 135], center: [759, 96] },
  hermandad: { label: 'Grupo / hermandad', row: 0, col: 5, crop: [873, 21, 131, 141], center: [938, 91] },
  portal: { label: 'Portal', row: 0, col: 6, crop: [1042, 8, 152, 156], center: [1117, 85] },
  libro: { label: 'Libro / guía', row: 0, col: 7, crop: [1227, 31, 155, 128], center: [1304, 94] },
  subir: { label: 'Subir archivo', row: 1, col: 0, crop: [32, 189, 119, 117], center: [91, 247] },
  descargar: { label: 'Descargar', row: 1, col: 1, crop: [190, 194, 127, 112], center: [253, 249] },
  'perfil-alt': { label: 'Perfil', row: 1, col: 2, crop: [355, 182, 126, 130], center: [417, 246] },
  jugadores: { label: 'Lista de jugadores', row: 1, col: 3, crop: [534, 178, 102, 129], center: [584, 242] },
  calendario: { label: 'Calendario / horario', row: 1, col: 4, crop: [704, 184, 131, 126], center: [769, 246] },
  escudo: { label: 'Escudo / protección', row: 1, col: 5, crop: [882, 180, 112, 135], center: [937, 247] },
  sanacion: { label: 'Sanación / apoyo', row: 1, col: 6, crop: [1050, 185, 134, 127], center: [1116, 248] },
  arma: { label: 'Arma / combate', row: 1, col: 7, crop: [1243, 183, 127, 126], center: [1306, 245] },
  espadas: { label: 'Espadas cruzadas', row: 2, col: 0, crop: [31, 333, 118, 116], center: [89, 390] },
  cristal: { label: 'Cristal mágico', row: 2, col: 1, crop: [195, 324, 117, 131], center: [253, 389] },
  corona: { label: 'Corona / rango', row: 2, col: 2, crop: [354, 326, 127, 123], center: [417, 387] },
  brujula: { label: 'Brújula', row: 2, col: 3, crop: [520, 325, 128, 132], center: [583, 390] },
  confirmacion: { label: 'Confirmación', row: 2, col: 4, crop: [706, 330, 117, 120], center: [764, 389] },
  medalla: { label: 'Medalla', row: 2, col: 5, crop: [898, 327, 80, 125], center: [937, 389] },
  advertencia: { label: 'Advertencia', row: 2, col: 6, crop: [1052, 327, 128, 132], center: [1115, 392] },
  cofre: { label: 'Cofre / botín', row: 2, col: 7, crop: [1237, 333, 127, 120], center: [1300, 392] },
  dados: { label: 'Dados', row: 3, col: 0, crop: [35, 478, 101, 113], center: [85, 534] },
  pergamino: { label: 'Pergamino', row: 3, col: 1, crop: [202, 480, 107, 119], center: [255, 539] },
  balanza: { label: 'Balanza / equidad', row: 3, col: 2, crop: [354, 469, 126, 127], center: [416, 532] },
  validado: { label: 'Confirmación circular', row: 3, col: 3, crop: [519, 476, 134, 118], center: [585, 534] },
  reloj: { label: 'Reloj de arena', row: 3, col: 4, crop: [723, 471, 83, 126], center: [764, 533] },
  vientos: { label: 'Rosa de los vientos', row: 3, col: 5, crop: [870, 468, 131, 134], center: [935, 534] },
  discord: { label: 'Voz / Discord', row: 3, col: 6, crop: [1046, 479, 145, 119], center: [1118, 538] },
  nota: { label: 'Nota / mensaje', row: 3, col: 7, crop: [1235, 481, 138, 117], center: [1303, 539] },
  engranajes: { label: 'Engranajes', row: 4, col: 0, crop: [34, 618, 117, 107], center: [92, 671] },
  fuego: { label: 'Fuego mágico', row: 4, col: 1, crop: [204, 615, 103, 126], center: [255, 677] },
  'portal-circular': { label: 'Portal circular', row: 4, col: 2, crop: [353, 612, 128, 127], center: [416, 675] },
  estrella: { label: 'Estrella', row: 4, col: 3, crop: [521, 613, 125, 128], center: [583, 676] },
  ajustes: { label: 'Ajustes', row: 4, col: 4, crop: [709, 618, 110, 114], center: [763, 674] },
  ayuda: { label: 'Ayuda', row: 4, col: 5, crop: [877, 617, 119, 119], center: [936, 676] },
  sincronizar: { label: 'Sincronizar / actualizar', row: 4, col: 6, crop: [1057, 620, 112, 113], center: [1112, 676] },
  visibilidad: { label: 'Visibilidad', row: 4, col: 7, crop: [1235, 624, 127, 103], center: [1298, 675] },
  navegacion: { label: 'Navegación', row: 5, col: 0, crop: [24, 744, 131, 131], center: [89, 809] },
  megafono: { label: 'Megáfono', row: 5, col: 1, crop: [195, 756, 128, 103], center: [258, 807] },
  diamante: { label: 'Diamante / calidad', row: 5, col: 2, crop: [354, 753, 124, 116], center: [415, 810] },
  facciones: { label: 'Facciones', row: 5, col: 3, crop: [526, 749, 115, 122], center: [583, 809] },
  trofeo: { label: 'Trofeo', row: 5, col: 4, crop: [709, 754, 110, 113], center: [763, 810] },
  'editar-perfil': { label: 'Editar perfil', row: 5, col: 5, crop: [883, 755, 116, 112], center: [940, 810] },
  compartir: { label: 'Compartir', row: 5, col: 6, crop: [1055, 756, 105, 107], center: [1107, 809] },
  buscar: { label: 'Buscar', row: 5, col: 7, crop: [1236, 752, 114, 116], center: [1292, 809] },
  filtrar: { label: 'Filtrar', row: 6, col: 0, crop: [42, 889, 93, 98], center: [88, 937] },
  notificaciones: { label: 'Notificaciones', row: 6, col: 1, crop: [209, 887, 86, 103], center: [251, 938] },
  correcto: { label: 'Estado correcto', row: 6, col: 2, crop: [363, 886, 105, 105], center: [415, 938] },
  alerta: { label: 'Alerta', row: 6, col: 3, crop: [533, 883, 105, 107], center: [585, 936] },
  error: { label: 'Error / cancelar', row: 6, col: 4, crop: [710, 883, 105, 105], center: [762, 935] },
  info: { label: 'Información', row: 6, col: 5, crop: [874, 884, 104, 105], center: [925, 936] },
  bloqueo: { label: 'Bloqueo', row: 6, col: 6, crop: [1072, 881, 84, 105], center: [1113, 933] },
  'bloqueo-alt': { label: 'Bloqueo alternativo', row: 6, col: 7, crop: [1255, 884, 84, 106], center: [1296, 936] },
  bandeja: { label: 'Bandeja / archivo', row: 7, col: 0, crop: [30, 1005, 121, 98], center: [90, 1053] },
  energia: { label: 'Energía / remolino', row: 7, col: 1, crop: [210, 1005, 128, 102], center: [273, 1055] },
  anadir: { label: 'Añadir', row: 7, col: 2, crop: [392, 1005, 103, 102], center: [443, 1055] },
  editar: { label: 'Editar', row: 7, col: 3, crop: [539, 1005, 103, 101], center: [590, 1055] },
  eliminar: { label: 'Eliminar', row: 7, col: 4, crop: [687, 1004, 103, 102], center: [738, 1054] },
  enlace: { label: 'Abrir enlace', row: 7, col: 5, crop: [840, 1005, 91, 100], center: [885, 1054] },
  servidor: { label: 'Servidor / base de datos', row: 7, col: 6, crop: [985, 1004, 87, 102], center: [1028, 1054] },
  sincronizacion: { label: 'Sincronización', row: 7, col: 7, crop: [1115, 1002, 105, 106], center: [1167, 1054] },
  'brujula-alt': { label: 'Brújula alternativa', row: 8, col: 0, crop: [1258, 999, 110, 111], center: [1312, 1054] },
} as const satisfies Record<string, IconMeta>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, value);
}

// Tamaños (clases CSS de src/styles/icons.css; espejo de ui.icon).
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const ICON_SIZE_CLASS: Record<IconSize, string> = {
  xs: 'rd-ico-xs',
  sm: 'rd-ico-sm',
  md: 'rd-ico-md',
  lg: 'rd-ico-lg',
  xl: 'rd-ico-xl',
};

export interface IconElOptions {
  size?: IconSize;
  // Clases extra del span.
  cls?: string;
  // Etiqueta accesible: si se pasa, el icono se anuncia (role="img");
  // sin ella es decorativo (aria-hidden) — el texto vecino ya comunica.
  label?: string;
}

// Crea el <span> de icono para render JS (mismo markup que Icon.astro).
export function iconEl(name: IconName, opts: IconElOptions = {}): HTMLElement {
  const meta = ICONS[name];
  const span = document.createElement('span');
  span.className = `rd-ico ${ICON_SIZE_CLASS[opts.size ?? 'md']} ${opts.cls ?? ''}`.trim();
  span.style.setProperty('--rd-ico-col', String(meta.col));
  span.style.setProperty('--rd-ico-row', String(meta.row));
  if (opts.label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', opts.label);
  } else {
    span.setAttribute('aria-hidden', 'true');
  }
  return span;
}
