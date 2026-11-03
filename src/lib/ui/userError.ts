// Traduce errores internos (auth, permisos, PostgREST, validaciones) a copy
// accionable para el usuario. Nunca devuelve el mensaje crudo: los detalles
// técnicos quedan fuera de la UI y del HTML servido.

const AUTH_RE = /invalid login credentials|email not confirmed|already registered|user already registered|jwt|session|not authenticated|auth session missing|sin sesi[oó]n|token.*expired/i;
const PERMISSION_RE = /permission denied|not authorized|42501|insufficient privilege/i;
const UNAVAILABLE_RE = /could not find the function|function .* does not exist|schema cache|pgrst202|no est[aá] aplicada/i;
const NETWORK_RE = /network|failed to fetch|fetch failed|timeout|timed out|offline|econn/i;

export function userError(raw: string | null | undefined, fallback: string): string {
  const text = (raw ?? '').trim();
  if (!text) return fallback;

  if (/personaje validado/i.test(text)) {
    return 'Primero valida tu personaje; después podrás reclamar la hermandad.';
  }
  if (/otra cuenta/i.test(text)) {
    return 'Este archivo pertenece a otra cuenta. No puedes reclamar su hermandad desde aquí.';
  }
  if (/requiere ser miembro/i.test(text)) {
    return 'Primero valida tu cuenta; después podrás reclamar la hermandad.';
  }
  if (/ya tiene un maestro|maestro registrado/i.test(text)) {
    return 'Esa hermandad ya tiene un maestro registrado en el portal.';
  }
  if (/duplicate key|unique constraint|ya existe/i.test(text)) {
    return 'No pudimos completar la operación porque el registro ya existe. Reintenta o contacta a soporte.';
  }
  if (/rate limit|too many requests/i.test(text)) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
  }
  if (/invalid login credentials/i.test(text)) {
    return 'Correo o contraseña incorrectos.';
  }
  if (/already registered|user already registered/i.test(text)) {
    return 'Ese correo ya tiene cuenta; inicia sesión.';
  }
  if (/email not confirmed/i.test(text)) {
    return 'Confirma tu correo con el enlace que te enviamos e inténtalo de nuevo.';
  }
  if (AUTH_RE.test(text)) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  }
  if (PERMISSION_RE.test(text)) {
    return 'No tienes permiso para esta acción.';
  }
  if (UNAVAILABLE_RE.test(text)) {
    return 'La función no está disponible en este momento. Reintenta más tarde o contacta a soporte.';
  }
  if (NETWORK_RE.test(text)) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (/not found|no encontrado|pgrst116|0 rows/i.test(text)) {
    return 'No encontramos ese registro. Recarga la página e inténtalo de nuevo.';
  }
  return fallback;
}
