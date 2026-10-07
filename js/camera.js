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
