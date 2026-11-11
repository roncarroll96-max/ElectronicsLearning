/**
 * The live engine: runs a circuit in time, paced to the clock, the way the
 * app shows it. It lives in a background worker (see worker.ts), so the page
 * stays smooth and sound never stutters while the screen is busy; being plain
 * code, it is also tested directly.
 *
 * Each call to run() advances circuit time by as much real time as has passed
 * (times the playback speed), within a computing budget, and returns what the
 * page needs: the readings, the "heat" view for ratings, the scope's samples,
 * and, for a circuit with a speaker, its sound.
 */
import { pinKey, type Circuit, type PinRef } from '../model/circuit';
import { SPEAKER } from './models';
import type { PartReading, SimResult } from './simulate';
import { TransientSim, type CapStates } from './transient';

/** Normal step size: 0.2 ms of circuit time (slow motion shrinks it in proportion). */
export const BASE_STEP = 2e-4;
/** Sound is produced at 16,000 samples a second. */
export const AUDIO_RATE = 16_000;
/**
 * Steps per sound sample. The time stepper takes smaller steps of its own where
 * the circuit changes fast, so one per sample already gets pitches right.
 */
export const OVERSAMPLE = 1;
/** Playback speeds: real time, then slow motion. */
export const SPEEDS = [1, 0.25, 0.1, 0.01] as const;
export type Speed = (typeof SPEEDS)[number];

/** How long heat takes to build up in a small part, s. */
const THERMAL_TAU = 0.05;
/** A frame in which no capacitor changes by more than this (V) per step means the circuit has settled. */
const SETTLED_DV = 1e-6;

/** Circuits that change over time: they have a working capacitor. */
export const usesTime = (c: Circuit) => c.parts.some((p) => p.kind === 'capacitor' && !p.burn);
const speakersOf = (c: Circuit) => c.parts.filter((p) => p.kind === 'speaker' && !p.burn);

/** Everything the page needs after a run. */
export interface Frame {
  /** Which circuit (as numbered by the page) this describes. */
  version: number;
  time: number;
  result: SimResult;
  /** Heat-averaged readings, for ratings. */
  heat: Map<string, PartReading>;
  caps: CapStates;
  settled: boolean;
  lagging: boolean;
  /** Scope samples since the last frame. */
  trace: { t: Float64Array; a: Float32Array; b: Float32Array } | null;
  /** Each sounding speaker's loudness: the changing part of its current, rms, A. */
  levels: [string, number][];
}

export class LiveEngine {
  private sim: TransientSim | null = null;
  private version = 0;
  private probes: [PinRef | null, PinRef | null] = [null, null];
  private speakers: { id: string; pins: [PinRef, PinRef] }[] = [];
  private paused = false;
  private speed: Speed = 1;
  private audio = false;
  private settled = false;
  private lagging = false;
  private heat = new Map<string, PartReading>();
  // Samples gathered since the last frame was taken.
  private tT: number[] = [];
  private tA: number[] = [];
  private tB: number[] = [];
  private sound: { sum: number; sq: number; n: number }[] = [];
  /** Steps into the current sound sample (0 … OVERSAMPLE−1), and their running total. */
  private sub = 0;
  private acc = 0;

  /**
   * A new or changed circuit. Capacitor charge and the clock carry across,
   * unless `restart` (power off and on). `null` stops everything.
   */
  setCircuit(c: Circuit | null, version: number, probes: [PinRef | null, PinRef | null], restart: boolean): void {
    this.version = version;
    this.probes = probes;
    this.settled = false;
    this.lagging = false;
    this.tT = [];
    this.tA = [];
    this.tB = [];
    if (!c || !usesTime(c)) {
      this.sim = null;
      this.heat = new Map();
      return;
    }
    const carry = restart ? null : this.sim;
    if (restart) this.heat = new Map();
    this.sim = new TransientSim(c, carry?.capStates(), carry?.time ?? 0);
    this.speakers = speakersOf(c).map((p) => ({ id: p.id, pins: [{ part: p.id, pin: 0 }, { part: p.id, pin: 1 }] }));
    this.sound = this.speakers.map(() => ({ sum: 0, sq: 0, n: 0 }));
    this.sub = 0;
    this.acc = 0;
  }

  setControls(paused: boolean, speed: Speed, audio: boolean): void {
    if (speed !== this.speed || paused !== this.paused) this.lagging = false;
    this.paused = paused;
    this.speed = speed;
    this.audio = audio;
  }

  /** The last run couldn't do everything asked of it within its budget. */
  get behind(): boolean {
    return this.lagging;
  }

  /** The circuit has a working speaker. */
  get hasSpeaker(): boolean {
    return this.speakers.length > 0;
  }

  /** There is work to do: a circuit that is running, not paused and not settled. */
  get active(): boolean {
    return !!this.sim && this.sim.dynamic && !this.paused && !this.settled;
  }

  /** Circuit time per step right now. */
  get step(): number {
    return (this.speakers.length ? 1 / (AUDIO_RATE * OVERSAMPLE) : BASE_STEP) * this.speed;
  }

  /**
   * Advances by `elapsed` seconds of real time, spending at most `budgetMs` of
   * computing. Returns the speaker's sound for that stretch (at AUDIO_RATE,
   * only when sound is on and playing at real-time speed), or null.
   */
  run(elapsed: number, budgetMs: number): Float32Array | null {
    const sim = this.sim;
    if (!sim || !this.active) return null;
    const h = this.step;
    const wanted = Math.round((Math.min(elapsed, 0.1) * this.speed) / h);
    const speakers = this.speakers.length > 0;
    const playing = this.audio && speakers && this.speed === 1;
    const out = playing ? new Float32Array(Math.ceil(wanted / OVERSAMPLE) + 1) : null;
    let samples = 0;
    const start = performance.now();
    let done = 0;
    let biggest = 0;
    let hTotal = 0;
    while (done < wanted && performance.now() - start < budgetMs) {
      if (!sim.step(h)) break;
      biggest = Math.max(biggest, sim.lastChange);
      hTotal += h;
      // With a speaker, steps are 4 to a sound sample: the scope records one per sample.
      const sampleEnd = !speakers || this.sub === OVERSAMPLE - 1;
      const [p1, p2] = this.probes;
      if (sampleEnd && (p1 || p2)) {
        this.tT.push(sim.time);
        this.tA.push(p1 ? (sim.voltageAt(p1) ?? NaN) : NaN);
        this.tB.push(p2 ? (sim.voltageAt(p2) ?? NaN) : NaN);
      }
      // The speaker's cone follows the current through its coil.
      let sample = 0;
      for (let k = 0; k < this.speakers.length; k++) {
        const [a, b] = this.speakers[k].pins;
        const i = ((sim.voltageAt(a) ?? 0) - (sim.voltageAt(b) ?? 0)) / SPEAKER.r;
        const s = this.sound[k];
        s.sum += i;
        s.sq += i * i;
        s.n++;
        sample += i / SPEAKER.fullScale;
      }
      if (speakers) {
        this.acc += sample;
        if (sampleEnd) {
          if (out) out[samples++] = this.acc / OVERSAMPLE;
          this.acc = 0;
          this.sub = 0;
        } else {
          this.sub++;
        }
      }
      done++;
    }
    this.lagging = done < wanted;
    const result = sim.result();
    if (done > 0 && biggest < SETTLED_DV) {
      this.blend(result, Infinity); // settled: the heat has caught up too
      this.settled = true;
    } else if (done > 0) {
      this.blend(result, hTotal);
    }
    // Falling behind real time: send nothing rather than gappy sound (the audio thread fades out).
    if (this.lagging) return null;
    return out ? out.subarray(0, samples) : null;
  }

  /** Everything the page needs right now; takes (and clears) the scope samples gathered since the last frame. */
  frame(): Frame | null {
    const sim = this.sim;
    if (!sim) return null;
    const result = sim.result();
    const trace = this.tT.length
      ? { t: Float64Array.from(this.tT), a: Float32Array.from(this.tA), b: Float32Array.from(this.tB) }
      : null;
    this.tT = [];
    this.tA = [];
    this.tB = [];
    const levels: [string, number][] = this.speakers.map((sp, k) => {
      const s = this.sound[k];
      const mean = s.n ? s.sum / s.n : 0;
      const rms = s.n ? Math.sqrt(Math.max(0, s.sq / s.n - mean * mean)) : 0;
      this.sound[k] = { sum: 0, sq: 0, n: 0 };
      return [sp.id, rms];
    });
    // Parts the heat average hasn't seen yet (just added) use their live reading.
    const heat = new Map<string, PartReading>();
    for (const [id, r] of result.parts) heat.set(id, this.heat.get(id) ?? r);
    return {
      version: this.version,
      time: sim.time,
      result,
      heat,
      caps: sim.capStates(),
      settled: this.settled,
      lagging: this.lagging && this.active,
      trace,
      levels,
    };
  }

  /** Heat: an exponential average of each part's readings over circuit time. */
  private blend(now: SimResult, dt: number): void {
    const a = Number.isFinite(dt) ? 1 - Math.exp(-dt / THERMAL_TAU) : 1;
    const next = new Map<string, PartReading>();
    for (const [id, r] of now.parts) {
      const h = this.heat.get(id);
      if (!h || h.i.length !== r.i.length || a >= 1) {
        next.set(id, { v: [...r.v], i: [...r.i], power: r.power });
      } else {
        next.set(id, {
          v: r.v.map((v, k) => h.v[k] + a * (v - h.v[k])),
          i: r.i.map((i, k) => h.i[k] + a * (i - h.i[k])),
          power: h.power + a * (r.power - h.power),
        });
      }
    }
    this.heat = next;
  }
}

/** A short key for the probes, so the page knows when they moved. */
export const probesKey = (p: [PinRef | null, PinRef | null]) => p.map((x) => (x ? pinKey(x) : '-')).join('|');
