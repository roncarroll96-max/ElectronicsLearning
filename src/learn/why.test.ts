/** "Why this value?" recognizes what a part is doing and works the numbers from the real circuit. */
import { describe, expect, it } from 'vitest';
import { E12, isStandard, parseValue, seriesValues, standardDown, standardUp } from '../model/values';
import { bench } from '../test/bench';
import type { Circuit } from '../model/circuit';
import { simulate } from '../sim/simulate';
import { TransientSim } from '../sim/transient';
import { LESSONS } from './lessons';
import { blinkerHalf, timing555, whyThisValue } from './why';

describe('standard values', () => {
  it('lists every E12 resistor from 10 Ω to 1 MΩ', () => {
    const r = seriesValues(E12, 10, 1e6);
    expect(r[0]).toBe(10);
    expect(r).toContain(330);
    expect(r).toContain(4700);
    expect(r[r.length - 1]).toBe(1e6);
    expect(r.length).toBe(61);
  });

  it('rounds up and down to standard values', () => {
    expect(standardUp(350)).toBe(390);
    expect(standardDown(350)).toBe(330);
    expect(standardDown(8350)).toBe(8200);
    expect(isStandard(330)).toBe(true);
    expect(isStandard(350)).toBe(false);
  });

  it('reads typed values the way people write them', () => {
    expect(parseValue('330')).toBe(330);
    expect(parseValue('4.7k')).toBe(4700);
    expect(parseValue('4k7')).toBe(4700);
    expect(parseValue('1M')).toBe(1e6);
    expect(parseValue('10 µF')).toBe(10e-6);
    expect(parseValue('100nF')).toBe(100e-9);
    expect(parseValue('2.2u')).toBe(2.2e-6);
    expect(parseValue('330 Ω')).toBe(330);
    expect(parseValue('abc')).toBeNull();
    expect(parseValue('-5')).toBeNull();
  });
});

describe('roles', () => {
  it('a resistor feeding an LED is a current limiter, with the classic calculation', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 330);
    const led = b.add('led');
    b.wire([bat, 0], [r, 0]);
    b.wire([r, 1], [led, 0]);
    b.wire([led, 1], [bat, 1]);
    const why = whyThisValue(r, b.circuit(), b.run());
    expect(why.role).toBe('LED current limiter');
    expect(why.choice).toContain('350 Ω');
    expect(why.choice).toContain('390 Ω');
    expect(why.yours).toContain('21.1 mA');
    expect(why.math.some((l) => l.includes('7 V ÷ 0.020 A = 350 Ω'))).toBe(true);
  });

  it('a capacitor with a resistor gets its time constant, and what half the capacitance would do', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 10_000);
    const c = b.add('capacitor', 10e-6);
    b.wire([bat, 0], [r, 0]);
    b.wire([r, 1], [c, 0]);
    b.wire([c, 1], [bat, 1]);
    const why = whyThisValue(c, b.circuit(), b.run());
    expect(why.choice).toContain('τ = R × C = 100 ms');
    expect(why.math.some((l) => l.includes('4.7 µF') && l.includes('47 ms'))).toBe(true);
  });

  it('a resistor at a transistor base is recognized as a base resistor', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const rb = b.add('resistor', 10_000);
    const rc = b.add('resistor', 1000);
    const q = b.add('npn');
    b.wire([bat, 0], [rb, 0]);
    b.wire([rb, 1], [q, 0]);
    b.wire([bat, 0], [rc, 0]);
    b.wire([rc, 1], [q, 1]);
    b.wire([q, 2], [bat, 1]);
    const sim = b.run();
    expect(whyThisValue(rb, b.circuit(), sim).role).toBe('Transistor base resistor');
    expect(whyThisValue(q, b.circuit(), sim).yours).toMatch(/Fully on/);
  });

  it('every part kind has an explanation', () => {
    const b = bench();
    const kinds = ['battery', 'ground', 'resistor', 'potentiometer', 'capacitor', 'ldr', 'led', 'lamp', 'buzzer', 'switch', 'pushbutton', 'diode', 'npn'] as const;
    const parts = kinds.map((k) => b.add(k));
    const sim = b.run();
    for (const p of parts) {
      const why = whyThisValue(p, b.circuit(), sim);
      expect(why.goal.length, p.kind).toBeGreaterThan(10);
      expect(why.reasoning.length, p.kind).toBeGreaterThan(10);
    }
  });
});

describe('timing predictions match the simulator (spec check 3)', () => {
  /** Average period between rising edges of a part's pin-to-pin voltage. */
  function measuredPeriod(c: Circuit, id: string, a: number, b: number, skip: number, seconds: number, h: number): number {
    const sim = new TransientSim(c);
    const v = () => {
      const r = sim.result().parts.get(id)!;
      return r.v[a] - r.v[b];
    };
    for (let t = 0; t < skip; t += h) sim.step(h);
    const edges: number[] = [];
    let was = v() > 4;
    for (let t = 0; t < seconds; t += h) {
      sim.step(h);
      const high = v() > 4;
      if (high && !was) edges.push(sim.time);
      was = high;
    }
    expect(edges.length).toBeGreaterThan(2);
    return (edges[edges.length - 1] - edges[0]) / (edges.length - 1);
  }
  const lesson = (id: string) => LESSONS.find((l) => l.id === id)!.starter!();

  it('a two-transistor blinker: each capacitor times 0.69 × R × C, and the scope agrees', () => {
    for (const cap of [10e-6, 4.7e-6]) {
      const c = lesson('blinker');
      for (const p of c.parts) if (p.kind === 'capacitor') p.value = cap;
      const c1 = c.parts.find((p) => p.ref === 'C1')!;
      const bl = blinkerHalf(c1, c)!;
      expect(bl).not.toBeNull();
      const q1 = c.parts.find((p) => p.ref === 'Q1')!;
      const T = measuredPeriod(c, q1.id, 1, 2, 2, 4, 2e-4);
      expect(T / (2 * bl.half)).toBeGreaterThan(0.85);
      expect(T / (2 * bl.half)).toBeLessThan(1.02);
      expect(whyThisValue(c1, c, simulate(c)).math.join(' ')).toMatch(/Half cycle/);
    }
  });

  it('a 555 astable: the worked frequency matches the simulated one', () => {
    const c = lesson('555-tone');
    const u = c.parts.find((p) => p.kind === 'timer555')!;
    c.parts.find((p) => p.kind === 'capacitor')!.value = 68e-9; // the lesson's first step
    const tm = timing555(u, c)!;
    expect(tm).not.toBeNull();
    const f = Number(/f = .* = ([\d.]+) (k?)Hz/.exec(tm.math[2])!.slice(1, 2)[0]) * (/kHz/.test(tm.math[2]) ? 1000 : 1);
    const gnd = 0;
    const T = measuredPeriod(c, u.id, 2, gnd, 0.01, 0.05, 1 / 16000);
    expect(1 / T / f).toBeGreaterThan(0.95);
    expect(1 / T / f).toBeLessThan(1.05);
  });
});
