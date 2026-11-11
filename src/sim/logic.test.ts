/**
 * Logic chips (gates, D flip-flop) on their hidden 5 V supply, and the
 * 7-segment display: truth tables, a latch made of gates, a counter made of
 * flip-flops, and the voltages and currents a real 74HC chip gives.
 */
import { describe, expect, it } from 'vitest';
import { addPart, addWire, createPart, newId, updatePart, type Circuit, type Part } from '../model/circuit';
import { GATE_KINDS, SEG, logicPins, type PartKind } from '../model/parts';
import { TransientSim } from './transient';
import { stressOf } from './ratings';

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

const H = 2e-4;
function run(c: Circuit, carry?: ReturnType<TransientSim['capStates']>, steps = 5) {
  const sim = new TransientSim(c, carry, 0);
  for (let k = 0; k < steps; k++) expect(sim.step(H)).toBe(true);
  return sim;
}

/** A switch from the chip's own 5V pin to an input, with a 10 kΩ pull-down: closed = HIGH. */
function inputSwitch(b: ReturnType<typeof build>, chip: Part, pin: number) {
  const lp = logicPins(chip.kind);
  const sw = b.add('switch');
  const r = b.add('resistor', 10_000);
  b.wire(chip, lp.v5, sw, 0);
  b.wire(sw, 1, chip, pin);
  b.wire(chip, pin, r, 0);
  b.wire(r, 1, chip, lp.gnd);
  return sw;
}

const TRUTH: Record<string, (a: boolean, b: boolean) => boolean> = {
  and: (a, b) => a && b,
  or: (a, b) => a || b,
  not: (a) => !a,
  nand: (a, b) => !(a && b),
  nor: (a, b) => !(a || b),
  xor: (a, b) => a !== b,
};

describe('logic gates', () => {
  for (const kind of GATE_KINDS) {
    it(`${kind.toUpperCase()} follows its truth table, lighting an LED from its output`, () => {
      const b = build();
      const g = b.add(kind);
      const lp = logicPins(kind);
      const swA = inputSwitch(b, g, lp.inputs[0]);
      const swB = lp.inputs.length > 1 ? inputSwitch(b, g, lp.inputs[1]) : null;
      const r = b.add('resistor', 330);
      const led = b.add('led');
      b.wire(g, lp.outputs[0], r, 0);
      b.wire(r, 1, led, 0);
      b.wire(led, 1, g, lp.gnd);
      for (const a of [false, true]) {
        for (const bb of swB ? [false, true] : [false]) {
          let c = updatePart(b.c, swA.id, { on: a });
          if (swB) c = updatePart(c, swB.id, { on: bb });
          const res = run(c).result();
          const vOut = res.parts.get(g.id)!.v[lp.outputs[0]] - res.parts.get(g.id)!.v[lp.gnd];
          const lit = res.parts.get(led.id)!.i[0] > 0.005;
          const want = TRUTH[kind](a, bb);
          expect(lit, `${kind}(${a}, ${bb})`).toBe(want);
          // A HIGH output sags a little under the LED's ~9 mA (25 Ω inside); a LOW one sits at 0 V.
          if (want) expect(vOut).toBeGreaterThan(4.6);
          else expect(vOut).toBeLessThan(0.05);
        }
      }
    });
  }

  it('burns out driving an LED with no resistor', () => {
    const b = build();
    const g = b.add('not');
    const led = b.add('led');
    b.wire(g, 1, led, 0);
    b.wire(led, 1, g, 3);
    const res = run(b.c).result().parts.get(g.id)!;
    expect(Math.abs(res.i[1])).toBeGreaterThan(0.05); // only the output's own 25 Ω limits it
    expect(stressOf(b.c.parts[0], res)?.level).toBe('burn');
  });

  it('reads an unconnected input as LOW', () => {
    const b = build();
    const g = b.add('not');
    const res = run(b.c).result();
    expect(res.parts.get(g.id)!.v[1]).toBeGreaterThan(4.9); // NOT of LOW
  });

  it('remembers with two cross-coupled NAND gates (a set–reset latch)', () => {
    const b = build();
    const n1 = b.add('nand');
    const n2 = b.add('nand');
    b.wire(n1, 4, n2, 4); // shared ground
    b.wire(n1, 2, n2, 0); // Q → n2
    b.wire(n2, 2, n1, 1); // Q̄ → n1
    // Set and reset are active LOW: pulled up, a push button pulls them down.
    const pull = (chip: Part, pin: number) => {
      const r = b.add('resistor', 10_000);
      const btn = b.add('pushbutton');
      b.wire(chip, 3, r, 0);
      b.wire(r, 1, chip, pin);
      b.wire(chip, pin, btn, 0);
      b.wire(btn, 1, chip, 4);
      return btn;
    };
    const set = pull(n1, 0);
    const reset = pull(n2, 1);
    const q = (s: TransientSim) => s.result().parts.get(n1.id)!.v[2] > 2.5;

    let sim = run(updatePart(b.c, set.id, { on: true }));
    expect(q(sim)).toBe(true); // set
    sim = run(b.c, sim.capStates());
    expect(q(sim)).toBe(true); // released: still set (memory)
    sim = run(updatePart(b.c, reset.id, { on: true }), sim.capStates());
    expect(q(sim)).toBe(false); // reset
    sim = run(b.c, sim.capStates());
    expect(q(sim)).toBe(false); // released: still reset
  });
});

describe('D flip-flop', () => {
  it('copies D to Q only on the rising edge of Clock', () => {
    const b = build();
    const ff = b.add('dff');
    const d = inputSwitch(b, ff, 0);
    const clk = inputSwitch(b, ff, 1);
    const q = (s: TransientSim) => s.result().parts.get(ff.id)!.v[2] > 2.5;
    const qbar = (s: TransientSim) => s.result().parts.get(ff.id)!.v[3] > 2.5;
    let sim = run(b.c);
    expect([q(sim), qbar(sim)]).toEqual([false, true]); // powers up cleared
    sim = run(updatePart(b.c, d.id, { on: true }), sim.capStates());
    expect(q(sim)).toBe(false); // D alone does nothing
    let c = updatePart(updatePart(b.c, d.id, { on: true }), clk.id, { on: true });
    sim = run(c, sim.capStates());
    expect([q(sim), qbar(sim)]).toEqual([true, false]); // clocked in
    c = updatePart(updatePart(b.c, d.id, { on: false }), clk.id, { on: true });
    sim = run(c, sim.capStates());
    expect(q(sim)).toBe(true); // D changed while Clock stays high: ignored
    sim = run(updatePart(b.c, clk.id, { on: false }), sim.capStates());
    expect(q(sim)).toBe(true); // falling edge: ignored
    sim = run(updatePart(b.c, clk.id, { on: true }), sim.capStates());
    expect(q(sim)).toBe(false); // next rising edge: D (low) clocked in
  });

  it('counts in binary as a two-stage ripple counter (Q̄ fed back to D)', () => {
    const b = build();
    const f1 = b.add('dff');
    const f2 = b.add('dff');
    b.wire(f1, 5, f2, 5);
    b.wire(f1, 3, f1, 0); // Q̄ → D: toggles on each clock
    b.wire(f2, 3, f2, 0);
    b.wire(f1, 3, f2, 1); // f1's Q̄ clocks f2: f2 toggles when f1 goes 1 → 0
    const clk = inputSwitch(b, f1, 1);
    const count = (s: TransientSim) => {
      const r = s.result().parts;
      return (r.get(f1.id)!.v[2] > 2.5 ? 1 : 0) + (r.get(f2.id)!.v[2] > 2.5 ? 2 : 0);
    };
    let sim = run(b.c);
    const seen = [count(sim)];
    for (let k = 0; k < 5; k++) {
      sim = run(updatePart(b.c, clk.id, { on: true }), sim.capStates());
      seen.push(count(sim));
      sim = run(b.c, sim.capStates());
    }
    expect(seen).toEqual([0, 1, 2, 3, 0, 1]);
  });
});

describe('7-segment display', () => {
  it('lights the segments driven through resistors, and only those', () => {
    const b = build();
    const bat = b.add('battery', 5);
    const disp = b.add('sevenseg');
    b.wire(bat, 1, disp, SEG.com);
    // Show a "1": segments b and c.
    for (const seg of [1, 2]) {
      const r = b.add('resistor', 330);
      b.wire(bat, 0, r, 0);
      b.wire(r, 1, disp, seg);
    }
    const res = run(b.c).result().parts.get(disp.id)!;
    const lit = Array.from({ length: SEG.count }, (_, k) => res.i[k] > 0.005);
    expect(lit).toEqual([false, true, true, false, false, false, false, false]);
    expect(res.i[1]).toBeGreaterThan(0.008); // (5 − ~1.9 V) ÷ 330 Ω ≈ 9 mA
    expect(res.i[1]).toBeLessThan(0.011);
  });
});
