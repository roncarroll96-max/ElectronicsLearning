/**
 * Plays a lesson for the walk-through tests: holds the circuit, meter and
 * scope, runs the simulator as the app does (Arduinos included), and ticks
 * steps as the learner acts. Only tests use it.
 */
import { expect } from 'vitest';
import { addPart, addWire, createPart, deleteItems, newId, updatePart, type Circuit, type Part } from '../../model/circuit';
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
import { UnoCore } from '../../arduino/uno';
import { topology } from '../topology';
import { lessonById } from './index';
import { advance } from './progress';
import type { CheckCtx, Lesson } from './types';

export interface PlayOptions {
  /** Compiles a sketch to its flash image (Arduino lessons only). */
  compile?: (source: string) => Promise<Uint8Array>;
}

/** Plays a lesson: holds the circuit and meter, and ticks steps as the learner acts. */
export function play(id: string | Lesson, opts: PlayOptions = {}) {
  const lesson = typeof id === 'string' ? (lessonById(id) as Lesson) : id;
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
  // Arduinos: each board's running chip and the sketch it was built from (upload() compiles), and what it printed.
  const boards = new Map<string, { sketch: string; core: UnoCore }>();
  const serial = new Map<string, string>();
  const cores = () => new Map([...boards].filter(([id]) => c.parts.some((p) => p.id === id && !p.burn)).map(([id, x]) => [id, x.core]));

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
      engine = new TransientSim(sc, engine?.capStates(), engine?.time ?? 0, {}, cores());
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
      arduinos: new Map(
        c.parts
          .filter((p) => p.kind === 'arduino' && !p.burn)
          .map((p) => {
            const b = boards.get(p.id);
            const status = b && b.sketch === (p.sketch ?? '') ? ('running' as const) : ('compiling' as const);
            return [p.id, { status, serial: serial.get(p.id) ?? '', running: !!b && !b.core.poweredDown }];
          }),
      ),
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
        for (const [id, x] of boards) {
          const text = x.core.takeSerial();
          if (text) serial.set(id, ((serial.get(id) ?? '') + text).slice(-20_000));
        }
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
    /** Compiles each Arduino's sketch, if it changed, and starts it afresh (like Upload, or the app compiling a new sketch). */
    async upload() {
      if (!opts.compile) throw new Error('play() needs a compile function for Arduino lessons');
      live();
      for (const p of c.parts) {
        if (p.kind !== 'arduino' || p.burn) continue;
        const sketch = p.sketch ?? '';
        if (boards.get(p.id)?.sketch === sketch) continue;
        boards.set(p.id, { sketch, core: new UnoCore(await opts.compile(sketch), (engine as TransientSim | null)?.time ?? 0) });
        serial.delete(p.id);
      }
      engineFor = null;
      return tick();
    },
    /** What an Arduino has printed. */
    serial(p: Part) {
      return serial.get(p.id) ?? '';
    },
    /** Everything the steps' checks see right now. */
    context: ctx,
    tick,
    /** Asserts exactly these steps are done so far. */
    expectDone(ids: string[]) {
      expect(tick()).toEqual(ids);
    },
  };
  return api;
}
