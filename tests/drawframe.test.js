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

test('drawFrame: obraz, pásy s otvory (evenodd) a popisky', () => {
  const L = layout(1200);
  const ctx = fakeCtx();
  const src = {};
  drawFrame(ctx, src, L, { number: 7 });

  const iDraw = ctx.calls.findIndex((c) => c[0] === 'drawImage');
  const iFill = ctx.calls.findIndex((c) => c[0] === 'fill');
  assert.deepEqual(ctx.calls[iDraw].slice(1), [src, 0, 0, L.width, L.height]);
  assert.equal(ctx.calls[iFill][1], 'evenodd');
  assert.ok(iDraw < iFill);

  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(texts.includes('KODAK TRI-X 400'));
  assert.ok(texts.some((t) => t.includes('7A')));
  assert.equal(ctx.calls.filter((c) => c[0] === 'arcTo').length, L.holes.length * 4);
});
