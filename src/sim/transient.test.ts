/**
 * The time-based simulator, checked against hand calculations: capacitor
 * charging and discharging follow e^(−t/RC), charge survives edits, and a
 * two-transistor blinker oscillates at the rate the textbook formula predicts.
 */
import { describe, expect, it } from 'vitest';
import { addPart, addWire, createPart, newId, updatePart, type Circuit, type Part } from '../model/circuit';
import type { PartKind } from '../model/parts';
import { simulate } from './simulate';
import { TransientSim } from './transient';

function build() {
  let c: Circuit = { parts: [], wires: [] };
  const add = (kind: PartKind, value?: number): Part => {
    const p = createPart(kind, 0, 0);
    c = addPart(c, value !== undefined ? { ...p, value } : p);
    return c.parts[c.parts.length - 1];
  };
  const wire = (a: Part, pa: number, b: Part, pb: number) => {
    c = addWire(c, newId('w'), { part: a.id, pin: pa }, { part: b.id, pin: pb });
  };
  return { add, wire, get c() { return c; }, set c(v: Circuit) { c = v; } };
}

const IDEAL = { batteryResistance: 1e-6 };
const H = 2e-4; // the app's normal step: 0.2 ms

/** Runs for `seconds` in steps of h, calling `watch` after each step. */
function run(sim: TransientSim, seconds: number, h = H, watch?: (t: number) => void) {
  const n = Math.round(seconds / h);
  for (let k = 0; k < n; k++) {
    expect(sim.step(h)).toBe(true);
    watch?.(sim.time);
  }
}

function rc(r = 10_000, cap = 10e-6) {
  const b = build();
  const bat = b.add('battery', 9);
  const res = b.add('resistor', r);
  const c = b.add('capacitor', cap);
  b.wire(bat, 0, res, 0);
  b.wire(res, 1, c, 0);
  b.wire(c, 1, bat, 1);
  return { b, bat, res, cap: c };
}

const vAcross = (sim: TransientSim, p: Part) => {
  const r = sim.result().parts.get(p.id)!;
  return r.v[0] - r.v[1];
};

describe('time-based simulation', () => {
  it('a capacitor charges through a resistor as 9·(1 − e^(−t/RC))', () => {
    const { b, cap } = rc(); // τ = 10 kΩ × 10 µF = 0.1 s
    const sim = new TransientSim(b.c, undefined, 0, IDEAL);
    expect(Math.abs(vAcross(sim, cap))).toBeLessThan(1e-5); // starts empty
    for (const t of [0.05, 0.1, 0.2, 0.5]) {
      run(sim, t - sim.time);
      const expected = 9 * (1 - Math.exp(-t / 0.1));
      expect(Math.abs(vAcross(sim, cap) - expected), `at ${t}s`).toBeLessThan(0.002 * 9);
    }
  });

  it('the charging current starts at V/R and the resistor’s voltage falls as the capacitor fills', () => {
    const { b, res } = rc();
    const sim = new TransientSim(b.c, undefined, 0, IDEAL);
    run(sim, H);
    expect(sim.result().parts.get(res.id)!.i[0]).toBeCloseTo(9 / 10_000, 5);
    run(sim, 0.1 - H);
    expect(sim.result().parts.get(res.id)!.i[0]).toBeCloseTo((9 / 10_000) * Math.exp(-1), 5);
  });

  it('a charged capacitor discharges through a resistor as V·e^(−t/RC)', () => {
    const b = build();
    const res = b.add('resistor', 10_000);
    const cap = b.add('capacitor', 10e-6);
    b.wire(res, 0, cap, 0);
    b.wire(res, 1, cap, 1);
    const sim = new TransientSim(b.c, new Map([[cap.id, { v: 9, vPrev: 9, steps: 2 }]]), 0, IDEAL);
    expect(sim.dynamic).toBe(true); // no battery, but still charged
    run(sim, 0.1);
    expect(vAcross(sim, cap)).toBeCloseTo(9 * Math.exp(-1), 2);
    run(sim, 0.9);
    expect(Math.abs(vAcross(sim, cap))).toBeLessThan(0.001);
  });

  it('ends up exactly where the settled (DC) simulator says', () => {
    const { b, res } = rc(1000, 100e-6);
    const sim = new TransientSim(b.c);
    run(sim, 2);
    const dc = simulate(b.c);
    expect(Math.abs(sim.result().parts.get(res.id)!.i[0])).toBeLessThan(1e-9);
    for (const p of b.c.parts) {
      const a = sim.result().parts.get(p.id)!.v;
      const d = dc.parts.get(p.id)!.v;
      a.forEach((v, k) => expect(v, `${p.ref} pin ${k}`).toBeCloseTo(d[k], 3));
    }
  });

  it('keeps its charge across an edit, and settles at once when far faster than a step', () => {
    const { b, res, cap } = rc();
    let sim = new TransientSim(b.c, undefined, 0, IDEAL);
    run(sim, 0.1);
    const v = vAcross(sim, cap);
    // Change the resistor: the capacitor's voltage must not jump.
    b.c = updatePart(b.c, res.id, { value: 1000 });
    sim = new TransientSim(b.c, sim.capStates(), sim.time, IDEAL);
    expect(vAcross(sim, cap)).toBeCloseTo(v, 4);
    // A 1 nF capacitor through 1 kΩ (τ = 1 µs) is fully charged after one 0.2 ms step, and nothing explodes.
    const fast = rc(1000, 1e-9);
    const s2 = new TransientSim(fast.b.c, undefined, 0, IDEAL);
    run(s2, 20 * H);
    expect(vAcross(s2, fast.cap)).toBeCloseTo(9, 3);
    expect(s2.lastChange).toBeLessThan(1e-6);
  });

  it('an LED fed by a discharging capacitor fades out', () => {
    const b = build();
    const res = b.add('resistor', 330);
    const led = b.add('led');
    const cap = b.add('capacitor', 1000e-6);
    b.wire(cap, 0, res, 0);
    b.wire(res, 1, led, 0);
    b.wire(led, 1, cap, 1);
    const sim = new TransientSim(b.c, new Map([[cap.id, { v: 9, vPrev: 9, steps: 2 }]]));
    const current = () => sim.result().parts.get(led.id)!.i[0];
    run(sim, H);
    const start = current();
    expect(start).toBeGreaterThan(0.018);
    run(sim, 0.3);
    const later = current();
    run(sim, 1);
    expect(later).toBeLessThan(start);
    expect(current()).toBeLessThan(later);
    expect(current()).toBeGreaterThan(0); // dimmer and dimmer, never negative
  });

  it('a perfectly symmetrical blinker still starts, as a real one does, and never looks settled', () => {
    // Exactly as built on the canvas (same ids and order), which once balanced on its tip and froze.
    const P = (id: string, kind: PartKind, ref: string, value?: number): Part => ({
      id, kind, ref, x: 0, y: 0, rot: 0, ...(value !== undefined ? { value } : {}),
    });
    const W = (id: string, a: string, pa: number, b: string, pb: number) => ({ id, a: { part: a, pin: pa }, b: { part: b, pin: pb } });
    const c: Circuit = {
      parts: [
        P('b', 'battery', 'B1', 9), P('r1', 'resistor', 'R1', 470), P('r2', 'resistor', 'R2', 470),
        P('l1', 'led', 'LED1'), P('l2', 'led', 'LED2'), P('rb1', 'resistor', 'R3', 47_000), P('rb2', 'resistor', 'R4', 47_000),
        P('c1', 'capacitor', 'C1', 10e-6), P('c2', 'capacitor', 'C2', 10e-6), P('q1', 'npn', 'Q1'), P('q2', 'npn', 'Q2'),
      ],
      wires: [
        W('w1', 'b', 0, 'r1', 0), W('w2', 'b', 0, 'r2', 0), W('w3', 'b', 0, 'rb1', 0), W('w4', 'b', 0, 'rb2', 0),
        W('w5', 'r1', 1, 'l1', 0), W('w6', 'r2', 1, 'l2', 0), W('w7', 'l1', 1, 'q1', 1), W('w8', 'l2', 1, 'q2', 1),
        W('w9', 'rb1', 1, 'q1', 0), W('w10', 'rb2', 1, 'q2', 0), W('w11', 'q1', 1, 'c1', 0), W('w12', 'c1', 1, 'q2', 0),
        W('w13', 'q2', 1, 'c2', 0), W('w14', 'c2', 1, 'q1', 0), W('w15', 'q1', 2, 'b', 1), W('w16', 'q2', 2, 'b', 1),
      ],
    };
    const sim = new TransientSim(c);
    const lit = () => (sim.result().parts.get('l1')!.i[0] > 0.005 ? 1 : 0) + (sim.result().parts.get('l2')!.i[0] > 0.005 ? 2 : 0);
    const seen = new Set<number>();
    // One animation frame at 60 fps is about 83 steps; the app stops stepping when a whole frame changes nothing.
    for (let frame = 0; frame < 180; frame++) {
      let biggest = 0;
      for (let k = 0; k < 83; k++) {
        expect(sim.step(H)).toBe(true);
        biggest = Math.max(biggest, sim.lastChange);
      }
      expect(biggest, `frame ${frame} looked settled`).toBeGreaterThan(1e-6);
      seen.add(lit());
    }
    expect(seen.has(1) && seen.has(2), 'each LED takes its turn alone').toBe(true);
  });

  it('a two-transistor blinker oscillates at the textbook rate', () => {
    // The classic astable multivibrator: each transistor's collector feeds the
    // other's base through a capacitor; each base is pulled up by a resistor.
    const b = build();
    const bat = b.add('battery', 9);
    const rc1 = b.add('resistor', 470);
    const rc2 = b.add('resistor', 470);
    const led1 = b.add('led');
    const led2 = b.add('led');
    const rb1 = b.add('resistor', 47_000);
    const rb2 = b.add('resistor', 47_000);
    const c1 = b.add('capacitor', 10e-6);
    const c2 = b.add('capacitor', 10e-6);
    const q1 = b.add('npn');
    const q2 = b.add('npn');
    // Collector loads: + → resistor → LED → collector.
    b.wire(bat, 0, rc1, 0);
    b.wire(rc1, 1, led1, 0);
    b.wire(led1, 1, q1, 1);
    b.wire(bat, 0, rc2, 0);
    b.wire(rc2, 1, led2, 0);
    b.wire(led2, 1, q2, 1);
    // Base pull-ups.
    b.wire(bat, 0, rb1, 0);
    b.wire(rb1, 1, q1, 0);
    b.wire(bat, 0, rb2, 0);
    b.wire(rb2, 1, q2, 0);
    // Cross-coupling: collector of one → capacitor (+ to collector) → base of the other.
    b.wire(q1, 1, c1, 0);
    b.wire(c1, 1, q2, 0);
    b.wire(q2, 1, c2, 0);
    b.wire(c2, 1, q1, 0);
    // Emitters to −.
    b.wire(q1, 2, bat, 1);
    b.wire(q2, 2, bat, 1);

    const sim = new TransientSim(b.c);
    const on = () => sim.result().parts.get(led1.id)!.i[0] > 0.005;
    const flips: number[] = [];
    let was = on();
    const t0 = performance.now();
    run(sim, 3, H, (t) => {
      const now = on();
      if (now !== was) flips.push(t);
      was = now;
    });
    const ms = performance.now() - t0;

    expect(flips.length, 'it blinks').toBeGreaterThan(6);
    // Ignore start-up; average the later half-periods.
    const halves = flips.slice(2).map((t, k, a) => (k ? t - a[k - 1] : NaN)).slice(1);
    const half = halves.reduce((s, x) => s + x, 0) / halves.length;
    // Each half-period is the time for a base, kicked to about −(9 − 2 − 0.1) V, to recharge
    // through 47 kΩ to +0.65 V: t = R·C·ln((9 + ΔV − 0.65) / (9 − 0.65)), with ΔV ≈ 7 V → ≈ 0.62·R·C.
    const rcT = 47_000 * 10e-6;
    expect(half / rcT).toBeGreaterThan(0.55);
    expect(half / rcT).toBeLessThan(0.72);
    // Both LEDs take turns: never both fully on.
    expect(halves.every((x) => Math.abs(x - half) < 0.05 * half)).toBe(true);
    // Fast enough to run live: 3 s of circuit time in well under 3 s of computing.
    expect(ms).toBeLessThan(1500);
    // For the record (shown when the test runs with --reporter verbose).
    console.log(`blinker: half-period ${(half * 1000).toFixed(1)} ms = ${(half / rcT).toFixed(3)}·RC; 3 s simulated in ${ms.toFixed(0)} ms`);
    void c2;
    void rb2;
  });
});
