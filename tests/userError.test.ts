import test from 'node:test';
import assert from 'node:assert/strict';
import { userError } from '../src/lib/ui/userError.ts';

test('no expone errores de permisos ni nombres de tablas', () => {
  const msg = userError('permission denied for table raiddominion_profiles', 'Fallback');
  assert.equal(msg, 'No tienes permiso para esta acción.');
  assert.ok(!/raiddominion|table|permission/i.test(msg));
});

test('no expone funciones internas ni migraciones', () => {
  const msg = userError('could not find the function public.raiddominion_tracker_apply', 'Fallback');
  assert.equal(msg, 'La función no está disponible en este momento. Reintenta más tarde o contacta a soporte.');
  assert.ok(!/raiddominion|function|migration/i.test(msg));
});

test('traduce autenticación y reclamos conocidos', () => {
  assert.equal(userError('Invalid login credentials', 'Fallback'), 'Correo o contraseña incorrectos.');
  assert.equal(userError('sin sesión', 'Fallback'), 'Tu sesión expiró. Vuelve a iniciar sesión.');
  assert.equal(userError('personaje validado', 'Fallback'), 'Primero valida tu personaje; después podrás reclamar la hermandad.');
  assert.equal(userError('otra cuenta', 'Fallback'), 'Este archivo pertenece a otra cuenta. No puedes reclamar su hermandad desde aquí.');
});

test('usa el fallback ante errores desconocidos', () => {
  assert.equal(userError('algo inesperado del backend', 'No se pudo completar.'), 'No se pudo completar.');
  assert.equal(userError('', 'No se pudo completar.'), 'No se pudo completar.');
});
