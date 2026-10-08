export const ASPECT = 2.2;

export function cropRect(vw, vh, orientation = 'landscape') {
  if (orientation === 'portrait') {
    const sw = Math.min(vw, vh / ASPECT);
    const sh = sw * ASPECT;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
  }
  const sh = Math.min(vh, vw / ASPECT);
  const sw = sh * ASPECT;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

export function canvasSize(L, orientation) {
  return orientation === 'portrait'
    ? { width: L.height, height: L.width }
    : { width: L.width, height: L.height };
}

export function outputLong(crop, orientation, max = 3600) {
  const long = orientation === 'portrait' ? crop.sh : crop.sw;
  return Math.min(max, Math.round(long));
}

export function layout(width) {
  const height = Math.round(width / ASPECT);
  const holeH = Math.round(height * 0.0825);
  const holeW = Math.round(holeH * 0.72);
  const pitch = Math.round(holeW * 2.33);
  const r = Math.round(holeW * 0.15);
  const topY = Math.round(height * 0.0385);
  const bottomY = Math.round(height * 0.935) - holeH;
  const count = Math.max(0, Math.floor((width - holeW) / pitch) + 1);
  const startX = Math.round((width - ((count - 1) * pitch + holeW)) / 2);
  const holes = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * pitch;
    holes.push({ x, y: topY, w: holeW, h: holeH, r });
    holes.push({ x, y: bottomY, w: holeW, h: holeH, r });
  }
  return {
    width, height, holes,
    text: {
      y: Math.round(height * 0.985),
      bigSize: Math.round(height * 0.065),
      smallSize: Math.round(height * 0.048),
      xs: {
        n0: Math.round(width * 0.153),
        a0: Math.round(width * 0.39),
        n1: Math.round(width * 0.655),
        a1: Math.round(width * 0.8),
      },
    },
  };
}

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

  ctx.fillStyle = '#050505';
  ctx.beginPath();
  for (const hole of L.holes) roundedRect(ctx, hole);
  ctx.fill();

  const n = meta.number ?? 1;
  const next = (n % 36) + 1;
  const { y, bigSize, smallSize, xs } = L.text;
  ctx.fillStyle = '#f2f2f2';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `bold ${bigSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(`${n}`, xs.n0, y);
  ctx.fillText(`${next}`, xs.n1, y);
  ctx.font = `bold ${smallSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(`▶${n}A`, xs.a0, y);
  ctx.fillText(`▶${next}A`, xs.a1, y);
}
