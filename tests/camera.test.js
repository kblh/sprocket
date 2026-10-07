import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraError, classifyError, start, stop } from '../js/camera.js';

test('classifyError mapuje názvy chyb', () => {
  assert.equal(classifyError({ name: 'NotAllowedError' }), 'denied');
  assert.equal(classifyError({ name: 'SecurityError' }), 'denied');
  assert.equal(classifyError({ name: 'NotFoundError' }), 'notfound');
  assert.equal(classifyError({ name: 'OverconstrainedError' }), 'notfound');
  assert.equal(classifyError({ name: 'NotReadableError' }), 'busy');
  assert.equal(classifyError({ name: 'Cokoliv' }), 'unknown');
});

test('start bez mediaDevices (nezabezpečený kontext) vyhodí unsupported', async () => {
  await assert.rejects(start('environment', {}), (e) => e instanceof CameraError && e.kind === 'unsupported');
});

test('start převede odepření na CameraError denied', async () => {
  const nav = { mediaDevices: { getUserMedia: async () => { throw { name: 'NotAllowedError', message: 'x' }; } } };
  await assert.rejects(start('user', nav), (e) => e.kind === 'denied');
});

test('start vrátí stream a stop zastaví stopy', async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  let constraints;
  const nav = { mediaDevices: { getUserMedia: async (c) => { constraints = c; return stream; } } };
  assert.equal(await start('environment', nav), stream);
  assert.deepEqual(constraints.video.facingMode, { ideal: 'environment' });
  assert.equal(constraints.audio, false);
  stop();
  assert.equal(stopped, 2);
});
