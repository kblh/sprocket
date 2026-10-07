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

export async function start(facingMode = 'environment', nav = globalThis.navigator) {
  stop();
  if (!nav?.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'getUserMedia is not available');
  }
  const gen = generation;
  let s;
  try {
    s = await nav.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    if (gen !== generation) throw new CameraError('superseded', 'start superseded');
    throw new CameraError(classifyError(e), e?.message ?? String(e));
  }
  if (gen !== generation) {
    s.getTracks().forEach((t) => t.stop());
    throw new CameraError('superseded', 'start superseded');
  }
  stream = s;
  return s;
}
