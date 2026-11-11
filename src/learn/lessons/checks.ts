/** Small, readable questions a lesson step can ask about the circuit. */
import { addPart, addWire, createPart, newId, type Circuit, type Part, type PartPatch } from '../../model/circuit';
import { PART_DEFS, type PartKind, type Rotation } from '../../model/parts';
import type { MeterMode } from '../../meter/meter';
import { probePin } from '../../meter/meter';
import type { CheckCtx } from './types';

/** Parts of a kind (never the meter's hidden ones). */
export function parts(ctx: CheckCtx, kind: PartKind): Part[] {
  return ctx.c.parts.filter((p) => p.kind === kind && !p.id.startsWith('__'));
}

export const has = (ctx: CheckCtx, kind: PartKind, n = 1) => parts(ctx, kind).length >= n;

/** Is some pin of kind A wired to some pin of kind B? (pin = null means any pin) */
export function wired(ctx: CheckCtx, a: PartKind, pinA: number | null, b: PartKind, pinB: number | null): boolean {
  for (const pa of parts(ctx, a)) {
    for (const pb of parts(ctx, b)) {
      if (pa.id === pb.id) continue;
      const pinsA = pinA === null ? [0, 1, 2] : [pinA];
      const pinsB = pinB === null ? [0, 1, 2] : [pinB];
      for (const i of pinsA) for (const j of pinsB) {
        if (ctx.t.wires({ part: pa.id, pin: i }) > 0 && ctx.t.joined({ part: pa.id, pin: i }, { part: pb.id, pin: j })) return true;
      }
    }
  }
  return false;
}

/** Is this pin of `part` wired to pin `pin` of some part of `kind`? */
export function joinedTo(ctx: CheckCtx, part: Part, partPin: number, kind: PartKind, pin: number): boolean {
  return ctx.t.net({ part: part.id, pin: partPin }).some((x) => x.part.id !== part.id && x.part.kind === kind && x.pin === pin);
}

/** Current through a two-pin part, from pin 0 to pin 1 (0 if not simulated). */
export function currentOf(ctx: CheckCtx, p: Part): number {
  if (!ctx.sim.ok || ctx.sim.idle) return 0;
  return ctx.sim.parts.get(p.id)?.i[0] ?? 0;
}

export function voltageAcross(ctx: CheckCtx, p: Part): number {
  if (!ctx.sim.ok || ctx.sim.idle) return 0;
  const r = ctx.sim.parts.get(p.id);
  return r ? r.v[0] - r.v[1] : 0;
}

/** The largest forward current through any LED. */
export function ledCurrent(ctx: CheckCtx): number {
  return Math.max(0, ...parts(ctx, 'led').map((p) => currentOf(ctx, p)));
}

export const ledLit = (ctx: CheckCtx, min = 1e-3) => ledCurrent(ctx) >= min;

export const anyBurned = (ctx: CheckCtx) => ctx.c.parts.some((p) => p.burn);

/** The meter is open, in this mode, and showing a value. */
export function meterValue(ctx: CheckCtx, mode: MeterMode): number | null {
  if (!ctx.meter.open || ctx.meter.mode !== mode || !ctx.reading) return null;
  return ctx.reading.value;
}

/** Both probes sit on the two pins of one part of this kind (either way round). */
export function probesAcross(ctx: CheckCtx, kind: PartKind): boolean {
  const red = probePin(ctx.c, ctx.meter.red);
  const black = probePin(ctx.c, ctx.meter.black);
  if (!red || !black || red.part !== black.part || red.pin === black.pin) return false;
  return parts(ctx, kind).some((p) => p.id === red.part);
}

/** Red probe on pin `redPin` and black on `blackPin` of the same part of this kind. */
export function probesOn(ctx: CheckCtx, kind: PartKind, redPin: number, blackPin: number): boolean {
  const red = probePin(ctx.c, ctx.meter.red);
  const black = probePin(ctx.c, ctx.meter.black);
  if (!red || !black || red.part !== black.part) return false;
  return parts(ctx, kind).some((p) => p.id === red.part) && red.pin === redPin && black.pin === blackPin;
}

/* ---------- Building starter circuits ---------- */

interface Placed {
  kind: PartKind;
  x: number;
  y: number;
  rot?: Rotation;
  value?: number;
  /** Other settings: an AC source's frequency, a light level… */
  set?: PartPatch;
}

/** A starter circuit: parts at grid positions, wires as [partIndex, pin, partIndex, pin]. */
export function starter(placed: Placed[], wires: [number, number, number, number][]): () => Circuit {
  return () => {
    let c: Circuit = { parts: [], wires: [] };
    for (const p of placed) {
      const part = { ...createPart(p.kind, p.x, p.y), rot: p.rot ?? 0, ...(p.value !== undefined ? { value: p.value } : {}), ...p.set };
      c = addPart(c, part);
    }
    for (const [a, pa, b, pb] of wires) {
      c = addWire(c, newId('w'), { part: c.parts[a].id, pin: pa }, { part: c.parts[b].id, pin: pb });
    }
    return c;
  };
}

/* ---------- More questions (lessons 6+) ---------- */

/** The part with this reference designator, e.g. "R2". */
export const byRef = (ctx: CheckCtx, ref: string): Part | undefined => ctx.c.parts.find((p) => p.ref === ref);

/** Current flowing into one pin of a part (for a transistor: 0 base, 1 collector, 2 emitter). */
export function pinCurrent(ctx: CheckCtx, p: Part | undefined, pin: number): number {
  if (!p || !ctx.sim.ok || ctx.sim.idle) return 0;
  return ctx.sim.parts.get(p.id)?.i[pin] ?? 0;
}

/** Power a part turns into heat (or light), W. */
export function powerOf(ctx: CheckCtx, p: Part | undefined): number {
  if (!p || !ctx.sim.ok || ctx.sim.idle) return 0;
  return ctx.sim.parts.get(p.id)?.power ?? 0;
}

/** Both probes sit on the two pins of this particular part (either way round). */
export function probesAcrossPart(ctx: CheckCtx, p: Part | undefined): boolean {
  const red = probePin(ctx.c, ctx.meter.red);
  const black = probePin(ctx.c, ctx.meter.black);
  return !!p && !!red && !!black && red.part === p.id && black.part === p.id && red.pin !== black.pin;
}

/** The meter reading in this mode, as a magnitude (0 when not measuring). */
export const meterMag = (ctx: CheckCtx, mode: MeterMode) => Math.abs(meterValue(ctx, mode) ?? 0);

export const between = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

/** Is this pin of `part` wired to any pin of some other part of `kind`? */
export const touches = (ctx: CheckCtx, part: Part, pin: number, kind: PartKind) =>
  ctx.t.net({ part: part.id, pin }).some((x) => x.part.id !== part.id && x.part.kind === kind);

/** A two-pin part sits between a part of kind A (one side) and kind B (the other). */
export const bridges = (ctx: CheckCtx, part: Part, a: PartKind, b: PartKind) =>
  [0, 1].some((i) => touches(ctx, part, i, a) && touches(ctx, part, 1 - i, b));

/* ---------- Time, the oscilloscope and sound (Sound & Timing) ---------- */

/** The scope channel (0 or 1) whose probe sits on this pin's net, or −1. */
export function scopeChannel(ctx: CheckCtx, p: Part | undefined, pin: number): number {
  if (!p || !ctx.scope.open) return -1;
  return ctx.scope.pins.findIndex((r) => !!r && ctx.t.joined(r, { part: p.id, pin }));
}

/** A scope probe touches this pin (or anything wired to it). */
export const scopeOn = (ctx: CheckCtx, p: Part | undefined, pin: number) => scopeChannel(ctx, p, pin) >= 0;

/** The frequency the scope measures at this pin (null: not probed, or not repeating). */
export function scopeFreq(ctx: CheckCtx, p: Part | undefined, pin: number): number | null {
  const ch = scopeChannel(ctx, p, pin);
  return ch < 0 ? null : ctx.scope.freq[ch];
}

/** The lowest and highest voltage the scope has seen at this pin lately. */
export function scopeRange(ctx: CheckCtx, p: Part | undefined, pin: number): [number, number] | null {
  const ch = scopeChannel(ctx, p, pin);
  return ch < 0 ? null : ctx.scope.range[ch];
}

/** Over the last few seconds this part's current has been both above `on` and clearly off (an LED blinking). */
export function blinking(ctx: CheckCtx, p: Part | undefined, on = 1e-3): boolean {
  const s = p && ctx.recent.swing(p.id);
  return !!s && s.iMax >= on && s.iMin < on / 5;
}

/** A part's value, or its kind's default. */
export const valueOf = (p: Part | undefined) => p?.value ?? (p ? PART_DEFS[p.kind].defaultValue : undefined) ?? 0;
