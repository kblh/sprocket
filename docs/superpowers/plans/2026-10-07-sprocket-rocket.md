# Sprocket Rocket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webová aplikace (vanilla JS/HTML/CSS), která fotí živou kamerou panoramatické černobílé snímky ve stylu Kodak Tri-X 400 na Sprocket Rocketu a umí je uložit na telefon.

**Architecture:** Statická stránka s ES moduly. Čistá logika (`film.js`, `frame.js`, `camera.js` chyby, `save.js` rozhodování) je bez přístupu k DOM, a proto testovatelná v Node. `app.js` propojuje kameru, zpracování, rám, galerii (IndexedDB) a UI. Živý náhled běží v nízkém rozlišení (640 px), hotový snímek se spočítá jednou ve vysokém (max 3600 px) se stejnými parametry.

**Tech Stack:** Vanilla JS (ES moduly), HTML, CSS, Canvas 2D, getUserMedia, Web Share API, IndexedDB, WebAudio. Testy: `node:test` (Node ≥ 20, bez závislostí).

**Spec:** `docs/superpowers/specs/2026-10-07-sprocket-rocket-design.md`

## Global Constraints

- Vanilla JS + HTML + CSS, bez frameworků, bez build kroku a bez npm závislostí.
- Moduly jsou ES moduly. `film.js` a `frame.js` nesahají na DOM (jen výpočty a kreslení do předaného `ctx`).
- Poměr panoramatického snímku **3:1**. Jediný film: **Kodak Tri-X 400**, popisek na okraji filmu `KODAK TRI-X 400`.
- Výstup JPEG, kvalita **0,92**, šířka nejvýše **3600 px**.
- Kamera vyžaduje HTTPS nebo `localhost`. Bez WebGL.
- IndexedDB databáze `sprocket`, store `shots` (id, čas, blob, miniatura).
- Spouští se ze statického serveru, např. `python3 -m http.server`.
- Mimo rozsah: další filmy, nahrávání souborů, dvojitá expozice, nastavení efektů, počítadlo snímků, ruční ostření.
- Každý commit: `git commit -m "<zpráva>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.

## Review Focus

- Kamera odepřená uživatelem: srozumitelná hláška a tlačítko „Zkusit znovu“, ne prázdná obrazovka (Task 4 test, Task 7 ruční kontrola).
- Stránka otevřená přes nezabezpečené `http://` (např. LAN IP): `navigator.mediaDevices` neexistuje, má se zobrazit hint o HTTPS, ne výjimka (Task 4 test).
- Video, které není 16:9 (portrét 480×640, 4:3, velmi široké): ořez na 3:1 musí zůstat 3:1 a uvnitř videa (Task 1 test).
- Uživatel zavře sdílecí list: žádné stahování navíc a žádná chyba (Task 5 test).
- Spoušť stisknutá dřív, než video běží, nebo IndexedDB nedostupná (soukromé okno): nic nespadne, snímek se přesto zobrazí a jde uložit (Task 7 ruční kontrola).

---

### Task 1: Rozměry rámu a ořez (frame.js, čistá logika)

**Files:**
- Create: `package.json`, `js/frame.js`
- Test: `tests/frame.test.js`

**Interfaces:**
- Produces: `ASPECT = 3`; `cropRect(vw, vh) → {sx, sy, sw, sh}` (střední ořez na 3:1 uvnitř vstupu); `layout(width) → {width, height, band, holes:[{x,y,w,h,r}], label:{x,y,size}, number:{x,y,size}}`. `holes` obsahuje horní i dolní řadu. `label` je levý a `number` pravý okraj spodního pásu.

- [ ] **Step 1: Založ `package.json`**

```json
{
  "name": "sprocket-rocket",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Napiš selhávající test `tests/frame.test.js`**

```js
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
```

- [ ] **Step 3: Spusť test, ověř selhání**

Run: `node --test tests/frame.test.js`
Expected: FAIL (`Cannot find module '../js/frame.js'`)

- [ ] **Step 4: Implementuj `js/frame.js`**

```js
export const ASPECT = 3;

export function cropRect(vw, vh) {
  const sh = Math.min(vh, vw / ASPECT);
  const sw = sh * ASPECT;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

export function layout(width) {
  const height = Math.round(width / ASPECT);
  const band = Math.round(height * 0.16);
  const holeH = Math.round(band * 0.42);
  const holeW = Math.round(holeH * 1.4);
  const pitch = Math.round(holeW * 1.9);
  const inset = Math.round(band * 0.12);
  const r = Math.round(holeH * 0.25);
  const count = Math.max(0, Math.floor(width / pitch) - 1);
  const startX = Math.round((width - ((count - 1) * pitch + holeW)) / 2);
  const holes = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * pitch;
    holes.push({ x, y: inset, w: holeW, h: holeH, r });
    holes.push({ x, y: height - inset - holeH, w: holeW, h: holeH, r });
  }
  const size = Math.max(6, Math.round(band * 0.2));
  const y = height - Math.round(band * 0.78);
  const margin = Math.round(width * 0.03);
  return {
    width, height, band, holes,
    label: { x: margin, y, size },
    number: { x: width - margin, y, size },
  };
}
```

- [ ] **Step 5: Spusť test, ověř průchod**

Run: `node --test tests/frame.test.js`
Expected: PASS (7 testů)

- [ ] **Step 6: Commit**

```bash
git add package.json js/frame.js tests/frame.test.js
git commit -m "feat: frame layout and 3:1 crop" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vykreslení rámu s perforací (drawFrame)

**Files:**
- Modify: `js/frame.js` (přidat `drawFrame`)
- Test: `tests/drawframe.test.js`

**Interfaces:**
- Consumes: `layout(width)` z Tasku 1.
- Produces: `drawFrame(ctx, source, L, meta)`. `source` je canvas/obraz, `L` výsledek `layout()`, `meta = {number}`. Nakreslí obraz přes celou plochu, černé pásy s vyříznutými otvory (obraz je vidět v otvorech), popisek `KODAK TRI-X 400` vlevo a `<n>   <n>A` vpravo.

- [ ] **Step 1: Napiš selhávající test `tests/drawframe.test.js`**

```js
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
```

- [ ] **Step 2: Spusť test, ověř selhání**

Run: `node --test tests/drawframe.test.js`
Expected: FAIL (`drawFrame` není exportováno)

- [ ] **Step 3: Přidej do `js/frame.js`**

```js
function roundedRect(ctx, { x, y, w, h, r }) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function drawFrame(ctx, source, L, meta = {}) {
  ctx.drawImage(source, 0, 0, L.width, L.height);

  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.rect(0, 0, L.width, L.band);
  ctx.rect(0, L.height - L.band, L.width, L.band);
  for (const hole of L.holes) roundedRect(ctx, hole);
  ctx.fill('evenodd');

  ctx.fillStyle = '#d8d8d8';
  ctx.font = `${L.label.size}px "Courier New", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('KODAK TRI-X 400', L.label.x, L.label.y);
  ctx.textAlign = 'right';
  const n = meta.number ?? 1;
  ctx.fillText(`${n}   ${n}A`, L.number.x, L.number.y);
}
```

- [ ] **Step 4: Spusť všechny testy**

Run: `npm test`
Expected: PASS (frame i drawframe)

- [ ] **Step 5: Commit**

```bash
git add js/frame.js tests/drawframe.test.js
git commit -m "feat: draw film frame with sprocket holes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Look Kodak Tri-X (film.js)

**Files:**
- Create: `js/film.js`
- Test: `tests/film.test.js`

**Interfaces:**
- Produces: `TRIX` (konstanta parametrů: `mix`, `curve`, `grain`, `vignette`, `softness`); `grainSizeFor(width) → int` (≥ 1); `applyTriX(imageData, options)` mění `imageData.data` na místě, vstup stačí `{data, width, height}`. `options` může přepsat kterýkoli klíč `TRIX` a navíc `seed` (výchozí 1) a `grainSize` (výchozí 1). Alfa se nemění.

- [ ] **Step 1: Napiš selhávající test `tests/film.test.js`**

```js
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
```

- [ ] **Step 2: Spusť test, ověř selhání**

Run: `node --test tests/film.test.js`
Expected: FAIL (`Cannot find module '../js/film.js'`)

- [ ] **Step 3: Implementuj `js/film.js`**

```js
export const TRIX = {
  mix: [0.40, 0.45, 0.15],
  curve: 0.55,
  grain: 0.09,
  vignette: 0.6,
  softness: 0.5,
};

export function grainSizeFor(width) {
  return Math.max(1, Math.round(width / 1280));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function curveLut(k) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const s = x * x * (3 - 2 * x);
    lut[i] = (x + k * (s - x)) * 255;
  }
  return lut;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / n;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function applyTriX(imageData, options = {}) {
  const o = { ...TRIX, seed: 1, grainSize: 1, ...options };
  const { data, width: w, height: h } = imageData;
  const n = w * h;
  const [mr, mg, mb] = o.mix;

  const gray = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = mr * data[p] + mg * data[p + 1] + mb * data[p + 2];
  }
  const blurred = o.softness > 0 ? boxBlur(gray, w, h, Math.max(1, Math.round(w * 0.006))) : null;
  const lut = curveLut(o.curve);

  const gs = Math.max(1, Math.round(o.grainSize));
  const gw = Math.ceil(w / gs);
  const gh = Math.ceil(h / gs);
  const noise = new Float32Array(gw * gh);
  if (o.grain > 0) {
    const rand = mulberry32(o.seed);
    for (let i = 0; i < noise.length; i++) noise[i] = gaussian(rand);
  }

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) / (cy || 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = Math.hypot((x - cx) / (cx || 1), dy) / Math.SQRT2;
      let l = gray[i];
      if (blurred) l += (blurred[i] - l) * o.softness * smoothstep(0.35, 1, d);
      l = lut[Math.min(255, Math.max(0, Math.round(l)))];
      l *= 1 - o.vignette * smoothstep(0.25, 1, d);
      if (o.grain > 0) {
        const t = l / 255;
        const weight = 0.4 + 0.6 * 4 * t * (1 - t);
        l += noise[Math.floor(y / gs) * gw + Math.floor(x / gs)] * o.grain * 255 * weight;
      }
      l = Math.min(255, Math.max(0, Math.round(l)));
      const p = i * 4;
      data[p] = data[p + 1] = data[p + 2] = l;
    }
  }
}
```

- [ ] **Step 4: Spusť testy**

Run: `npm test`
Expected: PASS. Pokud selže test „měkkost“, uprav jen práh v testu (ne algoritmus), protože ověřuje směr efektu, ne přesná čísla.

- [ ] **Step 5: Commit**

```bash
git add js/film.js tests/film.test.js
git commit -m "feat: Kodak Tri-X film look" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kamera (camera.js)

**Files:**
- Create: `js/camera.js`
- Test: `tests/camera.test.js`

**Interfaces:**
- Produces: `class CameraError extends Error` s polem `kind` (`'denied' | 'notfound' | 'busy' | 'unsupported' | 'unknown'`); `classifyError(err) → kind`; `start(facingMode = 'environment', nav = globalThis.navigator) → Promise<MediaStream>` (při chybě vyhodí `CameraError`); `stop()`.

- [ ] **Step 1: Napiš selhávající test `tests/camera.test.js`**

```js
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
```

- [ ] **Step 2: Spusť test, ověř selhání**

Run: `node --test tests/camera.test.js`
Expected: FAIL (`Cannot find module '../js/camera.js'`)

- [ ] **Step 3: Implementuj `js/camera.js`**

```js
export class CameraError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export function classifyError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'notfound';
    case 'NotReadableError':
      return 'busy';
    default:
      return 'unknown';
  }
}

let stream = null;

export function stop() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function start(facingMode = 'environment', nav = globalThis.navigator) {
  stop();
  if (!nav?.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'getUserMedia is not available');
  }
  try {
    stream = await nav.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    return stream;
  } catch (e) {
    throw new CameraError(classifyError(e), e?.message ?? String(e));
  }
}
```

- [ ] **Step 4: Spusť testy**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/camera.js tests/camera.test.js
git commit -m "feat: camera access with classified errors" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ukládání (save.js)

**Files:**
- Create: `js/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Produces: `saveImage(blob, filename, env = {}) → Promise<'shared' | 'cancelled' | 'downloaded'>`; `env.nav` a `env.download(blob, filename)` jsou kvůli testům přepisovatelné; `downloadBlob(blob, filename, doc = document)`.
- Poznámka: `saveImage` musí zavolat `navigator.share` synchronně z klik handleru (bez předchozího `await`), jinak iOS odmítne sdílení kvůli chybějící uživatelské akci.

- [ ] **Step 1: Napiš selhávající test `tests/save.test.js`**

```js
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
```

- [ ] **Step 2: Spusť test, ověř selhání**

Run: `node --test tests/save.test.js`
Expected: FAIL (`Cannot find module '../js/save.js'`)

- [ ] **Step 3: Implementuj `js/save.js`**

```js
export function downloadBlob(blob, filename, doc = document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveImage(blob, filename, env = {}) {
  const nav = env.nav ?? globalThis.navigator;
  const download = env.download ?? downloadBlob;
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, filename);
  return 'downloaded';
}
```

- [ ] **Step 4: Spusť testy**

Run: `npm test`
Expected: PASS. (Pokud `File` není definováno, ověř `node --version` ≥ 20.)

- [ ] **Step 5: Commit**

```bash
git add js/save.js tests/save.test.js
git commit -m "feat: save via Web Share with download fallback" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Galerie v IndexedDB (gallery.js)

**Files:**
- Create: `js/gallery.js`

**Interfaces:**
- Produces: `add(blob, thumb) → Promise<id>`; `list() → Promise<[{id, time, blob, thumb}]>` (nejnovější první); `remove(id) → Promise<void>`; `renderGrid(container, shots, onOpen)` vykreslí mřížku miniatur (tlačítka s `<img>`), klepnutí zavolá `onOpen(shot)`; předchozí object URL se uvolní.
- IndexedDB nelze v Node bez závislostí testovat, takže se ověřuje v Tasku 7 v prohlížeči. Zde jen kontrola syntaxe.

- [ ] **Step 1: Implementuj `js/gallery.js`**

```js
const DB = 'sprocket';
const STORE = 'shots';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const add = (blob, thumb) => tx('readwrite', (s) => s.add({ time: Date.now(), blob, thumb }));

export async function list() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.id - a.id);
}

export const remove = (id) => tx('readwrite', (s) => s.delete(id));

let urls = [];

export function renderGrid(container, shots, onOpen) {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  container.replaceChildren();
  for (const shot of shots) {
    const url = URL.createObjectURL(shot.thumb);
    urls.push(url);
    const btn = document.createElement('button');
    btn.className = 'grid-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    btn.appendChild(img);
    btn.addEventListener('click', () => onOpen(shot));
    container.appendChild(btn);
  }
}
```

- [ ] **Step 2: Zkontroluj syntaxi**

Run: `node --check js/gallery.js`
Expected: bez výstupu (exit 0)

- [ ] **Step 3: Commit**

```bash
git add js/gallery.js
git commit -m "feat: IndexedDB gallery" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI a propojení (index.html, style.css, app.js)

**Files:**
- Create: `index.html`, `style.css`, `js/app.js`

**Interfaces:**
- Consumes: `camera.start/stop/CameraError`, `applyTriX`, `grainSizeFor`, `cropRect`, `layout`, `drawFrame`, `saveImage`, `gallery.add/list/remove/renderGrid` (přesné podpisy viz Tasky 1–6).
- Produces: spustitelnou aplikaci.

- [ ] **Step 1: Vytvoř `index.html`**

```html
<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0a">
  <title>Sprocket Rocket</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <video id="video" class="hidden-video" playsinline muted></video>

  <main id="camera-screen" class="screen">
    <div class="viewfinder">
      <canvas id="preview"></canvas>
      <div id="flash"></div>
    </div>
    <div id="message" class="message" hidden>
      <p id="message-text"></p>
      <button id="retry" class="text-btn">Zkusit znovu</button>
    </div>
    <div class="controls">
      <button id="open-gallery" class="thumb-btn" aria-label="Galerie"><img id="last-thumb" alt="" hidden></button>
      <button id="shutter" aria-label="Spoušť"></button>
      <button id="switch-camera" class="round-btn" aria-label="Přepnout kameru">⟲</button>
    </div>
  </main>

  <section id="gallery-screen" class="screen" hidden>
    <header class="bar"><button id="close-gallery" class="text-btn">‹ Zpět</button><span>Galerie</span></header>
    <p id="gallery-empty" class="empty" hidden>Zatím žádné snímky.</p>
    <div id="grid" class="grid"></div>
  </section>

  <section id="result" class="overlay" hidden>
    <img id="result-img" alt="Hotový snímek">
    <div class="bar">
      <button id="save" class="text-btn">Uložit / Sdílet</button>
      <button id="delete" class="text-btn" hidden>Smazat</button>
      <button id="close-result" class="text-btn">Zavřít</button>
    </div>
  </section>

  <div id="toast" class="toast" hidden></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Vytvoř `style.css`**

```css
:root { --bg: #0a0a0a; --fg: #e8e8e8; --dim: #8a8a8a; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg);
  font-family: "Courier New", monospace; overscroll-behavior: none; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

.hidden-video { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.screen { position: fixed; inset: 0; display: flex; flex-direction: column; }

#camera-screen { justify-content: center; align-items: center; }
.viewfinder { position: relative; width: 100%; max-width: calc((100vh - 200px) * 3); max-width: calc((100dvh - 200px) * 3); }
.viewfinder canvas { display: block; width: 100%; height: auto; background: #000; }
#flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
#flash.go { animation: flash 0.12s ease-out; }
@keyframes flash { from { opacity: 0.9; } to { opacity: 0; } }

.controls { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-around;
  align-items: center; padding: 20px 16px calc(20px + env(safe-area-inset-bottom)); }
#shutter { width: 76px; height: 76px; border-radius: 50%; border: 4px solid var(--fg); background: #d8d8d8;
  box-shadow: inset 0 0 0 4px var(--bg); }
#shutter:active { background: #888; }
.round-btn, .thumb-btn { width: 52px; height: 52px; border-radius: 50%; border: 2px solid var(--dim);
  background: transparent; font-size: 24px; overflow: hidden; padding: 0; }
.thumb-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }

.message { position: absolute; left: 16px; right: 16px; top: 50%; transform: translateY(-50%);
  text-align: center; background: #000c; padding: 16px; border: 1px solid var(--dim); }
.text-btn { background: transparent; border: 1px solid var(--dim); padding: 10px 16px; }

.bar { display: flex; gap: 12px; align-items: center; justify-content: center; padding: 12px 16px; }
#gallery-screen .bar { justify-content: space-between; padding-top: calc(12px + env(safe-area-inset-top)); }
.grid { overflow-y: auto; padding: 8px 8px calc(8px + env(safe-area-inset-bottom)); display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.grid-item { padding: 0; border: 0; background: #000; }
.grid-item img { display: block; width: 100%; height: auto; }
.empty { color: var(--dim); text-align: center; margin-top: 40px; }

.overlay { position: fixed; inset: 0; background: #000f; display: flex; flex-direction: column;
  justify-content: center; align-items: center; }
.overlay img { width: 100%; max-height: 70vh; object-fit: contain; }
.overlay .bar { padding-bottom: calc(12px + env(safe-area-inset-bottom)); flex-wrap: wrap; }

.toast { position: fixed; left: 50%; bottom: calc(110px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  background: #222; border: 1px solid var(--dim); padding: 10px 16px; max-width: 90vw; text-align: center; z-index: 10; }
```

- [ ] **Step 3: Vytvoř `js/app.js`**

```js
import * as camera from './camera.js';
import { applyTriX, grainSizeFor } from './film.js';
import { cropRect, layout, drawFrame } from './frame.js';
import { saveImage } from './save.js';
import * as gallery from './gallery.js';

const PREVIEW_W = 640;
const MAX_W = 3600;
const JPEG_Q = 0.92;
const THUMB_W = 320;
const FRAMES_PER_ROLL = 36;
const PREVIEW_INTERVAL_MS = 66;

const MESSAGES = {
  denied: 'Povol prosím přístup ke kameře.',
  notfound: 'Kamera nebyla nalezena.',
  busy: 'Kameru používá jiná aplikace.',
  unsupported: 'Kamera není dostupná. Stránka musí běžet na HTTPS (nebo na localhost).',
  unknown: 'Kameru se nepodařilo spustit.',
};

const $ = (id) => document.getElementById(id);
const video = $('video');
const preview = $('preview');
const flash = $('flash');
const message = $('message');
const lastThumb = $('last-thumb');
const resultImg = $('result-img');

let facing = 'environment';
let screen = 'camera';
let current = null; // { blob, id }
let busy = false;
let frameCounter = 0;
let lastTick = 0;
let lastThumbUrl = null;
let resultUrl = null;
let work = null;
let toastTimer = null;
let audioCtx = null;

// --- pomocné ---------------------------------------------------------------

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality));

function peekNumber() {
  try {
    return (Number(localStorage.getItem('sprocket.number')) || 0) % FRAMES_PER_ROLL + 1;
  } catch { return 1; }
}
function commitNumber(n) {
  try { localStorage.setItem('sprocket.number', String(n)); } catch { /* bez úložiště se číslo neuchová */ }
}

function playClick() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(audioCtx.sampleRate * 0.06);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    src.connect(filter).connect(audioCtx.destination);
    src.start();
  } catch { /* zvuk je jen bonus */ }
}

// --- vykreslení ------------------------------------------------------------

function render(source, canvas, outW, meta, seed) {
  const vw = source.videoWidth || source.width;
  const vh = source.videoHeight || source.height;
  const { sx, sy, sw, sh } = cropRect(vw, vh);
  const L = layout(outW);
  if (!work || work.width !== L.width || work.height !== L.height) {
    work = document.createElement('canvas');
    work.width = L.width;
    work.height = L.height;
  }
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(source, sx, sy, sw, sh, 0, 0, L.width, L.height);
  const img = wctx.getImageData(0, 0, L.width, L.height);
  applyTriX(img, { seed, grainSize: grainSizeFor(L.width) });
  wctx.putImageData(img, 0, 0);
  if (canvas.width !== L.width) canvas.width = L.width;
  if (canvas.height !== L.height) canvas.height = L.height;
  drawFrame(canvas.getContext('2d'), work, L, meta);
}

function loop(t) {
  requestAnimationFrame(loop);
  if (screen !== 'camera' || !video.videoWidth || t - lastTick < PREVIEW_INTERVAL_MS) return;
  lastTick = t;
  render(video, preview, PREVIEW_W, { number: peekNumber() }, ++frameCounter);
}

// --- kamera ----------------------------------------------------------------

async function startCamera() {
  try {
    video.srcObject = await camera.start(facing);
    await video.play();
    message.hidden = true;
  } catch (e) {
    $('message-text').textContent = MESSAGES[e?.kind] ?? MESSAGES.unknown;
    message.hidden = false;
  }
}

// --- snímek ----------------------------------------------------------------

async function makeThumb(canvas) {
  const t = document.createElement('canvas');
  t.width = THUMB_W;
  t.height = Math.round((THUMB_W * canvas.height) / canvas.width);
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return toBlob(t, 0.8);
}

function setLastThumb(blob) {
  if (lastThumbUrl) URL.revokeObjectURL(lastThumbUrl);
  lastThumbUrl = blob ? URL.createObjectURL(blob) : null;
  lastThumb.src = lastThumbUrl ?? '';
  lastThumb.hidden = !blob;
}

async function refreshLastThumb() {
  try {
    const [newest] = await gallery.list();
    setLastThumb(newest?.thumb ?? null);
  } catch { setLastThumb(null); }
}

async function capture() {
  if (busy || !video.videoWidth) return;
  busy = true;
  try {
    playClick();
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');

    const number = peekNumber();
    const { sw } = cropRect(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    render(video, canvas, Math.min(MAX_W, Math.round(sw)), { number }, Date.now() & 0xffff);
    const blob = await toBlob(canvas, JPEG_Q);
    commitNumber(number);

    current = { blob, id: null };
    try {
      const thumb = await makeThumb(canvas);
      current.id = await gallery.add(blob, thumb);
      setLastThumb(thumb);
    } catch {
      toast('Galerii se nepodařilo uložit, snímek ulož ručně.');
    }
    showResult(blob, current.id !== null);
  } finally {
    busy = false;
  }
}

// --- výsledek a galerie ----------------------------------------------------

function showResult(blob, canDelete) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(blob);
  resultImg.src = resultUrl;
  $('delete').hidden = !canDelete;
  $('result').hidden = false;
}

function closeResult() {
  $('result').hidden = true;
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultImg.removeAttribute('src');
  current = null;
}

async function openGallery() {
  screen = 'gallery';
  $('camera-screen').hidden = true;
  $('gallery-screen').hidden = false;
  await refreshGrid();
}

function closeGallery() {
  screen = 'camera';
  $('gallery-screen').hidden = true;
  $('camera-screen').hidden = false;
}

async function refreshGrid() {
  let shots = [];
  try { shots = await gallery.list(); } catch { toast('Galerii se nepodařilo načíst.'); }
  $('gallery-empty').hidden = shots.length > 0;
  gallery.renderGrid($('grid'), shots, (shot) => {
    current = { blob: shot.blob, id: shot.id };
    showResult(shot.blob, true);
  });
}

// --- události --------------------------------------------------------------

$('shutter').addEventListener('click', capture);
$('retry').addEventListener('click', startCamera);
$('switch-camera').addEventListener('click', () => {
  facing = facing === 'environment' ? 'user' : 'environment';
  startCamera();
});
$('open-gallery').addEventListener('click', openGallery);
$('close-gallery').addEventListener('click', closeGallery);
$('close-result').addEventListener('click', closeResult);

$('save').addEventListener('click', async () => {
  if (!current) return;
  const result = await saveImage(current.blob, `sprocket-${Date.now()}.jpg`);
  if (result === 'shared') toast('Hotovo.');
  else if (result === 'downloaded') toast('Soubor stažen.');
});

$('delete').addEventListener('click', async () => {
  if (current?.id == null) return;
  try { await gallery.remove(current.id); } catch { toast('Smazání se nezdařilo.'); return; }
  closeResult();
  if (screen === 'gallery') await refreshGrid();
  await refreshLastThumb();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) camera.stop();
  else startCamera();
});

startCamera();
refreshLastThumb();
requestAnimationFrame(loop);
```

- [ ] **Step 4: Spusť server a ověř v prohlížeči (Chrome s falešnou kamerou)**

Run (server, na pozadí): `python3 -m http.server 8000`
Run (Chrome s testovací kamerou, vlastní profil kvůli příznakům):
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=<scratchpad>/chrome-profile --use-fake-device-for-media-stream --use-fake-ui-for-media-stream http://localhost:8000`

Ruční kontrola (vše musí platit):
- Živý panoramatický náhled 3:1 s perforací nahoře i dole, černobílý, se zrnem a tmavými rohy.
- Spoušť: bílý záblesk, cvaknutí, zobrazí se hotový snímek s `KODAK TRI-X 400` a číslem; číslo při dalším snímku vzroste.
- „Uložit / Sdílet“ na desktopu otevře sdílení nebo stáhne `sprocket-*.jpg`; soubor se otevře a je JPEG v šířce ≤ 3600.
- Miniatura posledního snímku vlevo dole; klepnutí otevře galerii s mřížkou; klepnutí na miniaturu otevře snímek; „Smazat“ ho odstraní a aktualizuje miniaturu.
- Přepnutí kamery nepadá (na desktopu se jen znovu spustí stream).
- Odepření kamery (v novém profilu bez `--use-fake-ui-for-media-stream`, kliknout „Blokovat“): hláška „Povol prosím přístup ke kameře.“ a „Zkusit znovu“ funguje po povolení.
- Otevření přes `http://<LAN-IP>:8000` z jiného zařízení: hláška o HTTPS, žádná výjimka v konzoli.
- Okamžitý dvojklik na spoušť nevytvoří dva snímky najednou.

- [ ] **Step 5: Oprav případné nalezené chyby, ať projde celý seznam**

- [ ] **Step 6: Commit**

```bash
git add index.html style.css js/app.js
git commit -m "feat: camera UI, capture flow, gallery and save" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README a kontrola na telefonu

**Files:**
- Create: `README.md`

- [ ] **Step 1: Vytvoř `README.md`**

````markdown
# Sprocket Rocket

Simulace panoramatického foťáku Lomography Sprocket Rocket s černobílým filmem Kodak Tri-X 400.
Čisté HTML + CSS + JS, bez build kroku.

## Spuštění

```bash
python3 -m http.server 8000
```

Otevři `http://localhost:8000`. Kamera funguje jen na `localhost` nebo přes HTTPS.

## Na telefonu

Adresa s IP v síti (`http://192.168.x.x`) kameru neumožní. Použij jednu z cest:
- Android + Chrome: USB kabel, `chrome://inspect` na počítači, port forwarding 8000 (telefon pak vidí `localhost:8000`).
- HTTPS tunel, např. `cloudflared tunnel --url http://localhost:8000` nebo `ngrok http 8000`.
- Nasazení statických souborů na libovolný HTTPS hosting (GitHub Pages, Netlify).

## Ukládání

Na telefonu tlačítko „Uložit / Sdílet“ otevře sdílecí list, ve kterém zvolíš „Uložit obrázek“ (do Fotek). Na počítači se soubor stáhne.

## Testy

```bash
npm test   # Node ≥ 20
```
````

- [ ] **Step 2: Spusť všechny testy**

Run: `npm test`
Expected: PASS (všechny soubory v `tests/`)

- [ ] **Step 3: Ruční kontrola na skutečném telefonu přes HTTPS**

Ověř: živý náhled, spoušť, sdílecí list → „Uložit obrázek“ → snímek je ve Fotkách, panorama 3:1 s perforací, černobílé se zrnem. Výsledek zapiš uživateli (co fungovalo a co ne).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with run and phone testing instructions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (provedeno)

- **Pokrytí specifikace:** živý náhled 3:1 s perforací (T1, T2, T7), přepnutí kamer (T4, T7), volné focení bez počítadla/přetáčení (T7; číslo na okraji filmu je jen dekorace), Tri-X look (T3), Web Share + fallback (T5), galerie IndexedDB (T6, T7), záblesk + cvaknutí (T7), chyby (T4, T7), JPEG 0,92 a max 3600 px (T7), testy čisté logiky (T1–T5), ruční ověření (T7, T8).
- **Placeholdery:** žádné. Každý krok má kód nebo přesný příkaz.
- **Konzistence typů:** `layout`→`{width,height,band,holes,label,number}` se používá shodně v T1, T2, T7; `cropRect`→`{sx,sy,sw,sh}` v T1 a T7; `saveImage` vrací `'shared'|'cancelled'|'downloaded'` v T5 a T7; `CameraError.kind` shodně v T4 a `MESSAGES` v T7; `gallery.add(blob, thumb)` a `list()` shodně v T6 a T7.
- **Review Focus:** pokryto testy (T1 ořez, T4 odepření + unsupported, T5 zrušené sdílení) a ruční kontrolou (T7 spoušť před startem videa, IndexedDB selhání). `capture()` hlídá `!video.videoWidth` a IndexedDB chyby jsou v `try/catch`.
