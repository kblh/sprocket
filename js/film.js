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
