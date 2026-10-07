import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, drawFrame } from '../js/frame.js';

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get: (_, p) => (p === 'calls' ? calls : (...args) => { calls.push([p, ...args]); }),
    set: () => true,
  });
}

test('drawFrame: obraz přes celou plochu, pak černé otvory a číslování', () => {
  const L = layout(1200);
  const ctx = fakeCtx();
  const src = {};
  drawFrame(ctx, src, L, { number: 7 });

  const iDraw = ctx.calls.findIndex((c) => c[0] === 'drawImage');
  const iFill = ctx.calls.findIndex((c) => c[0] === 'fill');
  assert.deepEqual(ctx.calls[iDraw].slice(1), [src, 0, 0, L.width, L.height]);
  assert.ok(iDraw < iFill);
  assert.equal(ctx.calls.filter((c) => c[0] === 'arcTo').length, L.holes.length * 4);
  assert.equal(ctx.calls.filter((c) => c[0] === 'rect').length, 0);

  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.deepEqual([...texts].sort(), ['7', '8', '▶7A', '▶8A']);
});

test('drawFrame: žádný popisek filmu (TRI-X/KODAK) na pásu', () => {
  const ctx = fakeCtx();
  drawFrame(ctx, {}, layout(1200), { number: 36 });
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]).join(' ');
  assert.ok(!/TRI|KODAK|400/i.test(texts));
  assert.deepEqual(texts.split(' ').sort(), ['1', '36', '▶1A', '▶36A']);
});
