/**
 * The simulator checked against hand calculations.
 *
 * Linear circuits are compared with the textbook formula worked out in each
 * test's comment. Non-linear parts (diodes, LEDs, lamps) are compared with an
 * independent one-variable solve of the same physics by bisection, which
 * shares no code with the simulator, plus the rule-of-thumb answer a student
 * would calculate by hand.
 */
import { describe, expect, it } from 'vitest';
import type { Circuit, Part } from '../model/circuit';
import { PART_DEFS, type PartKind } from '../model/parts';
import { across, bench, current, near, reading, type Pin } from '../test/bench';
import * as M from './models';
import { simulate, type SimOptions } from './simulate';

/** Solves f(x) = 0 for increasing f on [lo, hi] by bisection. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Voltage a diode model drops at current I (inverse Shockley plus series resistance). */
function diodeV(I: number, m: M.DiodeModel) {
  return m.n * M.VT * Math.log(I / m.is + 1) + I * m.rs;
}

/** Current a battery drives through series resistance R and one diode. */
function diodeLoopCurrent(V: number, R: number, m: M.DiodeModel) {
  return bisect((I) => I * R + diodeV(I, m) - V, 0, V / R);
}

const RB = M.BATTERY_R;
/** Practically ideal battery, for exact textbook answers. */
const IDEAL: SimOptions = { batteryResistance: 1e-6 };

/* ---------- Linear circuits ---------- */

describe("Ohm's law and resistor networks", () => {
  it('battery and one resistor: I = V / (R + r)', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const w0 = b.wire([bat, 0], [r1, 0]);
    const w1 = b.wire([r1, 1], [bat, 1]);
    const r = b.run();

    const I = 9 / (1000 + RB); // 8.9865 mA
    near(current(r, r1), I);
    near(across(r, r1), I * 1000);
    near(reading(r, bat).i[0], -I); // current leaves the battery at +
    near(reading(r, bat).v[0], 9 - I * RB); // terminal voltage sags by I·r
    near(reading(r, r1).power, I * I * 1000);
    near(r.wires.get(w0.id)!, I);
    near(r.wires.get(w1.id)!, I);
  });

  it('ideal battery: exactly V / R', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 330);
    b.wire([bat, 0], [r1, 0]);
    b.wire([r1, 1], [bat, 1]);
    near(current(b.run(IDEAL), r1), 9 / 330, 1e-6); // 27.27 mA
  });

  it('voltage divider: Vout = V · R2 / (R1 + R2)', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const r2 = b.add('resistor', 2000);
    b.wire([bat, 0], [r1, 0]);
    b.wire([r1, 1], [r2, 0]);
    b.wire([r2, 1], [bat, 1]);
    near(reading(b.run(IDEAL), r2).v[0], (9 * 2000) / 3000); // 6 V

    const I = 9 / (3000 + RB);
    near(reading(b.run(), r2).v[0], I * 2000);
  });

  it('series–parallel: 1 kΩ + (2 kΩ ∥ 2 kΩ) = 2 kΩ, branches split evenly', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const r2 = b.add('resistor', 2000);
    const r3 = b.add('resistor', 2000);
    b.wire([bat, 0], [r1, 0]);
    const toR2 = b.wire([r1, 1], [r2, 0]);
    const toR3 = b.wire([r1, 1], [r3, 0]);
    b.wire([r2, 1], [bat, 1]);
    b.wire([r3, 1], [bat, 1]);
    const r = b.run();

    const I = 9 / (1000 + 1000 + RB);
    near(current(r, r1), I);
    near(current(r, r2), I / 2);
    near(current(r, r3), I / 2);
    near(r.wires.get(toR2.id)!, I / 2);
    near(r.wires.get(toR3.id)!, I / 2);
  });

  it('unbalanced Wheatstone bridge (not reducible to series/parallel)', () => {
    // Nodes: A = +9 V, B = 0 V. R1 A–C 1k, R2 C–B 2k, R3 A–D 3k, R4 D–B 4k, R5 C–D 5k.
    // KCL at C: (9−C)/1k = C/2k + (C−D)/5k  →  17C − 2D = 90
    // KCL at D: (9−D)/3k + (C−D)/5k = D/4k  →  12C − 47D = −180
    // ⇒ C = 918/155 = 5.92258 V, D = 828/155 = 5.34194 V, I(R5) = (C−D)/5k = 18/155000 A
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const r2 = b.add('resistor', 2000);
    const r3 = b.add('resistor', 3000);
    const r4 = b.add('resistor', 4000);
    const r5 = b.add('resistor', 5000);
    b.wire([bat, 0], [r1, 0]);
    b.wire([bat, 0], [r3, 0]);
    b.wire([r1, 1], [r2, 0]);
    b.wire([r3, 1], [r4, 0]);
    b.wire([r1, 1], [r5, 0]);
    b.wire([r5, 1], [r3, 1]);
    b.wire([r2, 1], [bat, 1]);
    b.wire([r4, 1], [bat, 1]);
    const r = b.run(IDEAL);

    near(reading(r, r2).v[0], 918 / 155);
    near(reading(r, r4).v[0], 828 / 155);
    near(current(r, r5), 18 / 155000);
  });

  it('batteries in series add; batteries opposing cancel', () => {
    const aid = bench();
    const b1 = aid.add('battery', 9);
    const b2 = aid.add('battery', 9);
    const r1 = aid.add('resistor', 1000);
    aid.wire([b1, 1], [b2, 0]);
    aid.wire([b1, 0], [r1, 0]);
    aid.wire([r1, 1], [b2, 1]);
    near(current(aid.run(), r1), 18 / (1000 + 2 * RB));

    const opp = bench();
    const c1 = opp.add('battery', 9);
    const c2 = opp.add('battery', 9);
    const r2 = opp.add('resistor', 1000);
    opp.wire([c1, 1], [c2, 1]);
    opp.wire([c1, 0], [r2, 0]);
    opp.wire([r2, 1], [c2, 0]);
    expect(Math.abs(current(opp.run(), r2))).toBeLessThan(1e-9);
  });

  it('potentiometer: wiper voltage follows its position', () => {
    // 10 kΩ pot across 9 V, wiper at 25% from End A (End A to +):
    // the wiper sits 7.5 kΩ above the − end ⇒ Vw = I · 7.5 kΩ
    const b = bench();
    const bat = b.add('battery', 9);
    const pot = b.add('potentiometer', 10_000, { pos: 0.25 });
    b.wire([bat, 0], [pot, 0]);
    b.wire([pot, 1], [bat, 1]);
    const r = b.run();
    const I = 9 / (10_000 + RB);
    near(reading(r, pot).v[2], I * 7500);
    expect(Math.abs(reading(r, pot).i[2])).toBeLessThan(1e-9); // nothing connected to the wiper
  });

  it('light sensor: 1 MΩ in the dark, 500 Ω in bright light', () => {
    for (const [light, ohms] of [
      [0, 1e6],
      [1, 500],
    ]) {
      const b = bench();
      const bat = b.add('battery', 9);
      const ldr = b.add('ldr', undefined, { light });
      b.wire([bat, 0], [ldr, 0]);
      b.wire([ldr, 1], [bat, 1]);
      near(current(b.run(), ldr), 9 / (ohms + RB));
    }
    near(M.ldrResistance(0.5), Math.sqrt(1e6 * 500)); // about 22 kΩ in room light
  });
});

describe('switches and capacitors', () => {
  const loop = (kind: PartKind, extra: Partial<Part>) => {
    const b = bench();
    const bat = b.add('battery', 9);
    const sw = b.add(kind, undefined, extra);
    const r1 = b.add('resistor', 1000);
    b.wire([bat, 0], [sw, 0]);
    b.wire([sw, 1], [r1, 0]);
    b.wire([r1, 1], [bat, 1]);
    return { r: b.run(), sw, r1 };
  };

  it('open switch: no current, full battery voltage across the switch', () => {
    const { r, sw, r1 } = loop('switch', { on: false });
    expect(Math.abs(current(r, r1))).toBeLessThan(1e-9);
    near(across(r, sw), 9, 1e-6);
  });

  it('open switch after an LED: still the full battery voltage across the switch', () => {
    // No current flows, so neither the resistor nor the LED drops any voltage.
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 330);
    const led = b.add('led');
    const sw = b.add('switch', undefined, { on: false });
    b.wire([bat, 0], [r1, 0]);
    b.wire([r1, 1], [led, 0]);
    b.wire([led, 1], [sw, 0]);
    b.wire([sw, 1], [bat, 1]);
    const r = b.run();
    near(across(r, sw), 9, 1e-6);
    near(across(r, led), 0, 0, 1e-6);
  });

  it('closed switch: I = V / (R + r + contact resistance)', () => {
    const { r, r1 } = loop('switch', { on: true });
    near(current(r, r1), 9 / (1000 + RB + M.SWITCH_R));
  });

  it('push button conducts only while pressed', () => {
    const released = loop('pushbutton', {});
    expect(Math.abs(current(released.r, released.r1))).toBeLessThan(1e-9);
    const pressed = loop('pushbutton', { on: true });
    near(current(pressed.r, pressed.r1), 9 / (1000 + RB + M.SWITCH_R));
  });

  it('capacitor in steady state blocks current and holds the full voltage', () => {
    const { r, sw: cap, r1 } = loop('capacitor', {});
    expect(Math.abs(current(r, r1))).toBeLessThan(1e-9);
    near(across(r, cap), 9, 1e-6);
  });
});

/* ---------- Non-linear parts ---------- */

describe('diodes and LEDs', () => {
  const series = (kind: PartKind, R: number, reversed = false) => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', R);
    const d = b.add(kind);
    b.wire([bat, 0], [r1, 0]);
    b.wire([r1, 1], [d, reversed ? 1 : 0]);
    b.wire([d, reversed ? 0 : 1], [bat, 1]);
    return { r: b.run(), d, r1 };
  };

  it('silicon diode with 1 kΩ: matches the exact physics, and the 0.7 V rule of thumb', () => {
    const { r, d } = series('diode', 1000);
    const exact = diodeLoopCurrent(9, 1000 + RB, M.DIODE_1N4148);
    near(current(r, d), exact, 1e-6);
    const vf = across(r, d);
    expect(vf).toBeGreaterThan(0.6);
    expect(vf).toBeLessThan(0.8);
    near(current(r, d), (9 - 0.7) / 1000, 0.03); // hand estimate: 8.3 mA
  });

  it('red LED with 330 Ω: about 2 V across it and 21 mA through it', () => {
    const { r, d } = series('led', 330);
    near(current(r, d), diodeLoopCurrent(9, 330 + RB, M.LED_RED), 1e-6);
    const vf = across(r, d);
    expect(vf).toBeGreaterThan(1.9);
    expect(vf).toBeLessThan(2.1);
    near(current(r, d), (9 - 2) / 330, 0.03); // the classic calculation: 21.2 mA
  });

  it('red LED datasheet points: 2.0 V at 20 mA, about 1.75 V at 1 mA', () => {
    near(diodeV(0.02, M.LED_RED), 2.0, 0.01);
    near(diodeV(0.001, M.LED_RED), 1.75, 0.02);
  });

  it('reversed LED and reversed diode carry only tiny leakage current', () => {
    // A silicon diode leaks its saturation current, 2.5 nA (1N4148 datasheet: up to 25 nA).
    for (const kind of ['led', 'diode'] as const) {
      const { r, d } = series(kind, 330, true);
      expect(Math.abs(current(r, d))).toBeLessThan(kind === 'led' ? 1e-10 : 1e-8);
      near(across(r, d), -9, 1e-6); // anode 9 V below cathode: the whole battery across it
    }
  });

  it('LED straight across a battery (no resistor) gives a large but finite current', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const led = b.add('led');
    b.wire([bat, 0], [led, 0]);
    b.wire([led, 1], [bat, 1]);
    const I = current(b.run(), led);
    near(I, diodeLoopCurrent(9, RB, M.LED_RED), 1e-6);
    expect(I).toBeGreaterThan(0.5); // far beyond an LED's ~20 mA rating
  });

  it('ten LEDs in series on 9 V barely conduct (they need ~18 V)', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const leds = Array.from({ length: 10 }, () => b.add('led'));
    b.wire([bat, 0], [leds[0], 0]);
    for (let k = 1; k < 10; k++) b.wire([leds[k - 1], 1], [leds[k], 0]);
    b.wire([leds[9], 1], [bat, 1]);
    const r = b.run();
    expect(current(r, leds[0])).toBeLessThan(1e-6);
    for (const l of leds) near(across(r, l), 0.9, 0.01); // 9 V shared equally
  });

  it('buzzer: about 15 mA at 9 V, nothing when reversed', () => {
    const fwd = series('buzzer', 0.01);
    near(current(fwd.r, fwd.d), diodeLoopCurrent(9, 0.01 + RB, M.BUZZER), 1e-6);
    near(current(fwd.r, fwd.d), 0.015, 0.05);
    const rev = series('buzzer', 0.01, true);
    expect(Math.abs(current(rev.r, rev.d))).toBeLessThan(1e-8); // leakage only
  });
});

describe('lamp', () => {
  const lampLoop = (volts: number, opts?: SimOptions) => {
    const b = bench();
    const bat = b.add('battery', volts);
    const lamp = b.add('lamp');
    b.wire([bat, 0], [lamp, 0]);
    b.wire([lamp, 1], [bat, 1]);
    return { r: b.run(opts), lamp };
  };

  it('draws its rated 50 mA at 9 V', () => {
    const { r, lamp } = lampLoop(9, IDEAL);
    near(current(r, lamp), 0.05);
  });

  it("at half voltage it draws more than half the current: a hot filament's resistance rises", () => {
    const { r, lamp } = lampLoop(4.5, IDEAL);
    near(current(r, lamp), 0.05 * 0.5 ** 0.55); // 34.2 mA, not 25 mA
    near(4.5 / current(r, lamp), 131.8, 0.001); // 132 Ω, versus 180 Ω when fully hot
  });

  it('with a real battery: matches an independent solve', () => {
    const { r, lamp } = lampLoop(9);
    const lampV = (I: number) => M.LAMP.v * (I / M.LAMP.i) ** (1 / M.LAMP.exponent);
    near(current(r, lamp), bisect((I) => I * RB + lampV(I) - 9, 0, 9 / RB));
  });
});

describe('NPN transistor', () => {
  // Common-emitter: base fed from +9 V through Rb, collector load Rc to +9 V, emitter to −.
  const amp = (Rb: number, Rc: number) => {
    const b = bench();
    const bat = b.add('battery', 9);
    const rb = b.add('resistor', Rb);
    const rc = b.add('resistor', Rc);
    const q = b.add('npn');
    b.wire([bat, 0], [rb, 0]);
    b.wire([bat, 0], [rc, 0]);
    b.wire([rb, 1], [q, 0]);
    b.wire([rc, 1], [q, 1]);
    b.wire([q, 2], [bat, 1]);
    const r = b.run();
    const t = reading(r, q);
    return { ib: t.i[0], ic: t.i[1], ie: t.i[2], vbe: t.v[0] - t.v[2], vce: t.v[1] - t.v[2] };
  };

  it('active region (Rb = 1 MΩ, Rc = 1 kΩ): Ic = β · Ib', () => {
    // Hand: Ib ≈ (9 − 0.65) / 1 MΩ = 8.35 µA, Ic = 200 · Ib ≈ 1.67 mA, Vce ≈ 9 − 1.67 = 7.33 V
    const { ib, ic, ie, vbe, vce } = amp(1e6, 1000);
    near(ic / ib, 200, 1e-4);
    near(ie, -(ib + ic), 1e-9); // all current leaves through the emitter
    expect(vbe).toBeGreaterThan(0.6);
    expect(vbe).toBeLessThan(0.75);
    near(ib, 8.35e-6, 0.03);
    near(ic, 1.67e-3, 0.03);
    near(vce, 7.33, 0.03);
  });

  it('saturated (Rb = 10 kΩ): fully on, collector current set by the load', () => {
    // β · Ib ≈ 200 · 0.83 mA = 166 mA, but 1 kΩ only allows ≈ 9 mA ⇒ saturated, Vce ≈ 0.1 V
    const { ib, ic, vce } = amp(10_000, 1000);
    expect(vce).toBeLessThan(0.2);
    expect(vce).toBeGreaterThan(0);
    near(ic, (9 - vce) / 1000, 0.01);
    expect(ic / ib).toBeLessThan(20);
  });

  it('no base current: transistor off', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const rc = b.add('resistor', 1000);
    const q = b.add('npn');
    b.wire([bat, 0], [rc, 0]);
    b.wire([rc, 1], [q, 1]);
    b.wire([q, 2], [bat, 1]);
    // Only leakage flows: 2N3904 datasheet cutoff current is at most 50 nA.
    expect(Math.abs(reading(b.run(), q).i[1])).toBeLessThan(50e-9);
  });
});

/* ---------- Ground, references, odd circuits ---------- */

describe('ground and reference', () => {
  it('moving the ground symbol changes voltage readings but not currents', () => {
    const make = (groundPin: 0 | 1) => {
      const b = bench();
      const bat = b.add('battery', 9);
      const r1 = b.add('resistor', 1000);
      const gnd = b.add('ground');
      b.wire([bat, 0], [r1, 0]);
      b.wire([r1, 1], [bat, 1]);
      b.wire([bat, groundPin], [gnd, 0]);
      return { r: b.run(), bat, r1, gnd };
    };
    const I = 9 / (1000 + RB);
    const low = make(1);
    const high = make(0);
    near(current(low.r, low.r1), I);
    near(current(high.r, high.r1), I);
    near(reading(low.r, low.bat).v[0], 9 - I * RB);
    near(reading(high.r, high.bat).v[1], -(9 - I * RB)); // ground at +, so − is negative
    expect(Math.abs(reading(low.r, low.gnd).i[0])).toBeLessThan(1e-9); // one ground: no current in it
  });

  it('two ground symbols are connected to each other', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const g1 = b.add('ground');
    const g2 = b.add('ground');
    b.wire([bat, 0], [r1, 0]);
    b.wire([bat, 1], [g1, 0]);
    b.wire([r1, 1], [g2, 0]);
    const r = b.run();
    const I = 9 / (1000 + RB);
    near(current(r, r1), I);
    near(reading(r, g2).i[0], I); // current flows into ground at G2...
    near(reading(r, g1).i[0], -I); // ...and back out at G1
  });

  it('separate circuits are each solved on their own', () => {
    const b = bench();
    const b1 = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const b2 = b.add('battery', 3);
    const r2 = b.add('resistor', 100);
    b.wire([b1, 0], [r1, 0]);
    b.wire([r1, 1], [b1, 1]);
    b.wire([b2, 0], [r2, 0]);
    b.wire([r2, 1], [b2, 1]);
    const r = b.run();
    near(current(r, r1), 9 / (1000 + RB));
    near(current(r, r2), 3 / (100 + RB));
  });

  it('short circuit: limited only by the battery’s internal resistance', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const w = b.wire([bat, 0], [bat, 1]);
    const r = b.run();
    near(r.wires.get(w.id)!, 9 / RB); // 6 A
  });

  it('empty circuit, unconnected parts and no battery are all fine', () => {
    expect(simulate({ parts: [], wires: [] }).idle).toBe(true);

    const b = bench();
    const bat = b.add('battery', 9);
    b.add('led');
    b.add('npn');
    b.add('ground');
    const r = b.run();
    near(reading(r, bat).v[0], 9); // open battery shows its full voltage

    const nb = bench();
    const r1 = nb.add('resistor', 100);
    const r2 = nb.add('resistor', 100);
    nb.wire([r1, 0], [r2, 0]);
    const idle = nb.run();
    expect(idle.idle).toBe(true);
    expect(current(idle, r1)).toBe(0);
  });

  it('a loop of wires shares current equally between equal paths', () => {
    // Battery + feeds two equal 1 kΩ resistors; the three pins are joined by a triangle of wires.
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    const r2 = b.add('resistor', 1000);
    const wa = b.wire([bat, 0], [r1, 0]);
    const wb = b.wire([bat, 0], [r2, 0]);
    const wc = b.wire([r1, 0], [r2, 0]);
    b.wire([r1, 1], [bat, 1]);
    b.wire([r2, 1], [bat, 1]);
    const r = b.run();
    const I = 9 / (500 + RB);
    near(r.wires.get(wa.id)!, I / 2);
    near(r.wires.get(wb.id)!, I / 2);
    near(r.wires.get(wc.id)!, 0, 0, 1e-12);
  });
});

/* ---------- Conservation laws on random circuits ---------- */

describe('conservation laws on random circuits', () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  function randomCircuit(seed: number): Circuit {
    const rand = rng(seed);
    const b = bench();
    const kinds: PartKind[] = ['resistor', 'resistor', 'resistor', 'led', 'diode', 'lamp', 'npn', 'potentiometer'];
    b.add('battery', 3 + Math.round(rand() * 9));
    const count = 3 + Math.floor(rand() * 8);
    for (let k = 0; k < count; k++) {
      const kind = kinds[Math.floor(rand() * kinds.length)];
      b.add(kind, kind === 'resistor' ? 10 ** (1 + rand() * 5) : undefined, { pos: rand() });
    }
    if (rand() < 0.5) b.add('ground');
    const pins: Pin[] = b.parts.flatMap((p) => PART_DEFS[p.kind].pins.map((_, i) => [p, i] as Pin));
    const wireCount = Math.floor(pins.length * (0.6 + rand() * 0.6));
    for (let k = 0; k < wireCount; k++) {
      const a = pins[Math.floor(rand() * pins.length)];
      const c = pins[Math.floor(rand() * pins.length)];
      if (a === c) continue;
      if (b.wires.some((w) => (w.a.part === a[0].id && w.a.pin === a[1] && w.b.part === c[0].id && w.b.pin === c[1]) || (w.a.part === c[0].id && w.a.pin === c[1] && w.b.part === a[0].id && w.b.pin === a[1]))) continue;
      b.wire(a, c);
    }
    return { parts: b.parts, wires: b.wires };
  }

  it('200 random circuits: always solves, KCL holds at every pin, power balances', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const c = randomCircuit(seed);
      const r = simulate(c);
      expect(r.ok, `seed ${seed}`).toBe(true);

      let absorbed = 0;
      let scale = 0;
      for (const p of c.parts) {
        const t = r.parts.get(p.id)!;
        // Each part's pin currents add up to zero (charge isn't created inside a part),
        // to within a few parts per billion of the current flowing.
        // (A ground symbol has one pin: its current goes into the shared ground.)
        const biggest = Math.max(...t.i.map(Math.abs));
        if (p.kind !== 'ground') expect(Math.abs(t.i.reduce((s, x) => s + x, 0)), `seed ${seed} ${p.id}`).toBeLessThanOrEqual(1e-8 * biggest + 1e-12);
        absorbed += t.power;
        scale += Math.abs(t.power);
      }
      // Tellegen's theorem: total power supplied equals total power absorbed.
      expect(Math.abs(absorbed), `seed ${seed}`).toBeLessThanOrEqual(1e-9 * scale + 1e-9);

      // At every pin, the wires carry away exactly what the part pushes out
      // (to a few parts per billion of the largest current in the circuit).
      const largest = Math.max(0, ...[...r.parts.values()].flatMap((t) => t.i.map(Math.abs)));
      const flow = new Map<string, number>();
      for (const w of c.wires) {
        const cur = r.wires.get(w.id)!;
        const ka = `${w.a.part}:${w.a.pin}`;
        const kb = `${w.b.part}:${w.b.pin}`;
        flow.set(ka, (flow.get(ka) ?? 0) + cur);
        flow.set(kb, (flow.get(kb) ?? 0) - cur);
      }
      for (const [k, out] of flow) {
        const [id, pin] = k.split(':');
        const into = r.parts.get(id)!.i[Number(pin)];
        expect(Math.abs(out + into), `seed ${seed} pin ${k}`).toBeLessThanOrEqual(1e-8 * largest + 1e-12);
      }
    }
  });
});
