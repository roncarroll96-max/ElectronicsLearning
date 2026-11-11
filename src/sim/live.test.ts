/**
 * The live engine (what the background worker runs): pacing to the clock,
 * slow motion, settling, power on/off, the scope's samples, and speaker sound.
 */
import { describe, expect, it } from 'vitest';
import type { Circuit, Part } from '../model/circuit';
import type { PartKind } from '../model/parts';
import { AUDIO_RATE, LiveEngine, OVERSAMPLE } from './live';
import { SPEAKER } from './models';
import { TransientSim } from './transient';

const P = (id: string, kind: PartKind, ref: string, value?: number): Part => ({
  id, kind, ref, x: 0, y: 0, rot: 0, ...(value !== undefined ? { value } : {}),
});
const W = (id: string, a: string, pa: number, b: string, pb: number) => ({ id, a: { part: a, pin: pa }, b: { part: b, pin: pb } });

const rc: Circuit = {
  parts: [P('b', 'battery', 'B1', 9), P('r', 'resistor', 'R1', 10_000), P('c', 'capacitor', 'C1', 10e-6)],
  wires: [W('w1', 'b', 0, 'r', 0), W('w2', 'r', 1, 'c', 0), W('w3', 'c', 1, 'b', 1)],
};

/** A two-transistor oscillator with 10 nF capacitors (a tone, about 1.7 kHz), Q2 driving a speaker through 470 Ω. */
const beeper: Circuit = {
  parts: [
    P('b', 'battery', 'B1', 9), P('r1', 'resistor', 'R1', 470), P('r2', 'resistor', 'R2', 470), P('l1', 'led', 'LED1'),
    P('spk', 'speaker', 'SPK1'), P('rb1', 'resistor', 'R3', 47_000), P('rb2', 'resistor', 'R4', 47_000),
    P('c1', 'capacitor', 'C1', 10e-9), P('c2', 'capacitor', 'C2', 10e-9), P('q1', 'npn', 'Q1'), P('q2', 'npn', 'Q2'),
  ],
  wires: [
    W('w1', 'b', 0, 'r1', 0), W('w2', 'b', 0, 'r2', 0), W('w3', 'b', 0, 'rb1', 0), W('w4', 'b', 0, 'rb2', 0),
    W('w5', 'r1', 1, 'l1', 0), W('w6', 'r2', 1, 'spk', 0), W('w7', 'l1', 1, 'q1', 1), W('w8', 'spk', 1, 'q2', 1),
    W('w9', 'rb1', 1, 'q1', 0), W('w10', 'rb2', 1, 'q2', 0), W('w11', 'q1', 1, 'c1', 0), W('w12', 'c1', 1, 'q2', 0),
    W('w13', 'q2', 1, 'c2', 0), W('w14', 'c2', 1, 'q1', 0), W('w15', 'q1', 2, 'b', 1), W('w16', 'q2', 2, 'b', 1),
  ],
};

const NO_PROBES: [null, null] = [null, null];
const vC = (e: LiveEngine) => {
  const r = e.frame()!.result.parts.get('c')!;
  return r.v[0] - r.v[1];
};

describe('live engine', () => {
  it('keeps pace with the clock: 0.1 s of real time is 0.1 s of circuit time', () => {
    const e = new LiveEngine();
    e.setCircuit(rc, 1, NO_PROBES, false);
    e.setControls(false, 1, false);
    for (let k = 0; k < 10; k++) e.run(0.01, 1000);
    const f = e.frame()!;
    expect(f.version).toBe(1);
    expect(f.time).toBeCloseTo(0.1, 6);
    expect(vC(e)).toBeCloseTo(9 * (1 - Math.exp(-1)), 1);
  });

  it('runs slower in slow motion, stops when paused, and settles', () => {
    const e = new LiveEngine();
    e.setCircuit(rc, 1, NO_PROBES, false);
    e.setControls(false, 0.1, false);
    e.run(0.05, 1000);
    expect(e.frame()!.time).toBeCloseTo(0.005, 6);
    e.setControls(true, 1, false);
    expect(e.active).toBe(false);
    expect(e.run(0.05, 1000)).toBeNull();
    expect(e.frame()!.time).toBeCloseTo(0.005, 6);
    e.setControls(false, 1, false);
    for (let k = 0; k < 200 && e.active; k++) e.run(0.05, 1000);
    expect(e.frame()!.settled).toBe(true);
    expect(e.active).toBe(false);
  });

  it('keeps charge across an edit, and power off/on empties it', () => {
    const e = new LiveEngine();
    e.setCircuit(rc, 1, NO_PROBES, false);
    e.setControls(false, 1, false);
    for (let k = 0; k < 10; k++) e.run(0.01, 1000);
    const v = vC(e);
    e.setCircuit({ ...rc }, 2, NO_PROBES, false);
    expect(vC(e)).toBeCloseTo(v, 3);
    expect(e.frame()!.time).toBeCloseTo(0.1, 6);
    e.setCircuit({ ...rc }, 3, NO_PROBES, true);
    expect(Math.abs(vC(e))).toBeLessThan(1e-4);
    expect(e.frame()!.time).toBe(0);
  });

  it('records scope samples at every step, handed over once per frame', () => {
    const e = new LiveEngine();
    e.setCircuit(rc, 1, [{ part: 'c', pin: 0 }, null], false);
    e.setControls(false, 1, false);
    e.run(0.01, 1000); // 50 steps of 0.2 ms
    const f = e.frame()!;
    expect(f.trace!.t.length).toBe(50);
    expect(Number.isNaN(f.trace!.b[0])).toBe(true); // channel 2 not attached
    expect(f.trace!.a[49]).toBeGreaterThan(f.trace!.a[0]); // charging
    expect(e.frame()!.trace).toBeNull(); // already handed over
  });

  it('a speaker plays the circuit’s tone, at the pitch the circuit makes', () => {
    const e = new LiveEngine();
    e.setCircuit(beeper, 1, NO_PROBES, false);
    e.setControls(false, 1, true);
    expect(e.step).toBeCloseTo(1 / (AUDIO_RATE * OVERSAMPLE), 12);
    const chunks: Float32Array[] = [];
    for (let k = 0; k < 100; k++) chunks.push(e.run(0.005, 1000)!); // 0.5 s in 5 ms chunks, as the worker does
    const sound = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      sound.set(c, at);
      at += c.length;
    }
    expect(sound.length).toBe(AUDIO_RATE / 2); // exactly the right number of samples
    // Pitch: count rising crossings through the middle in the last 0.25 s.
    const tail = sound.subarray(sound.length / 2);
    const mid = (Math.max(...tail) + Math.min(...tail)) / 2;
    let rises = 0;
    for (let k = 1; k < tail.length; k++) if (tail[k - 1] < mid && tail[k] >= mid) rises++;
    const hz = rises / 0.25;
    // Textbook: f ≈ 1 / (2 × 0.62 × R × C) = 1 / (1.24 × 47 kΩ × 10 nF) ≈ 1.7 kHz.
    expect(hz).toBeGreaterThan(1500);
    expect(hz).toBeLessThan(1900);
    expect(Math.max(...tail) - Math.min(...tail)).toBeGreaterThan(0.05); // clearly audible
    const levels = new Map(e.frame()!.levels);
    expect(levels.get('spk')!).toBeGreaterThan(0.003);
    console.log(`beeper: ${hz.toFixed(0)} Hz`);
  });

  it('keeps up with a transistor tone in real time, at the pitch a fine-step simulation gives', () => {
    // Each of this oscillator's 3,200 transistor flips a second is a sudden snap: the
    // hardest thing for the simulator to keep up with.
    const e = new LiveEngine();
    e.setCircuit(beeper, 1, NO_PROBES, false);
    e.setControls(false, 1, true);
    for (let k = 0; k < 20; k++) e.run(0.005, 1000); // 0.1 s to start up (and for the code to warm up)
    const chunks: Float32Array[] = [];
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) {
      const c = e.run(0.005, 1000); // 0.5 s in 5 ms chunks, as the worker does
      expect(c).not.toBeNull();
      chunks.push(c!);
    }
    const seconds = (performance.now() - t0) / 1000;
    const speed = 0.5 / seconds;
    // Real time with room to spare (it was 0.2× before the speed-up; about 1.8× on the machine it was tuned on).
    expect(speed, `${speed.toFixed(2)}× real time`).toBeGreaterThan(1.5);

    // Pitch, from the moments the sound rises through its middle (interpolated between samples).
    const sound = Float32Array.from(chunks.flatMap((c) => Array.from(c)));
    const mid = (Math.max(...sound) + Math.min(...sound)) / 2;
    const rises = (wave: ArrayLike<number>, dt: number) => {
      const t: number[] = [];
      for (let k = 1; k < wave.length; k++)
        if (wave[k - 1] < mid && wave[k] >= mid) t.push((k - 1 + (mid - wave[k - 1]) / (wave[k] - wave[k - 1])) * dt);
      return (t.length - 1) / (t[t.length - 1] - t[0]);
    };
    const hz = rises(sound, 1 / AUDIO_RATE);

    // Reference: the same circuit in 0.25 µs steps, where every flip is followed through nanosecond by nanosecond.
    const fine = new TransientSim(beeper);
    const h = 2.5e-7;
    const spk = (s: TransientSim) => ((s.voltageAt({ part: 'spk', pin: 0 })! - s.voltageAt({ part: 'spk', pin: 1 })!) / SPEAKER.r) / SPEAKER.fullScale;
    for (let k = 0; k < 0.004 / h; k++) fine.step(h); // start-up
    const wave: number[] = [];
    for (let k = 0; k < 0.012 / h; k++) {
      fine.step(h);
      wave.push(spk(fine));
    }
    const ref = rises(wave, h);
    expect(ref).toBeGreaterThan(1500); // about 1.6 kHz
    expect(ref).toBeLessThan(1700);
    expect(Math.abs(hz / ref - 1), `${hz.toFixed(1)} Hz vs ${ref.toFixed(1)} Hz`).toBeLessThan(0.01);
    console.log(`beeper live: ${speed.toFixed(2)}× real time, ${hz.toFixed(1)} Hz (fine steps: ${ref.toFixed(1)} Hz)`);
  }, { retry: 2 }); // a timing test: another busy program on the machine can slow one run down

  it('makes no sound in slow motion (the pitch would be wrong) or with sound switched off', () => {
    const e = new LiveEngine();
    e.setCircuit(beeper, 1, NO_PROBES, false);
    e.setControls(false, 0.1, true);
    expect(e.run(0.01, 1000)).toBeNull();
    e.setControls(false, 1, false);
    expect(e.run(0.01, 1000)).toBeNull();
  });
});
