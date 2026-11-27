import { getApps } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const FSMEDIA_PREFIX = 'fsmedia://';

const IDB_NAME = 'edutest_media_cache_v1';
const IDB_STORE = 'assets';
const MAX_FIRESTORE_DATAURL_CHARS = 720_000;

const memoryAssetCache = new Map<string, string>();
const contentHashUriCache = new Map<string, string>();
const pendingFetchPromises = new Map<string, Promise<string | null>>();

let dbProviderFn: (() => { db: Firestore; auth: Auth }) | null = null;

export function registerMediaFirestoreProvider(
  provider: () => { db: Firestore; auth: Auth }
): void {
  dbProviderFn = provider;
}

function getFirestoreAndAuth(): { db: Firestore | null; auth: Auth | null } {
  try {
    if (dbProviderFn) {
      return dbProviderFn();
    }
    const apps = getApps();
    if (apps.length === 0) return { db: null, auth: null };
    return {
      db: getFirestore(apps[0], firebaseConfig.firestoreDatabaseId),
      auth: getAuth(apps[0]),
    };
  } catch {
    return { db: null, auth: null };
  }
}

export function isFirestoreMediaUri(src?: string | null): boolean {
  if (typeof src !== 'string') return false;
  return src.trim().startsWith(FSMEDIA_PREFIX);
}

export function extractFirestoreMediaId(src?: string | null): string | null {
  if (!isFirestoreMediaUri(src)) return null;
  const rawId = String(src || '')
    .trim()
    .slice(FSMEDIA_PREFIX.length)
    .split(/[?#]/)[0]
    .trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawId)) return null;
  return rawId;
}

export function resolveMediaSrcSync(src?: string | null): string | undefined {
  if (typeof src !== 'string') return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;
  const assetId = extractFirestoreMediaId(trimmed);
  if (!assetId) return trimmed;
  return memoryAssetCache.get(assetId);
}

function openMediaIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          }
        } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readAssetFromIdb(assetId: string): Promise<string | null> {
  const idb = await openMediaIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(assetId);
      req.onsuccess = () => {
        const val = req.result?.dataUrl;
        resolve(typeof val === 'string' && val.startsWith('data:image/') ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeAssetToIdb(assetId: string, dataUrl: string): Promise<void> {
  const idb = await openMediaIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ id: assetId, dataUrl, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function fastStringHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  const step = input.length > 4000 ? Math.floor(input.length / 2000) : 1;
  for (let i = 0; i < input.length; i += step) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

function parseDataUrlMime(dataUrl: string): string {
  const m = /^data:([^;]+);base64,/i.exec(dataUrl.trim());
  return (m?.[1] || '').toLowerCase();
}

async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function compressDataUrlForFirestoreMedia(
  rawDataUrl: string,
  maxChars: number = MAX_FIRESTORE_DATAURL_CHARS
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (typeof rawDataUrl !== 'string') return null;
  const trimmed = rawDataUrl.trim();
  if (!/^data:image\/[^;]+;base64,/i.test(trimmed)) return null;

  let mimeType = parseDataUrlMime(trimmed);
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

  // If already valid raster MIME & within byte limit, keep crisp quality without re-encoding
  if (ALLOWED_IMAGE_MIMES.has(mimeType) && trimmed.length <= maxChars) {
    return { dataUrl: trimmed, mimeType };
  }

  if (typeof document === 'undefined') return null;
  const img = await loadImageElement(trimmed);
  if (!img) return null;

  const origW = Math.max(1, img.naturalWidth || img.width || 800);
  const origH = Math.max(1, img.naturalHeight || img.height || 600);

  // Rasterize SVG to PNG first if small enough, otherwise progressive JPEG/WebP scaling
  const attempts: { maxDim: number; quality: number; outMime: string }[] = mimeType.includes('svg')
    ? [
        { maxDim: 1400, quality: 0.92, outMime: 'image/png' },
        { maxDim: 1200, quality: 0.86, outMime: 'image/webp' },
        { maxDim: 960, quality: 0.76, outMime: 'image/jpeg' },
        { maxDim: 720, quality: 0.65, outMime: 'image/jpeg' },
      ]
    : [
        { maxDim: 1400, quality: 0.85, outMime: 'image/jpeg' },
        { maxDim: 1200, quality: 0.78, outMime: 'image/jpeg' },
        { maxDim: 960, quality: 0.7, outMime: 'image/jpeg' },
        { maxDim: 760, quality: 0.6, outMime: 'image/jpeg' },
        { maxDim: 560, quality: 0.5, outMime: 'image/jpeg' },
      ];

  for (const att of attempts) {
    let w = origW;
    let h = origH;
    if (w > att.maxDim || h > att.maxDim) {
      if (w >= h) {
        h = Math.max(1, Math.round((h * att.maxDim) / w));
        w = att.maxDim;
      } else {
        w = Math.max(1, Math.round((w * att.maxDim) / h));
        h = att.maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    if (att.outMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const encoded = canvas.toDataURL(att.outMime, att.quality);
      if (encoded.length <= maxChars && ALLOWED_IMAGE_MIMES.has(att.outMime)) {
        return { dataUrl: encoded, mimeType: att.outMime };
      }
    } catch {}
  }

  return null;
}

export async function uploadImageAssetToFirestore(
  rawDataUrl: string,
  options?: {
    fileName?: string;
    visibility?: 'public' | 'authenticated';
  }
): Promise<string | null> {
  const prepared = await compressDataUrlForFirestoreMedia(rawDataUrl);
  if (!prepared) return null;

  const { db, auth } = getFirestoreAndAuth();
  const user = auth?.currentUser;
  if (!db || !user || user.isAnonymous) {
    return null;
  }

  const uidTag = user.uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'u';
  const contentSig = `${uidTag}_${fastStringHash(prepared.dataUrl)}_${prepared.dataUrl.length.toString(36)}`;
  const cachedUri = contentHashUriCache.get(contentSig);
  if (cachedUri) {
    return cachedUri;
  }

  const assetId = `ma_${contentSig}`.slice(0, 120);
  const fsUri = `${FSMEDIA_PREFIX}${assetId}`;

  // Optimistically cache in memory + IndexedDB right away for instant UI display
  memoryAssetCache.set(assetId, prepared.dataUrl);
  contentHashUriCache.set(contentSig, fsUri);
  void writeAssetToIdb(assetId, prepared.dataUrl);

  const approxBytes = Math.round((prepared.dataUrl.length * 3) / 4);
  const payload: Record<string, any> = {
    id: assetId,
    mimeType: prepared.mimeType,
    dataUrl: prepared.dataUrl,
    sizeBytes: approxBytes,
    ownerUid: user.uid,
    visibility: options?.visibility || 'public',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const cleanFileName = String(options?.fileName || '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 190);
  if (cleanFileName) {
    payload.fileName = cleanFileName;
  }
  const cleanEmail = (user.email || '').trim().toLowerCase().slice(0, 180);
  if (cleanEmail) {
    payload.ownerEmail = cleanEmail;
  }

  try {
    await setDoc(doc(db, 'mediaAssets', assetId), payload, { merge: true });
    return fsUri;
  } catch (err) {
    console.warn('[mediaAssets] Firestore media upload fallback:', err);
    return null;
  }
}

export async function resolveFirestoreMediaUrlAsync(src?: string | null): Promise<string | null> {
  if (typeof src !== 'string' || !src.trim()) return null;
  const trimmed = src.trim();
  const assetId = extractFirestoreMediaId(trimmed);
  if (!assetId) return trimmed;

  const fromMem = memoryAssetCache.get(assetId);
  if (fromMem) return fromMem;

  const existingPromise = pendingFetchPromises.get(assetId);
  if (existingPromise) return await existingPromise;

  const fetchTask = (async (): Promise<string | null> => {
    try {
      const fromIdb = await readAssetFromIdb(assetId);
      if (fromIdb) {
        memoryAssetCache.set(assetId, fromIdb);
        return fromIdb;
      }

      const { db } = getFirestoreAndAuth();
      if (!db) return null;

      const snap = await getDoc(doc(db, 'mediaAssets', assetId));
      if (!snap.exists()) return null;
      const dataUrl = snap.data()?.dataUrl;
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        memoryAssetCache.set(assetId, dataUrl);
        void writeAssetToIdb(assetId, dataUrl);
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingFetchPromises.delete(assetId);
    }
  })();

  pendingFetchPromises.set(assetId, fetchTask);
  return await fetchTask;
}

/**
 * Fetches a legacy `/api/files/...` image from the currently reachable origin and promotes it
 * into Cloud Firestore (`mediaAssets`) so mobile/tablet/shared URL devices can load it forever.
 */
export async function promoteLocalUploadUrlToFirestoreMedia(
  url?: string | null
): Promise<string | null> {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || isFirestoreMediaUri(trimmed)) return null;
  if (!trimmed.startsWith('/api/files/')) return null;

  const { auth } = getFirestoreAndAuth();
  if (!auth?.currentUser || auth.currentUser.isAnonymous) return null;

  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const blob = await res.blob();
    if (blob.size <= 0 || blob.size > 6 * 1024 * 1024) return null;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;

    const fileName = trimmed.split('/').pop() || 'migrated_image.png';
    return await uploadImageAssetToFirestore(dataUrl, {
      fileName,
      visibility: 'public',
    });
  } catch {
    return null;
  }
}

export function seedMemoryMediaCache(assetId: string, dataUrl: string): void {
  if (!assetId || !dataUrl) return;
  memoryAssetCache.set(assetId, dataUrl);
  void writeAssetToIdb(assetId, dataUrl);
}
