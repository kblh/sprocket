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
