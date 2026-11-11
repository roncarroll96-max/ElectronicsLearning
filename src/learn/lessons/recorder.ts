/**
 * A short memory of how each part's current and voltage have moved over the
 * last few seconds of circuit time, so a lesson can ask "is this LED
 * blinking?" or "did the capacitor charge and then drain?", which a single
 * moment can't answer.
 */
import type { SimResult } from '../../sim/simulate';

/** How far back the memory reaches, s of circuit time. */
const WINDOW = 4;

export interface Swing {
  /** Lowest and highest current into pin 0 (A), and voltage from pin 0 to pin 1 (V). */
  iMin: number;
  iMax: number;
  vMin: number;
  vMax: number;
}

export interface Recent {
  /** How a part's current and voltage ranged over the last few seconds (null: nothing recorded yet). */
  swing(id: string): Swing | null;
}

interface Sample {
  t: number;
  i: number;
  v: number;
}

export class Recorder implements Recent {
  private parts = new Map<string, Sample[]>();
  private last = -Infinity;

  /** Forgets everything (a new circuit, or the power switched off and on). */
  clear(): void {
    this.parts.clear();
    this.last = -Infinity;
  }

  /** Records the readings at circuit time t. Time going backwards means a restart. */
  record(t: number, sim: SimResult): void {
    if (t < this.last) this.clear();
    this.last = t;
    if (!sim.ok || sim.idle) return;
    for (const [id, r] of sim.parts) {
      let list = this.parts.get(id);
      if (!list) this.parts.set(id, (list = []));
      list.push({ t, i: r.i[0] ?? 0, v: (r.v[0] ?? 0) - (r.v[1] ?? 0) });
      let drop = 0;
      while (drop < list.length && list[drop].t < t - WINDOW) drop++;
      if (drop) list.splice(0, drop);
    }
  }

  swing(id: string): Swing | null {
    const list = this.parts.get(id);
    if (!list?.length) return null;
    const s: Swing = { iMin: Infinity, iMax: -Infinity, vMin: Infinity, vMax: -Infinity };
    for (const x of list) {
      s.iMin = Math.min(s.iMin, x.i);
      s.iMax = Math.max(s.iMax, x.i);
      s.vMin = Math.min(s.vMin, x.v);
      s.vMax = Math.max(s.vMax, x.v);
    }
    return s;
  }
}

/** A memory with nothing in it. */
export const NO_HISTORY: Recent = { swing: () => null };
