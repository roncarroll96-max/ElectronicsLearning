/**
 * The circuit document: parts placed on the canvas and wires between their pins.
 * Every function here is pure (returns a new circuit, never mutates), which is
 * what makes undo/redo simple.
 */
import { PART_DEFS, rotateDir, rotatePoint, type Dir, type PartKind, type Rotation } from './parts';

export interface Pt {
  x: number;
  y: number;
}

export interface Part {
  id: string;
  kind: PartKind;
  /** Reference designator shown on the canvas, e.g. "R1". */
  ref: string;
  x: number;
  y: number;
  rot: Rotation;
  value?: number;
  /** Switch closed / push button pressed. */
  on?: boolean;
  /** Potentiometer wiper position, 0 (at End A) to 1 (at End B). Default 0.5. */
  pos?: number;
  /** Light falling on a light sensor, 0 (dark) to 1 (bright). Default 0.5. */
  light?: number;
}

export type PartPatch = Partial<Pick<Part, 'value' | 'on' | 'pos' | 'light'>>;

export interface PinRef {
  part: string;
  pin: number;
}

export interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
}

export interface Circuit {
  parts: Part[];
  wires: Wire[];
}

export const EMPTY_CIRCUIT: Circuit = { parts: [], wires: [] };

let idCounter = 0;
/** Unique id. Called outside reducers so reducers stay pure. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const pinKey = (r: PinRef) => `${r.part}:${r.pin}`;
export const samePin = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;

/* ---------- Pin geometry ---------- */

export function pinWorld(part: Part, pin: number): Pt {
  const def = PART_DEFS[part.kind].pins[pin];
  const p = rotatePoint(def.x, def.y, part.rot);
  return { x: part.x + p.x, y: part.y + p.y };
}

export function pinWorldDir(part: Part, pin: number): Dir {
  return rotateDir(PART_DEFS[part.kind].pins[pin].dir, part.rot);
}

/* ---------- Creating parts ---------- */

export function nextRef(c: Circuit, kind: PartKind): string {
  if (kind === 'ground') return 'GND';
  const prefix = PART_DEFS[kind].prefix;
  let max = 0;
  for (const p of c.parts) {
    if (p.kind !== kind) continue;
    const n = parseInt(p.ref.slice(prefix.length), 10);
    if (n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function createPart(kind: PartKind, x: number, y: number): Part {
  return { id: newId('p'), kind, ref: '', x, y, rot: 0, value: PART_DEFS[kind].defaultValue };
}

/* ---------- Edits (pure) ---------- */

/** Adds a part, giving it the next free reference designator. */
export function addPart(c: Circuit, part: Part): Circuit {
  return { ...c, parts: [...c.parts, { ...part, ref: nextRef(c, part.kind) }] };
}

export function moveParts(c: Circuit, ids: ReadonlySet<string>, dx: number, dy: number): Circuit {
  if (dx === 0 && dy === 0) return c;
  return { ...c, parts: c.parts.map((p) => (ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) };
}

/** Rotates each selected part 90° clockwise about its own center. */
export function rotateParts(c: Circuit, ids: ReadonlySet<string>): Circuit {
  if (!c.parts.some((p) => ids.has(p.id))) return c;
  return {
    ...c,
    parts: c.parts.map((p) => (ids.has(p.id) ? { ...p, rot: ((p.rot + 90) % 360) as Rotation } : p)),
  };
}

/** Removes parts and wires by id. Wires attached to removed parts go too. */
export function deleteItems(c: Circuit, ids: ReadonlySet<string>): Circuit {
  const parts = c.parts.filter((p) => !ids.has(p.id));
  const alive = new Set(parts.map((p) => p.id));
  const wires = c.wires.filter((w) => !ids.has(w.id) && alive.has(w.a.part) && alive.has(w.b.part));
  if (parts.length === c.parts.length && wires.length === c.wires.length) return c;
  return { parts, wires };
}

/** Changes a part's settings (value, switch state, wiper position, light level). */
export function updatePart(c: Circuit, id: string, patch: PartPatch): Circuit {
  if (!c.parts.some((p) => p.id === id)) return c;
  return { ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function canConnect(c: Circuit, a: PinRef, b: PinRef): boolean {
  if (samePin(a, b)) return false;
  return !c.wires.some((w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)));
}

export function addWire(c: Circuit, id: string, a: PinRef, b: PinRef): Circuit {
  if (!canConnect(c, a, b)) return c;
  return { ...c, wires: [...c.wires, { id, a, b }] };
}

/* ---------- Connectivity ---------- */

export type NetRole = 'power' | 'ground' | 'signal';

export interface NetInfo {
  /** Role of the net each pin belongs to (for wire colors). */
  role: Map<string, NetRole>;
  /** How many wires end on each pin. */
  wireCount: Map<string, number>;
}

/**
 * Groups pins joined by wires into nets. A net touching the battery's + is
 * "power"; one touching the battery's − or a ground symbol is "ground".
 */
export function analyzeNets(c: Circuit): NetInfo {
  const parent = new Map<string, string>();
  for (const p of c.parts) {
    PART_DEFS[p.kind].pins.forEach((_, i) => {
      const k = pinKey({ part: p.id, pin: i });
      parent.set(k, k);
    });
  }
  const find = (k: string): string => {
    const p = parent.get(k);
    if (p === undefined || p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };

  const wireCount = new Map<string, number>();
  for (const w of c.wires) {
    const ka = pinKey(w.a);
    const kb = pinKey(w.b);
    wireCount.set(ka, (wireCount.get(ka) ?? 0) + 1);
    wireCount.set(kb, (wireCount.get(kb) ?? 0) + 1);
    const ra = find(ka);
    const rb = find(kb);
    if (ra !== rb) parent.set(ra, rb);
  }

  const rootRole = new Map<string, NetRole>();
  for (const p of c.parts) {
    if (p.kind === 'battery') rootRole.set(find(pinKey({ part: p.id, pin: 1 })), 'ground');
    if (p.kind === 'ground') rootRole.set(find(pinKey({ part: p.id, pin: 0 })), 'ground');
  }
  for (const p of c.parts) {
    if (p.kind === 'battery') rootRole.set(find(pinKey({ part: p.id, pin: 0 })), 'power');
  }

  const role = new Map<string, NetRole>();
  for (const k of parent.keys()) role.set(k, rootRole.get(find(k)) ?? 'signal');
  return { role, wireCount };
}
