import test from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, cropRect, layout } from '../js/frame.js';

test('formát odpovídá referenčnímu snímku (2860×1302 ≈ 2,2:1)', () => {
  assert.ok(Math.abs(ASPECT - 2860 / 1302) < 0.01);
});

test('cropRect: 16:9 video se ořízne na poměr rámu vystředěně', () => {
  const r = cropRect(1920, 1080);
  assert.equal(r.sw, 1920);
  assert.ok(Math.abs(r.sw / r.sh - ASPECT) < 1e-9);
  assert.ok(Math.abs(r.sy - (1080 - r.sh) / 2) < 1e-9);
  assert.equal(r.sx, 0);
});

test('cropRect: portrét 480×640 zůstane v poměru rámu a uvnitř videa', () => {
  const r = cropRect(480, 640);
  assert.ok(Math.abs(r.sw / r.sh - ASPECT) < 1e-9);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 480 + 1e-9 && r.sy + r.sh <= 640 + 1e-9);
});

test('cropRect: velmi široké video se ořízne na šířku', () => {
  const r = cropRect(1000, 100);
  assert.equal(r.sh, 100);
  assert.ok(Math.abs(r.sw - 100 * ASPECT) < 1e-9);
  assert.ok(Math.abs(r.sx - (1000 - r.sw) / 2) < 1e-9);
});

test('layout: výška odpovídá poměru stran', () => {
  for (const w of [120, 640, 1200, 1920, 3600]) {
    assert.equal(layout(w).height, Math.round(w / ASPECT));
  }
});

test('layout: otvory jsou celé uvnitř šířky, horní řada nahoře a dolní dole', () => {
  for (const w of [120, 640, 1920]) {
    const L = layout(w);
    assert.ok(L.holes.length > 0);
    for (const h of L.holes) {
      assert.ok(h.x >= 0 && h.x + h.w <= L.width);
      const top = h.y + h.h < L.height / 2;
      const bottom = h.y > L.height / 2 && h.y + h.h <= L.height;
      assert.ok(top || bottom);
    }
  }
});

test('layout: otvory mají pravidelnou rozteč a jsou vystředěné', () => {
  const L = layout(1200);
  const top = L.holes.filter((h) => h.y < L.height / 2);
  assert.ok(top.length >= 8);
  const pitch = top[1].x - top[0].x;
  for (let i = 1; i < top.length; i++) assert.equal(top[i].x - top[i - 1].x, pitch);
  const last = top[top.length - 1];
  assert.ok(Math.abs(top[0].x - (L.width - (last.x + last.w))) <= 1);
});

test('layout: číslování leží pod dolní řadou otvorů a uvnitř snímku', () => {
  const L = layout(1200);
  const holeBottom = Math.max(...L.holes.map((h) => h.y + h.h));
  assert.ok(L.text.y - 0.72 * L.text.bigSize >= holeBottom - 1);
  assert.ok(L.text.y <= L.height);
  const { n0, a0, n1, a1 } = L.text.xs;
  assert.ok(0 < n0 && n0 < a0 && a0 < n1 && n1 < a1 && a1 < L.width);
});

import { canvasSize, outputLong } from '../js/frame.js';

test('cropRect portrait: svislý výřez 1:ASPECT uvnitř videa, vystředěný', () => {
  const r = cropRect(1080, 1920, 'portrait');
  assert.ok(Math.abs(r.sh / r.sw - ASPECT) < 1e-9);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 1080 + 1e-9 && r.sy + r.sh <= 1920 + 1e-9);
  assert.ok(Math.abs(r.sx - (1080 - r.sw) / 2) < 1e-9);
});

test('cropRect portrait: ze širokého videa 1920×1080 vezme výšku celou', () => {
  const r = cropRect(1920, 1080, 'portrait');
  assert.equal(r.sh, 1080);
  assert.ok(Math.abs(r.sw - 1080 / ASPECT) < 1e-9);
});

test('cropRect portrait: velmi úzké video ořízne na výšku', () => {
  const r = cropRect(100, 1000, 'portrait');
  assert.equal(r.sw, 100);
  assert.ok(Math.abs(r.sh - 100 * ASPECT) < 1e-9);
});

test('canvasSize: portrait prohodí rozměry layoutu', () => {
  const L = layout(1000);
  assert.deepEqual(canvasSize(L, 'landscape'), { width: L.width, height: L.height });
  assert.deepEqual(canvasSize(L, 'portrait'), { width: L.height, height: L.width });
});

test('outputLong: delší strana výřezu, nejvýše 3600', () => {
  const land = cropRect(4032, 3024);
  assert.equal(outputLong(land, 'landscape'), 3600);
  const port = cropRect(3024, 4032, 'portrait');
  assert.equal(outputLong(port, 'portrait'), 3600);
  assert.equal(outputLong(cropRect(1920, 1080), 'landscape'), 1920);
  assert.equal(outputLong(cropRect(1080, 1920, 'portrait'), 'portrait'), 1920);
  assert.equal(outputLong(cropRect(1000, 100), 'landscape', 3600), 220);
});

import { fitBox } from '../js/frame.js';

test('fitBox: landscape se vejde na šířku nebo na výšku', () => {
  const a = fitBox(390, 634, 'landscape');
  assert.ok(Math.abs(a.width - 390) < 1e-9 && Math.abs(a.height - 390 / ASPECT) < 1e-9);
  const b = fitBox(1200, 400, 'landscape');
  assert.ok(Math.abs(b.height - 400) < 1e-9 && Math.abs(b.width - 400 * ASPECT) < 1e-9);
});

test('fitBox: portrait se vejde na výšku nebo na šířku', () => {
  const a = fitBox(390, 634, 'portrait');
  assert.ok(Math.abs(a.height - 634) < 1e-9 && Math.abs(a.width - 634 / ASPECT) < 1e-9);
  const b = fitBox(300, 900, 'portrait');
  assert.ok(Math.abs(b.width - 300) < 1e-9 && Math.abs(b.height - 300 * ASPECT) < 1e-9);
});

test('fitBox: nikdy nepřesáhne dostupné místo a drží poměr stran', () => {
  for (const o of ['landscape', 'portrait']) {
    for (const [w, h] of [[390, 634], [1200, 400], [300, 900], [0, 500]]) {
      const r = fitBox(w, h, o);
      assert.ok(r.width <= w + 1e-9 && r.height <= h + 1e-9);
      const ratio = o === 'portrait' ? r.height / r.width : r.width / r.height;
      assert.ok(r.width === 0 || Math.abs(ratio - ASPECT) < 1e-9);
    }
  }
});
