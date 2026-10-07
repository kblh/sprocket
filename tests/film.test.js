import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTriX, grainSizeFor } from '../js/film.js';

function image(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = typeof fill === 'function' ? fill(i) : fill;
    data.set([r, g, b, 255], i * 4);
  }
  return { data, width: w, height: h };
}
const PLAIN = { grain: 0, vignette: 0, softness: 0 };

test('výstup je šedotónový a alfa se nemění', () => {
  const img = image(32, 32, (i) => [(i * 7) % 256, (i * 13) % 256, (i * 29) % 256]);
  applyTriX(img);
  for (let p = 0; p < img.data.length; p += 4) {
    assert.equal(img.data[p], img.data[p + 1]);
    assert.equal(img.data[p + 1], img.data[p + 2]);
    assert.equal(img.data[p + 3], 255);
  }
});

test('tónová křivka: monotónní, černá a bílá drží, hluboké stíny, světla nahoru', () => {
  const out = (g) => {
    const img = image(1, 1, [g, g, g]);
    applyTriX(img, PLAIN);
    return img.data[0];
  };
  assert.equal(out(0), 0);
  assert.equal(out(255), 255);
  assert.ok(out(64) < 64);
  assert.ok(out(192) > 192);
  let prev = -1;
  for (let g = 0; g <= 255; g += 5) {
    const v = out(g);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('vinětace ztmaví rohy víc než střed', () => {
  const img = image(64, 64, [128, 128, 128]);
  applyTriX(img, { grain: 0, softness: 0 });
  const at = (x, y) => img.data[(y * 64 + x) * 4];
  assert.ok(at(0, 0) < at(32, 32) - 40);
  assert.ok(at(63, 63) < at(32, 32) - 40);
});

test('zrno: s grain > 0 se hodnoty liší, s grain = 0 ne', () => {
  const distinct = (opts) => {
    const img = image(32, 32, [128, 128, 128]);
    applyTriX(img, { vignette: 0, softness: 0, ...opts });
    return new Set(Array.from({ length: 32 * 32 }, (_, i) => img.data[i * 4])).size;
  };
  assert.ok(distinct({ grain: 0.09 }) > 1);
  assert.equal(distinct({ grain: 0 }), 1);
});

test('zrno je deterministické podle seed', () => {
  const run = (seed) => {
    const img = image(32, 32, [128, 128, 128]);
    applyTriX(img, { seed });
    return Array.from(img.data);
  };
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6));
});

test('grainSize seskupuje zrno do bloků', () => {
  const img = image(16, 16, [128, 128, 128]);
  applyTriX(img, { vignette: 0, softness: 0, grainSize: 4 });
  const at = (x, y) => img.data[(y * 16 + x) * 4];
  assert.equal(at(0, 0), at(3, 3));
  assert.equal(at(4, 4), at(7, 7));
});

test('měkkost rozostří ostrý okraj blízko hrany obrazu', () => {
  const img = image(64, 64, (i) => (i % 64 < 32 ? [0, 0, 0] : [255, 255, 255]));
  applyTriX(img, { grain: 0, vignette: 0, softness: 1 });
  const row = 32 * 64;
  const edgeLeft = img.data[(row + 0) * 4];
  const edgeRight = img.data[(row + 63) * 4];
  assert.ok(edgeLeft <= 10 && edgeRight >= 245);
  const step = img.data[(row + 32) * 4] - img.data[(row + 31) * 4];
  assert.ok(step > 0);
});

test('grainSizeFor roste s rozlišením', () => {
  assert.equal(grainSizeFor(640), 1);
  assert.equal(grainSizeFor(3600), 3);
});
