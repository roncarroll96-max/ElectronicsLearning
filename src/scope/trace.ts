/**
 * The oscilloscope's memory: a rolling record of two channels' voltages,
 * sampled at every simulation step, plus the measurements a scope shows.
 */

/** About 26 s of circuit time at the normal 0.2 ms step. */
const CAPACITY = 1 << 17;

export class Trace {
  readonly t = new Float64Array(CAPACITY);
  readonly a = new Float32Array(CAPACITY);
  readonly b = new Float32Array(CAPACITY);
  /** Index of the oldest sample, and how many there are. */
  private start = 0;
  length = 0;

  clear(): void {
    this.start = 0;
    this.length = 0;
  }

  /** Adds a sample. NaN marks a channel with nothing to measure. Time must not go backwards. */
  push(t: number, a: number, b: number): void {
    if (this.length > 0 && t < this.timeAt(this.length - 1)) this.clear();
    const k = (this.start + this.length) % CAPACITY;
    this.t[k] = t;
    this.a[k] = a;
    this.b[k] = b;
    if (this.length < CAPACITY) this.length++;
    else this.start = (this.start + 1) % CAPACITY;
  }

  /** The i-th sample, oldest first. */
  private idx(i: number): number {
    return (this.start + i) % CAPACITY;
  }
  timeAt(i: number): number {
    return this.t[this.idx(i)];
  }
  value(ch: 0 | 1, i: number): number {
    return (ch === 0 ? this.a : this.b)[this.idx(i)];
  }
  get first(): number {
    return this.length ? this.timeAt(0) : 0;
  }
  get last(): number {
    return this.length ? this.timeAt(this.length - 1) : 0;
  }

  /** The first sample at or after time t (binary search). */
  indexAt(t: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.timeAt(mid) < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Min, max and mean of a channel between two times (null if no samples). */
  stats(ch: 0 | 1, t0: number, t1: number): { min: number; max: number; mean: number } | null {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    for (let i = this.indexAt(t0); i < this.length && this.timeAt(i) <= t1; i++) {
      const v = this.value(ch, i);
      if (Number.isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      n++;
    }
    return n ? { min, max, mean: sum / n } : null;
  }

  /**
   * Times where a channel rises through `level` (with a little hysteresis so
   * noise-free but slowly wobbling signals count once per cycle).
   */
  risingEdges(ch: 0 | 1, t0: number, t1: number, level: number, hysteresis: number): number[] {
    const out: number[] = [];
    let armed = false;
    for (let i = this.indexAt(t0); i < this.length && this.timeAt(i) <= t1; i++) {
      const v = this.value(ch, i);
      if (Number.isNaN(v)) continue;
      if (v < level - hysteresis) armed = true;
      else if (armed && v >= level && i > 0) {
        // Interpolate between this sample and the previous one for a precise crossing time.
        const v0 = this.value(ch, i - 1);
        const ta = this.timeAt(i - 1);
        const tb = this.timeAt(i);
        out.push(Number.isNaN(v0) || v === v0 ? tb : ta + ((level - v0) / (v - v0)) * (tb - ta));
        armed = false;
      }
    }
    return out;
  }

  /** The signal's frequency (Hz) from its rising edges in a time span, if it repeats. */
  frequency(ch: 0 | 1, t0: number, t1: number): number | null {
    const s = this.stats(ch, t0, t1);
    if (!s || s.max - s.min < 0.05) return null;
    const level = (s.max + s.min) / 2;
    const edges = this.risingEdges(ch, t0, t1, level, (s.max - s.min) * 0.1);
    if (edges.length < 3) return null;
    const period = (edges[edges.length - 1] - edges[0]) / (edges.length - 1);
    return period > 0 ? 1 / period : null;
  }
}
