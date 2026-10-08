import * as camera from './camera.js';
import { applyTriX, grainSizeFor } from './film.js';
import { cropRect, layout, drawFrame, canvasSize, outputLong } from './frame.js';
import { saveImage } from './save.js';
import * as gallery from './gallery.js';

const PREVIEW_W = 640;
const MAX_W = 3600;
const JPEG_Q = 0.92;
const ORIENT_ICONS = { landscape: '▭', portrait: '▯' };
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
let orientation = loadOrientation();
let framed = null;
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

function loadOrientation() {
  try { return localStorage.getItem('sprocket.orientation') === 'portrait' ? 'portrait' : 'landscape'; } catch { return 'landscape'; }
}
function applyOrientation() {
  $('viewfinder').classList.toggle('portrait', orientation === 'portrait');
  $('orientation').textContent = ORIENT_ICONS[orientation];
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

function render(source, canvas, outLong, meta, seed, orient) {
  const vw = source.videoWidth || source.width;
  const vh = source.videoHeight || source.height;
  const portrait = orient === 'portrait';
  const { sx, sy, sw, sh } = cropRect(vw, vh, orient);
  const L = layout(outLong);
  if (!work || work.width !== L.width || work.height !== L.height) {
    work = document.createElement('canvas');
    work.width = L.width;
    work.height = L.height;
  }
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.save();
  if (portrait) {
    wctx.translate(0, L.height);
    wctx.rotate(-Math.PI / 2);
    wctx.drawImage(source, sx, sy, sw, sh, 0, 0, L.height, L.width);
  } else {
    wctx.drawImage(source, sx, sy, sw, sh, 0, 0, L.width, L.height);
  }
  wctx.restore();
  const img = wctx.getImageData(0, 0, L.width, L.height);
  applyTriX(img, { seed, grainSize: grainSizeFor(L.width) });
  wctx.putImageData(img, 0, 0);

  const size = canvasSize(L, orient);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  if (!portrait) {
    drawFrame(canvas.getContext('2d'), work, L, meta);
    return;
  }
  if (!framed || framed.width !== L.width || framed.height !== L.height) {
    framed = document.createElement('canvas');
    framed.width = L.width;
    framed.height = L.height;
  }
  drawFrame(framed.getContext('2d'), work, L, meta);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(L.height, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(framed, 0, 0);
  ctx.restore();
}

function loop(t) {
  requestAnimationFrame(loop);
  if (screen !== 'camera' || !video.videoWidth || t - lastTick < PREVIEW_INTERVAL_MS) return;
  lastTick = t;
  render(video, preview, PREVIEW_W, { number: peekNumber() }, ++frameCounter, orientation);
}

// --- kamera ----------------------------------------------------------------

async function startCamera() {
  try {
    video.srcObject = await camera.start(facing);
    await video.play();
    message.hidden = true;
  } catch (e) {
    if (e?.kind === 'superseded' || e?.name === 'AbortError') return;
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
  if (lastThumbUrl) lastThumb.src = lastThumbUrl;
  else lastThumb.removeAttribute('src');
  lastThumb.hidden = !blob;
  $('gallery-icon').hidden = !!blob;
}

async function refreshLastThumb() {
  try {
    const [newest] = await gallery.list();
    setLastThumb(newest?.thumb ?? null);
  } catch { setLastThumb(null); }
}

function capture() {
  if (!video.videoWidth) return;
  playClick();
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  const number = peekNumber();
  const crop = cropRect(video.videoWidth, video.videoHeight, orientation);
  const canvas = document.createElement('canvas');
  render(video, canvas, outputLong(crop, orientation, MAX_W), { number }, Date.now() & 0xffff, orientation);
  commitNumber(number);
  persistShot(canvas).catch(() => toast('Snímek se nepodařilo uložit.'));
}

async function persistShot(canvas) {
  const blob = await toBlob(canvas, JPEG_Q);
  let thumb = null;
  try {
    thumb = await makeThumb(canvas);
    await gallery.add(blob, thumb);
    setLastThumb(thumb);
    toast('Snímek uložen do galerie.');
  } catch {
    current = { blob, id: null };
    toast('Galerii se nepodařilo uložit, snímek ulož ručně.');
    showResult(blob, false);
  } finally {
    canvas.width = canvas.height = 0;
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
$('orientation').addEventListener('click', () => {
  orientation = orientation === 'portrait' ? 'landscape' : 'portrait';
  try { localStorage.setItem('sprocket.orientation', orientation); } catch { /* jen pohodlí */ }
  applyOrientation();
});
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

applyOrientation();
startCamera();
refreshLastThumb();
requestAnimationFrame(loop);
