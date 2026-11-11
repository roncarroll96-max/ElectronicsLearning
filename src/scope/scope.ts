/**
 * The virtual oscilloscope's settings. Like a real two-channel scope, each
 * probe shows the voltage at the point it touches over time, measured from
 * the circuit's 0 V (the battery's −, or a ground symbol). The screen has 10
 * divisions across (time) and 8 up (volts).
 *
 * Unlike the multimeter, the scope's probes don't load the circuit: a real
 * scope probe draws a tiny current (it is 1–10 MΩ), which only matters in a
 * few very high-resistance circuits.
 */
import type { Circuit, PinRef } from '../model/circuit';
import { probePin, type Probe } from '../meter/meter';
import type { Trace } from './trace';

export const DIVS_X = 10;
export const DIVS_Y = 8;
/** Volts per division. */
export const V_DIVS = [0.1, 0.2, 0.5, 1, 2, 5] as const;
/** Seconds per division. */
export const TIME_DIVS = [5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1, 2] as const;

export type Channel = 0 | 1;

export interface ScopeState {
  open: boolean;
  probes: [Probe, Probe];
  on: [boolean, boolean];
  vDiv: [number, number];
  /** Where each channel's 0 V line sits, in divisions above the centre line. */
  zero: [number, number];
  timeDiv: number;
  /** Hold a repeating signal still by starting each sweep on CH1 rising through its middle. */
  trigger: boolean;
}

export const INITIAL_SCOPE: ScopeState = {
  open: false,
  probes: [{ at: { x: 0, y: 0 } }, { at: { x: 0, y: 0 } }],
  on: [true, true],
  vDiv: [2, 2],
  zero: [-3, -3],
  timeDiv: 0.1,
  trigger: false,
};

/** The pins the probes touch, for the live simulator to sample. */
export function scopePins(c: Circuit, s: ScopeState): [PinRef | null, PinRef | null] {
  if (!s.open) return [null, null];
  return [s.on[0] ? probePin(c, s.probes[0]) : null, s.on[1] ? probePin(c, s.probes[1]) : null];
}

/** What the oscilloscope shows, as a lesson sees it. */
export interface ScopeView {
  open: boolean;
  /** The pin each channel's probe touches (null: not on a pin, or the channel is off). */
  pins: [PinRef | null, PinRef | null];
  /** Each channel's frequency over the last few seconds (null: not repeating). */
  freq: [number | null, number | null];
  /** Each channel's lowest and highest voltage over the last few seconds. */
  range: [[number, number] | null, [number, number] | null];
}

/** What the scope shows over the last few seconds, for lesson checks. */
export function scopeView(s: ScopeState, pins: [PinRef | null, PinRef | null], trace: Trace, now: number): ScopeView {
  const t0 = now - 4;
  const range = (ch: 0 | 1): [number, number] | null => {
    const st = pins[ch] && trace.length ? trace.stats(ch, t0, now) : null;
    return st ? [st.min, st.max] : null;
  };
  const freq = (ch: 0 | 1) => (pins[ch] && trace.length ? trace.frequency(ch, t0, now) : null);
  return { open: s.open, pins, freq: [freq(0), freq(1)], range: [range(0), range(1)] };
}

/** The smallest standard volts/division that fits a span in about `divs` divisions. */
function fitVDiv(span: number, divs: number): number {
  return V_DIVS.find((v) => v * divs >= span) ?? V_DIVS[V_DIVS.length - 1];
}

/**
 * "Auto": choose volts/division and the 0 V line for each channel so its
 * signal fills the screen, and a time base that shows two or three cycles of a
 * repeating signal. `steady` gives the value of a channel that isn't changing
 * (a circuit without capacitors), when there's no record.
 */
export function autoSet(s: ScopeState, trace: Trace, now: number, steady: [number | null, number | null]): ScopeState {
  const next: ScopeState = { ...s, vDiv: [...s.vDiv], zero: [...s.zero] };
  const window = Math.min(now - trace.first, TIME_DIVS[TIME_DIVS.length - 1] * DIVS_X);
  // Two channels share the screen: give each about 6 divisions, overlapping, so both fit.
  for (const ch of [0, 1] as const) {
    const st = trace.length ? trace.stats(ch, now - window, now) : null;
    const lo = st ? Math.min(st.min, 0) : Math.min(steady[ch] ?? 0, 0);
    const hi = st ? Math.max(st.max, 0) : Math.max(steady[ch] ?? 0, 0);
    const v = fitVDiv(hi - lo, 6);
    next.vDiv[ch] = v;
    // Centre the span (which always includes 0 V) on the screen, snapped to half divisions.
    const mid = (hi + lo) / 2 / v;
    next.zero[ch] = Math.max(-DIVS_Y / 2, Math.min(DIVS_Y / 2, Math.round(-mid * 2) / 2));
  }
  const f = trace.length ? (trace.frequency(0, now - window, now) ?? trace.frequency(1, now - window, now)) : null;
  if (f) {
    // About two and a half cycles across the screen.
    const want = 2.5 / f / DIVS_X;
    next.timeDiv = TIME_DIVS.find((d) => d >= want) ?? TIME_DIVS[TIME_DIVS.length - 1];
    next.trigger = true;
  }
  return next;
}

/** "200 ms", "1 s", "500 µs". */
export function formatDiv(seconds: number): string {
  if (seconds >= 1) return `${seconds} s`;
  if (seconds >= 1e-3) return `${+(seconds * 1000).toPrecision(3)} ms`;
  return `${+(seconds * 1e6).toPrecision(3)} µs`;
}
