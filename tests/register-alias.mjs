// Hook de resolución para `node --test`: mapea el alias `@/` de tsconfig a
// `src/`, que Node no conoce por sí solo (los imports del parser lo usan).
// Dependencia-free: se registra con `--import ./tests/register-alias.mjs`.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-hook.mjs', import.meta.url);

export const aliasBase = pathToFileURL(new URL('../src', import.meta.url).pathname).href;
