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
