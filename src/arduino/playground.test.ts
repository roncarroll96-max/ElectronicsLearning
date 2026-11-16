/** The Playground's Arduino projects, compiled for real and run on the emulated chip. */
import { beforeAll, describe, expect, it } from 'vitest';
import { play } from '../learn/lessons/harness';
import type { Lesson } from '../learn/lessons/types';
import { CHASER_SKETCH, PIANO_SKETCH, REACTION_SKETCH, TRAFFIC_SKETCH, projectById } from '../playground/projects';
import { program, testToolkit } from './testKit';

beforeAll(async () => {
  await testToolkit();
}, 60_000);

/** Opens a project in the lesson harness with the real compiler; `sketch` replaces its code (a “break it” edit). */
async function open(id: string, sketch?: string) {
  const project = projectById(id)!;
  const p = play({ id, track: 'digital', title: project.title, summary: '', minutes: 0, concept: [], starter: project.build, build: [], experiment: [] } as Lesson, { compile: program });
  if (sketch !== undefined) p.set(p.find('arduino'), { sketch });
  await p.upload();
  return p;
}
type Played = Awaited<ReturnType<typeof open>>;

/** Which of these LEDs carry current right now, as a string of 1s and 0s. */
function lit(p: Played, refs: string[]): string {
  const ctx = p.context();
  return refs.map((r) => ((ctx.sim.ok ? (ctx.sim.parts.get(p.ref(r).id)?.i[0] ?? 0) : 0) > 2e-3 ? '1' : '0')).join('');
}

/** A changed copy of a sketch; fails if the text to change isn't there. */
function edited(sketch: string, from: string | RegExp, to: string): string {
  const out = sketch.replace(from, to);
  expect(out, `sketch contains ${from}`).not.toBe(sketch);
  return out;
}

/** The digit the display shows (the segments carrying current), as segment letters. */
function shown(p: ReturnType<typeof play>): string {
  const ctx = p.context();
  const d = p.find('sevenseg');
  const r = ctx.sim.ok ? ctx.sim.parts.get(d.id) : undefined;
  return r ? 'abcdefg'.split('').filter((_, k) => r.i[k] > 1e-3).join('') : '';
}

const FACES = ['bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg'];

describe('Playground: Electronic dice', () => {
  it('shows 1, rolls while held, and stops on a face', async () => {
    const dice = projectById('dice')!;
    const p = play({ id: dice.id, track: 'digital', title: dice.title, summary: '', minutes: 0, concept: [], starter: dice.build, build: [], experiment: [] } as Lesson, { compile: program });
    await p.upload();
    p.wait(0.3);
    expect(shown(p)).toBe('bc');
    const btn = p.find('pushbutton');
    const faces = new Set<string>();
    for (let roll = 0; roll < 4; roll++) {
      p.set(btn, { on: true });
      for (let k = 0; k < 10; k++) {
        p.wait(0.05 + roll * 0.013);
        faces.add(shown(p));
      }
      p.set(btn, { on: false });
      p.wait(1.6);
      const a = shown(p);
      p.wait(0.5);
      expect(shown(p), 'stopped').toBe(a);
      expect(FACES).toContain(a);
      faces.add(a);
    }
    for (const f of faces) expect(FACES).toContain(f);
    expect(faces.size).toBeGreaterThanOrEqual(4);
    expect(p.c.parts.some((x) => x.burn)).toBe(false);
  }, 120_000);
});

describe('Playground: Traffic light', () => {
  const LIGHTS = ['LED1', 'LED2', 'LED3', 'LED4']; // red, yellow, green, WALK

  it('rests on green, and a press runs the crossing', async () => {
    const p = await open('traffic-light');
    const btn = p.find('pushbutton');
    p.wait(4);
    expect(lit(p, LIGHTS)).toBe('0010');
    p.wait(3);
    expect(lit(p, LIGHTS)).toBe('0010'); // green until someone asks
    p.set(btn, { on: true });
    p.wait(0.15);
    p.set(btn, { on: false });
    // From the press: yellow 1.5 s, red 1 s, WALK 4 s, flashing 2.5 s, red 1 s, red and yellow 1 s, green.
    p.wait(0.6);
    expect(lit(p, LIGHTS)).toBe('0100');
    expect(p.serial(p.find('arduino'))).toContain('Button pressed');
    p.wait(1.25); // 2.0 s
    expect(lit(p, LIGHTS)).toBe('1000');
    p.wait(1.5); // 3.5 s
    expect(lit(p, LIGHTS)).toBe('1001');
    p.wait(2.5); // 6.0 s
    expect(lit(p, LIGHTS)).toBe('1001');
    // WALK flashes while red stays on.
    const flashing = new Set<string>();
    for (let k = 0; k < 20; k++) {
      p.wait(0.1); // up to 8.0 s
      flashing.add(lit(p, LIGHTS));
    }
    expect([...flashing].sort()).toEqual(['1000', '1001']);
    p.wait(1.6); // 9.6 s
    expect(lit(p, LIGHTS)).toBe('1000');
    p.wait(0.9); // 10.5 s
    expect(lit(p, LIGHTS)).toBe('1100');
    p.wait(1); // 11.5 s
    expect(lit(p, LIGHTS)).toBe('0010');
    p.wait(5);
    expect(lit(p, LIGHTS)).toBe('0010'); // and it waits again
    expect(p.c.parts.some((x) => x.burn)).toBe(false);
  }, 120_000);

  it('remembers a press made while the light is yellow', async () => {
    const p = await open('traffic-light');
    const btn = p.find('pushbutton');
    const press = () => {
      p.set(btn, { on: true });
      p.wait(0.15);
      p.set(btn, { on: false });
    };
    p.wait(3.5);
    press();
    p.wait(0.5);
    expect(lit(p, LIGHTS)).toBe('0100');
    press(); // a second press, during yellow
    p.wait(11.2); // the crossing ends about 11 s after the first press
    expect(lit(p, LIGHTS)).toBe('0010');
    // That press was during this crossing, so it doesn't start another.
    p.wait(5);
    expect(lit(p, LIGHTS)).toBe('0010');
  }, 120_000);

  it('“break it”: INPUT never rests on green; no ground wire, no crossing', async () => {
    const p = await open('traffic-light', edited(TRAFFIC_SKETCH, 'INPUT_PULLUP', 'INPUT'));
    p.wait(3.6);
    expect(lit(p, LIGHTS)).toBe('0100'); // off it goes, with no press
    p.wait(11);
    expect(lit(p, LIGHTS)).toBe('0010');
    p.wait(3);
    expect(lit(p, LIGHTS)).toBe('0100'); // and again

    const q = await open('traffic-light');
    const btn = q.find('pushbutton');
    q.remove(q.c.parts.filter((x) => x.kind === 'ground')[1]); // PB1's ground
    q.wait(3.5);
    q.set(btn, { on: true });
    q.wait(0.3);
    q.set(btn, { on: false });
    q.wait(2);
    expect(lit(q, LIGHTS)).toBe('0010');
  }, 120_000);
});

describe('Playground: Reaction timer', () => {
  /** Runs until the light comes on (or fails after `limit` seconds). */
  function untilLit(p: Played, limit = 6) {
    for (let t = 0; t < limit; t += 0.05) {
      if (lit(p, ['LED1']) === '1') return;
      p.wait(0.05);
    }
    throw new Error('the light never came on');
  }

  it('times a press, catches a press that’s too soon, and keeps the best', async () => {
    const p = await open('reaction-timer');
    const uno = p.find('arduino');
    const btn = p.find('pushbutton');
    p.wait(1.5);
    expect(lit(p, ['LED1'])).toBe('0'); // at least 2 s of waiting
    expect(p.serial(uno)).toContain('Wait for the light');
    untilLit(p);
    p.wait(0.3);
    p.set(btn, { on: true });
    p.wait(0.1);
    const first = Number(/(\d+) ms/.exec(p.serial(uno))?.[1]);
    expect(first).toBeGreaterThanOrEqual(295);
    expect(first).toBeLessThanOrEqual(360); // the light was seen up to 50 ms late
    expect(p.serial(uno)).toContain('best so far');
    expect(lit(p, ['LED1'])).toBe('0');
    p.set(btn, { on: false });

    // Too soon: a press during the wait.
    p.wait(1.5);
    p.set(btn, { on: true });
    p.wait(0.1);
    p.set(btn, { on: false });
    expect(p.serial(uno)).toContain('Too soon');
    p.wait(1.5);
    expect(lit(p, ['LED1'])).toBe('0'); // the wait started again

    // A slower second go isn't a new best.
    untilLit(p);
    p.wait(0.6);
    p.set(btn, { on: true });
    p.wait(0.1);
    p.set(btn, { on: false });
    const times = [...p.serial(uno).matchAll(/(\d+) ms/g)].map((m) => Number(m[1]));
    expect(times.length).toBe(2);
    expect(times[1]).toBeGreaterThan(times[0]);
    expect(p.serial(uno).match(/best so far/g)?.length).toBe(1);
    expect(p.c.parts.some((x) => x.burn)).toBe(false);
  }, 120_000);

  it('“break it”: without the “Too soon!” block, holding the button gives 0 ms', async () => {
    const cheat = edited(REACTION_SKETCH, /    if \(digitalRead\(BUTTON\) == LOW\) \{\n(.*\n){3}    \}\n/, '');
    expect(cheat).not.toContain('Too soon');
    const p = await open('reaction-timer', cheat);
    p.set(p.find('pushbutton'), { on: true });
    p.wait(5.5);
    expect(p.serial(p.find('arduino'))).toContain('\n0 ms');
  }, 120_000);
});

describe('Playground: Mini piano', () => {
  const NOTES = [262, 294, 330, 392];
  /** The pitch on the speaker's pin, as the scope measures it, and how loudly the speaker is driven. */
  function sounding(p: Played) {
    p.probe([p.find('arduino'), 2]);
    p.wait(0.3);
    const ctx = p.context();
    return { freq: ctx.scope.freq[0], level: ctx.levels.get(p.find('speaker').id) ?? 0 };
  }

  it('each key plays its note, and letting go stops it', async () => {
    const p = await open('mini-piano');
    p.sound(true);
    p.wait(0.3);
    expect(sounding(p).level).toBeLessThan(1e-4);
    for (let k = 0; k < 4; k++) {
      const key = p.ref(`PB${k + 1}`);
      p.set(key, { on: true });
      const s = sounding(p);
      expect(s.level).toBeGreaterThan(3e-3);
      expect(Math.abs((s.freq ?? 0) - NOTES[k]) / NOTES[k], `key ${k + 1}: ${s.freq} Hz`).toBeLessThan(0.02);
      p.set(key, { on: false });
      p.wait(0.1);
      expect(sounding(p).level).toBeLessThan(1e-4);
    }
    // Two keys at once: only the lower note.
    p.set(p.ref('PB3'), { on: true });
    p.set(p.ref('PB1'), { on: true });
    const s = sounding(p);
    expect(Math.abs((s.freq ?? 0) - 262) / 262).toBeLessThan(0.02);
    expect(p.c.parts.some((x) => x.burn)).toBe(false);
  }, 120_000);

  it('“break it”: without noTone the note never stops', async () => {
    const p = await open('mini-piano', edited(PIANO_SKETCH, /.*noTone\(SPEAKER\);.*\n/, ''));
    p.sound(true);
    p.set(p.ref('PB2'), { on: true });
    p.wait(0.3);
    p.set(p.ref('PB2'), { on: false });
    p.wait(1);
    const s = sounding(p);
    expect(s.level).toBeGreaterThan(3e-3);
    expect(Math.abs((s.freq ?? 0) - 294) / 294).toBeLessThan(0.02);
  }, 120_000);
});

describe('Playground: LED chaser', () => {
  const LEDS = ['LED1', 'LED2', 'LED3', 'LED4', 'LED5', 'LED6'];

  /**
   * Watches for `seconds`, 1 ms at a time. The front LED is the one that's lit without a break
   * (the tail's LEDs flicker, being dimmed by PWM); returns the front LEDs in order, and how long each step took.
   */
  function watch(p: Played, seconds: number) {
    const heads: number[] = [];
    const times: number[] = [];
    let steady = new Array(6).fill(0);
    let t = 0;
    for (let k = 0; k < seconds * 1000; k++) {
      p.wait(0.001);
      t += 0.001;
      const now = lit(p, LEDS);
      steady = steady.map((n, i) => (now[i] === '1' ? n + 1 : 0));
      const head = steady.findIndex((n) => n >= 12); // lit for 12 ms on end: not PWM (2 ms a cycle at most)
      if (head >= 0 && heads[heads.length - 1] !== head) {
        heads.push(head);
        times.push(t);
      }
    }
    const gaps = times.slice(1).map((x, i) => x - times[i]);
    return { heads, step: gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length) };
  }

  /** How many times an LED switched on in `seconds` (hundreds a second while PWM dims it). */
  function switching(p: Played, ref: string, seconds: number): number {
    let n = 0;
    let was = false;
    for (let k = 0; k < seconds * 2000; k++) {
      p.wait(0.0005);
      const on = lit(p, [ref]) === '1';
      if (on && !was) n += 1;
      was = on;
    }
    return n;
  }

  it('runs back and forth with a tail, and the knob sets the speed', async () => {
    const p = await open('led-chaser');
    p.set(p.find('potentiometer'), { pos: 1 }); // fastest: 30 ms a step
    p.wait(0.2);
    const fast = watch(p, 1.2);
    expect(fast.heads.length).toBeGreaterThan(20);
    // Back and forth: each front LED is next to the last, and it turns round only at the ends.
    for (let k = 1; k < fast.heads.length; k++) expect(Math.abs(fast.heads[k] - fast.heads[k - 1])).toBe(1);
    for (let k = 2; k < fast.heads.length; k++) {
      if (fast.heads[k] === fast.heads[k - 2]) expect([0, 5]).toContain(fast.heads[k - 1]);
    }
    expect(fast.heads).toContain(0);
    expect(fast.heads).toContain(5);
    expect(fast.step).toBeGreaterThan(0.027);
    expect(fast.step).toBeLessThan(0.036);

    p.set(p.find('potentiometer'), { pos: 0.5 }); // about 165 ms a step
    p.wait(0.4);
    const mid = watch(p, 1.5);
    expect(mid.step).toBeGreaterThan(0.15);
    expect(mid.step).toBeLessThan(0.18);
    // The tail: LED1 is dimmed by PWM as the light moves away from it.
    expect(switching(p, 'LED1', 3.5)).toBeGreaterThan(8);
    expect(p.c.parts.some((x) => x.burn)).toBe(false);
  }, 240_000);

  it('“break it”: no fading, and all six stay lit; on pin 12 an LED has no tail', async () => {
    const p = await open('led-chaser', edited(CHASER_SKETCH, /.*level\[k\] = level\[k\] \/ 16;.*\n/, ''));
    p.set(p.find('potentiometer'), { pos: 1 });
    p.wait(1);
    for (let k = 0; k < 10; k++) {
      p.wait(0.033);
      expect(lit(p, LEDS)).toBe('111111');
    }
    expect(p.c.parts.some((x) => x.burn)).toBe(false);

    const q = await open('led-chaser', edited(CHASER_SKETCH, '{11, 10,', '{12, 10,'));
    const uno = q.find('arduino');
    q.unwire(uno, 11, q.ref('R1'), 1);
    q.wire(uno, 12, q.ref('R1'), 1);
    q.wait(0.5);
    // At the middle speed LED1 comes on once every 10 steps (1.65 s), and no more often: no PWM.
    const n = switching(q, 'LED1', 3.5);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  }, 240_000);
});
