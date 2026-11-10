/**
 * Standard component values. Real resistors and capacitors are only made in
 * set steps (the "E series"), spaced so that each value's tolerance band
 * meets the next one's.
 */

/** E12: resistors with ±10% tolerance (and the common ±5% range). */
export const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
/** E6: electrolytic capacitors (±20%). */
export const E6 = [1, 1.5, 2.2, 3.3, 4.7, 6.8];

/** Every value of a series from min to max inclusive, e.g. 10 Ω … 1 MΩ. */
export function seriesValues(series: number[], min: number, max: number): number[] {
  const out: number[] = [];
  for (let decade = 10 ** Math.floor(Math.log10(min)); decade <= max; decade *= 10) {
    for (const base of series) {
      const v = round(base * decade);
      if (v >= min * 0.9999 && v <= max * 1.0001) out.push(v);
    }
  }
  return out;
}

/** Rounds away floating-point noise (4.7 × 1e-6 → 4.7e-6 exactly as printed). */
function round(v: number): number {
  return parseFloat(v.toPrecision(6));
}

function neighborsIn(series: number[], v: number): { down: number; up: number } {
  const decade = 10 ** Math.floor(Math.log10(v));
  const candidates = [...series.map((b) => round(b * decade / 10)), ...series.map((b) => round(b * decade)), round(10 * decade)];
  let down = candidates[0];
  let up = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c <= v * 1.0001) down = c;
    if (c >= v * 0.9999 && c < up) up = c;
  }
  return { down, up };
}

/** The smallest standard value at or above v. */
export function standardUp(v: number, series = E12): number {
  if (!(v > 0)) return series[0];
  return neighborsIn(series, v).up;
}

/** The largest standard value at or below v. */
export function standardDown(v: number, series = E12): number {
  if (!(v > 0)) return series[0];
  return neighborsIn(series, v).down;
}

export function isStandard(v: number, series = E12): boolean {
  const { down } = neighborsIn(series, v);
  return Math.abs(down - v) <= v * 1e-4;
}

const PREFIX: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6 };

/**
 * Reads a typed value: "330", "4.7k", "4k7", "10 µF", "2.2uF", "1M", "100n".
 * Returns null if it can't be read.
 */
export function parseValue(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(/(Ω|ohms?|F|V)$/i, '');
  // "4k7" style: the prefix letter stands in for the decimal point.
  const rkm = /^(\d+)([pnuµμmkKM])(\d+)$/.exec(t);
  if (rkm) return parseFloat(`${rkm[1]}.${rkm[3]}`) * PREFIX[rkm[2]];
  const m = /^(\d*\.?\d+)([pnuµμmkKM]?)$/.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1]) * (m[2] ? PREFIX[m[2]] : 1);
  return Number.isFinite(v) && v > 0 ? round(v) : null;
}
