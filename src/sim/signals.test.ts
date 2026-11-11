/**
 * Milestone 2, step 4 parts checked against hand calculations: an RL circuit's
 * time constant, a transformer's voltage ratio, a bridge rectifier's ripple,
 * a 555 astable's frequency, and an AC source seen on the scope.
 */
import { describe, expect, it } from 'vitest';
import type { Circuit, Part } from '../model/circuit';
import type { PartKind, Wave } from '../model/parts';
import { LiveEngine } from './live';
import { inductorResistance } from './models';
import { simulate } from './simulate';
import { TransientSim } from './transient';

const P = (id: string, kind: PartKind, value?: number, extra: Partial<Part> = {}): Part => ({
  id, kind, ref: id, x: 0, y: 0, rot: 0, ...(value !== undefined ? { value } : {}), ...extra,
});
let wid = 0;
const W = (a: string, pa: number, b: string, pb: number) => ({ id: `w${++wid}`, a: { part: a, pin: pa }, b: { part: b, pin: pb } });
const IDEAL = { batteryResistance: 1e-6 };

const across = (sim: TransientSim, id: string, a = 0, b = 1) => {
  const r = sim.result().parts.get(id)!;
  return r.v[a] - r.v[b];
};

/** Steps for `seconds` in steps of h, calling watch after each. */
function run(sim: TransientSim, seconds: number, h: number, watch?: () => void) {
  const n = Math.round(seconds / h);
  for (let k = 0; k < n; k++) {
    expect(sim.step(h)).toBe(true);
    watch?.();
  }
}

const ac = (id: string, volts: number, freq: number, wave: Wave = 'sine') => P(id, 'acsource', volts, { freq, wave });

describe('inductor', () => {
  it('current in an RL circuit rises as I·(1 − e^(−t/τ)), τ = L ÷ R', () => {
    const L = 0.1;
    const R = 100;
    const rTotal = R + inductorResistance(L);
    const tau = L / rTotal;
    const c: Circuit = {
      parts: [P('b', 'battery', 9), P('r', 'resistor', R), P('l', 'inductor', L)],
      wires: [W('b', 0, 'r', 0), W('r', 1, 'l', 0), W('l', 1, 'b', 1)],
    };
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    const amps = () => sim.result().parts.get('r')!.i[0];
    expect(Math.abs(amps())).toBeLessThan(1e-6); // a coil won't let current jump
    const h = tau / 20;
    for (const t of [tau, 2 * tau, 5 * tau]) {
      run(sim, t - sim.time, h);
      const expected = (9 / rTotal) * (1 - Math.exp(-t / tau));
      expect(Math.abs(amps() / expected - 1)).toBeLessThan(5e-3); // within the stepper's 0.5 % tolerance
    }
  });

  it('settled (DC), a coil is just its winding resistance', () => {
    const c: Circuit = {
      parts: [P('b', 'battery', 9), P('l', 'inductor', 0.01)],
      wires: [W('b', 0, 'l', 0), W('l', 1, 'b', 1)],
    };
    const r = simulate(c, IDEAL).parts.get('l')!;
    expect(r.i[0]).toBeCloseTo(9 / inductorResistance(0.01), 5);
  });
});

describe('transformer', () => {
  it('steps the voltage by its turns ratio', () => {
    for (const n of [0.5, 2]) {
      const c: Circuit = {
        parts: [ac('s', 10, 50), P('t', 'transformer', n), P('r', 'resistor', 10_000)],
        wires: [W('s', 0, 't', 0), W('t', 1, 's', 1), W('t', 2, 'r', 0), W('r', 1, 't', 3)],
      };
      const sim = new TransientSim(c, undefined, 0, IDEAL);
      run(sim, 0.1, 2e-4); // let it settle in
      let peak = 0;
      run(sim, 0.04, 2e-4, () => (peak = Math.max(peak, Math.abs(across(sim, 'r')))));
      expect(peak / 10).toBeGreaterThan(n * 0.95);
      expect(peak / 10).toBeLessThan(n * 1.01);
    }
  });

  it('passes no steady DC: a battery on the primary gives nothing on the secondary', () => {
    const c: Circuit = {
      parts: [P('b', 'battery', 9), P('rp', 'resistor', 100), P('t', 'transformer', 1), P('r', 'resistor', 1000)],
      wires: [W('b', 0, 'rp', 0), W('rp', 1, 't', 0), W('t', 1, 'b', 1), W('t', 2, 'r', 0), W('r', 1, 't', 3)],
    };
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    run(sim, 0.5, 2e-4);
    expect(Math.abs(across(sim, 'r'))).toBeLessThan(0.01);
  });
});

describe('bridge rectifier', () => {
  /** 12 V peak, 50 Hz, through a bridge into C ∥ 1 kΩ; returns [lowest, highest] output over the last cycles. */
  function ripple(cap: number): [number, number] {
    const c: Circuit = {
      parts: [ac('s', 12, 50), P('br', 'bridge'), P('c', 'capacitor', cap), P('r', 'resistor', 1000)],
      wires: [
        W('s', 0, 'br', 0), W('s', 1, 'br', 1),
        W('br', 2, 'c', 0), W('c', 1, 'br', 3), W('br', 2, 'r', 0), W('r', 1, 'br', 3),
      ],
    };
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    run(sim, 0.5, 2e-4);
    let lo = Infinity;
    let hi = -Infinity;
    run(sim, 0.06, 1e-4, () => {
      const v = across(sim, 'r');
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    });
    return [lo, hi];
  }

  it('turns AC into DC whose ripple shrinks as the capacitor grows (≈ Vpk ÷ (2·f·R·C))', () => {
    const [lo1, hi1] = ripple(100e-6);
    const [lo2, hi2] = ripple(1000e-6);
    // Peak: 12 V less two diode drops.
    expect(hi1).toBeGreaterThan(10);
    expect(hi1).toBeLessThan(11.2);
    const r1 = hi1 - lo1;
    const r2 = hi2 - lo2;
    expect(r1).toBeGreaterThan(0.7);
    expect(r1).toBeLessThan(1.3);
    expect(r2).toBeLessThan(r1 / 7);
    expect(lo2).toBeGreaterThan(9.8);
  });
});

describe('555 timer', () => {
  /** The classic astable: R1 from VCC to Discharge, R2 from Discharge to Threshold+Trigger, C to ground. */
  function astable(r1: number, r2: number, cap: number): Circuit {
    return {
      parts: [P('b', 'battery', 9), P('u', 'timer555'), P('r1', 'resistor', r1), P('r2', 'resistor', r2), P('c', 'capacitor', cap)],
      wires: [
        W('b', 0, 'u', 7), W('b', 0, 'u', 3), W('b', 1, 'u', 0),
        W('b', 0, 'r1', 0), W('r1', 1, 'u', 6), W('u', 6, 'r2', 0), W('r2', 1, 'u', 5), W('u', 5, 'u', 1),
        W('u', 5, 'c', 0), W('c', 1, 'b', 1),
      ],
    };
  }

  /** Times of the output's rising edges over `seconds`, after `skip` seconds of warm-up. */
  function edges(c: Circuit, skip: number, seconds: number, h: number): number[] {
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    run(sim, skip, h);
    const out: number[] = [];
    let was = across(sim, 'u', 2, 0) > 4.5;
    run(sim, seconds, h, () => {
      const high = across(sim, 'u', 2, 0) > 4.5;
      if (high && !was) out.push(sim.time);
      was = high;
    });
    return out;
  }

  it('an astable runs at 1.44 ÷ ((R1 + 2·R2)·C)', () => {
    for (const [r1, r2, cap] of [
      [1000, 10_000, 1e-6], // 68.6 Hz
      [10_000, 47_000, 1e-6], // 13.8 Hz
    ] as const) {
      const f = 1.44 / ((r1 + 2 * r2) * cap);
      const e = edges(astable(r1, r2, cap), 0.05, 0.5, 2e-4);
      const period = (e[e.length - 1] - e[0]) / (e.length - 1);
      expect(1 / period / f).toBeGreaterThan(0.98);
      expect(1 / period / f).toBeLessThan(1.03);
    }
  });

  it('runs at an audio pitch at the speaker step size', () => {
    const f = 1.44 / ((1000 + 2 * 10_000) * 68e-9); // about 1 kHz
    const e = edges(astable(1000, 10_000, 68e-9), 0.01, 0.05, 1 / 16_000);
    const period = (e[e.length - 1] - e[0]) / (e.length - 1);
    expect(1 / period / f).toBeGreaterThan(0.97);
    expect(1 / period / f).toBeLessThan(1.03);
  });

  it('output high is about VCC − 1.5 V, and Reset held low stops it', () => {
    const c = astable(1000, 10_000, 1e-6);
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    // At power-on the capacitor is empty, below ⅓ VCC: the output goes high at once.
    expect(across(sim, 'u', 2, 0)).toBeCloseTo(7.5, 1);
    expect(sim.timerStates().get('u')).toBe(true);
    const held: Circuit = { ...c, wires: c.wires.filter((w) => !(w.a.part === 'b' && w.b.pin === 3)).concat(W('u', 3, 'b', 1)) };
    const s2 = new TransientSim(held, undefined, 0, IDEAL);
    run(s2, 0.05, 2e-4);
    expect(across(s2, 'u', 2, 0)).toBeLessThan(0.01);
  });

  it('remembers its state across an edit', () => {
    const c = astable(1000, 10_000, 1e-6);
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    run(sim, 0.0123, 2e-4);
    const q = sim.timerStates().get('u');
    const next = new TransientSim(c, sim.capStates(), sim.time, IDEAL);
    expect(next.timerStates().get('u')).toBe(q);
  });
});

describe('AC source', () => {
  it('shows its frequency and peak on the scope', () => {
    for (const wave of ['sine', 'square', 'triangle'] as const) {
      const c: Circuit = {
        parts: [ac('s', 5, 200, wave), P('r', 'resistor', 1000)],
        wires: [W('s', 0, 'r', 0), W('r', 1, 's', 1)],
      };
      const e = new LiveEngine();
      e.setCircuit(c, 1, [{ part: 's', pin: 0 }, null], false);
      e.setControls(false, 1, false);
      for (let k = 0; k < 10; k++) e.run(0.01, 5000);
      const f = e.frame()!;
      expect(f.time).toBeCloseTo(0.1, 6);
      expect(f.settled).toBe(false);
      const { t, a } = f.trace!;
      let rising = 0;
      let peak = 0;
      for (let k = 1; k < t.length; k++) {
        if (a[k - 1] < 0 && a[k] >= 0) rising++;
        peak = Math.max(peak, Math.abs(a[k]));
      }
      expect(rising).toBeGreaterThanOrEqual(19); // 200 Hz for 0.1 s: 20 cycles
      expect(rising).toBeLessThanOrEqual(20);
      expect(peak).toBeGreaterThan(4.75); // sampled every 0.2 ms, so a peak can fall between samples
      expect(peak).toBeLessThan(5.01);
    }
  });

  it('a square wave keeps sharp edges', () => {
    const c: Circuit = {
      parts: [ac('s', 5, 100, 'square'), P('r', 'resistor', 1000)],
      wires: [W('s', 0, 'r', 0), W('r', 1, 's', 1)],
    };
    const sim = new TransientSim(c, undefined, 0, IDEAL);
    run(sim, 0.0025, 1e-4);
    expect(across(sim, 'r')).toBeCloseTo(5, 3);
    run(sim, 0.005, 1e-4);
    expect(across(sim, 'r')).toBeCloseTo(-5, 3);
  });
});
