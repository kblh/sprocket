import test from 'node:test';
import assert from 'node:assert/strict';
import { saveImage } from '../js/save.js';

const blob = new Blob(['x'], { type: 'image/jpeg' });

function env(nav) {
  const downloads = [];
  return { env: { nav, download: (b, f) => downloads.push(f) }, downloads };
}

test('sdílení uspěje: vrátí shared a nestahuje', async () => {
  const shared = [];
  const { env: e, downloads } = env({ canShare: () => true, share: async (d) => shared.push(d) });
  assert.equal(await saveImage(blob, 'a.jpg', e), 'shared');
  assert.equal(shared[0].files[0].name, 'a.jpg');
  assert.equal(downloads.length, 0);
});

test('uživatel zavře sdílecí list: cancelled, žádné stahování', async () => {
  const { env: e, downloads } = env({
    canShare: () => true,
    share: async () => { throw { name: 'AbortError' }; },
  });
  assert.equal(await saveImage(blob, 'a.jpg', e), 'cancelled');
  assert.equal(downloads.length, 0);
});

test('jiná chyba sdílení: fallback na stažení', async () => {
  const { env: e, downloads } = env({
    canShare: () => true,
    share: async () => { throw { name: 'NotAllowedError' }; },
  });
  assert.equal(await saveImage(blob, 'a.jpg', e), 'downloaded');
  assert.deepEqual(downloads, ['a.jpg']);
});

test('bez Web Share nebo canShare=false: stažení', async () => {
  for (const nav of [{}, { share: async () => {}, canShare: () => false }]) {
    const { env: e, downloads } = env(nav);
    assert.equal(await saveImage(blob, 'b.jpg', e), 'downloaded');
    assert.deepEqual(downloads, ['b.jpg']);
  }
});
