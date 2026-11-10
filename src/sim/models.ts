/**
 * Physical models and constants for every part the simulator knows.
 *
 * Numbers come from datasheets or standard SPICE models. Each one is written
 * down here, in one place, so that lessons can say exactly what the simulator
 * assumes and where it simplifies.
 */

/** Thermal voltage kT/q at 27 °C (SPICE's default temperature), in volts. */
export const VT = 0.025865;

/**
 * A tiny conductance (1 pS) from every node to the reference and across every
 * junction, as SPICE does. It keeps the math solvable when part of a circuit
 * is floating, and is far too small to change any reading.
 */
export const GMIN = 1e-12;

/** Internal resistance of a fresh 9 V alkaline battery (datasheets: about 1–2 Ω). */
export const BATTERY_R = 1.5;

/** Contact resistance of a closed switch or a pressed button. */
export const SWITCH_R = 0.01;

/** Smallest resistance a resistor, or either half of a potentiometer, can have. */
export const MIN_R = 0.01;

/** Light sensor (GL5528-style LDR): resistance in darkness and in bright light. */
export const LDR_DARK_R = 1e6;
export const LDR_BRIGHT_R = 500;

/**
 * LDR resistance for a light level from 0 (dark) to 1 (bright). Real LDRs
 * respond roughly logarithmically, so this interpolates on a log scale:
 * 0.5 gives about 22 kΩ, typical of a lit room.
 */
export function ldrResistance(light: number): number {
  const l = Math.min(1, Math.max(0, light));
  return Math.exp(Math.log(LDR_DARK_R) * (1 - l) + Math.log(LDR_BRIGHT_R) * l);
}

/** A PN junction (Shockley equation) with series resistance. */
export interface DiodeModel {
  /** Saturation current, A. */
  is: number;
  /** Emission coefficient. */
  n: number;
  /** Series resistance, Ω. */
  rs: number;
}

/** 1N4148 small-signal silicon diode (its standard SPICE model). */
export const DIODE_1N4148: DiodeModel = { is: 2.52e-9, n: 1.752, rs: 0.568 };

/** Red 5 mm LED: about 2.0 V at 20 mA and 1.75 V at 1 mA, like typical datasheets. */
export const LED_RED: DiodeModel = { is: 2.2e-18, n: 2, rs: 5 };

/**
 * Active buzzer, modeled as its polarity-sensitive driver: a silicon junction
 * plus about 560 Ω. Draws roughly 15 mA at 9 V and nothing when reversed.
 */
export const BUZZER: DiodeModel = { is: 2.52e-9, n: 1.752, rs: 560 };

/** NPN transistor, Ebers–Moll model with 2N3904-like values and a typical gain (β) of 200. */
export interface BjtModel {
  is: number;
  /** Forward current gain (β, also called hFE). */
  bf: number;
  /** Reverse current gain. */
  br: number;
}
export const NPN_2N3904: BjtModel = { is: 6.734e-15, bf: 200, br: 0.7371 };

/**
 * Incandescent lamp rated 9 V, 50 mA. A tungsten filament's resistance rises
 * as it heats up, so current grows more slowly than voltage: hot, I ∝ V^0.55.
 * Cold, its resistance is a tenth of the hot value.
 */
export const LAMP = { v: 9, i: 0.05, exponent: 0.55, coldRatio: 0.1 };
