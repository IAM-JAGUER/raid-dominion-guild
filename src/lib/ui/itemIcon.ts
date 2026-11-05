// Icono de objeto para las filas de equipamiento: MISMO arte que el tooltip
// de UltimoWoW. El SV solo trae `itemID`, así que el nombre del icono se
// obtiene del endpoint público `?item=ID&power` (el mismo que usa power.js)
// mediante inyección de script —igual que el widget— y se cachea por sesión.
import { iconEl } from '@/lib/ui/icons';
import { ensureWowhead } from '@/lib/ui/wowhead';

const POWER_ORIGIN = 'https://wotlk.ultimowow.com/';
const ICON_ORIGIN = 'https://wotlk.ultimowow.com/static/images/wow/icons/medium';
const CACHE_PREFIX = 'rd.itemIcon.';
const REQUEST_TIMEOUT = 8000;

type RegisterItem = (id: string | number, locale: number, json: unknown) => void;
type PowerGlobals = { $WowheadPower?: { registerItem?: RegisterItem } };

interface PendingIcon {
  waiters: Array<(icon: string | null) => void>;
  timer: number;
}

const memory = new Map<number, string | null>();
const pending = new Map<number, PendingIcon>();
let hooked = false;

function readStored(id: number): string | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + id);
    if (raw === null) return undefined;
    return raw === '' ? null : raw;
  } catch {
    return undefined;
  }
}

function store(id: number, icon: string | null): void {
  memory.set(id, icon);
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + id, icon ?? '');
  } catch {
    // sessionStorage puede fallar en modo privado: la caché en memoria basta.
  }
}

function iconFromJson(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const icon = (json as { icon?: unknown }).icon;
  return typeof icon === 'string' && icon.trim() ? icon.trim().toLowerCase() : null;
}

function resolvePending(id: number, icon: string | null): void {
  store(id, icon);
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  window.clearTimeout(entry.timer);
  entry.waiters.forEach((resolve) => resolve(icon));
}

// power.js registra cada respuesta con `$WowheadPower.registerItem`. Se
// envuelve una sola vez para capturar el campo `icon` de cualquier objeto
// (incluidos los que ya carga el propio tooltip).
function hookPower(): void {
  if (hooked) return;
  const win = window as unknown as PowerGlobals;
  const power = win.$WowheadPower;
  if (!power || typeof power.registerItem !== 'function') return;
  hooked = true;
  const original = power.registerItem;
  power.registerItem = (id, locale, json) => {
    const numeric = Number(id);
    const icon = iconFromJson(json);
    if (Number.isSafeInteger(numeric) && numeric > 0 && icon) resolvePending(numeric, icon);
    original.call(power, id, locale, json);
  };
}

function requestIcon(id: number): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (memory.has(id)) return Promise.resolve(memory.get(id) ?? null);
  const stored = readStored(id);
  if (stored !== undefined) return Promise.resolve(stored);

  const inFlight = pending.get(id);
  if (inFlight) return new Promise((resolve) => inFlight.waiters.push(resolve));

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolvePending(id, null), REQUEST_TIMEOUT);
    pending.set(id, { waiters: [resolve], timer });
    void ensureWowhead().then(() => {
      hookPower();
      const script = document.createElement('script');
      script.src = `${POWER_ORIGIN}?item=${id}&domain=www&power&v=2`;
      script.async = true;
      script.dataset.rdItemIcon = String(id);
      script.addEventListener('error', () => resolvePending(id, null), { once: true });
      document.head.appendChild(script);
    });
  });
}

function iconUrl(icon: string): string {
  return `${ICON_ORIGIN}/${icon}.jpg`;
}

// Icono cuadrado con fallback temático mientras se resuelve el arte real.
// `aria-hidden`: el nombre del ítem contiguo es la fuente accesible.
export function itemIconEl(itemID?: number | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (!itemID || !Number.isSafeInteger(itemID) || itemID <= 0) return null;

  const box = document.createElement('span');
  box.className = 'rd-item-icon';
  box.setAttribute('aria-hidden', 'true');
  const fallback = iconEl('arma', { size: 'md' });
  box.appendChild(fallback);

  void requestIcon(itemID).then((icon) => {
    if (!icon) return;
    const img = document.createElement('img');
    img.src = iconUrl(icon);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'rd-item-icon__img';
    img.style.opacity = '0';
    img.addEventListener('load', () => {
      img.style.opacity = '';
      box.replaceChildren(img);
    }, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    box.appendChild(img);
  });

  return box;
}
