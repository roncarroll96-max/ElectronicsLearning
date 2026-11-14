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
 * An LED of another colour, built like the red one but with the saturation
 * current that gives `vf` volts at 20 mA. Yellow and green chips need a little
 * more voltage than red; blue and white (a blue chip under a phosphor) about 3 V.
 */
export function ledModel(vf: number): DiodeModel {
  const n = 2;
  const rs = 5;
  return { is: 0.02 / Math.exp((vf - 0.02 * rs) / (n * VT)), n, rs };
}

/**
 * Active buzzer, modeled as its polarity-sensitive driver: a silicon junction
 * plus about 560 Ω. Draws roughly 15 mA at 9 V and nothing when reversed.
 */
/**
 * Small 8 Ω, 0.5 W speaker. Electrically, its voice coil is mostly resistance
 * (its inductance, which matters at high pitches, is left out). The sound it
 * makes follows the current through the coil, which pushes the cone in and out.
 */
export const SPEAKER = { r: 8, fullScale: 0.15 };

export const BUZZER: DiodeModel = { is: 2.52e-9, n: 1.752, rs: 560 };

/** NPN transistor, Ebers–Moll model with 2N3904-like values and a typical gain (β) of 200. */
/**
 * Junction capacitances (from the datasheets), used only in time-based
 * simulation. Every PN junction stores a little charge, so its voltage can't
 * jump instantly: this is what limits how fast a transistor switches. Treated
 * as fixed values (in real parts they vary somewhat with voltage).
 */
export const JUNCTION_C = {
  /** 2N3904: base–emitter (Cje) and base–collector (Cjc). */
  npnBe: 4.5e-12,
  npnBc: 3.6e-12,
  /** 1N4148. */
  diode: 4e-12,
  /** A 5 mm LED (a much bigger junction). */
  led: 30e-12,
};

export interface BjtModel {
  is: number;
  /** Forward current gain (β, also called hFE). */
  bf: number;
  /** Reverse current gain. */
  br: number;
  /**
   * Forward and reverse transit times, s. A conducting transistor holds charge
   * in its base, in proportion to its current (Q = τ·I), and that charge has to
   * flow in or out before the current can change: this is why a transistor
   * takes time to switch, and why one driven hard into saturation (where the
   * reverse charge τR builds up) is slow to turn off. Time-based simulation only.
   */
  tf: number;
  tr: number;
}
/** τF and τR from the standard 2N3904 SPICE model (TF = 301.2 ps, TR = 239.5 ns). */
export const NPN_2N3904: BjtModel = { is: 6.734e-15, bf: 200, br: 0.7371, tf: 301.2e-12, tr: 239.5e-9 };

/**
 * Incandescent lamp rated 9 V, 50 mA. A tungsten filament's resistance rises
 * as it heats up, so current grows more slowly than voltage: hot, I ∝ V^0.55.
 * Cold, its resistance is a tenth of the hot value.
 */
export const LAMP = { v: 9, i: 0.05, exponent: 0.55, coldRatio: 0.1 };

/**
 * 1N4001-style rectifier diode (its standard SPICE model), used for the four
 * diodes inside the bridge rectifier: rated 1 A, with about 15 pF of junction
 * capacitance.
 */
export const DIODE_1N4001: DiodeModel = { is: 14.11e-9, n: 1.984, rs: 0.0339 };
export const RECTIFIER_CJ = 15e-12;

/**
 * AC source (a signal generator or a transformer-style AC supply): its
 * internal resistance, Ω. Kept low so it can drive a transformer and a
 * rectifier the way a mains adapter would.
 */
export const AC_SOURCE_R = 1;

/**
 * An inductor's winding resistance, Ω. Real coils need more turns of thinner
 * wire for more inductance, so resistance grows with it: about 1.3 Ω at 1 mH,
 * 4 Ω at 10 mH, 13 Ω at 100 mH and 40 Ω at 1 H, typical of small hobby chokes.
 */
export function inductorResistance(henries: number): number {
  return Math.max(0.05, 40 * Math.sqrt(Math.max(0, henries)));
}

/**
 * Small transformer: the primary's inductance (H), the coupling between its
 * windings (k: 1 would be perfect; real iron-core transformers reach about
 * 0.99), and each winding's resistance. The secondary's inductance follows
 * from the turns ratio n: L2 = n²·L1, and its resistance scales the same way.
 */
export const TRANSFORMER = { l1: 1, k: 0.99, r1: 5 };

/**
 * 555 timer (NE555), as its behaviour rather than its 25 transistors:
 *  - three equal 5 kΩ resistors from VCC to ground set the comparator levels
 *    (Control sits at ⅔ VCC, the trigger level is half of Control);
 *  - the output, high, is VCC less about 1.5 V; low, about 10 Ω to ground;
 *  - the discharge transistor, when on, is about 20 Ω to ground;
 *  - the chip itself draws about 3 mA (modelled as 3 kΩ across the supply);
 *  - Reset has a weak pull-up, so leaving it unconnected keeps the chip running.
 * It needs at least 4.5 V to work (it is treated as reset below 3 V) and
 * takes at most 16 V (18 V absolute maximum).
 */
/**
 * Arduino Uno (ATmega328P at 16 MHz, powered over USB). Pin figures from the
 * ATmega328P datasheet at 5 V: an output pin sags about 0.5 V when it supplies
 * or sinks 20 mA (so about 25 Ω inside), the pull-up is 20–50 kΩ (35 kΩ here),
 * inputs read HIGH above about 0.6 × VCC and LOW below 0.3 × VCC with a
 * little hysteresis between, and brown-out detection holds the chip in reset
 * below 2.7 V. The board's 5 V comes from USB through a fuse and a switch
 * (about 0.3 Ω); its 3.3 V regulator (LP2985) supplies up to 150 mA.
 */
export const ARDUINO = {
  vcc: 5,
  usbR: 0.3,
  v33: 3.3,
  r33: 1,
  pinR: 25,
  pullUp: 35e3,
  /** Input switching points, as a fraction of VCC: rising past `rise` reads HIGH, falling below `fall` reads LOW. */
  rise: 0.55,
  fall: 0.45,
  /** Below this VCC the chip is held in reset (brown-out detector, 2.7 V setting). */
  brownOut: 2.7,
  clock: 16e6,
  /** Off switches: a tiny leak so no pin floats (1 nS). */
  off: 1e-9,
};

export const TIMER555 = {
  divider: 5000,
  highDrop: 1.5,
  outR: 10,
  dischargeR: 20,
  supplyR: 3000,
  resetPullUp: 100e3,
  resetLevel: 0.7,
  minVcc: 3,
  /** Off switches and comparator inputs: a tiny leak so no pin floats (1 nS). */
  off: 1e-9,
};

/**
 * Logic chips (gates and the D flip-flop), modelled on 74HC CMOS chips at 5 V
 * and run from a hidden 5 V supply: a stated simplification, so a beginner
 * wires only inputs, outputs, and GND (the 5V pin offers that supply for
 * switches and pull-ups). Outputs drive through about 25 Ω (74HC: about 0.5 V
 * drop at 20 mA, 25 mA absolute maximum); inputs read HIGH above 0.55 × 5 V and
 * LOW below 0.45 × 5 V with hysteresis between (Schmitt inputs, so a slow
 * input doesn't chatter). An unconnected input reads LOW here (a weak 1 MΩ
 * pull-down); on a real chip it floats and reads anything.
 */
export const LOGIC = { vcc: 5, supplyR: 0.5, outR: 25, rise: 0.55, fall: 0.45, pullDown: 1e6, off: 1e-9 } as const;
