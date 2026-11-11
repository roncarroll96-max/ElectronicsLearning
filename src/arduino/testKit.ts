/**
 * For tests: the Arduino compiler loaded from the prepared files in
 * public/arduino (made by scripts/prepare-arduino.mjs before the tests run),
 * and a helper that compiles a sketch or fails the test with its errors.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compileSketch, loadToolkit, type CompileResult, type Toolkit } from './toolchain';

let kit: Promise<Toolkit> | null = null;

export function testToolkit(): Promise<Toolkit> {
  const dir = new URL('../../public/arduino/', import.meta.url);
  kit ??= loadToolkit(async (name) => new Uint8Array(gunzipSync(readFileSync(new URL(name + '.gz', dir)))));
  return kit;
}

export function mustCompile(r: CompileResult): Extract<CompileResult, { ok: true }> {
  if (!r.ok) throw new Error('compile failed:\n' + r.diagnostics.map((d) => `${d.line ?? '-'}: ${d.message}`).join('\n'));
  return r;
}

/** Compile a sketch to its flash image. */
export async function program(source: string): Promise<Uint8Array> {
  return mustCompile(await compileSketch(await testToolkit(), source)).program;
}
