/** The Playground's Arduino dice, compiled for real and run on the emulated chip. */
import { beforeAll, describe, expect, it } from 'vitest';
import { play } from '../learn/lessons/harness';
import type { Lesson } from '../learn/lessons/types';
import { projectById } from '../playground/projects';
import { program, testToolkit } from './testKit';

beforeAll(async () => {
  await testToolkit();
}, 60_000);

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
