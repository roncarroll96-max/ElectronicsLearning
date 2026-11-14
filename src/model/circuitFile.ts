/**
 * Circuit files: the format used for export/import, and the checker that
 * every circuit read from outside (a file, or the browser's storage) must
 * pass before the app trusts it. A damaged file is refused with a plain
 * explanation, and never half-loaded.
 */
import type { BurnInfo, Circuit, Part, PinRef, Wire } from './circuit';
import { AC_MAX_F, AC_MIN_F, LED_COLORS, PART_DEFS, WAVES, type LedColor, type PartKind, type Rotation, type Wave } from './parts';

export const FILE_FORMAT = 'circuit-lab';
export const FILE_VERSION = 1;
/** File name ending for exported circuits. */
export const FILE_EXTENSION = '.circuit.json';

export interface CircuitFile {
  format: typeof FILE_FORMAT;
  version: number;
  name: string;
  savedAt: string;
  circuit: Circuit;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const MAX_PARTS = 2000;
const MAX_WIRES = 5000;

function checkBurn(raw: unknown): BurnInfo | undefined {
  if (!isObj(raw)) return undefined;
  const q = raw.quantity;
  if (q !== 'current' && q !== 'power' && q !== 'reverse' && q !== 'voltage') return undefined;
  if (!isNum(raw.value) || !isNum(raw.limit)) return undefined;
  const nums = (x: unknown) => (Array.isArray(x) && x.every(isNum) ? (x as number[]) : []);
  return { quantity: q, value: raw.value, limit: raw.limit, v: nums(raw.v), i: nums(raw.i) };
}

/** Longest sketch accepted from a file, characters (a full Uno holds about 32 KB of program). */
const MAX_SKETCH = 200_000;

function checkPart(raw: unknown, n: number): Checked<Part> {
  const where = `part ${n + 1}`;
  if (!isObj(raw)) return fail(`${where} isn’t a part.`);
  const { id, kind, ref, x, y, rot } = raw;
  if (typeof id !== 'string' || id === '' || id.startsWith('__')) return fail(`${where} has no valid id.`);
  if (typeof kind !== 'string' || !(kind in PART_DEFS)) return fail(`${where} is an unknown kind of part (“${String(kind)}”).`);
  const def = PART_DEFS[kind as PartKind];
  if (!isNum(x) || !isNum(y)) return fail(`${where} (${def.name}) has no valid position.`);
  if (!ROTATIONS.includes(rot as Rotation)) return fail(`${where} (${def.name}) has an invalid rotation.`);

  const part: Part = { id, kind: kind as PartKind, ref: typeof ref === 'string' ? ref : '', x, y, rot: rot as Rotation };
  if (raw.value !== undefined) {
    if (!isNum(raw.value) || raw.value <= 0) return fail(`${where} (${def.name}) has an invalid value.`);
    part.value = raw.value;
  } else if (def.defaultValue !== undefined) {
    part.value = def.defaultValue;
  }
  if (typeof raw.on === 'boolean') part.on = raw.on;
  if (isNum(raw.pos)) part.pos = Math.min(1, Math.max(0, raw.pos));
  if (isNum(raw.light)) part.light = Math.min(1, Math.max(0, raw.light));
  if (isNum(raw.freq)) part.freq = Math.min(AC_MAX_F, Math.max(AC_MIN_F, raw.freq));
  if (WAVES.includes(raw.wave as Wave)) part.wave = raw.wave as Wave;
  if (kind === 'led' && LED_COLORS.includes(raw.color as LedColor)) part.color = raw.color as LedColor;
  if (typeof raw.sketch === 'string' && kind === 'arduino') {
    if (raw.sketch.length > MAX_SKETCH) return fail(`${where} (${def.name}) has a sketch that is far too long.`);
    part.sketch = raw.sketch;
  }
  const burn = checkBurn(raw.burn);
  if (burn) part.burn = burn;
  return { ok: true, value: part };
}

function checkPin(raw: unknown, parts: Map<string, Part>): PinRef | null {
  if (!isObj(raw) || typeof raw.part !== 'string' || !Number.isInteger(raw.pin)) return null;
  const part = parts.get(raw.part);
  const pin = raw.pin as number;
  if (!part || pin < 0 || pin >= PART_DEFS[part.kind].pins.length) return null;
  return { part: raw.part, pin };
}

/** Checks a circuit from outside the app. Every wire must join two real pins. */
export function checkCircuit(raw: unknown): Checked<Circuit> {
  if (!isObj(raw) || !Array.isArray(raw.parts) || !Array.isArray(raw.wires)) return fail('It doesn’t contain a circuit.');
  if (raw.parts.length > MAX_PARTS || raw.wires.length > MAX_WIRES) return fail('The circuit is too big to open.');

  const parts = new Map<string, Part>();
  for (let n = 0; n < raw.parts.length; n++) {
    const r = checkPart(raw.parts[n], n);
    if (!r.ok) return r;
    if (parts.has(r.value.id)) return fail(`Two parts share the id “${r.value.id}”.`);
    parts.set(r.value.id, r.value);
  }

  const wires: Wire[] = [];
  const ids = new Set<string>();
  const joined = new Set<string>();
  for (let n = 0; n < raw.wires.length; n++) {
    const w = raw.wires[n];
    const where = `wire ${n + 1}`;
    if (!isObj(w) || typeof w.id !== 'string' || w.id === '') return fail(`${where} has no valid id.`);
    if (ids.has(w.id) || parts.has(w.id)) return fail(`Two items share the id “${w.id}”.`);
    const a = checkPin(w.a, parts);
    const b = checkPin(w.b, parts);
    if (!a || !b) return fail(`${where} connects to a part or pin that doesn’t exist.`);
    if (a.part === b.part && a.pin === b.pin) return fail(`${where} connects a pin to itself.`);
    // A repeated wire between the same two pins is harmless: keep just one.
    const key = [`${a.part}:${a.pin}`, `${b.part}:${b.pin}`].sort().join('|');
    if (joined.has(key)) continue;
    joined.add(key);
    ids.add(w.id);
    wires.push({ id: w.id, a, b });
  }

  // Give any part without a reference designator the next free one (R1, R2...).
  const list = [...parts.values()];
  for (const p of list) {
    if (p.ref) continue;
    const prefix = PART_DEFS[p.kind].prefix;
    let i = 1;
    while (list.some((q) => q.ref === `${prefix}${i}`)) i++;
    p.ref = `${prefix}${i}`;
  }
  return { ok: true, value: { parts: list, wires } };
}

/** A circuit as the text of a file. */
export function circuitToFile(c: Circuit, name: string, now = new Date()): string {
  const file: CircuitFile = { format: FILE_FORMAT, version: FILE_VERSION, name, savedAt: now.toISOString(), circuit: c };
  return JSON.stringify(file, null, 2);
}

/** Reads a circuit file. On any problem, says what's wrong and returns nothing to load. */
export function parseCircuitFile(text: string): Checked<{ name: string; circuit: Circuit }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('This isn’t an Electronics Tutorial file: it couldn’t be read as one.');
  }
  if (!isObj(raw) || raw.format !== FILE_FORMAT) return fail('This isn’t an Electronics Tutorial circuit file.');
  if (!isNum(raw.version) || raw.version < 1) return fail('This file is damaged: its version is missing.');
  if (raw.version > FILE_VERSION) return fail('This file was made by a newer version of Electronics Tutorial. Update the app to open it.');
  const c = checkCircuit(raw.circuit);
  if (!c.ok) return fail(`This file is damaged: ${c.error[0].toLowerCase()}${c.error.slice(1)}`);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Imported circuit';
  return { ok: true, value: { name, circuit: c.value } };
}

/** A safe file name for a circuit called `name`. */
export function fileNameFor(name: string): string {
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60);
  return `${base || 'circuit'}${FILE_EXTENSION}`;
}
