// Rate limit en memoria, best-effort para funciones serverless. Cada instancia
// caliente conserva su mapa; no sustituye a un limitador distribuido, pero
// frena ráfagas triviales de bots contra endpoints públicos.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);

  // Poda ocasional para que el mapa no crezca sin límite.
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (times.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }
  return true;
}
