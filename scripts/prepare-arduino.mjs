/**
 * Prepares the in-browser Arduino compiler files in public/arduino/.
 *
 * Source: the pinned npm package @horang-corp/avr-gcc-wasm (avr-gcc 7.3.0 and
 * binutils 2.42 built for WebAssembly, avr-libc 2.0.0, and the Arduino AVR core
 * precompiled for the Uno). Only what an Arduino Uno needs is kept:
 *
 * - tools/*.wasm.gz and tools/*.mjs.gz: the compiler (cc1plus), assembler, linker
 *   and objcopy, and the small JavaScript loader each one comes with.
 * - uno-sdk.pack.gz: one file holding the header files (Arduino core, Uno pins,
 *   avr-libc for the ATmega328P only), avr-libc's libraries, the linker script,
 *   and libcore.a.
 * - manifest.json: file sizes and a version made from the contents, so the page
 *   knows what to download and when its stored copy is out of date.
 *
 * libcore.a is built here, like the Arduino IDE's core.a, so the linker takes
 * only the parts of the core a sketch uses. (Linking every core file instead
 * would install interrupt handlers such as tone()'s Timer 2 handler in every
 * program, which a real Uno doesn't do.)
 *
 * Everything is gzipped so the download is small on any host. Runs before dev,
 * build and test; does nothing when the output is already up to date.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@horang-corp', 'avr-gcc-wasm');
const outDir = join(root, 'public', 'arduino');
const script = readFileSync(fileURLToPath(import.meta.url));

if (!existsSync(join(pkgDir, 'package.json'))) {
  console.error('prepare-arduino: @horang-corp/avr-gcc-wasm is missing. Run "npm install" first.');
  process.exit(1);
}
const pkgVersion = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const stamp = createHash('sha256').update(pkgVersion).update(script).digest('hex').slice(0, 16);
const stampFile = join(outDir, '.stamp');
if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp && existsSync(join(outDir, 'manifest.json'))) {
  process.exit(0);
}

const TOOLS = [
  // [name used by the app, wasm file in the package, loader file in the package]
  ['cc1plus', 'cc1plus.wasm', 'cc1plus.mjs'],
  ['as', 'avr-as.wasm', 'avr-as.mjs'],
  ['ld', 'avr-ld.wasm', 'avr-ld.mjs'],
  ['objcopy', 'avr-objcopy.wasm', 'avr-objcopy.mjs'],
];

/** Core object files that make up libcore.a (the Arduino AVR core, nothing else). */
const coreObjects = readdirSync(join(pkgDir, 'assets', 'objects'))
  .filter((f) => f.startsWith('core_') && f.endsWith('.o'))
  .sort();

// ---------- Header files: Arduino core and Uno pins, avr-libc for the ATmega328P ----------
const fsRoot = join(pkgDir, 'assets', 'fs');
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
/** avr-libc ships a register file per chip (io*.h); keep only the dispatcher and the Uno's. */
function keepHeader(virtualPath) {
  if (virtualPath.startsWith('/sysroot/avr/include/avr/')) {
    const name = virtualPath.slice('/sysroot/avr/include/avr/'.length);
    if (/^io.+\.h$/.test(name)) return name === 'io.h' || name === 'iom328p.h';
  }
  return true;
}
const headers = ['arduino/core', 'arduino/variant', 'sysroot/gcc', 'sysroot/avr']
  .flatMap((d) => walk(join(fsRoot, d)))
  .map((p) => '/' + relative(fsRoot, p).split('\\').join('/'))
  .filter(keepHeader)
  .sort();

// ---------- libcore.a: a GNU ar archive with a symbol index ----------
/** Global and weak symbols an ELF32 little-endian object file defines. */
function definedSymbols(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, false) !== 0x7f454c46 || buf[4] !== 1 || buf[5] !== 1) throw new Error('not an ELF32 LE object');
  const shoff = dv.getUint32(32, true);
  const shentsize = dv.getUint16(46, true);
  const shnum = dv.getUint16(48, true);
  const sec = (i) => {
    const o = shoff + i * shentsize;
    return { type: dv.getUint32(o + 4, true), offset: dv.getUint32(o + 16, true), size: dv.getUint32(o + 20, true), link: dv.getUint32(o + 24, true) };
  };
  const names = [];
  for (let i = 0; i < shnum; i++) {
    const s = sec(i);
    if (s.type !== 2) continue; // SHT_SYMTAB
    const strtab = sec(s.link);
    for (let o = s.offset + 16; o < s.offset + s.size; o += 16) {
      const nameOff = dv.getUint32(o, true);
      const bind = buf[o + 12] >> 4;
      const shndx = dv.getUint16(o + 14, true);
      if ((bind === 1 || bind === 2) && shndx !== 0) {
        let end = strtab.offset + nameOff;
        while (buf[end] !== 0) end++;
        names.push(Buffer.from(buf.subarray(strtab.offset + nameOff, end)).toString('latin1'));
      }
    }
  }
  return names;
}

function arHeader(name, size) {
  const field = (s, n) => s.padEnd(n, ' ').slice(0, n);
  return Buffer.from(
    field(name, 16) + field('0', 12) + field('0', 6) + field('0', 6) + field('644', 8) + field(String(size), 10) + '`\n',
    'latin1',
  );
}
const pad2 = (b) => (b.length % 2 ? Buffer.concat([b, Buffer.from('\n')]) : b);

function buildArchive(files) {
  const members = files.map(({ name, data }) => ({ name, data, symbols: definedSymbols(data) }));
  // Long-name table ("//"): every member is listed there, as "name/\n".
  let longNames = '';
  for (const m of members) {
    m.headerName = '/' + longNames.length;
    longNames += m.name + '/\n';
  }
  const longTable = pad2(Buffer.from(longNames, 'latin1'));
  const symCount = members.reduce((n, m) => n + m.symbols.length, 0);
  const symNames = Buffer.from(members.flatMap((m) => m.symbols.map((s) => s + '\0')).join(''), 'latin1');
  const symSize = 4 + 4 * symCount + symNames.length;
  const symTable = Buffer.alloc(symSize);
  // Member offsets: after the magic, the symbol table and the long-name table.
  let offset = 8 + 60 + symSize + (symSize % 2) + 60 + longTable.length;
  const offsets = members.map((m) => {
    const at = offset;
    offset += 60 + m.data.length + (m.data.length % 2);
    return at;
  });
  symTable.writeUInt32BE(symCount, 0);
  let k = 4;
  members.forEach((m, i) => m.symbols.forEach(() => { symTable.writeUInt32BE(offsets[i], k); k += 4; }));
  symNames.copy(symTable, k);
  return Buffer.concat([
    Buffer.from('!<arch>\n', 'latin1'),
    arHeader('/', symSize),
    pad2(symTable),
    arHeader('//', longTable.length),
    longTable,
    ...members.flatMap((m) => [arHeader(m.headerName, m.data.length), pad2(Buffer.from(m.data))]),
  ]);
}

const libcore = buildArchive(
  coreObjects.map((f) => ({ name: f.replace(/^core_/, ''), data: readFileSync(join(pkgDir, 'assets', 'objects', f)) })),
);

// ---------- uno-sdk.pack: "ETPK", u32 LE index length, JSON index, then the bytes ----------
const entries = [
  ...headers.map((p) => ({ path: p, data: readFileSync(join(fsRoot, p)) })),
  ...readdirSync(join(pkgDir, 'assets', 'libs')).map((f) => ({ path: '/libs/' + f, data: readFileSync(join(pkgDir, 'assets', 'libs', f)) })),
  { path: '/libs/libcore.a', data: libcore },
  { path: '/ldscripts/avr5.xn', data: readFileSync(join(pkgDir, 'assets', 'ldscripts', 'avr5.xn')) },
];
let at = 0;
const index = entries.map((e) => {
  const item = { p: e.path, o: at, n: e.data.length };
  at += e.data.length;
  return item;
});
const indexBytes = Buffer.from(JSON.stringify(index), 'utf8');
const head = Buffer.alloc(8);
head.write('ETPK', 0, 'latin1');
head.writeUInt32LE(indexBytes.length, 4);
const pack = Buffer.concat([head, indexBytes, ...entries.map((e) => e.data)]);

// ---------- Write everything out ----------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'tools'), { recursive: true });
const files = [];
const hash = createHash('sha256');
function emit(name, data) {
  const gz = gzipSync(data, { level: 9 });
  writeFileSync(join(outDir, name + '.gz'), gz);
  hash.update(name).update(data);
  files.push({ name: name + '.gz', bytes: gz.length, rawBytes: data.length });
}
for (const [name, wasm, loader] of TOOLS) {
  emit(`tools/${name}.wasm`, readFileSync(join(pkgDir, 'tools', wasm)));
  emit(`tools/${name}.mjs`, readFileSync(join(pkgDir, 'tools', loader)));
}
emit('uno-sdk.pack', pack);

const manifest = {
  version: hash.digest('hex').slice(0, 16),
  source: `@horang-corp/avr-gcc-wasm@${pkgVersion}`,
  files,
  bytes: files.reduce((n, f) => n + f.bytes, 0),
  rawBytes: files.reduce((n, f) => n + f.rawBytes, 0),
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(stampFile, stamp);
const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
console.log(
  `prepare-arduino: ${files.length} files, ${mb(manifest.bytes)} to download (${mb(manifest.rawBytes)} unpacked); ` +
    `${headers.length} headers, libcore.a with ${coreObjects.length} core files.`,
);
