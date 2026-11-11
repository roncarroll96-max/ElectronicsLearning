/**
 * Getting the compiler's files in the browser: a one-time download (about
 * 7 MB) kept in the browser's Cache Storage, so after that the compiler works
 * offline and app updates don't download it again. The files are stored
 * gzipped, exactly as downloaded, and unpacked each time the compiler starts.
 *
 * The cache is named after the files' version (from manifest.json); a new
 * version replaces the old copy once it has fully arrived.
 */
import type { ReadFile } from './toolchain';

export interface Manifest {
  version: string;
  source: string;
  files: { name: string; bytes: number; rawBytes: number }[];
  bytes: number;
  rawBytes: number;
}

const CACHE_PREFIX = 'arduino-compiler-';
const MANIFEST_KEY = 'manifest.json';

function cacheStorage(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' ? caches : null;
  } catch {
    return null; // some private modes refuse access
  }
}

/**
 * The manifest of a copy already stored in full, if any. Entries are stored
 * under their full URLs (base + name): the page and the compiler's thread live
 * at different addresses, so a relative name would mean different things to each.
 */
async function storedManifest(base: string): Promise<{ manifest: Manifest; cache: Cache } | null> {
  const cs = cacheStorage();
  if (!cs) return null;
  try {
    for (const key of await cs.keys()) {
      if (!key.startsWith(CACHE_PREFIX)) continue;
      const cache = await cs.open(key);
      const hit = await cache.match(base + MANIFEST_KEY);
      if (hit) return { manifest: (await hit.json()) as Manifest, cache };
    }
  } catch {
    /* treated as not stored */
  }
  return null;
}

export type DownloadState =
  | { phase: 'unknown' }
  | { phase: 'absent'; bytes: number | null }
  | { phase: 'downloading'; loaded: number; total: number }
  | { phase: 'ready'; bytes: number }
  | { phase: 'error'; message: string };

/** Whether the compiler is stored on this device (no download). */
export async function compilerStatus(base: string): Promise<DownloadState> {
  const stored = await storedManifest(base);
  if (stored) return { phase: 'ready', bytes: stored.manifest.bytes };
  try {
    const res = await fetch(base + MANIFEST_KEY, { cache: 'no-cache' });
    if (res.ok) return { phase: 'absent', bytes: ((await res.json()) as Manifest).bytes };
  } catch {
    /* offline */
  }
  return { phase: 'absent', bytes: null };
}

/** Un-gzip, unless the server already did (gzip files start with 1f 8b). */
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (data[0] !== 0x1f || data[1] !== 0x8b) return data;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok || !res.body) throw new Error(`Couldn’t download ${url.split('/').pop()} (${res.status}).`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Make sure the compiler's files are on this device, downloading what's
 * missing, and return a reader for them. `base` is the URL of the arduino/
 * folder, ending in "/".
 */
export async function ensureCompilerFiles(base: string, onProgress: (loaded: number, total: number) => void): Promise<ReadFile> {
  let manifest: Manifest | null = null;
  try {
    const res = await fetch(base + MANIFEST_KEY, { cache: 'no-cache' });
    if (res.ok) manifest = (await res.json()) as Manifest;
  } catch {
    /* offline: use the stored copy */
  }
  const stored = await storedManifest(base);
  if (!manifest) {
    if (!stored) throw new Error('The Arduino compiler hasn’t been downloaded yet, and this device is offline. Connect to the internet once to download it.');
    manifest = stored.manifest;
  }

  const cs = cacheStorage();
  const cache = cs ? await cs.open(CACHE_PREFIX + manifest.version) : null;
  const files = new Map<string, Uint8Array>();
  let loaded = 0;
  onProgress(0, manifest.bytes);
  await Promise.all(
    manifest.files.map(async (f) => {
      const url = base + f.name;
      const hit = cache ? await cache.match(url) : undefined;
      let data: Uint8Array;
      if (hit) {
        data = new Uint8Array(await hit.arrayBuffer());
        loaded += f.bytes;
        onProgress(loaded, manifest.bytes);
      } else {
        data = await fetchWithProgress(url, (n) => {
          loaded += n;
          onProgress(Math.min(loaded, manifest.bytes), manifest.bytes);
        });
        if (cache) await cache.put(url, new Response(data as BodyInit, { headers: { 'Content-Type': 'application/octet-stream' } }));
      }
      files.set(f.name.replace(/\.gz$/, ''), data);
    }),
  );
  if (cache && cs) {
    // The manifest goes in last: it marks this copy as complete. Then drop older copies.
    await cache.put(base + MANIFEST_KEY, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
    for (const key of await cs.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + manifest.version) await cs.delete(key);
    }
  }
  onProgress(manifest.bytes, manifest.bytes);

  return async (name: string) => {
    const data = files.get(name);
    if (!data) throw new Error(`The compiler file ${name} is missing.`);
    return gunzip(data);
  };
}

/** Remove the stored compiler (it will download again next time it's needed). */
export async function removeCompilerFiles(): Promise<void> {
  const cs = cacheStorage();
  if (!cs) return;
  for (const key of await cs.keys()) if (key.startsWith(CACHE_PREFIX)) await cs.delete(key);
}
