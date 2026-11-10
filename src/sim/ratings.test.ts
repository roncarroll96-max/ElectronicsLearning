/** Part ratings, burnouts and their explanations. */
import { describe, expect, it } from 'vitest';
import { updatePart, type Circuit } from '../model/circuit';
import { bench, current, near, reading } from '../test/bench';
import { explainBurn, standardUp } from './explain';
import { stressOf, worstBurnout } from './ratings';
import { simulate } from './simulate';

/** Battery straight into one part, optionally through a resistor. */
function loop(kind: 'led' | 'resistor' | 'lamp' | 'capacitor', opts: { r?: number; value?: number; volts?: number; reversed?: boolean } = {}) {
  const b = bench();
  const bat = b.add('battery', opts.volts ?? 9);
  const part = b.add(kind, opts.value);
  let from: [typeof bat, number] = [bat, 0];
  if (opts.r !== undefined) {
    const r1 = b.add('resistor', opts.r);
    b.wire([bat, 0], [r1, 0]);
    from = [r1, 1];
  }
  b.wire(from, [part, opts.reversed ? 1 : 0]);
  b.wire([part, opts.reversed ? 0 : 1], [bat, 1]);
  return { b, part, sim: b.run() };
}

/** Applies burnouts one at a time until the circuit is safe, like the app does. */
function burnUntilSafe(c: Circuit): { circuit: Circuit; burned: string[] } {
  const burned: string[] = [];
  for (let k = 0; k < 20; k++) {
    const worst = worstBurnout(c, simulate(c));
    if (!worst) break;
    burned.push(worst.id);
    c = updatePart(c, worst.id, { burn: worst.burn });
  }
  return { circuit: c, burned };
}

describe('burnouts', () => {
  it('LED straight across 9 V burns out; with 330 Ω it is fine', () => {
    const bare = loop('led');
    const worst = worstBurnout(bare.b.circuit(), bare.sim);
    expect(worst?.id).toBe(bare.part.id);
    expect(worst?.burn.quantity).toBe('current');
    expect(worst!.burn.value).toBeGreaterThan(0.5);

    const safe = loop('led', { r: 330 });
    expect(worstBurnout(safe.b.circuit(), safe.sim)).toBeNull();
    expect(stressOf(safe.part, reading(safe.sim, safe.part))?.level).toBe('ok');
  });

  it('LED with 150 Ω runs hot (about 44 mA) but survives', () => {
    const { part, sim, b } = loop('led', { r: 150 });
    expect(stressOf(part, reading(sim, part))?.level).toBe('hot');
    expect(worstBurnout(b.circuit(), sim)).toBeNull();
  });

  it('resistors across 9 V: 100 Ω burns (0.79 W), 220 Ω runs hot (0.36 W), 330 Ω is fine (0.24 W)', () => {
    const levels = [100, 220, 330].map((ohms) => {
      const { part, sim } = loop('resistor', { value: ohms });
      return stressOf(part, reading(sim, part))?.level;
    });
    expect(levels).toEqual(['burn', 'hot', 'ok']);
  });

  it('only the most overloaded part burns, and that breaks the circuit', () => {
    // 10 Ω + LED: the LED (≈ 0.4 A vs 60 mA) is far worse off than the resistor (1.6 W vs 0.5 W).
    const { b, part } = loop('led', { r: 10 });
    const { circuit, burned } = burnUntilSafe(b.circuit());
    expect(burned).toEqual([part.id]);
    const after = simulate(circuit);
    expect(Math.abs(after.parts.get(part.id)!.i[0])).toBeLessThan(1e-9);
  });

  it('a burned part conducts nothing', () => {
    const { b, part } = loop('led', { r: 330 });
    const c = updatePart(b.circuit(), part.id, { burn: { quantity: 'current', value: 1, limit: 0.03, v: [0, 0], i: [0, 0] } });
    expect(Math.abs(current(simulate(c), part))).toBeLessThan(1e-9);
  });

  it('an electrolytic capacitor connected backwards burns out', () => {
    const backwards = loop('capacitor', { r: 1000, reversed: true });
    expect(worstBurnout(backwards.b.circuit(), backwards.sim)?.burn.quantity).toBe('reverse');
    const right = loop('capacitor', { r: 1000 });
    expect(worstBurnout(right.b.circuit(), right.sim)).toBeNull();
  });

  it('the 9 V lamp is fine on 9 V and burns out on 18 V', () => {
    const ok = loop('lamp');
    expect(stressOf(ok.part, reading(ok.sim, ok.part))?.level).toBe('ok');
    const over = loop('lamp', { volts: 18 });
    expect(worstBurnout(over.b.circuit(), over.sim)?.id).toBe(over.part.id);
  });

  it('a shorted battery is flagged as a short circuit but never "burns"', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    b.wire([bat, 0], [bat, 1]);
    const sim = b.run();
    expect(stressOf(bat, reading(sim, bat))?.level).toBe('hot');
    expect(worstBurnout(b.circuit(), sim)).toBeNull();
  });

  it('transistor base wired straight to the battery burns it, and the explanation says why', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const q = b.add('npn');
    b.wire([bat, 0], [q, 0]);
    b.wire([q, 2], [bat, 1]);
    const worst = worstBurnout(b.circuit(), b.run());
    expect(worst?.id).toBe(q.id);
    const text = explainBurn(q, worst!.burn, 9);
    expect(text.why).toMatch(/base/);
    expect(text.fix).toMatch(/resistor/);
  });
});

describe('explanations', () => {
  it('standard resistor values round up to the E12 series', () => {
    expect(standardUp(350)).toBe(390);
    expect(standardUp(324)).toBe(330);
    expect(standardUp(1000)).toBe(1000);
    expect(standardUp(4700)).toBe(4700);
    expect(standardUp(9)).toBe(10);
    expect(standardUp(83)).toBe(100);
  });

  it('LED burnout suggests the right resistor for the battery voltage', () => {
    const { b, part, sim } = loop('led');
    const worst = worstBurnout(b.circuit(), sim)!;
    const text = explainBurn(part, worst.burn, 9);
    expect(text.fix).toContain('(9 − 2) ÷ 0.02 = 350 Ω');
    expect(text.fix).toContain('390 Ω');
  });

  it('resistor burnout works out the smallest safe resistance', () => {
    const { b, part, sim } = loop('resistor', { value: 100 });
    const worst = worstBurnout(b.circuit(), sim)!;
    const text = explainBurn(part, worst.burn, 9);
    near(worst.burn.value, (8.867 * 8.867) / 100, 0.01);
    expect(text.fix).toContain('330 Ω');
  });
});
