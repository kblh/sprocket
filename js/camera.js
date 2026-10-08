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
let generation = 0;

export function stop() {
  generation++;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export function pickWideDeviceId(devices) {
  const wide = devices.find(
    (d) => d.kind === 'videoinput' && /ultra/i.test(d.label) && !/front|přední|user|facetime/i.test(d.label),
  );
  return wide ? wide.deviceId : null;
}

export async function applyMinZoom(track) {
  try {
    const zoom = track?.getCapabilities?.().zoom;
    if (!zoom || !(zoom.min < 1)) return null;
    await track.applyConstraints({ advanced: [{ zoom: zoom.min }] });
    return zoom.min;
  } catch {
    return null;
  }
}

const sizeHint = { width: { ideal: 4096 }, height: { ideal: 3072 } };

export async function start(facingMode = 'environment', nav = globalThis.navigator) {
  stop();
  if (!nav?.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'getUserMedia is not available');
  }
  const gen = generation;
  const superseded = () => new CameraError('superseded', 'start superseded');
  const open = (video) => nav.mediaDevices.getUserMedia({ audio: false, video });
  const release = (s) => s.getTracks().forEach((t) => t.stop());

  let s;
  try {
    s = await open({ facingMode: { ideal: facingMode }, ...sizeHint });
  } catch (e) {
    if (gen !== generation) throw superseded();
    throw new CameraError(classifyError(e), e?.message ?? String(e));
  }
  if (gen !== generation) {
    release(s);
    throw superseded();
  }

  if (facingMode === 'environment') {
    let wideId = null;
    try {
      wideId = pickWideDeviceId((await nav.mediaDevices.enumerateDevices?.()) ?? []);
    } catch { /* bez seznamu zařízení zůstane běžná kamera */ }
    if (gen !== generation) {
      release(s);
      throw superseded();
    }
    const current = s.getVideoTracks?.()[0]?.getSettings?.().deviceId;
    if (wideId && wideId !== current) {
      release(s);
      try {
        s = await open({ deviceId: { exact: wideId }, ...sizeHint });
      } catch {
        try {
          s = await open({ facingMode: { ideal: facingMode }, ...sizeHint });
        } catch (e) {
          if (gen !== generation) throw superseded();
          throw new CameraError(classifyError(e), e?.message ?? String(e));
        }
      }
      if (gen !== generation) {
        release(s);
        throw superseded();
      }
    }
    await applyMinZoom(s.getVideoTracks?.()[0]);
    if (gen !== generation) {
      release(s);
      throw superseded();
    }
  }

  stream = s;
  return s;
}
