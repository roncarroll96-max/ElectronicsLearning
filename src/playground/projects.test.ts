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
