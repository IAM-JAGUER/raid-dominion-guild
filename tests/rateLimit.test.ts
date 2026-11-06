// Contrato del limitador en memoria de las Netlify Functions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rateLimit } from '../netlify/functions/_shared/rateLimit.ts';

test('rateLimit permite hasta el límite y luego bloquea', () => {
  const key = `test-${Math.random()}`;
  assert.equal(rateLimit(key, 2, 60_000), true);
  assert.equal(rateLimit(key, 2, 60_000), true);
  assert.equal(rateLimit(key, 2, 60_000), false);
});

test('rateLimit vuelve a permitir cuando expira la ventana', async () => {
  const key = `test-${Math.random()}`;
  assert.equal(rateLimit(key, 1, 40), true);
  assert.equal(rateLimit(key, 1, 40), false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(rateLimit(key, 1, 40), true);
});
