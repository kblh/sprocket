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

import { pickWideDeviceId, applyMinZoom } from '../js/camera.js';

const dev = (label, deviceId, kind = 'videoinput') => ({ kind, label, deviceId });

test('pickWideDeviceId najde zadní ultraširokou kameru', () => {
  assert.equal(pickWideDeviceId([dev('Front Camera', 'f'), dev('Back Camera', 'b'), dev('Back Ultra Wide Camera', 'u')]), 'u');
  assert.equal(pickWideDeviceId([dev('Zadní ultraširokoúhlý fotoaparát', 'cz'), dev('Zadní fotoaparát', 'b')]), 'cz');
});

test('pickWideDeviceId ignoruje přední kameru, audio a seznam bez ultraširoké', () => {
  assert.equal(pickWideDeviceId([dev('Front Ultra Wide Camera', 'f')]), null);
  assert.equal(pickWideDeviceId([dev('Ultra mic', 'a', 'audioinput')]), null);
  assert.equal(pickWideDeviceId([dev('Back Camera', 'b')]), null);
  assert.equal(pickWideDeviceId([]), null);
});

test('applyMinZoom nastaví zoom pod 1×, jinak nic', async () => {
  const applied = [];
  const track = { getCapabilities: () => ({ zoom: { min: 0.5, max: 10 } }), applyConstraints: async (c) => applied.push(c) };
  assert.equal(await applyMinZoom(track), 0.5);
  assert.deepEqual(applied[0], { advanced: [{ zoom: 0.5 }] });
  const none = { getCapabilities: () => ({ zoom: { min: 1, max: 5 } }), applyConstraints: async () => { throw new Error('nemá'); } };
  assert.equal(await applyMinZoom(none), null);
  assert.equal(await applyMinZoom({}), null);
  const failing = { getCapabilities: () => ({ zoom: { min: 0.5 } }), applyConstraints: async () => { throw new Error('x'); } };
  assert.equal(await applyMinZoom(failing), null);
});

function streamWith(deviceId) {
  const s = { stopped: 0 };
  s.getTracks = () => [{ stop: () => s.stopped++ }];
  s.getVideoTracks = () => [{ getSettings: () => ({ deviceId }) }];
  return s;
}

test('start žádá vysoké rozlišení', async () => {
  let constraints;
  const nav = { mediaDevices: { getUserMedia: async (c) => { constraints = c; return streamWith('b'); } } };
  await start('environment', nav);
  assert.ok(constraints.video.width.ideal >= 3840);
  stop();
});

test('start přepne zadní kameru na ultraširokou, pokud ji prohlížeč nabízí', async () => {
  const calls = [];
  const s1 = streamWith('b');
  const s2 = streamWith('u');
  const nav = { mediaDevices: {
    getUserMedia: async (c) => { calls.push(c); return calls.length === 1 ? s1 : s2; },
    enumerateDevices: async () => [dev('Back Camera', 'b'), dev('Back Ultra Wide Camera', 'u')],
  } };
  assert.equal(await start('environment', nav), s2);
  assert.equal(s1.stopped, 1);
  assert.deepEqual(calls[1].video.deviceId, { exact: 'u' });
  stop();
});

test('start spadne na běžnou kameru, když ultraširoká selže', async () => {
  const calls = [];
  const s1 = streamWith('b');
  const s3 = streamWith('b');
  const nav = { mediaDevices: {
    getUserMedia: async (c) => {
      calls.push(c);
      if (calls.length === 1) return s1;
      if (calls.length === 2) throw { name: 'OverconstrainedError' };
      return s3;
    },
    enumerateDevices: async () => [dev('Back Ultra Wide Camera', 'u')],
  } };
  assert.equal(await start('environment', nav), s3);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].video.deviceId, undefined);
  stop();
});

test('start nepřepíná, když už běží ultraširoká, ani u přední kamery', async () => {
  let n = 0;
  const wide = streamWith('u');
  const nav = { mediaDevices: {
    getUserMedia: async () => { n++; return wide; },
    enumerateDevices: async () => [dev('Back Ultra Wide Camera', 'u')],
  } };
  assert.equal(await start('environment', nav), wide);
  assert.equal(n, 1);
  n = 0;
  await start('user', nav);
  assert.equal(n, 1);
  stop();
});

test('selhání enumerateDevices nezahodí funkční kameru', async () => {
  const s1 = streamWith('b');
  const nav = { mediaDevices: {
    getUserMedia: async () => s1,
    enumerateDevices: async () => { throw new Error('nelze'); },
  } };
  assert.equal(await start('environment', nav), s1);
  assert.equal(s1.stopped, 0);
  stop();
});
