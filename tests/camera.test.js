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

function deferredNav() {
  const pending = [];
  const nav = { mediaDevices: { getUserMedia: () => new Promise((resolve) => pending.push(resolve)) } };
  const mkStream = () => {
    const s = { stopped: 0 };
    s.getTracks = () => [{ stop: () => s.stopped++ }];
    return s;
  };
  return { nav, pending, mkStream };
}

test('překrývající se start: starší stream se zastaví a starší volání skončí superseded', async () => {
  const { nav, pending, mkStream } = deferredNav();
  const first = start('environment', nav);
  const second = start('user', nav);
  const s1 = mkStream();
  const s2 = mkStream();
  pending[1](s2);
  pending[0](s1);
  assert.equal(await second, s2);
  await assert.rejects(first, (e) => e instanceof CameraError && e.kind === 'superseded');
  assert.equal(s1.stopped, 1);
  assert.equal(s2.stopped, 0);
  stop();
  assert.equal(s2.stopped, 1);
});

test('stop během čekání na kameru zastaví pozdě příchozí stream', async () => {
  const { nav, pending, mkStream } = deferredNav();
  const p = start('environment', nav);
  stop();
  const s = mkStream();
  pending[0](s);
  await assert.rejects(p, (e) => e.kind === 'superseded');
  assert.equal(s.stopped, 1);
});
