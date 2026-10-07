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
  if (lastThumbUrl) lastThumb.src = lastThumbUrl;
  else lastThumb.removeAttribute('src');
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
