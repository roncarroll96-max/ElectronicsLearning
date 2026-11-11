/**
 * The background thread the Arduino compiler runs in, so compiling never
 * freezes the page. The page asks it to get ready (downloading the compiler
 * the first time) and to compile sketches; it answers with progress and results.
 */
import { ensureCompilerFiles } from './assets';
import { compileSketch, loadToolkit, type CompileResult, type Toolkit } from './toolchain';

export type ToCompiler = { type: 'prepare'; base: string } | { type: 'compile'; id: number; base: string; source: string };

export type FromCompiler =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'result'; id: number; result: CompileResult };

const post = (self as unknown as { postMessage(m: FromCompiler, transfer?: Transferable[]): void }).postMessage.bind(self);

let kit: Promise<Toolkit> | null = null;

function prepare(base: string): Promise<Toolkit> {
  if (!kit) {
    kit = ensureCompilerFiles(base, (loaded, total) => post({ type: 'progress', loaded, total }))
      .then(loadToolkit)
      .then((k) => {
        post({ type: 'ready' });
        return k;
      });
    kit.catch((e: unknown) => {
      kit = null; // allow another try
      post({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
    });
  }
  return kit;
}

// Builds run one at a time, in order.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<ToCompiler>) => {
  const msg = e.data;
  if (msg.type === 'prepare') {
    prepare(msg.base).catch(() => {});
  } else if (msg.type === 'compile') {
    queue = queue.then(async () => {
      let result: CompileResult;
      try {
        result = await compileSketch(await prepare(msg.base), msg.source);
      } catch (err) {
        result = { ok: false, ms: 0, diagnostics: [{ severity: 'error', message: err instanceof Error ? err.message : String(err) }] };
      }
      post({ type: 'result', id: msg.id, result }, result.ok ? [result.program.buffer] : []);
    });
  }
};
