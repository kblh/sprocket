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
