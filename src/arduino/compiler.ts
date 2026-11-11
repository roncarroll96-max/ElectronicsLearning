/**
 * The page's side of the Arduino compiler: one background thread, started on
 * first use, plus a small store of its download state for the UI.
 *
 *   compile(source)       → Promise<CompileResult> (downloads the compiler first if needed)
 *   prepareCompiler()     → start the one-time download now
 *   useCompilerState()    → React hook: absent / downloading / ready / error
 */
import { useEffect, useSyncExternalStore } from 'react';
import { compilerStatus, removeCompilerFiles, type DownloadState } from './assets';
import type { FromCompiler, ToCompiler } from './compileWorker';
import type { CompileResult } from './toolchain';

export type { CompileResult } from './toolchain';
export type { DownloadState } from './assets';

/** Where the prepared compiler files are served from (public/arduino/). */
function base(): string {
  return new URL('arduino/', document.baseURI).href;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (r: CompileResult) => void>();

let state: DownloadState = { phase: 'unknown' };
const listeners = new Set<() => void>();
function setState(s: DownloadState) {
  state = s;
  listeners.forEach((l) => l());
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./compileWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<FromCompiler>) => {
    const m = e.data;
    if (m.type === 'progress') {
      // A stored copy "loads" in a blink: only show progress for a real download.
      if (state.phase !== 'ready') setState({ phase: 'downloading', loaded: m.loaded, total: m.total });
    } else if (m.type === 'ready') {
      if (state.phase !== 'ready') setState({ phase: 'ready', bytes: state.phase === 'downloading' ? state.total : 0 });
    } else if (m.type === 'failed') {
      setState({ phase: 'error', message: m.message });
    } else if (m.type === 'result') {
      waiting.get(m.id)?.(m.result);
      waiting.delete(m.id);
    }
  };
  w.onerror = () => {
    setState({ phase: 'error', message: 'The compiler stopped unexpectedly. Reload the page to try again.' });
    for (const done of waiting.values()) done({ ok: false, ms: 0, diagnostics: [{ severity: 'error', message: 'The compiler stopped unexpectedly.' }] });
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

function send(m: ToCompiler) {
  getWorker().postMessage(m);
}

/** Start getting the compiler ready (the one-time download, if it hasn't happened). */
export function prepareCompiler(): void {
  if (state.phase === 'error') setState({ phase: 'unknown' });
  send({ type: 'prepare', base: base() });
}

/** Compile a sketch for the Arduino Uno. */
export function compile(source: string): Promise<CompileResult> {
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    send({ type: 'compile', id, base: base(), source });
  });
}

/** Delete the stored compiler from this device. */
export async function forgetCompiler(): Promise<void> {
  worker?.terminate();
  worker = null;
  await removeCompilerFiles();
  setState(await compilerStatus(base()));
}

let checked = false;
async function check() {
  if (checked) return;
  checked = true;
  const s = await compilerStatus(base());
  if (state.phase === 'unknown') setState(s);
}

/** The compiler's download state, kept up to date. */
export function useCompilerState(): DownloadState {
  useEffect(() => {
    void check();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
