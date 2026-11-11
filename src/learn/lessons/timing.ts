/** Sound & Timing track: the oscilloscope, oscillators, the 555 timer, AC and power supplies. */
import type { Part } from '../../model/circuit';
import type { PartKind } from '../../model/parts';
import {
  between,
  blinking,
  byRef,
  has,
  joinedTo,
  ledLit,
  meterMag,
  parts,
  probesAcrossPart,
  scopeFreq,
  scopeOn,
  scopeRange,
  starter,
  touches,
  valueOf,
  voltageAcross,
} from './checks';
import type { CheckCtx, Lesson } from './types';

/* ---------- Shared starter circuits ---------- */

/**
 * The classic two-transistor blinker (an "astable multivibrator"): each
 * transistor's collector drives the other's base through a capacitor.
 * Parts: B1, R1/LED1 on Q1, R2 and a load (LED2 or a speaker) on Q2, R3/R4 feed the bases, C1/C2 cross-couple.
 */
const blinker = (cap: number, load: 'led' | 'speaker') =>
  starter(
    [
      { kind: 'battery', x: -300, y: 40, rot: 90 }, // 0
      { kind: 'resistor', x: -100, y: -100, rot: 90, value: 470 }, // 1 R1
      { kind: 'led', x: -100, y: 20, rot: 90 }, // 2 LED1
      { kind: 'npn', x: -120, y: 140 }, // 3 Q1
      { kind: 'resistor', x: -20, y: -100, rot: 90, value: 47_000 }, // 4 R2 (named R2: Q1's base feed)
      { kind: 'resistor', x: 60, y: -100, rot: 90, value: 47_000 }, // 5 R3 (Q2's base feed)
      { kind: 'capacitor', x: -20, y: 60, value: cap }, // 6 C1
      { kind: 'capacitor', x: 60, y: 100, value: cap }, // 7 C2
      { kind: 'npn', x: 180, y: 140 }, // 8 Q2
      { kind: 'resistor', x: 200, y: -100, rot: 90, value: 470 }, // 9 R4
      { kind: load, x: 200, y: 20, rot: 90 }, // 10 LED2 or SPK1
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 4, 0],
      [0, 0, 5, 0],
      [0, 0, 9, 0],
      [1, 1, 2, 0],
      [2, 1, 3, 1],
      [9, 1, 10, 0],
      [10, 1, 8, 1],
      [4, 1, 3, 0],
      [5, 1, 8, 0],
      [6, 0, 3, 1],
      [6, 1, 8, 0],
      [7, 0, 8, 1],
      [7, 1, 3, 0],
      [3, 2, 0, 1],
      [8, 2, 0, 1],
    ],
  );

/** 555 pins (index = chip pin − 1). */
const GND = 0;
const TRIG = 1;
const OUT = 2;
const RESET = 3;
const THR = 5;
const DIS = 6;
const VCC = 7;

type Placed = Parameters<typeof starter>[0][number];
type WireSpec = [number, number, number, number];

/**
 * A 555 with its power wired (VCC and Reset to +, GND to ground), its output
 * driving `load` through a resistor, plus whatever else `extra` adds.
 * Indexes: 0 battery, 1 the 555, 2 ground, 3 output resistor, 4 load; extras follow from 5.
 */
function chip(outR: number, load: PartKind, extra: Placed[], wires: WireSpec[]) {
  return starter(
    [
      { kind: 'battery', x: -300, y: 40, rot: 90 },
      { kind: 'timer555', x: 100, y: 0 },
      { kind: 'ground', x: 100, y: 160 },
      { kind: 'resistor', x: 260, y: 0, value: outR },
      { kind: load, x: 340, y: 60, rot: 90 },
      ...extra,
    ],
    [
      [0, 0, 1, VCC],
      [1, VCC, 1, RESET],
      [0, 1, 2, 0],
      [1, GND, 2, 0],
      [1, OUT, 3, 0],
      [3, 1, 4, 0],
      [4, 1, 2, 0],
      ...wires,
    ],
  );
}

/** A 555 astable: R1 (5) from + to Discharge, R2 (6) from Discharge to Threshold, Threshold to Trigger, C1 (7) to ground. */
const astable = (r1: number, r2: number, cap: number, outR: number, load: PartKind) =>
  chip(
    outR,
    load,
    [
      { kind: 'resistor', x: -40, y: -60, rot: 90, value: r1 },
      { kind: 'resistor', x: -120, y: 0, rot: 90, value: r2 },
      { kind: 'capacitor', x: -40, y: 80, rot: 90, value: cap },
    ],
    [
      [0, 0, 5, 0],
      [5, 1, 1, DIS],
      [1, DIS, 6, 0],
      [6, 1, 1, THR],
      [1, THR, 1, TRIG],
      [1, THR, 7, 0],
      [7, 1, 2, 0],
    ],
  );

/* ---------- Small questions for these lessons ---------- */

const first = (c: CheckCtx, kind: PartKind) => parts(c, kind)[0] as Part | undefined;
const timer = (c: CheckCtx) => first(c, 'timer555');
const ac = (c: CheckCtx) => first(c, 'acsource');
/** A pin of the 555 joined to a pin of another part. */
const onPin = (c: CheckCtx, p: Part | undefined, pin: number, chipPin: number) => {
  const u = timer(c);
  return !!p && !!u && c.t.joined({ part: p.id, pin }, { part: u.id, pin: chipPin });
};
const speaker = (c: CheckCtx) => first(c, 'speaker');
/** The speaker is being driven with a changing current (rms, A): it is making a sound. */
const sounding = (c: CheckCtx, amps = 2e-3) => {
  const s = speaker(c);
  return !!s && (c.levels.get(s.id) ?? 0) >= amps;
};

export const TIMING: Lesson[] = [
  {
    id: 'scope-intro',
    track: 'timing',
    title: 'Watching time: the oscilloscope',
    summary: 'Draw a capacitor charging and draining as a graph of voltage against time.',
    minutes: 6,
    concept: [
      'A multimeter shows one number: the voltage right now. An oscilloscope draws a graph of it, with time going across and voltage going up, so you can see how a circuit changes.',
      'Here a push button charges a capacitor through a 10 kΩ resistor, and a 100 kΩ resistor slowly drains it again. On the scope, charging is a curve that climbs steeply and then flattens out; draining is the same curve upside down.',
      'The time constant τ = R × C sets the pace: after one τ the capacitor has gone 63% of the way, after 5τ it has practically arrived.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: -200, y: 40, rot: 90 },
        { kind: 'pushbutton', x: -100, y: -40 },
        { kind: 'resistor', x: 20, y: -40, value: 10_000 },
        { kind: 'capacitor', x: 120, y: 40, rot: 90, value: 100e-6 },
        { kind: 'resistor', x: 220, y: 40, rot: 90, value: 100_000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 3, 0],
        [3, 0, 4, 0],
        [4, 1, 3, 1],
        [3, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'open',
        text: 'Open the oscilloscope: click the scope button in the toolbar under the canvas.',
        check: (c) => c.scope.open,
      },
      {
        id: 'probe',
        text: 'Drag the yellow CH1 probe onto the capacitor’s + pin. The trace is flat at 0 V: it’s empty.',
        check: (c) => scopeOn(c, first(c, 'capacitor'), 0),
      },
      {
        id: 'charge',
        text: 'Press and hold the button. The trace climbs, steeply at first, then more and more slowly. Keep holding until it levels off at about 8 V.',
        hint: 'τ = 10 kΩ × 100 µF = 1 s, so it takes a few seconds to level off. It stops at about 8.2 V, not 9 V, because the 100 kΩ resistor is draining a little all the time.',
        check: (c) => scopeOn(c, first(c, 'capacitor'), 0) && voltageAcross(c, first(c, 'capacitor')!) > 6.5,
      },
      {
        id: 'drain',
        text: 'Let go. Now the capacitor drains through the 100 kΩ resistor: the same curve, upside down, ten times slower (τ = 100 kΩ × 100 µF = 10 s).',
        check: (c) => {
          const cap = first(c, 'capacitor');
          const s = cap && c.recent.swing(cap.id);
          return !first(c, 'pushbutton')?.on && !!s && s.vMax > 6.5 && voltageAcross(c, cap!) < s.vMax - 0.4;
        },
      },
    ],
    experiment: [
      {
        id: 'drain-fast',
        text: 'Too slow? Change R2 (the 100 kΩ) to 10 kΩ: τ drops to 1 s, and the capacitor empties in a few seconds. Wait until it’s below 2 V.',
        check: (c) => valueOf(byRef(c, 'R2')) <= 22_000 && voltageAcross(c, first(c, 'capacitor')!) < 2,
      },
      {
        id: 'small-cap',
        text: 'Change C1 to 10 µF and tap the button: now the curve is ten times quicker (τ = 0.1 s). It levels off at 4.5 V, because with R2 at 10 kΩ the two resistors share the 9 V.',
        hint: 'Set the scope’s time/division to 0.2 s or less to see the curve clearly.',
        check: (c) => {
          const cap = first(c, 'capacitor');
          const s = cap && c.recent.swing(cap.id);
          return valueOf(cap) <= 22e-6 && !!s && s.vMin < 2 && voltageAcross(c, cap!) > 3.5;
        },
      },
    ],
    why: {
      capacitor: 'Its size, with the resistor charging it, sets how fast the trace climbs: τ = R × C. Ten times the capacitance, ten times slower.',
      pushbutton: 'While you hold it, the battery charges the capacitor; let go and only the drain resistor is left.',
    },
  },

  {
    id: 'blinker',
    track: 'timing',
    title: 'Oscillators: a two-transistor blinker',
    summary: 'Two transistors and two capacitors take turns forever. Measure how fast with the scope.',
    minutes: 7,
    concept: [
      'An oscillator is a circuit that never settles: it keeps switching back and forth by itself. This one, the astable multivibrator, is two transistor switches that keep turning each other off.',
      'When Q1 switches on, its collector drops to almost 0 V. That sudden drop passes through C1 and pulls Q2’s base far below 0 V, so Q2 turns off. Q2 stays off until C1 recharges through its base resistor, then turns on and does the same to Q1. Round and round.',
      'Each half of the cycle lasts about 0.69 × R × C (the base resistor and the capacitor), so a whole blink takes about 1.4 × R × C: with 47 kΩ and 10 µF, about 0.65 s, or 1.5 blinks a second.',
    ],
    starter: blinker(10e-6, 'led'),
    build: [
      {
        id: 'probe',
        text: 'The LEDs take turns. Open the scope and put CH1 on Q1’s collector (its top pin).',
        check: (c) => scopeOn(c, byRef(c, 'Q1'), 1),
      },
      {
        id: 'auto',
        text: 'Press Auto. The trace jumps between almost 0 V (Q1 on, its LED lit) and about 7 V (Q1 off). The scope reads the frequency: about 1.5 Hz.',
        check: (c) => between(scopeFreq(c, byRef(c, 'Q1'), 1) ?? 0, 1, 2.2),
      },
      {
        id: 'base',
        text: 'Now put CH2 on Q1’s base (its left pin). Each time Q2 switches on, the base is yanked far below 0 V, about −7 V, then climbs back up through R2 until Q1 turns on again.',
        check: (c) => (scopeRange(c, byRef(c, 'Q1'), 0)?.[0] ?? 0) < -4,
      },
    ],
    experiment: [
      {
        id: 'faster',
        text: 'Change both C1 and C2 to 4.7 µF. Half the capacitance, about twice as fast: check the frequency with the scope.',
        check: (c) =>
          parts(c, 'capacitor').length >= 2 &&
          parts(c, 'capacitor').every((p) => valueOf(p) <= 4.8e-6) &&
          between(scopeFreq(c, byRef(c, 'Q1'), 1) ?? 0, 2.4, 5),
      },
      {
        id: 'lopsided',
        text: 'Make the capacitors different (say C1 = 22 µF and C2 = 4.7 µF). It still blinks, but one LED now stays on much longer than the other: each capacitor times one half of the cycle.',
        check: (c) => {
          const [a, b] = parts(c, 'capacitor').map(valueOf);
          return !!a && !!b && Math.max(a, b) / Math.min(a, b) >= 2 && parts(c, 'led').every((l) => blinking(c, l));
        },
      },
    ],
    why: {
      capacitor: 'Each capacitor times half the cycle: it passes the sudden drop at one collector to the other transistor’s base, and holds that transistor off until it recharges through the base resistor (about 0.69 × R × C).',
      resistor: 'The 47 kΩ resistors feed the bases and recharge the capacitors, so they set the timing too. The 470 Ω ones limit each LED’s current.',
    },
  },

  {
    id: 'beeper',
    track: 'timing',
    title: 'From blink to beep',
    summary: 'Speed an oscillator up a thousand times and it becomes a sound.',
    minutes: 6,
    concept: [
      'Sound is air pushed back and forth. A speaker does the pushing: current through its coil moves the cone. Switch the current on and off slowly and you hear clicks; switch it hundreds or thousands of times a second and the clicks blur into a tone.',
      'The pitch you hear is the frequency: 440 Hz is the A that orchestras tune to; people hear from about 20 Hz to 15–20 kHz.',
      'This is the blinker again, with a speaker in place of Q2’s LED. Shrink its capacitors and it speeds up from a blink into a beep.',
    ],
    starter: blinker(10e-6, 'speaker'),
    build: [
      {
        id: 'sound',
        text: 'Switch sound on (the speaker button in the top bar). Each time Q2 switches, the speaker clicks.',
        check: (c) => c.sound,
      },
      {
        id: 'tone',
        text: 'Change both capacitors to 10 nF (a thousand times smaller). The clicks come so fast they become a tone.',
        check: (c) => parts(c, 'capacitor').length >= 2 && parts(c, 'capacitor').every((p) => valueOf(p) <= 22e-9) && sounding(c),
      },
      {
        id: 'measure',
        text: 'Put a scope probe on Q2’s collector and press Auto: about 1.5 kHz, a thousand times faster than the blinker, just as 1.4 × R × C predicts.',
        check: (c) => between(scopeFreq(c, byRef(c, 'Q2'), 1) ?? 0, 800, 3000),
      },
    ],
    experiment: [
      {
        id: 'lower',
        text: 'Change R2 and R3 (the 47 kΩ base resistors) to 100 kΩ. Twice the resistance: the pitch drops to about half.',
        check: (c) =>
          valueOf(byRef(c, 'R2')) >= 68_000 && valueOf(byRef(c, 'R3')) >= 68_000 && between(scopeFreq(c, byRef(c, 'Q2'), 1) ?? 0, 300, 1100),
      },
    ],
    why: {
      speaker: 'Every time Q2 switches, the current through the speaker’s coil jumps between nothing and about 18 mA (limited by the 470 Ω resistor), pushing the cone: that’s the click, and many clicks a second are a tone.',
      capacitor: 'The capacitors set the speed: 1.4 × 47 kΩ × 10 nF ≈ 0.66 ms per cycle, about 1,500 cycles a second.',
    },
  },

  {
    id: '555-oneshot',
    track: 'timing',
    title: 'The 555 timer: a one-shot',
    summary: 'Tap a button, and a light stays on for exactly as long as R × C says.',
    minutes: 7,
    concept: [
      'The 555 is a tiny chip, made since 1972 and still one of the most popular ever. Inside: two comparators (each checks whether one voltage is above another), a memory (a flip-flop) and a switch to empty a capacitor.',
      'Wired as a “monostable” (one-shot), it waits. A low pulse on Trigger (pin 2) switches the output (pin 3) high, and lets the capacitor charge through R1. When the capacitor reaches ⅔ of the supply, Threshold (pin 6) notices: the output switches low and Discharge (pin 7) empties the capacitor, ready for next time.',
      'The light stays on for 1.1 × R × C: with 100 kΩ and 10 µF, 1.1 seconds, whatever the battery voltage.',
    ],
    starter: chip(
      470,
      'led',
      [
        { kind: 'resistor', x: -40, y: -60, rot: 90, value: 100_000 }, // 5 R2 (the timing resistor)
        { kind: 'capacitor', x: -40, y: 80, rot: 90, value: 10e-6 }, // 6 C1
        { kind: 'resistor', x: -160, y: -60, rot: 90, value: 10_000 }, // 7 R3 (Trigger's pull-up)
        { kind: 'pushbutton', x: -160, y: 60, rot: 90 }, // 8 PB1
      ],
      [
        [0, 0, 5, 0],
        [5, 1, 1, DIS],
        [1, DIS, 1, THR],
        [1, THR, 6, 0],
        [6, 1, 2, 0],
        [0, 0, 7, 0],
        [7, 1, 1, TRIG],
        [1, TRIG, 8, 0],
        [8, 1, 2, 0],
      ],
    ),
    build: [
      {
        id: 'press',
        text: 'Tap the push button: it pulls Trigger (pin 2) to 0 V, and the LED lights.',
        check: (c) => ledLit(c),
      },
      {
        id: 'hold',
        text: 'Let go. The LED stays on: the 555 remembers it was triggered, while C1 charges through R2.',
        check: (c) => !first(c, 'pushbutton')?.on && ledLit(c),
      },
      {
        id: 'off',
        text: 'About a second later it switches off by itself, the moment C1 reaches 6 V (⅔ of 9 V).',
        check: (c) => !first(c, 'pushbutton')?.on && !ledLit(c, 1e-4) && blinking(c, first(c, 'led')),
      },
    ],
    experiment: [
      {
        id: 'scope',
        text: 'Open the scope: CH1 on C1’s + pin, CH2 on the output (pin 3). Tap the button again. C1 climbs to 6 V, then drops to 0 V at the very moment the output falls.',
        check: (c) =>
          scopeOn(c, first(c, 'capacitor'), 0) && scopeOn(c, timer(c), OUT) && between(scopeRange(c, first(c, 'capacitor'), 0)?.[1] ?? 0, 5.5, 6.7),
      },
      {
        id: 'longer',
        text: 'Change C1 to 47 µF and tap again: 1.1 × 100 kΩ × 47 µF ≈ 5 s. Count along.',
        check: (c) => valueOf(first(c, 'capacitor')) >= 47e-6 && ledLit(c),
      },
    ],
    challenge: [
      {
        id: 'ten',
        text: 'Design a 10-second timer: choose R2 and C1 so that 1.1 × R × C is about 10 s (8 to 12 s counts), then tap the button to start it.',
        hint: 'Pick a capacitor first, then work out R = 10 ÷ (1.1 × C). With 100 µF: R = 10 ÷ (1.1 × 0.0001) ≈ 91 kΩ, so 100 kΩ (11 s) is close enough.',
        check: (c) => between(1.1 * valueOf(byRef(c, 'R2')) * valueOf(first(c, 'capacitor')), 8, 12) && ledLit(c),
      },
    ],
    why: {
      timer555: 'Wired as a one-shot: Trigger starts it, R2 and C1 time it (1.1 × R × C), Threshold ends it, and Discharge empties C1 for next time.',
      resistor: 'R2 charges the timing capacitor. R3 holds Trigger high (so it doesn’t fire by itself) until the button pulls it low. R1 limits the LED’s current.',
      pushbutton: 'Pressing it pulls Trigger below ⅓ of the supply, which starts the timer. How long you hold it doesn’t matter (as long as it’s shorter than the timer).',
    },
  },

  {
    id: '555-astable',
    track: 'timing',
    title: 'The 555 timer: a blinker',
    summary: 'Wire the 555 to retrigger itself, and it blinks for ever at a rate you choose.',
    minutes: 8,
    concept: [
      'Join Trigger (pin 2) to Threshold (pin 6), both on the timing capacitor, and the 555 keeps itself going: the capacitor charges through two resistors (here R2 and R3) until it reaches ⅔ of the supply, then the output goes low and Discharge drains it through R3 alone, until it drops to ⅓, which triggers the next cycle.',
      'This is the “astable” circuit. It runs at f = 1.44 ÷ ((R2 + 2 × R3) × C). The output is high while charging (0.69 × (R2 + R3) × C) and low while discharging (0.69 × R3 × C).',
    ],
    starter: chip(
      470,
      'led',
      [
        { kind: 'resistor', x: -40, y: -60, rot: 90, value: 1000 }, // 5 R2 (named R2: R1 is the LED's)
        { kind: 'resistor', x: -140, y: 20, rot: 90, value: 47_000 }, // 6 R3
        { kind: 'capacitor', x: -40, y: 80, rot: 90, value: 10e-6 }, // 7 C1
      ],
      [
        [0, 0, 5, 0],
        [5, 1, 1, DIS],
      ],
    ),
    build: [
      {
        id: 'r3',
        text: 'Wire R3 (47 kΩ) from Discharge (pin 7) to Threshold (pin 6).',
        hint: 'Hover over the 555’s pins to see their names. Discharge and Threshold are the top two on its left side.',
        check: (c) => {
          const r = byRef(c, 'R3');
          return [0, 1].some((i) => onPin(c, r, i, DIS) && onPin(c, r, 1 - i, THR) && !onPin(c, r, 1 - i, DIS));
        },
      },
      {
        id: 'trig',
        text: 'Join Threshold (pin 6) to Trigger (pin 2) with a wire.',
        check: (c) => {
          const u = timer(c);
          return !!u && c.t.joined({ part: u.id, pin: THR }, { part: u.id, pin: TRIG });
        },
      },
      {
        id: 'cap',
        text: 'Wire C1’s + pin to Threshold and its − pin to ground (pin 1, or the ground symbol).',
        check: (c) => onPin(c, first(c, 'capacitor'), 0, THR) && onPin(c, first(c, 'capacitor'), 1, GND),
      },
      {
        id: 'blink',
        text: 'The LED blinks, about 1.5 times a second: 1.44 ÷ ((1 kΩ + 2 × 47 kΩ) × 10 µF) = 1.5 Hz.',
        check: (c) => blinking(c, first(c, 'led')),
      },
    ],
    experiment: [
      {
        id: 'saw',
        text: 'Probe C1’s + pin with the scope and press Auto. It saws up and down between 3 V and 6 V (⅓ and ⅔ of 9 V), never emptying. Try CH2 on the output: a square wave.',
        check: (c) => {
          const cap = first(c, 'capacitor');
          const r = scopeRange(c, cap, 0);
          return between(scopeFreq(c, cap, 0) ?? 0, 1, 2.2) && !!r && between(r[0], 2.5, 3.6) && between(r[1], 5.4, 6.6);
        },
      },
      {
        id: 'duty',
        text: 'Change R2 to 47 kΩ and R3 to 4.7 kΩ. Now the LED is on about ten times longer than it’s off: the charging path is R2 + R3, the discharging path R3 alone.',
        check: (c) => valueOf(byRef(c, 'R2')) >= 33_000 && valueOf(byRef(c, 'R3')) <= 6800 && blinking(c, first(c, 'led')),
      },
    ],
    why: {
      timer555: 'Wired as an astable: it triggers itself each time the capacitor falls to ⅓ of the supply, and resets each time it climbs to ⅔. f = 1.44 ÷ ((R2 + 2 × R3) × C) here.',
      capacitor: 'C1 is the timing capacitor: it charges through R2 and R3 and discharges through R3 alone. Twice the capacitance, half the speed.',
    },
  },

  {
    id: '555-tone',
    track: 'timing',
    title: 'The 555 timer: making tones',
    summary: 'Shrink the capacitor and the 555 sings. Tune it to a musical note.',
    minutes: 7,
    concept: [
      'The 555 astable works the same at 7 Hz or 7,000 Hz: only R and C change. Shrink the capacitor and its clicks become a tone.',
      'Its output swings between 0 V and about 7.5 V, so here it drives a speaker through 330 Ω to keep the current safe. A real design would add a capacitor in series, so only the changing part reaches the speaker.',
      'Musical notes are frequencies: A is 440 Hz, the A above is 880 Hz (doubling the frequency raises the pitch an octave).',
    ],
    starter: astable(1000, 10_000, 10e-6, 330, 'speaker'),
    build: [
      {
        id: 'sound',
        text: 'Switch sound on (top bar). You hear clicks, about 7 a second: 1.44 ÷ ((R2 + 2 × R3) × C1) = 1.44 ÷ ((1 kΩ + 2 × 10 kΩ) × 10 µF) = 6.9 Hz.',
        check: (c) => c.sound,
      },
      {
        id: 'tone',
        text: 'Change C1 to 68 nF, about 150 times smaller. Now it’s a tone of about 1 kHz.',
        check: (c) => valueOf(first(c, 'capacitor')) <= 220e-9 && sounding(c),
      },
      {
        id: 'measure',
        text: 'Probe the output (pin 3) with the scope and press Auto to read the frequency.',
        check: (c) => between(scopeFreq(c, timer(c), OUT) ?? 0, 500, 2000),
      },
    ],
    experiment: [
      {
        id: 'octave',
        text: 'Halve the capacitor (try 33 nF): the frequency doubles and the note goes up an octave.',
        check: (c) => valueOf(first(c, 'capacitor')) <= 47e-9 && between(scopeFreq(c, timer(c), OUT) ?? 0, 1500, 4000),
      },
    ],
    challenge: [
      {
        id: 'a440',
        text: 'Tune it to A, 440 Hz. Keep R2 = 1 kΩ and R3 = 10 kΩ and work out the capacitor: C = 1.44 ÷ ((R2 + 2 × R3) × 440). Check with the scope: within about 30 Hz counts.',
        hint: 'C = 1.44 ÷ (21 kΩ × 440) ≈ 156 nF. The nearest standard value is 150 nF.',
        check: (c) =>
          valueOf(byRef(c, 'R2')) === 1000 && valueOf(byRef(c, 'R3')) === 10_000 && between(scopeFreq(c, timer(c), OUT) ?? 0, 410, 475),
      },
    ],
    why: {
      capacitor: 'It sets the pitch: f = 1.44 ÷ ((R2 + 2 × R3) × C). Smaller capacitor, higher note.',
      speaker: 'Driven straight from the 555’s output through R1 (330 Ω): about 20 mA when the output is high, nothing when it’s low.',
    },
  },

  {
    id: 'theremin',
    track: 'timing',
    title: 'Sound effects: a light theremin',
    summary: 'Play a tune by waving light at a sensor that sets the 555’s pitch.',
    minutes: 6,
    concept: [
      'A theremin is an instrument you play without touching it. This one uses light: the light sensor (LDR) takes the place of part of the 555’s timing resistor.',
      'More light, lower resistance, faster charging, higher pitch. In the dark the LDR is nearly a megohm and the pitch drops to a low buzz. The fixed 4.7 kΩ in series stops the pitch shooting up out of hearing in bright light.',
    ],
    starter: chip(
      330,
      'speaker',
      [
        { kind: 'resistor', x: -40, y: -60, rot: 90, value: 1000 }, // 5 R2
        { kind: 'resistor', x: -140, y: -60, rot: 90, value: 4700 }, // 6 R3
        { kind: 'ldr', x: -140, y: 60, rot: 90 }, // 7 LDR1
        { kind: 'capacitor', x: -40, y: 80, rot: 90, value: 22e-9 }, // 8 C1
      ],
      [
        [0, 0, 5, 0],
        [5, 1, 1, DIS],
        [1, DIS, 6, 0],
        [6, 1, 7, 0],
        [7, 1, 1, THR],
        [1, THR, 1, TRIG],
        [1, THR, 8, 0],
        [8, 1, 2, 0],
      ],
    ),
    build: [
      {
        id: 'sound',
        text: 'Switch sound on: a tone of about 1.2 kHz.',
        check: (c) => c.sound && sounding(c),
      },
      {
        id: 'probe',
        text: 'Probe the output (pin 3) with the scope and press Auto, so you can read the pitch as you play.',
        check: (c) => (scopeFreq(c, timer(c), OUT) ?? 0) > 100,
      },
      {
        id: 'dark',
        text: 'Select the light sensor and drag its light level below 20%. The pitch falls to a low buzz.',
        check: (c) => (first(c, 'ldr')?.light ?? 0.5) <= 0.2 && between(scopeFreq(c, timer(c), OUT) ?? 0, 20, 400),
      },
      {
        id: 'bright',
        text: 'Now drag it above 80%: a high whistle, several kHz.',
        check: (c) => (first(c, 'ldr')?.light ?? 0.5) >= 0.8 && (scopeFreq(c, timer(c), OUT) ?? 0) > 2500,
      },
    ],
    experiment: [
      {
        id: 'range',
        text: 'Change R3 (the 4.7 kΩ) to 47 kΩ. The bright end of the range comes down a long way, while the dark end hardly changes: there the LDR’s near-megohm dominates.',
        check: (c) => valueOf(byRef(c, 'R3')) >= 33_000 && sounding(c),
      },
    ],
    why: {
      ldr: 'It is part of the timing resistor, so light sets the pitch: from about 500 Ω in bright light to 1 MΩ in darkness.',
      resistor: 'R3 (4.7 kΩ) sits in series with the light sensor, so even in bright light the timing resistance never drops below 4.7 kΩ: that keeps the top note in hearing range.',
    },
  },

  {
    id: 'ac-signals',
    track: 'timing',
    title: 'AC: signals that swing',
    summary: 'Meet alternating current: frequency, peak voltage and wave shapes, seen, lit and heard.',
    minutes: 7,
    concept: [
      'A battery always pushes the same way: direct current (DC). Alternating current (AC) pushes one way, then the other, over and over. Mains electricity does it 50 or 60 times a second; audio signals hundreds or thousands of times a second.',
      'Two numbers describe it: the peak voltage (how far it swings each way) and the frequency (complete swings per second, in hertz). The period, the time for one swing, is 1 ÷ frequency.',
      'This AC source is a signal generator, giving at most 25 V. Never experiment with mains electricity: it is deadly.',
    ],
    starter: starter(
      [
        { kind: 'acsource', x: -160, y: 40, rot: 90, value: 5, set: { freq: 50 } },
        { kind: 'resistor', x: 60, y: 40, rot: 90, value: 1000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'probe',
        text: 'Open the scope and put CH1 on the AC source’s + pin.',
        check: (c) => scopeOn(c, ac(c), 0),
      },
      {
        id: 'auto',
        text: 'Press Auto: a sine wave, swinging from +5 V to −5 V, 50 times a second (one swing every 20 ms).',
        check: (c) => {
          const r = scopeRange(c, ac(c), 0);
          return between(scopeFreq(c, ac(c), 0) ?? 0, 45, 55) && !!r && r[1] > 4.5 && r[0] < -4.5;
        },
      },
      {
        id: 'slow',
        text: 'Select the AC source and set its frequency to 1 Hz: one slow swing a second.',
        check: (c) => (ac(c)?.freq ?? 50) <= 2,
      },
      {
        id: 'led',
        text: 'Put an LED in series: delete the wire from R1 to the source’s − pin, and wire an LED into the gap (its + toward R1). It lights only while the voltage is positive: half of every swing.',
        tray: ['led'],
        check: (c) => {
          const led = first(c, 'led');
          return !!led && touches(c, led, 0, 'resistor') && touches(c, led, 1, 'acsource') && blinking(c, led);
        },
      },
    ],
    experiment: [
      {
        id: 'square',
        text: 'Try the square wave: the LED snaps fully on and fully off. (The triangle wave ramps it up and down.)',
        check: (c) => ac(c)?.wave === 'square',
      },
      {
        id: 'hear',
        text: 'Add a speaker in series too, set the frequency to 440 Hz and switch sound on. That’s the note A, straight from the signal generator.',
        tray: ['speaker'],
        check: (c) => c.sound && (ac(c)?.freq ?? 0) >= 200 && sounding(c, 1e-3),
      },
    ],
    why: {
      acsource: 'A signal generator: it makes a voltage that swings both ways, at the frequency, peak and shape you set.',
      led: 'An LED is a diode: it only conducts one way, so with AC it lights on the positive half of each swing and stays dark on the negative half.',
    },
  },

  {
    id: 'rectifiers',
    track: 'timing',
    title: 'Rectifiers: AC to DC',
    summary: 'Chop, flip and smooth an AC wave into steady DC, watching each stage on the scope.',
    minutes: 8,
    concept: [
      'Most electronics need steady DC, but power arrives as AC. A rectifier turns it into one-way current, using diodes, which only conduct one way.',
      'One diode passes only the positive halves (half-wave). A bridge of four diodes steers both halves the same way (full-wave), so the bumps come twice as often. A big capacitor then fills in the dips between bumps: what’s left is a small wobble called ripple.',
      'Ripple ≈ load current ÷ (2 × frequency × C) for full-wave: a bigger capacitor, or a smaller current, gives smoother DC.',
    ],
    starter: starter(
      [
        { kind: 'acsource', x: -220, y: 40, rot: 90, value: 12, set: { freq: 50 } },
        { kind: 'diode', x: -60, y: -40 },
        { kind: 'resistor', x: 100, y: 40, rot: 90, value: 1000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'half',
        text: 'Open the scope, put CH1 on R1’s top pin (the diode’s − side) and press Auto. Only the top half of each wave gets through: half-wave rectified, bumps 50 times a second.',
        check: (c) => {
          const r = scopeRange(c, first(c, 'resistor'), 0);
          return !!r && r[0] > -0.5 && r[1] > 10 && between(scopeFreq(c, first(c, 'resistor'), 0) ?? 0, 45, 55);
        },
      },
      {
        id: 'bridge',
        text: 'Swap in a bridge rectifier. Delete the diode and the wire from R1 to the source. Wire the source to the bridge’s two ~ pins, its + to R1’s top and its − to R1’s bottom. Add a ground symbol on the − pin: the scope measures from there, like a real scope’s ground clip.',
        hint: 'Now both halves come out the same way up: the bumps come 100 times a second.',
        tray: ['bridge', 'ground'],
        check: (c) => {
          const br = first(c, 'bridge');
          const r = first(c, 'resistor');
          if (!br || !r || has(c, 'diode')) return false;
          const fed = touches(c, br, 0, 'acsource') && touches(c, br, 1, 'acsource');
          const out = c.t.joined({ part: br.id, pin: 2 }, { part: r.id, pin: 0 }) && c.t.joined({ part: br.id, pin: 3 }, { part: r.id, pin: 1 });
          const range = scopeRange(c, r, 0);
          return fed && out && touches(c, br, 3, 'ground') && !!range && range[0] > -0.5 && between(scopeFreq(c, r, 0) ?? 0, 90, 110);
        },
      },
      {
        id: 'smooth',
        text: 'Add a 100 µF capacitor across R1 (its + to the bridge’s +). The dips fill in: about 10 V with a ripple of about 1 V.',
        tray: ['capacitor'],
        check: (c) => {
          const cap = first(c, 'capacitor');
          const br = first(c, 'bridge');
          const r = scopeRange(c, first(c, 'resistor'), 0);
          return (
            !!cap &&
            !!br &&
            valueOf(cap) >= 47e-6 &&
            joinedTo(c, cap, 0, 'bridge', 2) &&
            joinedTo(c, cap, 1, 'bridge', 3) &&
            !!r &&
            r[1] > 9 &&
            r[1] - r[0] < 2.5
          );
        },
      },
    ],
    experiment: [
      {
        id: 'bigger',
        text: 'Change C1 to 1000 µF: ten times the capacitance, a tenth of the ripple (about 0.1 V). Turn the scope’s volts/division down to see it.',
        check: (c) => {
          const r = scopeRange(c, first(c, 'resistor'), 0);
          return valueOf(first(c, 'capacitor')) >= 470e-6 && !!r && r[1] > 9 && r[1] - r[0] < 0.4;
        },
      },
    ],
    why: {
      bridge: 'Four diodes in a diamond: whichever way the AC pushes, two of them conduct and send the current out of + and back in at −. You lose about 1.4 V (two diode drops).',
      capacitor: 'The smoothing capacitor: it charges up at each peak and supplies the load in between. Ripple ≈ I ÷ (2 × f × C).',
      diode: 'One diode only lets the positive halves through: half-wave rectification.',
    },
  },

  {
    id: 'power-supply',
    track: 'timing',
    title: 'Project: a DC power supply',
    summary: 'Transformer, bridge and capacitor: build the power supply inside every adapter.',
    minutes: 8,
    concept: [
      'A plug-in power adapter does three jobs: a transformer steps the AC voltage down, a bridge rectifier turns it into one-way bumps, and a smoothing capacitor fills them into steady DC.',
      'A transformer is two coils on one iron core. AC in the first (primary) makes a changing magnetic field, and that field makes AC in the second (secondary). The voltage changes by the turns ratio: half the turns, half the voltage. It only works with AC, and its two sides share no wire, which is what keeps a real adapter’s output safe to touch.',
      'Here a 24 V AC source stands in for the mains (never use real mains).',
    ],
    starter: starter(
      [
        { kind: 'acsource', x: -320, y: 40, rot: 90, value: 24, set: { freq: 50 } }, // 0
        { kind: 'transformer', x: -180, y: 40, value: 0.5 }, // 1
        { kind: 'bridge', x: -20, y: 40 }, // 2
        { kind: 'capacitor', x: 120, y: 60, rot: 90, value: 470e-6 }, // 3
        { kind: 'resistor', x: 220, y: 60, rot: 90, value: 2200 }, // 4 R1 (the load)
        { kind: 'ground', x: 120, y: 180 }, // 5
        { kind: 'resistor', x: 320, y: -20, rot: 90, value: 1000 }, // 6 R2
        { kind: 'led', x: 320, y: 100, rot: 90 }, // 7
      ],
      [
        [2, 2, 3, 0],
        [2, 2, 4, 0],
        [2, 3, 3, 1],
        [2, 3, 4, 1],
        [2, 3, 5, 0],
      ],
    ),
    build: [
      {
        id: 'primary',
        text: 'Wire the AC source to the transformer’s primary: its two left pins.',
        check: (c) => {
          const t = first(c, 'transformer');
          return !!t && touches(c, t, 0, 'acsource') && touches(c, t, 1, 'acsource') && !c.t.joined({ part: t.id, pin: 0 }, { part: t.id, pin: 1 });
        },
      },
      {
        id: 'secondary',
        text: 'Wire the secondary (the two right pins) to the bridge’s two ~ pins.',
        check: (c) => {
          const t = first(c, 'transformer');
          const br = first(c, 'bridge');
          return (
            !!t &&
            !!br &&
            [0, 1].some((i) => joinedTo(c, t, 2, 'bridge', i) && joinedTo(c, t, 3, 'bridge', 1 - i))
          );
        },
      },
      {
        id: 'dc',
        text: 'Measure across R1 with the meter (V): about 10 V DC. 24 V × 0.5 = 12 V peak from the secondary, less 1.4 V for the bridge’s two diodes.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'V'), 9, 11.5),
      },
      {
        id: 'led',
        text: 'Add a power light: wire R2 and the LED in series across the output (R2 to +, the LED’s − to ground). It lights.',
        check: (c) => ledLit(c),
      },
    ],
    experiment: [
      {
        id: 'ratio',
        text: 'Select the transformer and choose 0.25× down. The output drops to about 4.5 V: one transformer design, a different winding, a different voltage.',
        check: (c) => valueOf(first(c, 'transformer')) <= 0.3 && between(voltageAcross(c, byRef(c, 'R1')!), 3, 6),
      },
      {
        id: 'ripple',
        text: 'Probe the output with the scope and press Auto: almost flat. Now delete C1 and watch the 100 Hz bumps return. That is why every power supply has a big capacitor.',
        check: (c) => {
          const r = scopeRange(c, byRef(c, 'R1'), 0);
          return !has(c, 'capacitor') && !!r && r[1] - r[0] > 2;
        },
      },
    ],
    why: {
      transformer: 'It steps the 24 V down by its turns ratio, 0.5, to 12 V peak, and keeps the output side separate from the input side.',
      bridge: 'It turns the transformer’s AC into one-way bumps, losing about 1.4 V.',
      capacitor: 'It fills in between the bumps: with 470 µF and about 5 mA of load, the ripple is only about 0.1 V.',
    },
  },
];
