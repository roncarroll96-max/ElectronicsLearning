/**
 * The Arduino compiler, running entirely in this page: real avr-gcc 7.3.0 (the
 * compiler the Arduino IDE uses for the Uno), the GNU assembler and linker, and
 * objcopy, each built for WebAssembly, with avr-libc 2.0.0 and the Arduino AVR
 * core. Nothing is sent anywhere.
 *
 * A build runs the same four steps the IDE runs for a sketch:
 *   sketch → C++ (prepareSketch) → cc1plus → assembler → linker → objcopy → HEX
 * with the IDE's Uno settings (-Os, gnu++11, no exceptions, --gc-sections, the
 * core as an archive so only the parts a sketch uses are linked).
 *
 * This module is environment-neutral: it runs in the compiler's background
 * thread in the browser and in Node for the tests. Getting the files is the
 * caller's job (see assets.ts).
 */
import { parseCompilerOutput, parseLinkerOutput, type Diagnostic } from './diagnostics';
import { hexToFlash, programSize, UNO_FLASH_BYTES, UNO_RAM_BYTES } from './elf';
import { prepareSketch, SKETCH_FILE } from './sketch';

export const TOOL_NAMES = ['cc1plus', 'as', 'ld', 'objcopy'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** What an Emscripten tool module gives back once started. */
interface EmModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string, opts?: { encoding: 'utf8' }): Uint8Array;
    analyzePath(path: string): { exists: boolean };
  };
  callMain(args: string[]): number | undefined;
}
type EmFactory = (opts: Record<string, unknown>) => Promise<EmModule>;

export interface Toolkit {
  tools: Record<ToolName, { factory: EmFactory; module: WebAssembly.Module }>;
  /** Headers, libraries and the linker script, by absolute path in the tools' file system. */
  sdk: Map<string, Uint8Array>;
}

/** Reads one of the prepared files (already un-gzipped) by its name in manifest.json, without ".gz". */
export type ReadFile = (name: string) => Promise<Uint8Array>;

/**
 * Start a tool's JavaScript loader without `import()`: the loader is an
 * Emscripten ES module whose only module features are `import.meta.url` and
 * `export default`, so it can be run as a function. This works the same in a
 * browser thread and in Node, and needs no file URL.
 */
function factoryFromLoader(source: string, name: string): EmFactory {
  const body = source.replace(/import\.meta\.url/g, '__loaderUrl').replace(/export\s+default\s+Module\s*;?\s*$/m, 'return Module;');
  if (body === source || !/return Module;/.test(body)) throw new Error(`The ${name} loader is not in the expected form.`);
  return new Function('__loaderUrl', body)(`https://arduino.invalid/tools/${name}.mjs`) as EmFactory;
}

/** Unpack uno-sdk.pack ("ETPK", u32 LE index length, JSON index, bytes). */
export function unpackSdk(pack: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
  if (String.fromCharCode(...pack.subarray(0, 4)) !== 'ETPK') throw new Error('uno-sdk.pack is damaged.');
  const indexLength = dv.getUint32(4, true);
  const index = JSON.parse(new TextDecoder().decode(pack.subarray(8, 8 + indexLength))) as { p: string; o: number; n: number }[];
  const data = 8 + indexLength;
  return new Map(index.map((e) => [e.p, pack.subarray(data + e.o, data + e.o + e.n)]));
}

/** Load and prepare every tool (the WebAssembly is compiled once and reused for every build). */
export async function loadToolkit(read: ReadFile): Promise<Toolkit> {
  const dec = new TextDecoder();
  const [sdkPack, ...toolFiles] = await Promise.all([
    read('uno-sdk.pack'),
    ...TOOL_NAMES.flatMap((t) => [read(`tools/${t}.mjs`), read(`tools/${t}.wasm`)]),
  ]);
  const tools = {} as Toolkit['tools'];
  await Promise.all(
    TOOL_NAMES.map(async (t, i) => {
      const loader = toolFiles[i * 2];
      const wasm = toolFiles[i * 2 + 1];
      tools[t] = { factory: factoryFromLoader(dec.decode(loader), t), module: await WebAssembly.compile(wasm as BufferSource) };
    }),
  );
  return { tools, sdk: unpackSdk(sdkPack) };
}

export type CompileResult =
  | {
      ok: true;
      /** Intel HEX, exactly what would be uploaded to a real Uno. */
      hex: string;
      /** The 32 KB flash image the emulator runs. */
      program: Uint8Array;
      flashBytes: number;
      ramBytes: number;
      /** Warnings, if any. */
      diagnostics: Diagnostic[];
      ms: number;
    }
  | { ok: false; diagnostics: Diagnostic[]; ms: number };

/** The Uno's compiler settings, as the Arduino IDE (AVR core 1.8) passes them. */
const COMPILE_ARGS = [
  '-quiet',
  '-imultilib', 'avr5',
  '-D__AVR_ATmega328P__',
  '-D__AVR_DEVICE_NAME__=atmega328p',
  '-DF_CPU=16000000L',
  '-DARDUINO=10819',
  '-DARDUINO_AVR_UNO',
  '-DARDUINO_ARCH_AVR',
  '-isystem', '/sysroot/gcc/include',
  '-isystem', '/sysroot/avr/include',
  '-I', '/arduino/core',
  '-I', '/arduino/variant',
  '/build/sketch.ino.cpp',
  '-mn-flash=1',
  '-mno-skip-bug',
  '-dumpbase', 'sketch.ino.cpp',
  '-mmcu=avr5',
  '-auxbase-strip', '/build/sketch.s',
  '-Os',
  '-w',
  '-std=gnu++11',
  '-fpermissive',
  '-fno-exceptions',
  '-fno-threadsafe-statics',
  '-fno-rtti',
  '-fno-enforce-eh-specs',
  '-ffunction-sections',
  '-fdata-sections',
  '-fno-diagnostics-show-caret',
  '-o', '/build/sketch.s',
];

const LINK_ARGS = [
  '-m', 'avr5',
  // SRAM starts at 0x100 on the ATmega328P (0x60-0xFF are I/O registers). The
  // gcc driver passes this for the chip; calling ld directly, we must.
  '-Tdata=0x800100',
  '--gc-sections',
  '-o', '/build/sketch.elf',
  '/libs/crtatmega328p.o',
  '/build/sketch.o',
  '-L/libs',
  '--start-group', '-lcore', '-lm', '-lc', '-lgcc', '--end-group',
];

function ensureDir(fs: EmModule['FS'], dir: string) {
  let cur = '';
  for (const part of dir.split('/').filter(Boolean)) {
    cur += '/' + part;
    if (!fs.analyzePath(cur).exists) fs.mkdir(cur);
  }
}

function put(fs: EmModule['FS'], path: string, data: Uint8Array | string) {
  ensureDir(fs, path.slice(0, path.lastIndexOf('/')));
  fs.writeFile(path, data);
}

/** Run one tool on fresh memory; returns its output file (or null) and what it printed. */
async function runTool(
  kit: Toolkit,
  name: ToolName,
  args: string[],
  inputs: [string, Uint8Array | string][],
  output: string,
): Promise<{ out: Uint8Array | null; log: string; status: number }> {
  const lines: string[] = [];
  const { factory, module } = kit.tools[name];
  const mod = await factory({
    noInitialRun: true,
    print: (s: string) => lines.push(s),
    printErr: (s: string) => lines.push(s),
    locateFile: (p: string) => p,
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
      WebAssembly.instantiate(module, imports).then((inst) => done(inst, module));
      return {};
    },
  });
  for (const [path, data] of inputs) put(mod.FS, path, data);
  let status = 0;
  try {
    // A copy: callMain puts the program name at the front of the array it's given.
    status = mod.callMain([...args]) ?? 0;
  } catch (e) {
    const s = (e as { status?: unknown }).status;
    if (typeof s === 'number') status = s;
    else throw new Error(`The ${name} step crashed: ${String((e as Error)?.message ?? e)}`);
  }
  const out = mod.FS.analyzePath(output).exists ? mod.FS.readFile(output) : null;
  return { out, log: lines.join('\n'), status };
}

/** Compile a sketch for the Arduino Uno. */
export async function compileSketch(kit: Toolkit, source: string): Promise<CompileResult> {
  const t0 = performance.now();
  const done = (r: Omit<Extract<CompileResult, { ok: false }>, 'ms'>): CompileResult => ({ ...r, ms: performance.now() - t0 });
  const { code } = prepareSketch(source);

  const headers = [...kit.sdk].filter(([p]) => !p.startsWith('/libs/') && !p.startsWith('/ldscripts/'));
  const cc = await runTool(kit, 'cc1plus', COMPILE_ARGS, [...headers, ['/build/sketch.ino.cpp', code]], '/build/sketch.s');
  const ccDiag = parseCompilerOutput(cc.log);
  const ccErrors = ccDiag.filter((d) => d.severity === 'error');
  if (cc.status !== 0 || !cc.out || ccErrors.length) {
    return done({ ok: false, diagnostics: ccErrors.length ? ccDiag : [{ severity: 'error', message: cc.log.trim() || 'The compiler stopped without saying why.' }] });
  }
  const warnings = ccDiag.filter((d) => d.severity !== 'error');

  const as = await runTool(kit, 'as', ['-mmcu=avr5', '-mno-skip-bug', '-o', '/build/sketch.o', '/build/sketch.s'], [['/build/sketch.s', cc.out]], '/build/sketch.o');
  if (as.status !== 0 || !as.out) {
    return done({ ok: false, diagnostics: [{ severity: 'error', message: `The assembler failed: ${as.log.trim()}` }] });
  }

  const libs = [...kit.sdk].filter(([p]) => p.startsWith('/libs/') || p.startsWith('/ldscripts/'));
  const ld = await runTool(kit, 'ld', LINK_ARGS, [...libs, ['/build/sketch.o', as.out]], '/build/sketch.elf');
  if (ld.status !== 0 || !ld.out) {
    const d = parseLinkerOutput(ld.log);
    return done({ ok: false, diagnostics: d.length ? d : [{ severity: 'error', message: ld.log.trim() || 'The linker failed.' }] });
  }

  const { flashBytes, ramBytes } = programSize(ld.out);
  if (flashBytes > UNO_FLASH_BYTES) {
    return done({
      ok: false,
      diagnostics: [{
        severity: 'error',
        message: `Sketch too big: it needs ${flashBytes} bytes of program storage; the Uno has ${UNO_FLASH_BYTES}.`,
        hint: 'Make the program smaller: long text in Serial.print can go in F("..."), and repeated code can become a function.',
      }],
    });
  }
  if (ramBytes > UNO_RAM_BYTES) {
    return done({
      ok: false,
      diagnostics: [{
        severity: 'error',
        message: `Not enough memory: global variables use ${ramBytes} bytes; the Uno has ${UNO_RAM_BYTES}.`,
        hint: 'Large arrays use up the Uno’s 2 KB of memory fast. Make them smaller, and put fixed text in F("...").',
      }],
    });
  }

  const oc = await runTool(kit, 'objcopy', ['-O', 'ihex', '-R', '.eeprom', '/build/sketch.elf', '/build/sketch.hex'], [['/build/sketch.elf', ld.out]], '/build/sketch.hex');
  if (oc.status !== 0 || !oc.out) {
    return done({ ok: false, diagnostics: [{ severity: 'error', message: `objcopy failed: ${oc.log.trim()}` }] });
  }
  const hex = new TextDecoder().decode(oc.out);
  return { ok: true, hex, program: hexToFlash(hex), flashBytes, ramBytes, diagnostics: warnings, ms: performance.now() - t0 };
}

export { SKETCH_FILE };
