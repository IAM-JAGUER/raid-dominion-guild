// Lectura de variables de entorno en funciones Netlify.
//
// En deploy las funciones se ejecutan con `process.env`. En dev (astro dev),
// Vite reemplaza `import.meta.env` con el .env del proyecto y process.env puede
// no tener las VITE_*. Este helper cubre ambos entornos.
interface EnvLike {
  env?: Record<string, string | undefined>;
}

export function env(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  const meta = import.meta as unknown as EnvLike;
  return meta.env?.[name];
}