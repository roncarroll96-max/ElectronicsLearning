import { describe, expect, it } from 'vitest';
import { Trace } from './trace';

describe('scope trace', () => {
  it('measures min, max, mean and frequency of a square wave', () => {
    const tr = new Trace();
    // 2 Hz square wave between 0 and 8 V on channel A; channel B steady at 3 V.
    for (let k = 0; k <= 15_000; k++) {
      const t = k * 2e-4;
      tr.push(t, (t * 2) % 1 < 0.5 ? 8 : 0, 3);
    }
    const s = tr.stats(0, 0, 3)!;
    expect(s.min).toBe(0);
    expect(s.max).toBe(8);
    expect(s.mean).toBeCloseTo(4, 1);
    expect(tr.frequency(0, 0, 3)).toBeCloseTo(2, 2);
    expect(tr.frequency(1, 0, 3)).toBeNull(); // steady: no frequency
    expect(tr.stats(1, 1, 2)!.mean).toBeCloseTo(3, 6);
  });

  it('finds samples by time and forgets the oldest when full', () => {
    const tr = new Trace();
    for (let k = 0; k < 200_000; k++) tr.push(k * 1e-3, k, NaN);
    expect(tr.length).toBe(1 << 17);
    expect(tr.last).toBeCloseTo(199.999, 6);
    expect(tr.first).toBeCloseTo((200_000 - (1 << 17)) * 1e-3, 6);
    const i = tr.indexAt(150);
    expect(tr.timeAt(i)).toBeCloseTo(150, 6);
    expect(tr.value(0, i)).toBe(150_000);
    expect(tr.stats(1, 100, 101)).toBeNull(); // channel B never measured anything
  });

  it('starts afresh when time goes backwards (the circuit was powered off and on)', () => {
    const tr = new Trace();
    tr.push(5, 1, 1);
    tr.push(6, 2, 2);
    tr.push(0, 9, 9);
    expect(tr.length).toBe(1);
    expect(tr.value(0, 0)).toBe(9);
  });
});
