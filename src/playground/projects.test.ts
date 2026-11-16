/**
 * The Playground circuits do what their guides say: each is simulated as the
 * app runs it, and checked against the behaviour its card describes.
 */
import { describe, expect, it } from 'vitest';
import { addWire, deleteItems, newId, type Circuit, type Part } from '../model/circuit';
import { P555 } from '../model/parts';
import { TransientSim } from '../sim/transient';
import { simulate } from '../sim/simulate';
import { diagnose } from '../learn/diagnose';
import { worstBurnout } from '../sim/ratings';
import { play } from '../learn/lessons/harness';
import type { Lesson } from '../learn/lessons/types';
import { PROJECTS, projectById, type Project } from './projects';

/** Plays a project in the lesson harness (no steps to tick, just the circuit and the clock). */
const playProject = (p: Project) => play({ id: p.id, track: 'foundations', title: p.title, summary: '', minutes: 0, concept: [], starter: p.build, build: [], experiment: [] } as Lesson);

const led = (c: Circuit, ref: string) => c.parts.find((p) => p.ref === ref) as Part;
/** Current through a two-pin part, A. */
function current(p: ReturnType<typeof playProject>, ref: string): number {
  const ctx = p.context();
  return ctx.sim.ok ? (ctx.sim.parts.get(led(ctx.c, ref).id)?.i[0] ?? 0) : 0;
}

/** Steps a circuit in time, calling `each` with the sim after every step. */
function run(c: Circuit, seconds: number, h: number, each: (sim: TransientSim) => void) {
  const sim = new TransientSim(c);
  const n = Math.round(seconds / h);
  for (let k = 0; k < n; k++) {
    sim.step(h);
    each(sim);
  }
}

/** The numbers a counter's four LEDs show (LED1 = 1s), each read once it has held for 20 ms (between ticks, not mid-ripple). */
function countSeen(c: Circuit, seconds: number): number[] {
  const leds = ['LED1', 'LED2', 'LED3', 'LED4'].map((r) => led(c, r));
  const seen: number[] = [];
  let since = 0;
  let last = -1;
  run(c, seconds, 1e-3, (sim) => {
    const r = sim.result();
    if (!r.ok) return;
    const n = leds.reduce((acc, l, k) => acc + ((r.parts.get(l.id)?.i[0] ?? 0) > 2e-3 ? 1 << k : 0), 0);
    since += 1;
    if (n !== last) {
      last = n;
      since = 0;
    } else if (since === 20) seen.push(n);
  });
  return seen;
}

describe('Playground', () => {
  it('every project builds, wires every part, and nothing burns out at rest', () => {
    for (const p of PROJECTS) {
      const c = p.build();
      const refs = c.parts.filter((x) => x.kind !== 'ground').map((x) => x.ref);
      expect(new Set(refs).size, `${p.id}: reference designators are unique`).toBe(refs.length);
      for (const part of c.parts) {
        expect(
          c.wires.some((w) => w.a.part === part.id || w.b.part === part.id),
          `${p.id}: ${part.ref} is wired`,
        ).toBe(true);
      }
      expect(p.tryThis.length).toBeGreaterThanOrEqual(3);
      expect(p.breakIt.length).toBeGreaterThanOrEqual(1);
      if (p.kind === 'Arduino') continue; // run on the real compiler in src/arduino/playground.test.ts
      const pp = playProject(p);
      pp.wait(1);
      expect(worstBurnout(pp.c, pp.context().sim), `${p.id}: nothing burns`).toBeNull();
      expect(pp.c.parts.some((x) => x.burn), `${p.id}: nothing burned`).toBe(false);
    }
  });

  it('“Why isn’t it working?” only points at the switches waiting to be pressed', () => {
    // Arduinos and logic chips bring their own supply, and their spare pins are no broken loop.
    for (const p of PROJECTS) {
      const c = p.build();
      for (const issue of diagnose(c, simulate(c))) expect(['open-switch', 'capacitor-blocks'], `${p.id}: ${issue.what}`).toContain(issue.kind);
    }
    // The AC projects have no battery, and their diodes block for half of every cycle: neither is a fault, at any moment.
    for (const id of ['voltage-doubler', 'tuned-circuit']) {
      const c = projectById(id)!.build();
      run(c, 0.5, 1e-3, (sim) => {
        if (sim.time > 0.45) expect(diagnose(c, sim.result()).map((x) => x.what), id).toEqual([]);
      });
    }
  });

  it('Fade-out lamp: dark until pressed, then lit, then fades', () => {
    const p = playProject(projectById('fade-lamp')!);
    p.wait(0.5);
    expect(current(p, 'LED1')).toBeLessThan(1e-4);
    p.set(p.find('pushbutton'), { on: true });
    p.wait(0.3);
    expect(current(p, 'LED1')).toBeGreaterThan(10e-3);
    p.set(p.find('pushbutton'), { on: false });
    p.wait(2);
    const early = current(p, 'LED1');
    expect(early).toBeGreaterThan(5e-3); // still lit a couple of seconds later
    p.wait(15);
    const late = current(p, 'LED1');
    expect(late).toBeLessThan(early / 2); // clearly dimmer
    p.wait(30);
    expect(current(p, 'LED1')).toBeLessThan(1e-3); // dark again
  });

  it('Two-tone siren: U2 plays two different notes as U1 beats', () => {
    const c = projectById('siren')!.build();
    const [u1, u2] = c.parts.filter((x) => x.kind === 'timer555');
    // Count U2's rising edges while U1's output is high and while it's low.
    const tally = { hi: { edges: 0, time: 0 }, lo: { edges: 0, time: 0 } };
    let prev = 0;
    const h = 1 / 16000;
    let t = 0;
    run(c, 3, h, (sim) => {
      t += h;
      const a = sim.voltageAt({ part: u1.id, pin: P555.out }) ?? 0;
      const b = sim.voltageAt({ part: u2.id, pin: P555.out }) ?? 0;
      if (t < 0.5) {
        prev = b;
        return;
      }
      const side = a > 4 ? tally.hi : tally.lo;
      side.time += h;
      if (prev < 4 && b >= 4) side.edges += 1;
      prev = b;
    });
    const fHi = tally.hi.edges / tally.hi.time;
    const fLo = tally.lo.edges / tally.lo.time;
    expect(tally.hi.time).toBeGreaterThan(0.4);
    expect(tally.lo.time).toBeGreaterThan(0.4);
    expect(fHi).toBeGreaterThan(200);
    expect(fLo).toBeGreaterThan(200);
    expect(fLo / fHi).toBeGreaterThan(1.2); // clearly two notes
    expect(Math.max(fHi, fLo)).toBeLessThan(3000);
  });

  it('Light-beam alarm: silent in bright light, sounds in the dark', () => {
    const p = playProject(projectById('beam-alarm')!);
    p.sound(true);
    p.wait(0.5);
    const quiet = p.context().levels.get(p.find('speaker').id) ?? 0;
    expect(quiet).toBeLessThan(1e-3);
    p.set(p.find('ldr'), { light: 0.4 });
    p.wait(0.5);
    const loud = p.context().levels.get(p.find('speaker').id) ?? 0;
    expect(loud).toBeGreaterThan(5e-3);
    // VR1 slid to End A: no light can quieten it.
    p.set(p.find('ldr'), { light: 1 });
    p.set(p.find('potentiometer'), { pos: 0 });
    p.wait(0.5);
    expect(p.context().levels.get(p.find('speaker').id) ?? 0).toBeGreaterThan(5e-3);
  });

  it('Four-bit binary counter: counts 0 to 15 and wraps', () => {
    const seen = countSeen(projectById('counter')!.build(), 12);
    // The settled readings go up by one each tick, wrapping from 15 to 0.
    expect(seen.length).toBeGreaterThan(18);
    for (let k = 1; k < seen.length; k++) expect(seen[k], `after ${seen[k - 1]}`).toBe((seen[k - 1] + 1) % 16);
  });

  it('Full adder: adds three bits', () => {
    const p = playProject(projectById('full-adder')!);
    const sw = p.c.parts.filter((x) => x.kind === 'switch');
    for (let n = 0; n < 8; n++) {
      const bits = [n & 1, (n >> 1) & 1, (n >> 2) & 1];
      sw.forEach((s, k) => p.set(s, { on: !!bits[k] }));
      p.wait(0.05);
      const total = bits[0] + bits[1] + bits[2];
      expect(current(p, 'LED1') > 2e-3, `sum of ${bits}`).toBe(total % 2 === 1);
      expect(current(p, 'LED2') > 2e-3, `carry of ${bits}`).toBe(total >= 2);
    }
  });

  it('Police flasher: red and blue take turns, about three times a second', () => {
    const c = projectById('police-flasher')!.build();
    const [red, blue] = ['LED1', 'LED2'].map((r) => led(c, r));
    const time = { red: 0, blue: 0, both: 0, neither: 0 };
    let flashes = 0;
    let was = false;
    run(c, 3, 1e-3, (sim) => {
      const r = sim.result();
      if (!r.ok || sim.time < 1) return;
      const a = (r.parts.get(red.id)?.i[0] ?? 0) > 5e-3;
      const b = (r.parts.get(blue.id)?.i[0] ?? 0) > 5e-3;
      time[a && b ? 'both' : a ? 'red' : b ? 'blue' : 'neither'] += 1e-3;
      if (a && !was) flashes += 1;
      was = a;
    });
    expect(time.both).toBe(0);
    expect(time.neither).toBeLessThan(0.02);
    expect(time.red).toBeGreaterThan(0.8);
    expect(time.blue).toBeGreaterThan(0.8);
    expect(flashes).toBeGreaterThanOrEqual(5); // about 3 a second, over 2 s
    expect(flashes).toBeLessThanOrEqual(7);
  });

  /** A metronome's beats a minute: how often its 555's output dips LOW. */
  function tempo(c: Circuit, seconds: number): number {
    const u = c.parts.find((x) => x.kind === 'timer555')!;
    const dips: number[] = [];
    let prev = 9;
    run(c, seconds, 1e-3, (sim) => {
      const v = sim.voltageAt({ part: u.id, pin: P555.out }) ?? 0;
      if (prev > 4 && v <= 4) dips.push(sim.time);
      prev = v;
    });
    expect(dips.length).toBeGreaterThan(2);
    return (60 * (dips.length - 1)) / (dips[dips.length - 1] - dips[0]);
  }

  it('Metronome: the knob sets the tempo, the light flashes and the speaker clicks on the beat', () => {
    const build = projectById('metronome')!.build;
    expect(tempo(build(), 8)).toBeGreaterThan(50);
    expect(tempo(build(), 8)).toBeLessThan(65);
    const at = (pos: number) => {
      const c = build();
      return tempo({ ...c, parts: c.parts.map((x) => (x.kind === 'potentiometer' ? { ...x, pos } : x)) }, pos > 0.5 ? 3 : 8);
    };
    const fast = at(1);
    expect(fast).toBeGreaterThan(185);
    expect(fast).toBeLessThan(215);
    const slow = at(0);
    expect(slow).toBeGreaterThan(30);
    expect(slow).toBeLessThan(37);

    // The light is dark between beats and lit on them; the speaker is silent between beats and clicks on them.
    const p = playProject(projectById('metronome')!);
    p.sound(true);
    let lit = 0;
    let dark = 0;
    let loudest = 0;
    let quietest = Infinity;
    for (let k = 0; k < 150; k++) {
      p.wait(0.02);
      if (k < 25) continue; // settle first
      if (current(p, 'LED1') > 10e-3) lit += 1;
      else if (current(p, 'LED1') < 1e-4) dark += 1;
      const level = p.context().levels.get(p.find('speaker').id) ?? 0;
      loudest = Math.max(loudest, level);
      quietest = Math.min(quietest, level);
    }
    expect(lit).toBeGreaterThanOrEqual(2);
    expect(dark).toBeGreaterThan(100);
    expect(loudest).toBeGreaterThan(5e-3);
    expect(quietest).toBeLessThan(1e-4);
  });

  /** The lowest and highest voltage at a pin, over the last `window` seconds of a run. */
  function swing(c: Circuit, ref: string, pin: number, seconds: number, window: number, h = 1e-4): [number, number] {
    const part = led(c, ref);
    let lo = Infinity;
    let hi = -Infinity;
    run(c, seconds, h, (sim) => {
      if (sim.time < seconds - window) return;
      const v = sim.voltageAt({ part: part.id, pin }) ?? 0;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    });
    return [lo, hi];
  }
  const withValue = (c: Circuit, ref: string, patch: Partial<Part>): Circuit => ({ ...c, parts: c.parts.map((x) => (x.ref === ref ? { ...x, ...patch } : x)) });

  it('Voltage doubler: 6 V peak in, about 11 V of steady DC out', () => {
    const build = projectById('voltage-doubler')!.build;
    const [lo, hi] = swing(build(), 'C2', 0, 1.5, 0.1);
    expect(lo).toBeGreaterThan(10.3);
    expect(hi).toBeLessThan(12);
    expect(hi - lo).toBeLessThan(0.4); // steady
    // Where C1 meets the diodes: the input wave, lifted to sit on 0 V.
    const [nLo, nHi] = swing(build(), 'C1', 0, 1.5, 0.1);
    expect(nLo).toBeGreaterThan(-1);
    expect(nLo).toBeLessThan(0);
    expect(nHi).toBeGreaterThan(10.5);
    // A 1 kΩ load makes it sag and ripple; 500 Hz brings most of it back.
    const [sLo, sHi] = swing(withValue(build(), 'R1', { value: 1000 }), 'C2', 0, 1.5, 0.1);
    expect(sHi).toBeLessThan(9);
    expect(sHi - sLo).toBeGreaterThan(1.5);
    const [fLo] = swing(withValue(withValue(build(), 'R1', { value: 1000 }), 'AC1', { freq: 500 }), 'C2', 0, 0.5, 0.05, 2e-5);
    expect(sLo).toBeLessThan(4);
    expect(fLo).toBeGreaterThan(8);
  });

  it('Tuned circuit: answers to about 500 Hz and little else', () => {
    const build = projectById('tuned-circuit')!.build;
    const amp = (c: Circuit, freq: number) => {
      const [lo, hi] = swing(withValue(c, 'AC1', { freq }), 'L1', 0, 0.3, 0.05, 2e-5);
      return (hi - lo) / 2;
    };
    const peak = amp(build(), 503);
    expect(peak).toBeGreaterThan(0.6);
    expect(peak).toBeLessThan(1.2);
    for (const f of [100, 250, 400, 650, 1000, 2000]) expect(amp(build(), f), `${f} Hz`).toBeLessThan(peak / 4);
    expect(amp(build(), 100)).toBeLessThan(peak / 40); // “almost flat”
    // 470 nF moves the peak to about 730 Hz.
    const c470 = withValue(build(), 'C1', { value: 470e-9 });
    expect(amp(c470, 734)).toBeGreaterThan(3 * amp(c470, 503));
    expect(amp(c470, 734)).toBeGreaterThan(3 * amp(c470, 1000));
    // A 50 Hz square wave: each edge makes it ring at its own 500 Hz (count the swings in one half cycle).
    const sq = withValue(build(), 'AC1', { freq: 50, wave: 'square' });
    const coil = led(sq, 'L1');
    let ups = 0;
    let prev = 0;
    run(sq, 0.1, 2e-5, (sim) => {
      const v = sim.voltageAt({ part: coil.id, pin: 0 }) ?? 0;
      // The ring rides on a small steady level, so count upward crossings of the half cycle's average, about 0.
      if (sim.time > 0.0805 && sim.time < 0.0895 && prev < 0.02 && v >= 0.02) ups += 1;
      prev = v;
    });
    expect(ups).toBeGreaterThanOrEqual(4); // 9 ms at 500 Hz: four or five swings
    expect(ups).toBeLessThanOrEqual(5);
  });

  it('Coin toss: flips while held, stays put when let go, and lands both ways', () => {
    const p = playProject(projectById('coin-toss')!);
    const btn = p.find('pushbutton');
    const face = () => {
      const heads = current(p, 'LED1') > 2e-3;
      const tails = current(p, 'LED2') > 2e-3;
      expect(heads !== tails, 'exactly one light').toBe(true);
      return heads ? 'H' : 'T';
    };
    p.wait(0.2);
    const first = face();
    p.wait(0.5);
    expect(face()).toBe(first); // nothing happens until the button is pressed
    const landed: string[] = [];
    for (let toss = 0; toss < 16; toss++) {
      p.set(btn, { on: true });
      p.wait(0.2 + toss * 0.0137);
      p.set(btn, { on: false });
      p.wait(0.1);
      const f = face();
      p.wait(0.3);
      expect(face()).toBe(f);
      landed.push(f);
    }
    expect(landed.filter((f) => f === 'H').length).toBeGreaterThanOrEqual(3);
    expect(landed.filter((f) => f === 'T').length).toBeGreaterThanOrEqual(3);

    // While held, Q runs at half the clock's frequency (about 1 kHz), whatever the clock's HIGH and LOW times.
    for (const r5 of [6800, 1000]) {
      let c = withValue(projectById('coin-toss')!.build(), 'R5', { value: r5 });
      c = withValue(c, 'PB1', { on: true });
      const u1 = c.parts.find((x) => x.kind === 'timer555')!;
      const u2 = c.parts.find((x) => x.kind === 'dff')!;
      const edges = { clock: 0, q: 0 };
      let high = 0;
      let n = 0;
      let prev = [0, 0];
      run(c, 0.25, 2e-5, (sim) => {
        if (sim.time < 0.05) return;
        const v = [sim.voltageAt({ part: u1.id, pin: P555.out }) ?? 0, sim.voltageAt({ part: u2.id, pin: 2 }) ?? 0];
        if (prev[0] < 2.5 && v[0] >= 2.5) edges.clock += 1;
        if (prev[1] < 2.5 && v[1] >= 2.5) edges.q += 1;
        prev = v;
        n += 1;
        if (v[1] >= 2.5) high += 1;
      });
      if (r5 === 6800) {
        expect(edges.clock * 5).toBeGreaterThan(850);
        expect(edges.clock * 5).toBeLessThan(1150);
      }
      expect(Math.abs(edges.clock - 2 * edges.q)).toBeLessThanOrEqual(2);
      expect(high / n).toBeGreaterThan(0.47); // fair: half its time each way
      expect(high / n).toBeLessThan(0.53);
    }
  });

  it('the new projects’ “break it” claims hold', () => {
    // Police flasher: R4 at 10 Ω, the red light looks stuck on and the blue one dark.
    const pf = withValue(projectById('police-flasher')!.build(), 'R4', { value: 10 });
    const sum = { red: 0, blue: 0, n: 0 };
    run(pf, 1.5, 1e-4, (sim) => {
      const r = sim.result();
      if (!r.ok || sim.time < 0.5) return;
      sum.red += r.parts.get(led(pf, 'LED1').id)?.i[0] ?? 0;
      sum.blue += Math.max(0, r.parts.get(led(pf, 'LED2').id)?.i[0] ?? 0);
      sum.n += 1;
    });
    expect(sum.red / sum.n).toBeGreaterThan(12e-3);
    expect(sum.blue / sum.n).toBeLessThan(0.5e-3);

    // Police flasher: R2 at 47 Ω burns the blue LED.
    const pb = playProject(projectById('police-flasher')!);
    pb.set(pb.ref('R2'), { value: 47 });
    pb.wait(1);
    expect(pb.ref('LED2').burn).toBeDefined();
    expect(pb.ref('R2').burn).toBeUndefined();

    // Metronome: R1 at 10 Ω and VR1 at End B burns R1.
    const m = playProject(projectById('metronome')!);
    m.wait(0.5);
    m.set(m.ref('R1'), { value: 10 });
    m.wait(0.5);
    expect(m.ref('R1').burn).toBeUndefined(); // VR1 still protects it
    m.set(m.find('potentiometer'), { pos: 1 });
    m.wait(1);
    expect(m.ref('R1').burn).toBeDefined();

    // Voltage doubler: 14 V in is too much for C2.
    const d = playProject(projectById('voltage-doubler')!);
    d.wait(1);
    d.set(d.ref('AC1'), { value: 14 });
    d.wait(1);
    expect(d.ref('C2').burn?.quantity).toBe('voltage');
    expect(d.c.parts.filter((x) => x.burn).length).toBe(1);

    // Voltage doubler: a 100 nF C1 can't keep up.
    const [, small] = swing(withValue(projectById('voltage-doubler')!.build(), 'C1', { value: 100e-9 }), 'C2', 0, 1.5, 0.1);
    expect(small).toBeLessThan(6);

    // Tuned circuit: with R1 at 100 Ω every frequency gets through about the same.
    const amp = (c: Circuit, freq: number) => {
      const [lo, hi] = swing(withValue(c, 'AC1', { freq }), 'L1', 0, 0.3, 0.05, 2e-5);
      return (hi - lo) / 2;
    };
    const loose = withValue(projectById('tuned-circuit')!.build(), 'R1', { value: 100 });
    const at = [250, 503, 1000].map((f) => amp(loose, f));
    expect(Math.max(...at) / Math.min(...at)).toBeLessThan(1.5);

    // Tuned circuit: 100 Ω across the coil, and the peak all but vanishes.
    const t = playProject(projectById('tuned-circuit')!);
    const r = t.add('resistor', 100);
    t.wire(r, 0, t.ref('L1'), 0);
    t.wire(r, 1, t.ref('L1'), 1);
    const sound = amp(projectById('tuned-circuit')!.build(), 503);
    expect(amp(t.c, 503)).toBeLessThan(sound / 20);

    // Coin toss: with C1 at 10 µF it flips about ten times a second.
    let slow = withValue(projectById('coin-toss')!.build(), 'C1', { value: 10e-6 });
    slow = withValue(slow, 'PB1', { on: true });
    const u2 = slow.parts.find((x) => x.kind === 'dff')!;
    let flips = 0;
    let q = -1;
    run(slow, 2.5, 1e-3, (sim) => {
      const now = (sim.voltageAt({ part: u2.id, pin: 2 }) ?? 0) > 2.5 ? 1 : 0;
      if (sim.time > 0.5 && q >= 0 && now !== q) flips += 1;
      q = now;
    });
    expect(flips / 2).toBeGreaterThan(8);
    expect(flips / 2).toBeLessThan(12);

    // Coin toss: without R1 it still works here.
    const ct = playProject(projectById('coin-toss')!);
    ct.remove(ct.ref('R1'));
    const seen = new Set<boolean>();
    for (let toss = 0; toss < 12; toss++) {
      ct.set(ct.find('pushbutton'), { on: true });
      ct.wait(0.2 + toss * 0.0137);
      ct.set(ct.find('pushbutton'), { on: false });
      ct.wait(0.1);
      const heads = current(ct, 'LED1') > 2e-3;
      ct.wait(0.2);
      expect(current(ct, 'LED1') > 2e-3).toBe(heads);
      seen.add(heads);
    }
    expect(seen.size).toBe(2);
  });

  it('the “break it” claims hold', () => {
    // Fade lamp: a 10 Ω charging resistor burns out on the inrush.
    const f = playProject(projectById('fade-lamp')!);
    f.set(f.ref('R1'), { value: 10 });
    f.set(f.find('pushbutton'), { on: true });
    f.wait(0.2);
    expect(f.ref('R1').burn).toBeDefined();

    // Siren: R2 at 10 Ω overheats.
    const s = playProject(projectById('siren')!);
    s.set(s.ref('R2'), { value: 10 });
    s.wait(1);
    expect(s.ref('R2').burn).toBeDefined();

    // Siren: U1 wired straight to U2's Control, U2 is silent while U1 is low.
    let c = projectById('siren')!.build();
    const [u1, u2] = c.parts.filter((x) => x.kind === 'timer555');
    c = deleteItems(c, new Set([led(c, 'R1').id]));
    c = addWire(c, newId('w'), { part: u1.id, pin: P555.out }, { part: u2.id, pin: P555.ctrl });
    const edges = { hi: 0, lo: 0 };
    let prev = 0;
    let t = 0;
    run(c, 3, 1 / 16000, (sim) => {
      t += 1 / 16000;
      const b = sim.voltageAt({ part: u2.id, pin: P555.out }) ?? 0;
      if (t > 0.5 && prev < 4 && b >= 4) edges[(sim.voltageAt({ part: u1.id, pin: P555.out }) ?? 0) > 4 ? 'hi' : 'lo'] += 1;
      prev = b;
    });
    expect(edges.hi).toBeGreaterThan(100);
    expect(edges.lo).toBe(0);

    // Counter: clocked from each Q instead of Q̄, it counts down.
    let k3 = projectById('counter')!.build();
    const ffs = k3.parts.filter((x) => x.kind === 'dff');
    for (let k = 0; k < 3; k++) {
      const w = k3.wires.find((w) => w.a.part === ffs[k].id && w.a.pin === 3 && w.b.part === ffs[k + 1].id && w.b.pin === 1)!;
      k3 = addWire(deleteItems(k3, new Set([w.id])), newId('w'), { part: ffs[k].id, pin: 2 }, { part: ffs[k + 1].id, pin: 1 });
    }
    const seen = countSeen(k3, 6);
    expect(seen.length).toBeGreaterThan(8);
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBe((seen[k - 1] + 15) % 16);
  });
});
