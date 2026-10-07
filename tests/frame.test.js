import test from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, cropRect, layout } from '../js/frame.js';

test('cropRect: 16:9 video se ořízne na 3:1 vystředěně', () => {
  assert.deepEqual(cropRect(1920, 1080), { sx: 0, sy: 220, sw: 1920, sh: 640 });
});

test('cropRect: portrét 480×640 zůstane 3:1 a uvnitř videa', () => {
  const r = cropRect(480, 640);
  assert.equal(r.sw / r.sh, ASPECT);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 480 && r.sy + r.sh <= 640);
});

test('cropRect: velmi široké video se ořízne na šířku', () => {
  assert.deepEqual(cropRect(1000, 100), { sx: 350, sy: 0, sw: 300, sh: 100 });
});

test('layout: výška je třetina šířky', () => {
  for (const w of [120, 640, 1200, 1920, 3600]) {
    assert.equal(layout(w).height, Math.round(w / ASPECT));
  }
});

test('layout: otvory leží v horním nebo dolním pásu a uvnitř šířky', () => {
  for (const w of [120, 640, 1920]) {
    const L = layout(w);
    assert.ok(L.holes.length > 0);
    for (const h of L.holes) {
      assert.ok(h.x >= 0 && h.x + h.w <= L.width);
      const top = h.y + h.h <= L.band;
      const bottom = h.y >= L.height - L.band && h.y + h.h <= L.height;
      assert.ok(top || bottom);
    }
  }
});

test('layout: otvory mají pravidelnou rozteč a jsou vystředěné', () => {
  const L = layout(1200);
  const top = L.holes.filter((h) => h.y < L.band);
  assert.ok(top.length >= 8);
  const pitch = top[1].x - top[0].x;
  for (let i = 1; i < top.length; i++) assert.equal(top[i].x - top[i - 1].x, pitch);
  const last = top[top.length - 1];
  assert.ok(Math.abs(top[0].x - (L.width - (last.x + last.w))) <= 1);
});

test('layout: popisek a číslo leží ve spodním pásu nad otvory', () => {
  const L = layout(1200);
  const holeTop = Math.min(...L.holes.filter((h) => h.y >= L.height - L.band).map((h) => h.y));
  assert.ok(L.label.y > L.height - L.band && L.label.y < holeTop);
  assert.equal(L.number.y, L.label.y);
  assert.ok(L.number.x > L.label.x);
});
