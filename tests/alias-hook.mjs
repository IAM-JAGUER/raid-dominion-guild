// Resolver del alias `@/` → `<repo>/src/`. Se registra desde register-alias.mjs.

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../src/', import.meta.url);

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '.js'];

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

  const base = fileURLToPath(new URL(specifier.slice(2), SRC));
  for (const suffix of CANDIDATES) {
    const candidate = base + suffix;
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
