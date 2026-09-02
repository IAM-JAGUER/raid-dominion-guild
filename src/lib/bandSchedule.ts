/**
 * Horarios de bandas del directorio /bandas: el addon guarda schedule como
 * string libre (p. ej. "SABADO 20:00", "Lunes y Jueves 20:00", "Lun-Jue
 * 18:00-21:00"). Este módulo es la ÚNICA fuente del parseo a día(s) de la
 * semana y hora de inicio, y del agrupado lunes → domingo por hora.
 * No dupliques esta lógica en vistas.
 */

// Índice de día: 0 = lunes … 5 = sábado, 6 = domingo.
export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const DAY_COUNT = WEEKDAY_LABELS.length;

// Formas reconocidas por día (nombre completo + abreviaturas del addon),
// normalizadas SIN acentos (el match se hace sobre el string sin diacríticos).
const DAY_FORMS: readonly string[][] = [
  ['lunes', 'lun'],
  ['martes', 'mar'],
  ['miercoles', 'mie', 'mier'],
  ['jueves', 'jue'],
  ['viernes', 'vie'],
  ['sabado', 'sab'],
  ['domingo', 'dom'],
];

// Normaliza a minúsculas y quita acentos/diacríticos (NFD + strip combining).
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface ParsedSchedule {
  /** Índices de día presentes en el horario (0=lunes…6=domingo), ordenados. */
  days: number[];
  /** Hora de inicio en minutos desde medianoche; null si no hay hora legible. */
  hour: number | null;
  /** El string de horario original (sin normalizar). */
  raw: string;
}

export function parseSchedule(schedule?: string | null): ParsedSchedule {
  const raw = (schedule ?? '').trim();
  if (!raw) return { days: [], hour: null, raw };

  const n = norm(raw);

  // Hora de inicio (formato 24h): primer "HH:MM" (o "HHhMM") del string.
  // No se exige ancla de palabra para no perder "20:00" tras separadores.
  const timeMatch = n.match(/(?:^|\D)(\d{1,2})(?::|h)(\d{2})?/);
  let hour: number | null = null;
  if (timeMatch) {
    const h = Number(timeMatch[1]) % 24;
    const m = timeMatch[2] ? Number(timeMatch[2]) : 0;
    hour = h * 60 + m;
  }

  const days: number[] = [];
  for (let i = 0; i < DAY_FORMS.length; i += 1) {
    const matched = DAY_FORMS[i].some((f) => {
      // El día debe ir como palabra (no como substring de otra palabra):
      // "mar" no matchea dentro de "marti" ni "sab" dentro de "sabado*".
      return new RegExp(`(^|[^a-z])${f}([^a-z]|$)`).test(n);
    });
    if (matched) days.push(i);
  }

  return { days, hour, raw };
}

export interface DayGroup<T> {
  day: number;
  bands: T[];
}

// Comparador de bandas por horario: hora de inicio ascendente; las sin hora al
// final, ordenadas por el string de schedule (estable).
export function compareByHour<T>(a: T, b: T, getSchedule: (t: T) => string | null | undefined): number {
  const ha = parseSchedule(getSchedule(a)).hour;
  const hb = parseSchedule(getSchedule(b)).hour;
  if (ha !== null && hb !== null) return ha - hb;
  if (ha !== null) return -1;
  if (hb !== null) return 1;
  return (getSchedule(a) ?? '').localeCompare(getSchedule(b) ?? '');
}

/**
 * Distribuye bandas en grupos por día, lunes → domingo. Una banda con varios
 * días (p. ej. "Lunes y Jueves") entra en cada grupo de sus días (así el
 * filtro por día es coherente con la vista completa). Dentro de cada grupo se
 * ordena por hora de inicio. Devuelve además las bandas sin día reconocible
 * (p. ej. el template "DIA 20:00"), ordenadas por hora.
 */
export function groupBandsByDay<T>(
  bands: T[],
  getSchedule: (t: T) => string | null | undefined,
): { groups: DayGroup<T>[]; undated: T[] } {
  const byDay: T[][] = Array.from({ length: DAY_COUNT }, () => []);
  const undated: T[] = [];

  bands.forEach((b) => {
    const p = parseSchedule(getSchedule(b));
    if (p.days.length === 0) {
      undated.push(b);
      return;
    }
    p.days.forEach((d) => byDay[d].push(b));
  });

  const cmp = (x: T, y: T): number => compareByHour(x, y, getSchedule);
  byDay.forEach((list) => list.sort(cmp));
  undated.sort(cmp);

  return {
    groups: byDay
      .map((list, day) => ({ day, bands: list }))
      .filter((g) => g.bands.length > 0),
    undated,
  };
}