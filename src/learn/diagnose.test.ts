/** "Why isn't it working?" finds the classic beginner faults, and its one-click fixes really fix them. */
import { describe, expect, it } from 'vitest';
import type { Circuit } from '../model/circuit';
import { simulate } from '../sim/simulate';
import { bench, near } from '../test/bench';
import { diagnose, type IssueKind } from './diagnose';

const kinds = (c: Circuit) => diagnose(c, simulate(c)).map((i) => i.kind);
const first = (c: Circuit) => diagnose(c, simulate(c))[0];

/** Battery → resistor → LED → back, with optional faults. */
function ledCircuit(opts: { r?: number; reversed?: boolean; skipReturn?: boolean; withSwitch?: boolean } = {}) {
  const b = bench();
  const bat = b.add('battery', 9);
  const res = b.add('resistor', opts.r ?? 330);
  const led = b.add('led');
  b.wire([bat, 0], [res, 0]);
  b.wire([res, 1], [led, opts.reversed ? 1 : 0]);
  const ledOut: [typeof led, number] = [led, opts.reversed ? 0 : 1];
  if (opts.withSwitch) {
    const sw = b.add('switch', undefined, { on: false });
    b.wire(ledOut, [sw, 0]);
    b.wire([sw, 1], [bat, 1]);
    return { b, bat, res, led, sw };
  }
  if (!opts.skipReturn) b.wire(ledOut, [bat, 1]);
  return { b, bat, res, led };
}

/** Applies the first issue's one-click fix. */
function applyFirst(c: Circuit): Circuit {
  const issue = first(c);
  expect(issue.action).toBeDefined();
  return issue.action!.apply(c);
}

describe('a working circuit', () => {
  it('has nothing to report', () => {
    expect(kinds(ledCircuit().b.circuit())).toEqual([]);
    expect(kinds({ parts: [], wires: [] })).toEqual([]);
  });
});

describe('faults', () => {
  it('no battery', () => {
    const b = bench();
    b.add('led');
    expect(kinds(b.circuit())).toEqual(['no-battery']);
  });

  it('a pin left unconnected breaks the loop, and the hint points at that pin', () => {
    // The missing return wire leaves two loose ends: the LED's cathode and the battery's −.
    const { b, led } = ledCircuit({ skipReturn: true });
    const all = diagnose(b.circuit(), simulate(b.circuit()));
    expect(all.map((i) => i.kind)).toEqual(['battery-unconnected', 'dangling']);
    const issue = all[1];
    expect(issue.pins).toEqual([{ part: led.id, pin: 1 }]);
    expect(issue.where).toContain('Cathode');
  });

  it('an unconnected battery terminal', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 330);
    b.wire([bat, 0], [r, 0]);
    expect(first(b.circuit()).kind).toBe<IssueKind>('battery-unconnected');
  });

  it('missing ground: the circuit returns to a ground symbol but the battery’s − does not', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 330);
    const gnd = b.add('ground');
    b.wire([bat, 0], [r, 0]);
    b.wire([r, 1], [gnd, 0]);
    expect(first(b.circuit()).kind).toBe<IssueKind>('missing-ground');
  });

  it('an open switch, fixed by closing it', () => {
    const { b, led } = ledCircuit({ withSwitch: true });
    expect(first(b.circuit()).kind).toBe('open-switch');
    const fixed = applyFirst(b.circuit());
    expect(kinds(fixed)).toEqual([]);
    expect(simulate(fixed).parts.get(led.id)!.i[0]).toBeGreaterThan(0.02);
  });

  it('a backwards LED, fixed by turning it around', () => {
    const { b, led } = ledCircuit({ reversed: true });
    expect(first(b.circuit()).kind).toBe('backwards');
    const fixed = applyFirst(b.circuit());
    expect(kinds(fixed)).toEqual([]);
    near(simulate(fixed).parts.get(led.id)!.i[0], 0.0211, 0.01);
  });

  it('a resistor far too large for the LED to light, fixed with the suggested value', () => {
    const { b, led } = ledCircuit({ r: 1e6 });
    const issue = first(b.circuit());
    expect(issue.kind).toBe('too-dim');
    expect(issue.fix).toContain('470 Ω');
    const fixed = applyFirst(b.circuit());
    expect(kinds(fixed)).toEqual([]);
    near(simulate(fixed).parts.get(led.id)!.i[0], 0.0147, 0.02);
  });

  it('too many LEDs in series for the battery', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const leds = Array.from({ length: 6 }, () => b.add('led'));
    b.wire([bat, 0], [leds[0], 0]);
    for (let k = 1; k < leds.length; k++) b.wire([leds[k - 1], 1], [leds[k], 0]);
    b.wire([leds[leds.length - 1], 1], [bat, 1]);
    expect(kinds(b.circuit())).toContain('low-voltage');
  });

  it('a part bypassed by a wire', () => {
    const { b, res } = ledCircuit();
    b.wire([res, 0], [res, 1]);
    expect(kinds(b.circuit())).toContain('bypassed');
  });

  it('a burned-out part, fixed by replacing it', () => {
    const { b, led } = ledCircuit();
    led.burn = { quantity: 'current', value: 1, limit: 0.03, v: [0, 0], i: [0, 0] };
    expect(first(b.circuit()).kind).toBe('burned');
    expect(kinds(applyFirst(b.circuit()))).toEqual([]);
  });

  it('a short circuit', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    b.wire([bat, 0], [bat, 1]);
    expect(first(b.circuit()).kind).toBe('short');
  });

  it('a capacitor in series blocks the loop', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 1000);
    const cap = b.add('capacitor');
    b.wire([bat, 0], [r, 0]);
    b.wire([r, 1], [cap, 0]);
    b.wire([cap, 1], [bat, 1]);
    expect(first(b.circuit()).kind).toBe('capacitor-blocks');
  });

  it('a transistor with nothing at its base stays off', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r = b.add('resistor', 1000);
    const q = b.add('npn');
    b.wire([bat, 0], [r, 0]);
    b.wire([r, 1], [q, 1]);
    b.wire([q, 2], [bat, 1]);
    const issue = first(b.circuit());
    expect(issue.kind).toBe('transistor-off');
    expect(issue.what).toContain('base isn’t connected');
  });

  it('parts running hot: with 150 Ω both the LED (44 mA) and the resistor (0.29 W) are over their ratings', () => {
    const { b, led, res } = ledCircuit({ r: 150 });
    const all = diagnose(b.circuit(), simulate(b.circuit()));
    expect(all.map((i) => i.kind)).toEqual(['hot', 'hot']);
    expect(all.flatMap((i) => i.parts).sort()).toEqual([led.id, res.id].sort());
  });
});
