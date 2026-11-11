/**
 * Reading the compiler's output files: how much memory a program uses (from
 * the ELF file, the same way the Arduino IDE's size report does) and the
 * program bytes (from the Intel HEX file).
 */

/** Uno flash available to a sketch (32 KB less the 0.5 KB bootloader), and its RAM. */
export const UNO_FLASH_BYTES = 32256;
export const UNO_RAM_BYTES = 2048;

/** Section sizes by name, from an ELF32 little-endian file. */
export function elfSectionSizes(elf: Uint8Array): Map<string, number> {
  const dv = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  if (dv.getUint32(0, false) !== 0x7f454c46) throw new Error('not an ELF file');
  const shoff = dv.getUint32(32, true);
  const shentsize = dv.getUint16(46, true);
  const shnum = dv.getUint16(48, true);
  const shstrndx = dv.getUint16(50, true);
  const strOff = dv.getUint32(shoff + shstrndx * shentsize + 16, true);
  const sizes = new Map<string, number>();
  for (let i = 0; i < shnum; i++) {
    const o = shoff + i * shentsize;
    let p = strOff + dv.getUint32(o, true);
    let name = '';
    while (elf[p]) name += String.fromCharCode(elf[p++]);
    if (name) sizes.set(name, dv.getUint32(o + 20, true));
  }
  return sizes;
}

/** Flash and RAM a program uses, counted like the Arduino IDE's report. */
export function programSize(elf: Uint8Array): { flashBytes: number; ramBytes: number } {
  const s = elfSectionSizes(elf);
  const get = (n: string) => s.get(n) ?? 0;
  return { flashBytes: get('.text') + get('.data'), ramBytes: get('.data') + get('.bss') + get('.noinit') };
}

/** The flash contents described by an Intel HEX file (32 KB, unused bytes 0xFF as on a real chip). */
export function hexToFlash(hex: string, size = 0x8000): Uint8Array {
  const flash = new Uint8Array(size).fill(0xff);
  let base = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(':')) continue;
    const n = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 0) {
      for (let i = 0; i < n; i++) {
        const at = base + addr + i;
        if (at < size) flash[at] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      }
    } else if (type === 2) {
      base = parseInt(line.slice(9, 13), 16) << 4;
    } else if (type === 4) {
      base = parseInt(line.slice(9, 13), 16) << 16;
    } else if (type === 1) {
      break;
    }
  }
  return flash;
}
