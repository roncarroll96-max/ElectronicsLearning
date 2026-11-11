/**
 * Every lesson can be completed: each test plays the learner, doing exactly
 * what the steps ask, and checks the steps tick off in order. This catches a
 * step whose check is impossible (or too easy) before a real learner does.
 */
import { describe, expect, it } from 'vitest';
import { addPart, addWire, createPart, deleteItems, flipPart, newId, updatePart, type Circuit, type Part } from '../../model/circuit';
import type { PartKind } from '../../model/parts';
import { circuitWithMeter, fuseOverload, INITIAL_METER, readMeter, type MeterMode, type MeterState } from '../../meter/meter';
import type { PinRef } from '../../model/circuit';
import { AUDIO_RATE, usesTime } from '../../sim/live';
import { simulate, type SimResult } from '../../sim/simulate';
import { Trace } from '../../scope/trace';
import { INITIAL_SCOPE, scopeView } from '../../scope/scope';
import { Recorder } from './recorder';
import { SPEAKER } from '../../sim/models';
import { TransientSim } from '../../sim/transient';
import { BASE_STEP } from '../../state/useLiveSim';
import { worstBurnout } from '../../sim/ratings';
import { topology } from '../topology';
import { lessonById, LESSONS } from './index';
import { advance, isComplete } from './progress';
import { allSteps, type CheckCtx, type Lesson } from './types';

/** Plays a lesson: holds the circuit and meter, and ticks steps as the learner acts. */
function play(id: string) {
  const lesson = lessonById(id) as Lesson;
  let c: Circuit = lesson.starter ? lesson.starter() : { parts: [], wires: [] };
  let meter: MeterState = { ...INITIAL_METER };
  let done: string[] = [];
  // The oscilloscope (its probes and record), the readings' recent history, and the sound switch.
  let scope = { open: false, pins: [null, null] as [PinRef | null, PinRef | null] };
  const trace = new Trace();
  const recorder = new Recorder();
  let sound = false;
  // Each speaker's loudness since the last tick: the changing part of its current, rms (as the live engine measures it).
  let levels = new Map<string, number>();
  const acc = new Map<string, { sum: number; sq: number; n: number }>();

  // Like the app: a circuit with capacitors runs in time (the learner waits, the clock moves);
  // without them it's solved once. The stepper is rebuilt on every change, keeping charge.
  let engine: TransientSim | null = null;
  let engineFor: [Circuit, MeterState] | null = null;
  const live = (): SimResult => {
    const sc = circuitWithMeter(c, meter);
    if (!usesTime(sc)) {
      engine = null;
      return simulate(sc);
    }
    if (!engine || !engineFor || engineFor[0] !== c || engineFor[1] !== meter) {
      engine = new TransientSim(sc, engine?.capStates(), engine?.time ?? 0);
      engineFor = [c, meter];
    }
    return engine.result();
  };

  const ctx = (): CheckCtx => {
    // The app burns out the most overloaded part, one at a time, until none is.
    for (let n = 0; n < 5; n++) {
      const worst = worstBurnout(c, live());
      if (!worst || worst.id.startsWith('__')) break;
      c = updatePart(c, worst.id, { burn: worst.burn });
    }
    const sim = live();
    // The app blows the fuse when an ammeter carries too much.
    const blown = fuseOverload(meter, sim);
    if (blown !== null) meter = { ...meter, fuseBlownAt: blown };
    const sim2 = blown !== null ? live() : sim;
    const time = (engine as TransientSim | null)?.time ?? 0;
    recorder.record(time, sim2);
    return {
      c,
      sim: sim2,
      t: topology(c),
      meter,
      reading: meter.open ? readMeter(c, meter, sim2) : null,
      time,
      scope: scopeView({ ...INITIAL_SCOPE, open: scope.open }, scope.open ? scope.pins : [null, null], trace, time),
      recent: recorder,
      sound,
      levels,
    };
  };
  const tick = () => {
    done = advance(lesson, done, ctx());
    return done;
  };
  const find = (kind: PartKind, n = 0): Part => c.parts.filter((p) => p.kind === kind)[n];
  const api = {
    lesson,
    get c() {
      return c;
    },
    set c(next: Circuit) {
      c = next;
    },
    find,
    ref(r: string): Part {
      const p = c.parts.find((x) => x.ref === r);
      expect(p, r).toBeDefined();
      return p!;
    },
    remove(p: Part) {
      c = deleteItems(c, new Set([p.id]));
    },
    add(kind: PartKind, value?: number) {
      const p = createPart(kind, 0, 0);
      c = addPart(c, value !== undefined ? { ...p, value } : p);
      return c.parts[c.parts.length - 1];
    },
    wire(a: Part, pa: number, b: Part, pb: number) {
      c = addWire(c, newId('w'), { part: a.id, pin: pa }, { part: b.id, pin: pb });
    },
    unwire(a: Part, pa: number, b: Part, pb: number) {
      const w = c.wires.find(
        (w) =>
          (w.a.part === a.id && w.a.pin === pa && w.b.part === b.id && w.b.pin === pb) ||
          (w.b.part === a.id && w.b.pin === pa && w.a.part === b.id && w.a.pin === pb),
      );
      expect(w, 'wire to delete').toBeDefined();
      c = deleteItems(c, new Set([w!.id]));
    },
    set(p: Part, patch: Parameters<typeof updatePart>[2]) {
      c = updatePart(c, p.id, patch);
    },
    meter(mode: MeterMode, red?: [Part, number], black?: [Part, number]) {
      meter = {
        ...meter,
        open: true,
        mode,
        ...(red ? { red: { pin: { part: red[0].id, pin: red[1] } } } : {}),
        ...(black ? { black: { pin: { part: black[0].id, pin: black[1] } } } : {}),
      };
    },
    /**
     * Lets circuit time pass (the app's clock running), ticking steps as it goes, like the app
     * does every frame; the scope samples every step (as small as the app's, 1/16000 s with a speaker).
     */
    wait(seconds: number) {
      live();
      const h = c.parts.some((p) => p.kind === 'speaker' && !p.burn) ? 1 / AUDIO_RATE : BASE_STEP;
      const steps = Math.round(seconds / h);
      const perTick = Math.max(1, Math.round(0.02 / h));
      for (let k = 0; k < steps && engine; k++) {
        const e = engine as TransientSim;
        e.step(h);
        if (scope.open) {
          const [a, b] = scope.pins;
          trace.push(e.time, a ? (e.voltageAt(a) ?? NaN) : NaN, b ? (e.voltageAt(b) ?? NaN) : NaN);
        }
        for (const s of c.parts) {
          if (s.kind !== 'speaker' || s.burn) continue;
          const i = ((e.voltageAt({ part: s.id, pin: 0 }) ?? 0) - (e.voltageAt({ part: s.id, pin: 1 }) ?? 0)) / SPEAKER.r;
          const x = acc.get(s.id) ?? { sum: 0, sq: 0, n: 0 };
          acc.set(s.id, { sum: x.sum + i, sq: x.sq + i * i, n: x.n + 1 });
        }
        if (k % perTick === 0) {
          levels = new Map([...acc].map(([id, x]) => [id, Math.sqrt(Math.max(0, x.sq / x.n - (x.sum / x.n) ** 2))]));
          acc.clear();
          tick();
        }
      }
      return tick();
    },
    /** The power button: every capacitor empty, the clock back to zero. */
    restart() {
      engine = null;
      engineFor = null;
      trace.clear();
    },
    /** Opens the scope with its probes on these pins. */
    probe(ch1?: [Part, number], ch2?: [Part, number]) {
      const pin = (x?: [Part, number]): PinRef | null => (x ? { part: x[0].id, pin: x[1] } : null);
      scope = { open: true, pins: [pin(ch1), pin(ch2)] };
      trace.clear();
    },
    /** Switches sound on or off. */
    sound(on: boolean) {
      sound = on;
    },
    replaceFuse() {
      meter = { ...meter, fuseBlownAt: null };
    },
    closeMeter() {
      meter = { ...meter, open: false };
    },
    tick,
    /** Asserts exactly these steps are done so far. */
    expectDone(ids: string[]) {
      expect(tick()).toEqual(ids);
    },
  };
  return api;
}

describe('lessons', () => {
  it('every lesson has a concept, steps with unique ids, and a summary', () => {
    for (const l of LESSONS) {
      expect(l.concept.length, l.id).toBeGreaterThan(0);
      const ids = allSteps(l).map((s) => s.id);
      expect(new Set(ids).size, l.id).toBe(ids.length);
      expect(l.summary.length, l.id).toBeGreaterThan(0);
    }
  });

  it('nothing ticks off by itself in a starter circuit', () => {
    for (const l of LESSONS) expect(play(l.id).tick(), l.id).toEqual([]);
  });

  it('Light your first LED', () => {
    const p = play('first-led');
    const bat = p.add('battery');
    p.expectDone(['battery']);
    const r = p.add('resistor');
    const led = p.add('led');
    p.expectDone(['battery', 'resistor', 'led']);
    p.wire(bat, 0, r, 0);
    p.wire(r, 1, led, 0);
    p.expectDone(['battery', 'resistor', 'led', 'wire-1', 'wire-2']);
    p.wire(led, 1, bat, 1);
    p.set(r, { value: 1000 });
    p.tick();
    p.set(r, { value: 100 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Voltage: the push', () => {
    const p = play('voltage');
    const bat = p.find('battery');
    const lamp = p.find('lamp');
    p.meter('V');
    p.expectDone(['meter']);
    p.meter('V', [bat, 0], [bat, 1]);
    p.expectDone(['meter', 'battery']);
    p.meter('V', [lamp, 0], [lamp, 1]);
    p.expectDone(['meter', 'battery', 'lamp']);
    p.set(bat, { value: 4.5 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Current: the flow (including the blown fuse)', () => {
    const p = play('current');
    const bat = p.find('battery');
    const led = p.find('led');
    p.unwire(led, 1, bat, 1);
    p.expectDone(['open']);
    p.meter('A', [led, 1], [bat, 1]);
    p.expectDone(['open', 'amps', 'bridge']);
    p.meter('A', [bat, 0], [bat, 1]);
    p.expectDone(['open', 'amps', 'bridge', 'fuse']);
    p.replaceFuse(); // probes still across the battery: blows again at once
    p.expectDone(['open', 'amps', 'bridge', 'fuse']);
    p.meter('A', [led, 1], [bat, 1]);
    p.replaceFuse();
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Ohm’s law, with the design challenge', () => {
    const p = play('ohms-law');
    const bat = p.find('battery');
    const r = p.find('resistor');
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['volts']);
    p.unwire(r, 1, bat, 1);
    p.meter('A', [r, 1], [bat, 1]);
    p.expectDone(['volts', 'amps']);
    p.set(r, { value: 2200 });
    p.expectDone(['volts', 'amps', 'double']);
    // Challenge: put the meter away, then R → LED → battery −, with 470 Ω.
    p.closeMeter();
    const led = p.add('led');
    p.wire(r, 1, led, 0);
    p.wire(led, 1, bat, 1);
    p.set(r, { value: 470 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Diodes: one-way streets', () => {
    const p = play('diodes');
    const d = p.find('diode');
    const r = p.find('resistor');
    p.meter('V', [d, 0], [d, 1]);
    p.expectDone(['forward']);
    p.c = flipPart(p.c, d.id);
    p.expectDone(['forward', 'reverse', 'blocking']);
    p.c = flipPart(p.c, d.id);
    p.set(r, { value: 1000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Foundations, lessons 4 and 6–10 ---------- */

  it('Resistance: the squeeze', () => {
    const p = play('resistance');
    const r = p.ref('R1');
    const ldr = p.ref('LDR1');
    p.meter('Ω');
    p.expectDone(['ohms']);
    p.meter('Ω', [r, 0], [r, 1]);
    p.expectDone(['ohms', 'measure']);
    p.set(r, { value: 4700 });
    p.expectDone(['ohms', 'measure', 'change']);
    p.meter('Ω', [ldr, 0], [ldr, 1]);
    p.expectDone(['ohms', 'measure', 'change']); // medium light: about 22 kΩ
    p.set(ldr, { light: 0 });
    p.expectDone(['ohms', 'measure', 'change', 'dark']);
    p.set(ldr, { light: 1 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Power: why parts get hot, with the design challenge', () => {
    const p = play('power');
    const r = p.ref('R1');
    p.set(r, { value: 470 });
    p.expectDone(['p470']);
    p.set(r, { value: 220 });
    p.expectDone(['p470', 'hot']);
    p.set(r, { value: 100 });
    p.expectDone(['p470', 'hot', 'burn']);
    expect(p.ref('R1').burn).toBeDefined();
    p.set(r, { value: 220, burn: undefined }); // Ctrl+Z
    p.set(r, { value: 330 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Series circuits', () => {
    const p = play('series');
    const [r1, r2, r3] = [p.ref('R1'), p.ref('R2'), p.ref('R3')];
    p.meter('V', [r1, 0], [r1, 1]);
    p.expectDone(['v1']);
    p.meter('V', [r2, 0], [r2, 1]);
    p.expectDone(['v1']);
    p.meter('V', [r3, 0], [r3, 1]);
    p.expectDone(['v1', 'v3']);
    p.unwire(r1, 1, r2, 0);
    p.meter('A', [r1, 1], [r2, 0]);
    p.expectDone(['v1', 'v3', 'current']);
    p.wire(r1, 1, r2, 0);
    p.set(r2, { value: 10_000 });
    p.expectDone(['v1', 'v3', 'current', 'grow']);
    p.closeMeter();
    p.unwire(r2, 1, r3, 0);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Parallel circuits', () => {
    const p = play('parallel');
    const bat = p.find('battery');
    const l1 = p.ref('L1');
    const l2 = p.add('lamp');
    p.expectDone(['second']);
    p.wire(l2, 0, l1, 0);
    p.wire(l2, 1, l1, 1);
    p.expectDone(['second', 'parallel']);
    p.meter('V', [l2, 0], [l2, 1]);
    p.expectDone(['second', 'parallel', 'measure']);
    p.unwire(l1, 1, bat, 1);
    p.meter('A', [l1, 1], [bat, 1]);
    p.expectDone(['second', 'parallel', 'measure', 'total']);
    p.closeMeter();
    p.wire(l1, 1, bat, 1);
    const sw = p.add('switch');
    p.unwire(l2, 1, l1, 1);
    p.wire(l2, 1, sw, 0);
    p.wire(sw, 1, l1, 1);
    p.expectDone(['second', 'parallel', 'measure', 'total', 'switch']);
    p.set(sw, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Voltage dividers', () => {
    const p = play('divider');
    const bat = p.find('battery');
    const [r1, r2] = [p.ref('R1'), p.ref('R2')];
    p.meter('V', [r2, 0], [r2, 1]);
    p.expectDone(['half']);
    p.set(r1, { value: 22_000 });
    p.expectDone(['half', 'unequal']);
    const vr = p.add('potentiometer');
    p.wire(vr, 1, bat, 0);
    p.wire(vr, 0, bat, 1);
    p.meter('V', [vr, 2], [vr, 0]);
    p.expectDone(['half', 'unequal', 'pot']);
    p.set(vr, { pos: 0.9 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Switches and logic, with the AND challenge', () => {
    const p = play('switches');
    const bat = p.find('battery');
    const lamp = p.ref('L1');
    const sw = p.add('switch');
    p.expectDone(['add']);
    p.unwire(lamp, 1, bat, 1);
    p.wire(lamp, 1, sw, 0);
    p.wire(sw, 1, bat, 1);
    p.expectDone(['add', 'wire']);
    p.set(sw, { on: true });
    p.expectDone(['add', 'wire', 'on']);
    p.set(sw, { on: false });
    p.expectDone(['add', 'wire', 'on', 'off']);
    const pb = p.add('pushbutton');
    p.wire(pb, 0, sw, 0);
    p.wire(pb, 1, sw, 1);
    p.set(pb, { on: true });
    p.expectDone(['add', 'wire', 'on', 'off', 'or']);
    // In parallel, the switch alone lights the lamp: that isn't AND.
    p.set(pb, { on: false });
    p.set(sw, { on: true });
    p.expectDone(['add', 'wire', 'on', 'off', 'or']);
    // Rewire in series: lamp → switch → button → battery −.
    p.unwire(pb, 0, sw, 0);
    p.unwire(pb, 1, sw, 1);
    p.unwire(sw, 1, bat, 1);
    p.wire(sw, 1, pb, 0);
    p.wire(pb, 1, bat, 1);
    p.expectDone(['add', 'wire', 'on', 'off', 'or', 'and-1']);
    p.set(pb, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Components in Depth, lessons 2–10 ---------- */

  it('LEDs: voltage and current, with the design challenge', () => {
    const p = play('leds');
    const bat = p.find('battery');
    const r = p.ref('R1');
    const led = p.ref('LED1');
    p.meter('V', [led, 0], [led, 1]);
    p.expectDone(['vf']);
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['vf', 'vr']);
    p.closeMeter();
    const led2 = p.add('led');
    p.unwire(led, 1, bat, 1);
    p.wire(led, 1, led2, 0);
    p.wire(led2, 1, bat, 1);
    p.expectDone(['vf', 'vr', 'two']);
    p.set(r, { value: 470 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Capacitors: storing charge (watched in time)', () => {
    const p = play('capacitors');
    const r = p.ref('R1');
    const cap = p.ref('C1');
    p.meter('V', [cap, 0], [cap, 1]);
    p.expectDone([]); // the lesson has only just opened: still charging
    p.wait(1); // τ = 0.1 s: full well within a second
    p.expectDone(['vc']);
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['vc', 'vr']);
    p.closeMeter();
    const led = p.add('led');
    p.unwire(r, 1, cap, 0);
    p.wire(r, 1, led, 0);
    p.wire(led, 1, cap, 0);
    p.wait(0.5);
    p.expectDone(['vc', 'vr', 'led']);
    p.set(cap, { value: 100e-6 });
    p.expectDone(['vc', 'vr', 'led', 'size']);
    // Watch it charge: LED out, 1000 µF, power off and on. τ = 10 s.
    p.remove(led);
    p.wire(r, 1, cap, 0);
    p.set(cap, { value: 1000e-6 });
    p.restart();
    p.expectDone(['vc', 'vr', 'led', 'size']); // just powered on: empty
    p.wait(2); // 9·(1 − e^−0.2) ≈ 1.6 V: not yet
    p.expectDone(['vc', 'vr', 'led', 'size']);
    p.wait(4); // t = 6 s: 9·(1 − e^−0.6) ≈ 4.1 V
    p.expectDone(['vc', 'vr', 'led', 'size', 'slow']);
    // Reversed, a charged electrolytic is forced the wrong way and fails.
    p.c = flipPart(p.c, cap.id);
    p.wait(30);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
    expect(p.ref('C1').burn?.quantity).toBe('reverse');
  });

  it('Potentiometers: a dimmer', () => {
    const p = play('potentiometers');
    const vr = p.ref('VR1');
    const r = p.ref('R1');
    const led = p.ref('LED1');
    p.set(vr, { pos: 0.1 });
    p.expectDone([]); // brighter, but not at the end yet
    p.set(vr, { pos: 0 });
    p.expectDone(['bright']);
    p.set(vr, { pos: 1 });
    p.expectDone(['bright', 'dim']);
    const before = p.c;
    p.remove(r);
    p.wire(vr, 2, led, 0);
    p.set(vr, { pos: 0 });
    p.expectDone(['bright', 'dim', 'no-resistor']);
    expect(p.ref('LED1').burn).toBeDefined();
    p.c = before; // Ctrl+Z back to the resistor
    p.set(vr, { pos: 0 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Light sensors', () => {
    const p = play('light-sensors');
    const r = p.ref('R1');
    const ldr = p.ref('LDR1');
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['measure']);
    p.set(ldr, { light: 0 });
    p.expectDone(['measure', 'dark']);
    p.set(ldr, { light: 1 });
    p.expectDone(['measure', 'dark', 'bright']);
    p.set(r, { value: 100_000 });
    // Search the slider for the half-way point, as a learner would.
    let found = false;
    for (let l = 0; l <= 1.0001 && !found; l += 0.01) {
      p.set(ldr, { light: l });
      found = isComplete(p.lesson, p.tick());
    }
    expect(found).toBe(true);
  });

  it('Transistors: a switch', () => {
    const p = play('transistor-switch');
    const bat = p.find('battery');
    const q = p.ref('Q1');
    const r2 = p.ref('R2');
    p.wire(bat, 0, r2, 0);
    p.expectDone([]); // only one end wired: nothing yet
    p.wire(r2, 1, q, 0);
    p.expectDone(['base']);
    p.meter('V', [q, 0], [q, 2]);
    p.expectDone(['base', 'vbe']);
    p.meter('V', [q, 1], [q, 2]);
    p.expectDone(['base', 'vbe', 'vce']);
    p.closeMeter();
    const pb = p.add('pushbutton');
    p.unwire(bat, 0, r2, 0);
    p.wire(bat, 0, pb, 0);
    p.wire(pb, 1, r2, 0);
    p.expectDone(['base', 'vbe', 'vce']);
    p.set(pb, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Transistors: gain', () => {
    const p = play('transistor-gain');
    const q = p.ref('Q1');
    const led = p.ref('LED1');
    const r2 = p.ref('R2');
    p.unwire(r2, 1, q, 0);
    p.meter('A', [r2, 1], [q, 0]);
    p.expectDone(['ib']);
    p.wire(r2, 1, q, 0);
    p.unwire(led, 1, q, 1);
    p.meter('A', [led, 1], [q, 1]);
    p.expectDone(['ib', 'ic']);
    p.closeMeter();
    p.wire(led, 1, q, 1);
    p.set(r2, { value: 100_000 });
    p.expectDone(['ib', 'ic', 'more']);
    p.set(r2, { value: 10_000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Choosing a base resistor, with the design challenge', () => {
    const p = play('base-resistor');
    const q = p.ref('Q1');
    const r = p.ref('R1');
    p.meter('V', [q, 1], [q, 2]);
    p.expectDone(['dim']);
    p.closeMeter();
    p.set(r, { value: 100_000 });
    p.expectDone(['dim', 'partway']);
    p.set(r, { value: 100 });
    p.expectDone(['dim', 'partway', 'too-small']);
    expect(p.ref('R1').burn).toBeDefined();
    p.set(r, { value: 100_000, burn: undefined }); // Ctrl+Z
    p.set(r, { value: 22_000 }); // base current too small for the challenge
    p.expectDone(['dim', 'partway', 'too-small']);
    p.set(r, { value: 10_000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Project: automatic night light', () => {
    const p = play('night-light');
    const bat = p.find('battery');
    const q = p.ref('Q1');
    const ldr = p.ref('LDR1');
    p.wire(ldr, 0, q, 0);
    p.wire(ldr, 1, bat, 1);
    p.expectDone(['sensor']);
    p.set(ldr, { light: 0.3 });
    p.expectDone(['sensor', 'dark']);
    p.set(ldr, { light: 0.8 });
    p.expectDone(['sensor', 'dark', 'bright']);
    p.set(p.ref('R1'), { value: 1_000_000 });
    p.set(ldr, { light: 0.5 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Diode logic', () => {
    const p = play('diode-logic');
    const [sw1, sw2, d2, r1] = [p.ref('SW1'), p.ref('SW2'), p.ref('D2'), p.ref('R1')];
    p.set(sw1, { on: true });
    p.expectDone(['a']);
    p.set(sw1, { on: false });
    p.set(sw2, { on: true });
    p.expectDone(['a', 'b']);
    p.set(sw1, { on: true });
    p.expectDone(['a', 'b', 'both']);
    p.remove(d2);
    p.wire(sw2, 1, r1, 0);
    p.set(sw2, { on: false });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Sound & Timing ---------- */

  it('Watching time: the oscilloscope', () => {
    const p = play('scope-intro');
    const cap = p.find('capacitor');
    const pb = p.find('pushbutton');
    p.probe();
    p.expectDone(['open']);
    p.probe([cap, 0]);
    p.expectDone(['open', 'probe']);
    p.set(pb, { on: true });
    p.wait(3);
    p.expectDone(['open', 'probe', 'charge']);
    p.set(pb, { on: false });
    p.wait(1);
    p.expectDone(['open', 'probe', 'charge', 'drain']);
    p.set(p.ref('R2'), { value: 10_000 });
    p.wait(4);
    p.expectDone(['open', 'probe', 'charge', 'drain', 'drain-fast']);
    p.set(cap, { value: 10e-6 });
    p.set(pb, { on: true });
    p.wait(0.6);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Oscillators: a two-transistor blinker', () => {
    const p = play('blinker');
    const q1 = p.ref('Q1');
    p.probe([q1, 1]);
    p.wait(4.5);
    p.expectDone(['probe', 'auto']);
    p.probe([q1, 1], [q1, 0]);
    p.wait(4.5);
    p.expectDone(['probe', 'auto', 'base']);
    p.set(p.ref('C1'), { value: 4.7e-6 });
    p.set(p.ref('C2'), { value: 4.7e-6 });
    p.wait(4.5);
    p.expectDone(['probe', 'auto', 'base', 'faster']);
    p.set(p.ref('C1'), { value: 22e-6 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('From blink to beep', () => {
    const p = play('beeper');
    p.sound(true);
    p.expectDone(['sound']);
    p.set(p.ref('C1'), { value: 10e-9 });
    p.set(p.ref('C2'), { value: 10e-9 });
    p.wait(0.1);
    p.expectDone(['sound', 'tone']);
    p.probe([p.ref('Q2'), 1]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure']);
    p.set(p.ref('R2'), { value: 100_000 });
    p.set(p.ref('R3'), { value: 100_000 });
    p.probe([p.ref('Q2'), 1]);
    p.wait(0.1);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: a one-shot, with the design challenge', () => {
    const p = play('555-oneshot');
    const pb = p.find('pushbutton');
    p.wait(0.1);
    p.set(pb, { on: true });
    p.wait(0.1);
    p.expectDone(['press']);
    p.set(pb, { on: false });
    p.wait(0.2);
    p.expectDone(['press', 'hold']);
    p.wait(1.2);
    p.expectDone(['press', 'hold', 'off']);
    p.probe([p.find('capacitor'), 0], [p.find('timer555'), 2]);
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(1.5);
    p.expectDone(['press', 'hold', 'off', 'scope']);
    p.set(p.find('capacitor'), { value: 47e-6 });
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(0.5);
    p.expectDone(['press', 'hold', 'off', 'scope', 'longer']);
    p.wait(6); // let the 5 s pulse end
    p.set(p.find('capacitor'), { value: 100e-6 });
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(0.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: a blinker', () => {
    const p = play('555-astable');
    const u = p.find('timer555');
    const r3 = p.ref('R3');
    const cap = p.find('capacitor');
    const gnd = p.find('ground');
    p.wire(r3, 0, u, 6);
    p.wire(r3, 1, u, 5);
    p.expectDone(['r3']);
    p.wire(u, 5, u, 1);
    p.expectDone(['r3', 'trig']);
    p.wire(cap, 0, u, 5);
    p.wire(cap, 1, gnd, 0);
    p.wait(2);
    p.expectDone(['r3', 'trig', 'cap', 'blink']);
    p.probe([cap, 0], [u, 2]);
    p.wait(4.5);
    p.expectDone(['r3', 'trig', 'cap', 'blink', 'saw']);
    p.set(p.ref('R2'), { value: 47_000 });
    p.set(r3, { value: 4700 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: making tones, tuned to A', () => {
    const p = play('555-tone');
    const u = p.find('timer555');
    const cap = p.find('capacitor');
    p.sound(true);
    p.expectDone(['sound']);
    p.set(cap, { value: 68e-9 });
    p.wait(0.1);
    p.expectDone(['sound', 'tone']);
    p.probe([u, 2]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure']);
    p.set(cap, { value: 33e-9 });
    p.probe([u, 2]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure', 'octave']);
    p.set(cap, { value: 150e-9 });
    p.probe([u, 2]);
    p.wait(0.1);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Sound effects: a light theremin', () => {
    const p = play('theremin');
    const u = p.find('timer555');
    const ldr = p.find('ldr');
    p.sound(true);
    p.wait(0.05);
    p.expectDone(['sound']);
    p.probe([u, 2]);
    p.wait(0.05);
    p.expectDone(['sound', 'probe']);
    p.set(ldr, { light: 0.1 });
    p.probe([u, 2]);
    p.wait(0.3);
    p.expectDone(['sound', 'probe', 'dark']);
    p.set(ldr, { light: 0.9 });
    p.probe([u, 2]);
    p.wait(0.05);
    p.expectDone(['sound', 'probe', 'dark', 'bright']);
    p.set(p.ref('R3'), { value: 47_000 });
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('AC: signals that swing', () => {
    const p = play('ac-signals');
    const src = p.find('acsource');
    const r = p.ref('R1');
    p.probe([src, 0]);
    p.wait(0.2);
    p.expectDone(['probe', 'auto']);
    p.set(src, { freq: 1 });
    p.expectDone(['probe', 'auto', 'slow']);
    p.unwire(r, 1, src, 1);
    const led = p.add('led');
    p.wire(r, 1, led, 0);
    p.wire(led, 1, src, 1);
    p.wait(1.5);
    p.expectDone(['probe', 'auto', 'slow', 'led']);
    p.set(src, { wave: 'square' });
    p.expectDone(['probe', 'auto', 'slow', 'led', 'square']);
    p.unwire(led, 1, src, 1);
    const spk = p.add('speaker');
    p.wire(led, 1, spk, 0);
    p.wire(spk, 1, src, 1);
    p.set(src, { freq: 440 });
    p.sound(true);
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Rectifiers: AC to DC', () => {
    const p = play('rectifiers');
    const src = p.find('acsource');
    const r = p.ref('R1');
    p.probe([r, 0]);
    p.wait(0.2);
    p.expectDone(['half']);
    p.remove(p.find('diode'));
    p.unwire(r, 1, src, 1);
    const br = p.add('bridge');
    const gnd = p.add('ground');
    p.wire(src, 0, br, 0);
    p.wire(src, 1, br, 1);
    p.wire(br, 2, r, 0);
    p.wire(br, 3, r, 1);
    p.wire(br, 3, gnd, 0);
    p.probe([r, 0]);
    p.wait(0.2);
    p.expectDone(['half', 'bridge']);
    const cap = p.add('capacitor', 100e-6);
    p.wire(cap, 0, br, 2);
    p.wire(cap, 1, br, 3);
    p.wait(4.5);
    p.expectDone(['half', 'bridge', 'smooth']);
    p.set(cap, { value: 1000e-6 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Project: a DC power supply', () => {
    const p = play('power-supply');
    const [src, t, br] = [p.find('acsource'), p.find('transformer'), p.find('bridge')];
    const r1 = p.ref('R1');
    p.wire(src, 0, t, 0);
    p.wire(src, 1, t, 1);
    p.expectDone(['primary']);
    p.wire(t, 2, br, 0);
    p.wire(t, 3, br, 1);
    p.expectDone(['primary', 'secondary']);
    p.wait(0.5);
    p.meter('V', [r1, 0], [r1, 1]);
    p.wait(0.1);
    p.expectDone(['primary', 'secondary', 'dc']);
    p.closeMeter();
    const r2 = p.ref('R2');
    const led = p.find('led');
    p.wire(r2, 0, br, 2);
    p.wire(r2, 1, led, 0);
    p.wire(led, 1, p.find('ground'), 0);
    p.wait(0.1);
    p.expectDone(['primary', 'secondary', 'dc', 'led']);
    p.set(t, { value: 0.25 });
    p.wait(1);
    p.expectDone(['primary', 'secondary', 'dc', 'led', 'ratio']);
    p.probe([r1, 0]);
    p.remove(p.find('capacitor'));
    p.wait(0.2);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('each track has ten lessons, in a sensible order', () => {
    expect(LESSONS.filter((l) => l.track === 'foundations').map((l) => l.id)).toEqual([
      'first-led',
      'voltage',
      'current',
      'resistance',
      'ohms-law',
      'power',
      'series',
      'parallel',
      'divider',
      'switches',
    ]);
    expect(LESSONS.filter((l) => l.track === 'components')).toHaveLength(10);
    expect(LESSONS.filter((l) => l.track === 'timing')).toHaveLength(10);
  });
});
