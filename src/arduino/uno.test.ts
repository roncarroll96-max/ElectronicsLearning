/**
 * The Arduino Uno part in the circuit simulator: real sketches, compiled by
 * the in-browser compiler, running on the emulated ATmega328P and driving
 * (and reading) a simulated circuit. Checked against what a real Uno does.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { addPart, addWire, createPart, newId, updatePart, type Circuit, type Part } from '../model/circuit';
import { UNO, type PartKind } from '../model/parts';
import { TransientSim } from '../sim/transient';
import { stressOf } from '../sim/ratings';
import { UnoCore } from './uno';
import { program, testToolkit } from './testKit';

beforeAll(async () => {
  await testToolkit();
}, 60_000);

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

const H = 2e-4; // the app's normal step

/** An Uno driving an LED through a resistor from `pin`. */
function ledOn(pin: number, ohms = 220) {
  const b = build();
  const uno = b.add('arduino');
  const r = b.add('resistor', ohms);
  const led = b.add('led');
  b.wire(uno, pin, r, 0);
  b.wire(r, 1, led, 0);
  b.wire(led, 1, uno, UNO.gnd);
  return { b, uno, r, led };
}

function start(c: Circuit, uno: Part, prog: Uint8Array) {
  const cores = new Map([[uno.id, new UnoCore(prog, 0)]]);
  return { sim: new TransientSim(c, undefined, 0, {}, cores), cores };
}

/** Runs for `seconds`, sampling `probe` after each step. */
function record(sim: TransientSim, seconds: number, probe: () => number, h = H) {
  const t: number[] = [];
  const v: number[] = [];
  for (let k = 0, n = Math.round(seconds / h); k < n; k++) {
    expect(sim.step(h)).toBe(true);
    t.push(sim.time);
    v.push(probe());
  }
  return { t, v };
}

/** Times at which a signal crosses `level` going up. */
function risingEdges(t: number[], v: number[], level: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < v.length; k++) if (v[k - 1] < level && v[k] >= level) out.push(t[k]);
  return out;
}

describe('Arduino Uno part', () => {
  it('blinks an LED through a resistor at exactly the rate the sketch says, with real pin voltages and current', async () => {
    const { b, uno, led } = ledOn(13);
    const { sim } = start(
      b.c,
      uno,
      await program('void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(250); digitalWrite(13, LOW); delay(250); }'),
    );
    const current = () => sim.result().parts.get(led.id)!.i[0];
    const { t, v } = record(sim, 1.3, current);
    const on = risingEdges([0, ...t], [0, ...v], 0.005); // from power-on, when the LED is off
    // On at the start, then every 0.5 s (delay() is exact; the step is 0.2 ms).
    expect(on.length).toBe(3);
    expect(on[1] - on[0]).toBeCloseTo(0.5, 3);
    expect(on[2] - on[1]).toBeCloseTo(0.5, 3);
    // While on: (5 V − about 1.9 V for a red LED) ÷ (220 Ω + 25 Ω inside the pin) ≈ 12.5 mA.
    const iOn = Math.max(...v);
    expect(iOn).toBeGreaterThan(0.011);
    expect(iOn).toBeLessThan(0.0135);
    // The pin itself sags a little under that load: 5 V less 12.5 mA × 25 Ω.
    const r = sim.result().parts.get(uno.id)!;
    expect(Math.max(...[r.v[13]])).toBeLessThan(5);
  }, 30_000);

  it('reads a push button with INPUT_PULLUP, and keeps running while the circuit is edited', async () => {
    const b = build();
    const uno = b.add('arduino');
    const btn = b.add('pushbutton');
    b.wire(uno, 2, btn, 0);
    b.wire(btn, 1, uno, UNO.gnd2);
    const prog = await program(
      'void setup() { pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, digitalRead(2) == LOW ? HIGH : LOW); }',
    );
    const { sim, cores } = start(b.c, uno, prog);
    const d13 = (s: TransientSim) => s.result().parts.get(uno.id)!.v[13];
    record(sim, 0.01, () => 0);
    expect(d13(sim)).toBeLessThan(0.5); // not pressed: the pull-up holds D2 HIGH
    expect(sim.result().parts.get(uno.id)!.v[2]).toBeGreaterThan(4.9);

    // Press it: a new simulator for the edited circuit, same running chip.
    b.c = updatePart(b.c, btn.id, { on: true });
    const pressed = new TransientSim(b.c, sim.capStates(), sim.time, {}, cores);
    record(pressed, 0.01, () => 0);
    expect(d13(pressed)).toBeGreaterThan(4.5);
    expect(cores.get(uno.id)!.time).toBeCloseTo(0.02, 3); // it carried on from where it was
  }, 30_000);

  it('measures a voltage with analogRead and prints it over Serial', async () => {
    const b = build();
    const uno = b.add('arduino');
    const pot = b.add('potentiometer', 10_000);
    b.wire(uno, UNO.v5, pot, 0);
    b.wire(pot, 1, uno, UNO.gnd);
    b.wire(pot, 2, uno, 14); // wiper to A0
    b.c = updatePart(b.c, pot.id, { pos: 0.25 });
    const { sim, cores } = start(
      b.c,
      uno,
      await program('void setup() { Serial.begin(115200); }\nvoid loop() { Serial.println(analogRead(A0)); delay(10); }'),
    );
    record(sim, 0.05, () => 0);
    const lines = cores.get(uno.id)!.takeSerial().trim().split(/\r\n/);
    const value = Number(lines[lines.length - 1]);
    // A quarter of the way along a divider across 5 V: ¾ of the supply at the wiper (End A is at 5 V).
    expect(value).toBeGreaterThanOrEqual(766);
    expect(value).toBeLessThanOrEqual(768);
  }, 30_000);

  it('reads an unconnected pin as 0 V (not some voltage in between)', async () => {
    const b = build();
    const uno = b.add('arduino');
    const { sim, cores } = start(b.c, uno, await program('void setup() { Serial.begin(115200); }\nvoid loop() { Serial.println(analogRead(A0)); delay(5); }'));
    record(sim, 0.02, () => 0);
    expect(sim.result().parts.get(uno.id)!.v[14]).toBeLessThan(0.01);
    expect(cores.get(uno.id)!.takeSerial().trim().split(/\r\n/).pop()).toBe('0');
  }, 30_000);

  it('makes PWM with analogWrite: 490 Hz on pin 9, high a quarter of the time for 64', async () => {
    const { b, uno } = ledOn(9);
    const { sim } = start(b.c, uno, await program('void setup() { analogWrite(9, 64); }\nvoid loop() {}'));
    const h = 1e-5; // fine steps, to see the pulses' shape
    const pin = () => sim.result().parts.get(uno.id)!.v[9];
    record(sim, 0.01, pin, h);
    const { t, v } = record(sim, 0.05, pin, h);
    const edges = risingEdges(t, v, 2.5);
    const f = (edges.length - 1) / (edges[edges.length - 1] - edges[0]);
    expect(f).toBeCloseTo(490.2, 0); // 16 MHz ÷ 64 ÷ 510, as on a real Uno
    const high = v.filter((x) => x > 2.5).length / v.length;
    expect(high).toBeCloseTo(64 / 255, 1);
  }, 30_000);

  it('plays a tone at the frequency asked for', async () => {
    const b = build();
    const uno = b.add('arduino');
    const spk = b.add('speaker');
    const r = b.add('resistor', 100);
    b.wire(uno, 8, r, 0);
    b.wire(r, 1, spk, 0);
    b.wire(spk, 1, uno, UNO.gnd);
    const { sim } = start(b.c, uno, await program('void setup() { tone(8, 440); }\nvoid loop() {}'));
    const h = 1 / 16000;
    const pin = () => sim.result().parts.get(uno.id)!.v[8];
    record(sim, 0.02, pin, h);
    const { t, v } = record(sim, 0.5, pin, h);
    const edges = risingEdges(t, v, 2.5);
    expect((edges.length - 1) / (edges[edges.length - 1] - edges[0])).toBeCloseTo(440, 0);
  }, 30_000);

  it('burns out when a pin drives an LED with no resistor', async () => {
    const b = build();
    const uno = b.add('arduino');
    const led = b.add('led');
    b.wire(uno, 13, led, 0);
    b.wire(led, 1, uno, UNO.gnd);
    const { sim } = start(b.c, uno, await program('void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }\nvoid loop() {}'));
    record(sim, 0.01, () => 0);
    const r = sim.result().parts.get(uno.id)!;
    // Only the pin's own 25 Ω limits it: well past the 40 mA absolute maximum.
    expect(Math.abs(r.i[13])).toBeGreaterThan(0.04);
    expect(stressOf(b.c.parts[0], r)?.level).toBe('burn');
  }, 30_000);

  it('runs an Uno with no program attached as a board with every pin an input', () => {
    const { b } = ledOn(13);
    const sim = new TransientSim(b.c, undefined, 0, {}, new Map());
    expect(sim.step(H)).toBe(true);
    expect(sim.result().parts.get(b.c.parts[0].id)!.v[UNO.v5]).toBeCloseTo(5, 1);
  });
});
