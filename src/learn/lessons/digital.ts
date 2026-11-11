/** Digital Logic & Arduino track: logic levels, gates, memory, counting, displays, then the Arduino. */
import type { Part } from '../../model/circuit';
import { BLINK_SKETCH } from '../../arduino/examples';
import { UNO, logicPins, type PartKind } from '../../model/parts';
import { between, blinking, currentOf, meterValue, parts, probesOn, scopeFreq, scopeRange, starter } from './checks';
import type { CheckCtx, Lesson } from './types';

/* ---------- Small questions for these lessons ---------- */

const first = (c: CheckCtx, kind: PartKind, n = 0) => parts(c, kind)[n] as Part | undefined;
/** An LED clearly lit, or clearly dark. */
const lit = (c: CheckCtx, led: Part | undefined) => !!led && currentOf(c, led) > 1e-3;
const dark = (c: CheckCtx, led: Part | undefined) => !!led && currentOf(c, led) < 1e-4;
/** Two pins wired together (through any number of wires). */
const joined = (c: CheckCtx, a: Part | undefined, pa: number, b: Part | undefined, pb: number) =>
  !!a && !!b && c.t.joined({ part: a.id, pin: pa }, { part: b.id, pin: pb });
/** A logic chip's pin is HIGH (above half its 5 V, measured from its own GND). */
function high(c: CheckCtx, chip: Part | undefined, pin: number): boolean {
  if (!chip || !c.sim.ok || c.sim.idle) return false;
  const r = c.sim.parts.get(chip.id);
  return !!r && r.v[pin] - r.v[logicPins(chip.kind).gnd] > 2.5;
}
const closed = (p: Part | undefined) => !!p?.on;
/** How many of these switches are closed. */
const closedCount = (c: CheckCtx, kind: 'switch' | 'pushbutton') => parts(c, kind).filter((p) => p.on).length;

/** The 7-segment display's lit segments, as letters in order (e.g. "bc" for a 1). */
function segments(c: CheckCtx): string {
  const d = first(c, 'sevenseg');
  if (!d || !c.sim.ok || c.sim.idle) return '';
  const r = c.sim.parts.get(d.id);
  return r ? 'abcdefg'.split('').filter((_, k) => r.i[k] > 1e-3).join('') : '';
}

const uno = (c: CheckCtx) => first(c, 'arduino');
const board = (c: CheckCtx) => {
  const u = uno(c);
  return u ? c.arduinos?.get(u.id) : undefined;
};
/** The board's current sketch compiled and is running. */
const running = (c: CheckCtx) => board(c)?.status === 'running' && board(c)!.running;
const code = (c: CheckCtx) => uno(c)?.sketch ?? '';
/** The number at the start of the last whole line printed over Serial (null if none yet). */
function lastReading(c: CheckCtx): number | null {
  const lines = (board(c)?.serial ?? '').split(/\r?\n/);
  lines.pop(); // the line still being printed
  for (let k = lines.length - 1; k >= 0; k--) {
    const m = /^\s*(-?\d+)/.exec(lines[k]);
    if (m) return Number(m[1]);
  }
  return null;
}
/** Every delay(…) in the sketch is at most this many milliseconds (and there is at least one). */
function delaysAtMost(c: CheckCtx, ms: number): boolean {
  const all = [...code(c).replace(/\/\/.*$/gm, '').matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  return all.length > 0 && all.every((d) => d <= ms);
}
/** The part wired between an Uno pin and an LED's + leg (the series resistor), if there is one. */
function ledOnPin(c: CheckCtx, pin: number): Part | undefined {
  const u = uno(c);
  return parts(c, 'resistor').find((r) => [0, 1].some((k) => joined(c, r, k, u, pin) && parts(c, 'led').some((l) => joined(c, r, 1 - k, l, 0))));
}

/* ---------- Starter circuits ---------- */

/**
 * Logic-chip inputs: a switch (or push button) from the chip's 5V pin to the input,
 * and a 10 kΩ pull-down from the input to GND, so an open switch reads LOW.
 */
const gateWithSwitches = (kind: 'and' | 'nand', extra: Parameters<typeof starter>[0] = [], extraWires: [number, number, number, number][] = []) =>
  starter(
    [
      { kind, x: 0, y: 0 }, // 0 U1
      { kind: 'switch', x: -200, y: -120 }, // 1 S1
      { kind: 'switch', x: -200, y: 120 }, // 2 S2
      { kind: 'resistor', x: -100, y: -60, rot: 90, value: 10_000 }, // 3 R1
      { kind: 'resistor', x: -100, y: 60, rot: 90, value: 10_000 }, // 4 R2
      { kind: 'resistor', x: 140, y: 0, value: 330 }, // 5 R3
      { kind: 'led', x: 240, y: 60, rot: 90 }, // 6 LED1
      ...extra,
    ],
    [
      [0, 3, 1, 0],
      [1, 1, 0, 0],
      [0, 3, 2, 0],
      [2, 1, 0, 1],
      [0, 0, 3, 1],
      [3, 0, 0, 4],
      [0, 1, 4, 0],
      [4, 1, 0, 4],
      [0, 2, 5, 0],
      [5, 1, 6, 0],
      [6, 1, 0, 4],
      ...extraWires,
    ],
  );

/** An Uno running `sketch`, plus other parts (indexes from 1). */
const unoWith = (sketch: string, extra: Parameters<typeof starter>[0], wires: [number, number, number, number][] = []) =>
  starter([{ kind: 'arduino', x: 0, y: 0, set: { sketch } }, ...extra], wires);

const DIMMER_SKETCH = `// Dimmer: the knob on A0 sets how bright the LED on pin 9 is.

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  int knob = analogRead(A0);   // 0 (0 V) to 1023 (5 V)
  // Your turn: analogWrite takes 0 to 255, so divide knob by 4
  // and write it to pin 9.

}
`;

const BUTTON_SKETCH = `// Button: light the LED on pin 13 while the button on pin 2 is pressed.

void setup() {
  pinMode(2, INPUT_PULLUP);   // pin 2 reads HIGH until the button pulls it to GND
  pinMode(13, OUTPUT);
}

void loop() {
  if (digitalRead(2) == LOW) {   // pressed
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
}
`;

const READ_SKETCH = `// Read a voltage: measure pin A0 ten times a second and print it.
// analogRead gives 0 for 0 V up to 1023 for 5 V.

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(A0);
  Serial.println(reading);
  delay(100);
}
`;

export const DIGITAL: Lesson[] = [
  {
    id: 'logic-levels',
    track: 'digital',
    title: 'HIGH and LOW',
    summary: 'Digital circuits deal in just two voltages. Meet a logic gate and the pull-down resistor.',
    minutes: 6,
    concept: [
      'Digital circuits don’t care about exact voltages, only about two ranges: near 5 V means HIGH (1, true, on), near 0 V means LOW (0, false, off). That is what makes them reliable: a signal that sags a little still means the same thing.',
      'A logic gate looks at its inputs and drives its output HIGH or LOW. The simplest, the NOT gate (an “inverter”), outputs the opposite of its input.',
      'An input must never be left to float. Here a switch connects the input to 5 V for HIGH, and a 10 kΩ “pull-down” resistor holds it at 0 V (LOW) whenever the switch is open. In this simulator each chip runs on its own hidden 5 V supply: you only wire its GND, and its 5V pin feeds switches like this one.',
    ],
    starter: starter(
      [
        { kind: 'not', x: 0, y: 0 }, // 0 U1
        { kind: 'switch', x: -200, y: -80 }, // 1 S1
        { kind: 'resistor', x: -100, y: 60, rot: 90, value: 10_000 }, // 2 R1
        { kind: 'resistor', x: 140, y: 0, value: 330 }, // 3 R2
        { kind: 'led', x: 240, y: 60, rot: 90 }, // 4 LED1
      ],
      [
        [0, 2, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 2, 0],
        [2, 1, 0, 3],
        [0, 1, 3, 0],
        [3, 1, 4, 0],
      ],
    ),
    build: [
      {
        id: 'gnd',
        text: 'LED1’s − leg isn’t connected. Wire it to the gate’s GND pin (the bottom one). The LED lights: S1 is open, so R1 holds the input LOW, and the NOT gate’s output is HIGH.',
        check: (c) => lit(c, first(c, 'led')),
      },
      {
        id: 'flip',
        text: 'Close S1 (click it). The input goes HIGH, the output goes LOW, and the LED goes out.',
        check: (c) => closed(first(c, 'switch')) && dark(c, first(c, 'led')),
      },
      {
        id: 'measure-high',
        text: 'Measure the input: open the multimeter on volts, red probe on the gate’s In pin, black on its GND. About 5 V: HIGH.',
        hint: 'The meter button is in the toolbar under the canvas.',
        check: (c) => probesOn(c, 'not', 0, 3) && (meterValue(c, 'V') ?? 0) > 4.5,
      },
      {
        id: 'measure-low',
        text: 'Open S1 again and watch the meter: 0 V, LOW, held there by the pull-down. The LED is back on.',
        check: (c) => probesOn(c, 'not', 0, 3) && !closed(first(c, 'switch')) && (meterValue(c, 'V') ?? 1) < 0.5,
      },
    ],
    experiment: [
      {
        id: 'pot-high',
        text: 'Where exactly does LOW become HIGH? Delete S1 and R1, and add a potentiometer: End A to the gate’s 5V pin, End B to GND, the wiper to In. Turn the knob toward End A until the LED goes out: the input is HIGH.',
        hint: 'Put the meter on the In pin to watch the voltage as you turn the knob.',
        check: (c) => joined(c, first(c, 'potentiometer'), 2, first(c, 'not'), 0) && dark(c, first(c, 'led')),
        tray: ['potentiometer'],
      },
      {
        id: 'pot-low',
        text: 'Now turn it slowly back. The LED stays out until the input falls below about 2.25 V, though it went out as the input rose past about 2.75 V. That gap stops a wobbly input from making the output chatter.',
        check: (c) => joined(c, first(c, 'potentiometer'), 2, first(c, 'not'), 0) && lit(c, first(c, 'led')),
      },
    ],
    why: {
      resistor: 'R1 is the pull-down: it holds the input at 0 V while the switch is open. 10 kΩ is weak enough that the closed switch easily wins (only 0.5 mA flows), strong enough to beat stray pickup. R2 limits the LED’s current.',
      not: 'A NOT gate outputs the opposite of its input: HIGH in, LOW out.',
    },
  },

  {
    id: 'gates',
    track: 'digital',
    title: 'AND, OR, NOT',
    summary: 'Gates make decisions: both, either, or the opposite.',
    minutes: 7,
    concept: [
      'An AND gate’s output is HIGH only when input A and input B are both HIGH. An OR gate’s output is HIGH when A or B (or both) is HIGH. A NOT gate flips its one input.',
      'These three are enough to describe any decision a circuit can make: “the alarm sounds if the door is open AND the system is armed”, “the light comes on if this switch OR that one is on”.',
      'Engineers list what a gate does in a truth table: every combination of inputs and the output each one gives. You’ll check a few rows of the AND and OR tables with two switches.',
    ],
    starter: gateWithSwitches('and', [{ kind: 'or', x: 0, y: 260 }]),
    build: [
      {
        id: 'and-both',
        text: 'Close both switches. The AND gate’s output goes HIGH and the LED lights: 1 AND 1 = 1.',
        check: (c) => closedCount(c, 'switch') === 2 && lit(c, first(c, 'led')),
      },
      {
        id: 'and-one',
        text: 'Open one of them. The LED goes out: 1 AND 0 = 0. AND needs both.',
        check: (c) => closedCount(c, 'switch') === 1 && dark(c, first(c, 'led')),
      },
      {
        id: 'or',
        text: 'Now use the OR gate (U2) instead: move each wire from U1’s pins to the same pins of U2 (In A, In B, Out, 5V and GND), or delete U1 and wire U2 the same way. With one switch closed, the LED lights: 1 OR 0 = 1.',
        hint: 'Every pin matters: U2 needs its 5V for the switches and its GND for the pull-downs and the LED.',
        check: (c) => {
          const or = first(c, 'or');
          const r3 = c.c.parts.find((p) => p.ref === 'R3');
          return (
            joined(c, or, 2, r3, 0) &&
            !parts(c, 'and').some((a) => joined(c, a, 2, r3, 0)) &&
            closedCount(c, 'switch') === 1 &&
            lit(c, first(c, 'led'))
          );
        },
        tray: ['or'],
      },
    ],
    experiment: [
      {
        id: 'or-none',
        text: 'Open both switches: 0 OR 0 = 0, the only row of OR’s table with a LOW output.',
        check: (c) => closedCount(c, 'switch') === 0 && dark(c, first(c, 'led')),
      },
      {
        id: 'nor',
        text: 'Add a NOT gate between the OR’s output and R3 (and wire its GND). Now the LED lights only when both switches are open: NOT OR, called NOR.',
        check: (c) => {
          const n = first(c, 'not');
          const r3 = c.c.parts.find((p) => p.ref === 'R3');
          return joined(c, n, 0, first(c, 'or'), 2) && joined(c, n, 1, r3, 0) && closedCount(c, 'switch') === 0 && lit(c, first(c, 'led'));
        },
        tray: ['not'],
      },
    ],
    why: {
      and: 'AND: the output is HIGH only when both inputs are HIGH.',
      or: 'OR: the output is HIGH when either input (or both) is HIGH.',
    },
  },

  {
    id: 'nand',
    track: 'digital',
    title: 'NAND builds everything',
    summary: 'One kind of gate is enough to make all the others.',
    minutes: 7,
    concept: [
      'A NAND gate is an AND followed by a NOT: its output is LOW only when both inputs are HIGH.',
      'NAND has a remarkable property: you can build every other gate, and so any digital circuit at all, out of NAND gates alone. Join a NAND’s two inputs and it becomes a NOT. Put that NOT after another NAND and the two NOTs cancel: you have AND.',
      'Chip factories love this: one simple, well-tested building block repeated millions of times. Early computers, like the one that guided Apollo to the Moon, were built almost entirely from NOR gates, which share the same property.',
    ],
    starter: gateWithSwitches('nand', [{ kind: 'nand', x: 240, y: 260 }]),
    build: [
      {
        id: 'nand-both',
        text: 'Close both switches: the LED goes out. NAND’s output is LOW only for 1 and 1.',
        check: (c) => closedCount(c, 'switch') === 2 && dark(c, first(c, 'led')),
      },
      {
        id: 'nand-one',
        text: 'Open one switch: the LED lights again.',
        check: (c) => closedCount(c, 'switch') === 1 && lit(c, first(c, 'led')),
      },
      {
        id: 'make-not',
        text: 'Turn U2 into a NOT gate: wire both of its inputs to U1’s Out, wire its GND to GND, and move R3’s left end from U1’s Out to U2’s Out.',
        hint: 'A NAND with both inputs joined: 1 NAND 1 = 0 and 0 NAND 0 = 1. That’s a NOT.',
        check: (c) => {
          const [u1, u2] = [first(c, 'nand'), first(c, 'nand', 1)];
          const r3 = c.c.parts.find((p) => p.ref === 'R3');
          return joined(c, u2, 0, u1, 2) && joined(c, u2, 1, u1, 2) && joined(c, u2, 2, r3, 0) && !joined(c, u1, 2, r3, 0);
        },
      },
      {
        id: 'and',
        text: 'Close both switches: the LED lights. NAND then NOT is AND, made from NAND gates only.',
        check: (c) => {
          const u2 = first(c, 'nand', 1);
          const r3 = c.c.parts.find((p) => p.ref === 'R3');
          return joined(c, u2, 2, r3, 0) && closedCount(c, 'switch') === 2 && lit(c, first(c, 'led'));
        },
      },
    ],
    experiment: [
      {
        id: 'and-one',
        text: 'Open one switch: the LED goes out, exactly like the AND gate in the last lesson.',
        check: (c) => {
          const u2 = first(c, 'nand', 1);
          const r3 = c.c.parts.find((p) => p.ref === 'R3');
          return joined(c, u2, 2, r3, 0) && closedCount(c, 'switch') === 1 && dark(c, first(c, 'led'));
        },
      },
    ],
    why: {
      nand: 'NAND: LOW only when both inputs are HIGH. With its inputs joined it’s a NOT, and from NOTs and NANDs you can build every other gate.',
    },
  },

  {
    id: 'latch',
    track: 'digital',
    title: 'A memory latch',
    summary: 'Two gates feeding each other remember which button you pressed last.',
    minutes: 8,
    concept: [
      'Every gate so far forgets: its output depends only on its inputs right now. To remember, feed outputs back into inputs.',
      'Two NAND gates, each one’s output wired to the other’s input, form a set–reset latch. Its Set and Reset inputs are “active LOW”: pull-up resistors hold them HIGH, and pressing a button pulls one LOW. Press Set and the output Q goes HIGH; let go and the loop holds it there. Press Reset and Q goes LOW, and stays LOW.',
      'That’s one bit of memory. A computer’s fastest memory (its registers and cache) is built from millions of loops like this.',
    ],
    starter: starter(
      [
        { kind: 'nand', x: 0, y: -120 }, // 0 U1
        { kind: 'nand', x: 0, y: 140 }, // 1 U2
        { kind: 'pushbutton', x: -220, y: -60 }, // 2 Set
        { kind: 'resistor', x: -120, y: -180, rot: 90, value: 10_000 }, // 3 R1
        { kind: 'pushbutton', x: -220, y: 220 }, // 4 Reset
        { kind: 'resistor', x: -120, y: 80, rot: 90, value: 10_000 }, // 5 R2
        { kind: 'resistor', x: 160, y: -120, value: 330 }, // 6 R3
        { kind: 'led', x: 260, y: -60, rot: 90 }, // 7 LED1
      ],
      [
        [0, 3, 3, 0],
        [3, 1, 0, 0],
        [0, 0, 2, 0],
        [2, 1, 0, 4],
        [1, 3, 5, 0],
        [5, 1, 1, 1],
        [1, 1, 4, 0],
        [4, 1, 1, 4],
        [0, 4, 1, 4],
        [0, 2, 1, 0],
        [0, 2, 6, 0],
        [6, 1, 7, 0],
        [7, 1, 0, 4],
      ],
    ),
    build: [
      {
        id: 'feedback',
        text: 'One wire is missing: the feedback. Wire U2’s Out to U1’s In B.',
        check: (c) => joined(c, first(c, 'nand', 1), 2, first(c, 'nand'), 1),
      },
      {
        id: 'reset',
        text: 'Press and hold Reset (the button on U2’s In B). The LED goes out: Q is LOW.',
        check: (c) => {
          const reset = parts(c, 'pushbutton').find((b) => joined(c, b, 0, first(c, 'nand', 1), 1));
          return closed(reset) && joined(c, first(c, 'nand', 1), 2, first(c, 'nand'), 1) && dark(c, first(c, 'led'));
        },
      },
      {
        id: 'hold-0',
        text: 'Let go. The LED stays off: the two gates hold each other where they are.',
        check: (c) => closedCount(c, 'pushbutton') === 0 && dark(c, first(c, 'led')),
      },
      {
        id: 'set',
        text: 'Press Set (the button on U1’s In A). The LED lights: Q is HIGH.',
        check: (c) => {
          const set = parts(c, 'pushbutton').find((b) => joined(c, b, 0, first(c, 'nand'), 0));
          return closed(set) && lit(c, first(c, 'led'));
        },
      },
      {
        id: 'hold-1',
        text: 'Let go. It stays lit. Nothing is pressed, yet the circuit knows which button you pressed last: one bit of memory.',
        check: (c) => closedCount(c, 'pushbutton') === 0 && lit(c, first(c, 'led')),
      },
    ],
    experiment: [
      {
        id: 'both',
        text: 'Hold both buttons at once. Both gates’ outputs go HIGH, which breaks the rule that Q̄ is the opposite of Q. That’s why this combination is called “forbidden”: let go of both together and a real latch could end up either way.',
        check: (c) => closedCount(c, 'pushbutton') === 2 && high(c, first(c, 'nand'), 2) && high(c, first(c, 'nand', 1), 2),
      },
    ],
    why: {
      nand: 'Each gate’s output feeds the other’s input: that loop is what remembers.',
      resistor: 'R1 and R2 are pull-ups: they hold Set and Reset HIGH (inactive) until a button pulls one to GND. R3 limits the LED’s current.',
    },
  },

  {
    id: 'counter',
    track: 'digital',
    title: 'Flip-flops and counting',
    summary: 'Clocked memory, and a two-bit binary counter.',
    minutes: 8,
    concept: [
      'A D flip-flop is memory that changes only at one moment: when its Clock input goes from LOW to HIGH (a “rising edge”), it copies D to Q. The rest of the time it ignores D completely.',
      'Wire Q̄ (the opposite of Q) back to D, and every clock edge flips Q: 0, 1, 0, 1. Q changes half as often as the clock, so it divides the frequency by two.',
      'Chain two: the second flip-flop’s clock comes from the first one’s Q̄, so it flips every time the first one goes from 1 back to 0. Read the two Qs as a binary number and they count 0, 1, 2, 3, then wrap back to 0.',
    ],
    starter: starter(
      [
        { kind: 'dff', x: 0, y: 0 }, // 0 U1
        { kind: 'dff', x: 280, y: 0 }, // 1 U2
        { kind: 'pushbutton', x: -200, y: 80 }, // 2 clock button
        { kind: 'resistor', x: -100, y: 140, rot: 90, value: 10_000 }, // 3 R1
        { kind: 'resistor', x: 120, y: -140, rot: 90, value: 330 }, // 4 R2
        { kind: 'led', x: 120, y: -240, rot: 270 }, // 5 LED1
        { kind: 'resistor', x: 400, y: -140, rot: 90, value: 330 }, // 6 R3
        { kind: 'led', x: 400, y: -240, rot: 270 }, // 7 LED2
      ],
      [
        [0, 3, 0, 0],
        [0, 4, 2, 0],
        [2, 1, 0, 1],
        [0, 1, 3, 0],
        [3, 1, 0, 5],
        [0, 5, 1, 5],
        [0, 3, 1, 1],
        [0, 2, 4, 0],
        [4, 1, 5, 0],
        [5, 1, 0, 5],
        [1, 2, 6, 0],
        [6, 1, 7, 0],
        [7, 1, 1, 5],
      ],
    ),
    build: [
      {
        id: 'feedback',
        text: 'U1’s Q̄ is wired back to its D, so it flips on every clock. U2’s isn’t yet: wire U2’s Q̄ to U2’s D.',
        check: (c) => joined(c, first(c, 'dff', 1), 3, first(c, 'dff', 1), 0),
      },
      {
        id: 'one',
        text: 'Press the button once (press and let go). LED1 lights: the count is 1. LED1 is the 1s, LED2 the 2s.',
        hint: 'The button is the clock: pressing it makes a rising edge on U1’s Clock.',
        check: (c) => lit(c, first(c, 'led')) && dark(c, first(c, 'led', 1)),
      },
      {
        id: 'two',
        text: 'Press again: LED1 goes out, and as U1 goes from 1 to 0 its Q̄ rises and clocks U2. LED2 lights: 2.',
        check: (c) => dark(c, first(c, 'led')) && lit(c, first(c, 'led', 1)),
      },
      {
        id: 'three',
        text: 'Press again: both lit. 1 + 2 = 3.',
        check: (c) => lit(c, first(c, 'led')) && lit(c, first(c, 'led', 1)),
      },
    ],
    experiment: [
      {
        id: 'wrap',
        text: 'Press once more: 3 + 1 wraps round to 0, like a car’s odometer. Two flip-flops count to 3; eight would count to 255.',
        check: (c) => dark(c, first(c, 'led')) && dark(c, first(c, 'led', 1)),
      },
    ],
    why: {
      dff: 'On each rising edge of Clock, Q takes the value of D. With Q̄ fed back to D, that means Q flips every clock.',
      pushbutton: 'The clock. A real push button “bounces”, making several edges per press, so a real counter would need a debounce circuit; this one is clean.',
    },
  },

  {
    id: 'seven-seg',
    track: 'digital',
    title: 'The 7-segment display',
    summary: 'Seven LEDs in a figure 8 can show any digit.',
    minutes: 6,
    concept: [
      'A 7-segment display is eight LEDs in one package: seven bars, named a to g, arranged as a figure 8, plus a decimal point. Light the right bars and you get any digit from 0 to 9.',
      'The bars go clockwise from the top: a (top), b (top right), c (bottom right), d (bottom), e (bottom left), f (top left), and g across the middle. In this “common cathode” display all the LEDs’ − legs are joined to the common pins, which go to GND; each segment lights when its own pin is driven positive.',
      'Every segment needs its own resistor. With one shared resistor, the digit would get dimmer the more segments were lit.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: -300, y: 40, rot: 90, value: 5 }, // 0 B1
        { kind: 'sevenseg', x: 180, y: 40 }, // 1 DS1
        ...[0, 1, 2, 3, 4, 5, 6].map((k) => ({ kind: 'resistor' as const, x: -120, y: -200 + 60 * k, value: 330 })), // 2–8 R1–R7
      ],
      [[1, 9, 0, 1], ...[0, 1, 2, 3, 4, 5, 6].map((k): [number, number, number, number] => [0, 0, 2 + k, 0])],
    ),
    build: [
      {
        id: 'one',
        text: 'Each resistor’s left end is on the battery’s +. Show a 1: wire one resistor’s free end to segment b and another to segment c.',
        hint: 'The pin letters are printed on the display. b and c are the two bars on the right.',
        check: (c) => segments(c) === 'bc',
      },
      {
        id: 'seven',
        text: 'Make it a 7: add segment a, the top bar.',
        check: (c) => segments(c) === 'abc',
      },
      {
        id: 'three',
        text: 'Now a 3: add d (the bottom) and g (the middle).',
        check: (c) => segments(c) === 'abcdg',
      },
    ],
    experiment: [
      {
        id: 'eight',
        text: 'Light every segment for an 8, the digit that uses them all.',
        check: (c) => segments(c) === 'abcdefg',
      },
    ],
    why: {
      sevenseg: 'Eight LEDs sharing one cathode. Each segment pin lights its own bar.',
      resistor: 'Each segment has its own resistor: (5 V − 1.9 V) ÷ 330 Ω ≈ 9 mA, bright enough and well inside its 20 mA rating.',
    },
  },

  {
    id: 'arduino-blink',
    track: 'digital',
    title: 'Meet the Arduino: Blink',
    summary: 'A microcontroller runs a program you write. Make it blink an LED, then change the code.',
    minutes: 8,
    concept: [
      'An Arduino Uno is a small computer on a board: its chip, an ATmega328P, runs your program (a “sketch”) 16 million steps a second. Its pins are like the logic outputs you’ve used, but your code decides when each one is HIGH or LOW.',
      'A sketch has two parts. setup() runs once at the start: here it makes pin 13 an output. loop() then runs over and over forever: pin 13 HIGH, wait 1000 milliseconds, LOW, wait again.',
      'Your code is compiled (translated into the chip’s own instructions) right here in the browser, then runs on a simulated chip exactly as it would on a real Uno.',
    ],
    starter: unoWith(
      BLINK_SKETCH,
      [
        { kind: 'resistor', x: -140, y: -200, rot: 90, value: 220 },
        { kind: 'led', x: -60, y: -260, rot: 90 },
      ],
    ),
    build: [
      {
        id: 'wire',
        text: 'Wire an LED to pin 13: pin 13 → R1 → LED1’s + leg (the top one), and LED1’s − leg to the GND pin beside pin 13. Your LED blinks with the board’s own L light: one second on, one second off.',
        hint: 'The first time, the Arduino compiler downloads (6.6 MB, once only), so give it a moment.',
        check: (c) => !!ledOnPin(c, 13) && blinking(c, first(c, 'led')),
      },
      {
        id: 'faster',
        text: 'Select the Uno and click Edit code. Change both delay(1000) to delay(200) and click Upload. It blinks five times as fast.',
        check: (c) => running(c) && delaysAtMost(c, 300) && blinking(c, first(c, 'led')),
      },
    ],
    experiment: [
      {
        id: 'pin-8',
        text: 'Use pin 8 instead: change 13 to 8 in the code (pinMode and both digitalWrite lines), upload, and move the wire from pin 13 to pin 8.',
        check: (c) => running(c) && /digitalWrite\s*\(\s*8\s*,/.test(code(c)) && !!ledOnPin(c, 8) && !ledOnPin(c, 13) && blinking(c, first(c, 'led')),
      },
    ],
    why: {
      resistor: 'An Uno pin gives 5 V through about 25 Ω inside the chip. 220 Ω keeps the LED at about 12 mA: bright, and well inside the pin’s 20 mA.',
      arduino: 'It runs your sketch: setup() once, then loop() forever.',
    },
  },

  {
    id: 'arduino-button',
    track: 'digital',
    title: 'Reading a button',
    summary: 'Inputs: the program reads a push button and decides what to do.',
    minutes: 7,
    concept: [
      'Pins can be inputs as well as outputs. digitalRead(2) gives HIGH or LOW depending on the voltage on pin 2, using the same thresholds as the logic gates.',
      'INPUT_PULLUP switches on a resistor inside the chip (about 35 kΩ) from the pin to 5 V. The pin reads HIGH until a button connects it to GND, and then reads LOW. No extra resistor needed, which is why buttons on an Arduino are usually wired from the pin to GND.',
      'Notice the logic is upside down: pressed is LOW. The sketch says “if pin 2 is LOW, light the LED”.',
    ],
    starter: unoWith(
      BUTTON_SKETCH,
      [
        { kind: 'resistor', x: -140, y: -200, rot: 90, value: 220 }, // 1
        { kind: 'led', x: -60, y: -260, rot: 90 }, // 2
        { kind: 'pushbutton', x: 140, y: -200 }, // 3
      ],
      [
        [0, 13, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 0, UNO.gnd2],
      ],
    ),
    build: [
      {
        id: 'wire',
        text: 'Wire the push button from pin 2 to GND (either GND pin).',
        check: (c) => {
          const b = first(c, 'pushbutton');
          const u = uno(c);
          return [0, 1].some((k) => joined(c, b, k, u, 2) && (joined(c, b, 1 - k, u, UNO.gnd) || joined(c, b, 1 - k, u, UNO.gnd2)));
        },
      },
      {
        id: 'press',
        text: 'Press and hold the button: the LED lights. Pin 2 is pulled to 0 V, digitalRead says LOW, and the sketch turns pin 13 on.',
        check: (c) => running(c) && closed(first(c, 'pushbutton')) && lit(c, first(c, 'led')),
      },
      {
        id: 'release',
        text: 'Let go: the pull-up takes pin 2 back to HIGH and the LED goes out.',
        check: (c) => !closed(first(c, 'pushbutton')) && dark(c, first(c, 'led')),
      },
    ],
    experiment: [
      {
        id: 'invert',
        text: 'Turn it round: edit the code so the LED is on until you press the button (swap HIGH and LOW in the two digitalWrite lines), then Upload.',
        check: (c) => running(c) && !closed(first(c, 'pushbutton')) && lit(c, first(c, 'led')),
      },
    ],
    why: {
      pushbutton: 'From pin 2 to GND: pressing it pulls the pin LOW against the chip’s internal pull-up.',
    },
  },

  {
    id: 'arduino-serial',
    track: 'digital',
    title: 'The serial monitor and analogRead',
    summary: 'Measure a voltage with the Arduino and watch the numbers it prints.',
    minutes: 7,
    concept: [
      'Pins A0 to A5 can measure a voltage, not just HIGH or LOW. analogRead(A0) turns 0 V to 5 V into a number from 0 to 1023: 1024 steps of about 4.9 mV each.',
      'The board can also talk back. Serial.begin(9600) opens its serial port (the USB connection to a computer), and Serial.println(…) sends a line of text. The serial monitor, under the code editor, shows what it sends. It’s the simplest way to see what a program is doing.',
      'Here a potentiometer makes any voltage from 0 V to 5 V, and the sketch prints what A0 reads ten times a second.',
    ],
    starter: unoWith(READ_SKETCH, [{ kind: 'potentiometer', x: 60, y: 220, value: 10_000 }]),
    build: [
      {
        id: 'wire',
        text: 'Wire the potentiometer: one end to the 5V pin, the other end to GND, and the middle pin (the wiper) to A0.',
        check: (c) => {
          const p = first(c, 'potentiometer');
          const u = uno(c);
          const gnd = (k: number) => joined(c, p, k, u, UNO.gnd) || joined(c, p, k, u, UNO.gnd2);
          return joined(c, p, 2, u, 14) && [0, 1].some((k) => joined(c, p, k, u, UNO.v5) && gnd(1 - k));
        },
      },
      {
        id: 'monitor',
        text: 'Select the Uno and click Edit code: the serial monitor at the bottom shows a number ten times a second, about 511 with the knob in the middle (2.5 V is half of 5 V).',
        check: (c) => between(lastReading(c) ?? -1, 400, 620),
      },
      {
        id: 'top',
        text: 'Turn the knob all the way one way: the number climbs to 1023 (5 V).',
        check: (c) => (lastReading(c) ?? 0) >= 1000,
      },
      {
        id: 'bottom',
        text: 'And all the way the other way: 0 (0 V).',
        check: (c) => (lastReading(c) ?? 999) <= 20,
      },
    ],
    experiment: [
      {
        id: 'quarter',
        text: 'Set the knob so the reading is about 256: a quarter of 1023, so a quarter of 5 V, 1.25 V. Check it with the multimeter on A0 if you like.',
        check: (c) => between(lastReading(c) ?? -1, 230, 280),
      },
    ],
    why: {
      potentiometer: 'A voltage divider you can adjust: the wiper sits anywhere from 0 V to 5 V.',
    },
  },

  {
    id: 'arduino-dimmer',
    track: 'digital',
    title: 'Project: a dimmer',
    summary: 'Read a knob, set an LED’s brightness with PWM, and see the pulses on the scope.',
    minutes: 10,
    concept: [
      'A digital pin can only be HIGH or LOW, so how does analogWrite make an LED half as bright? It switches the pin on and off 490 times a second, too fast to see. The share of each cycle it spends HIGH (the “duty cycle”) sets the average power, so the brightness. This is PWM, pulse-width modulation.',
      'analogWrite(9, 0) is always off, 255 is always on, and 127 is on half the time. Only the pins marked ~ on the board can do it.',
      'Your project: read a knob with analogRead (0 to 1023) and write it to the LED with analogWrite (0 to 255). Since 1023 ÷ 4 ≈ 255, dividing by 4 does it.',
    ],
    starter: unoWith(DIMMER_SKETCH, [
      { kind: 'potentiometer', x: 60, y: 220, value: 10_000 },
      { kind: 'resistor', x: -60, y: -200, rot: 90, value: 220 },
      { kind: 'led', x: 20, y: -260, rot: 90 },
    ]),
    build: [
      {
        id: 'wire',
        text: 'Wire it up: the potentiometer’s ends to 5V and GND and its wiper to A0, then pin 9 → R1 → LED1 → GND.',
        check: (c) => !!ledOnPin(c, 9) && joined(c, first(c, 'potentiometer'), 2, uno(c), 14),
      },
      {
        id: 'code',
        text: 'Select the Uno, click Edit code, and finish the sketch: add analogWrite(9, knob / 4); at the end of loop(), then Upload. The LED glows at half brightness.',
        hint: 'Upload checks your code first: any mistake shows up under the editor with a hint.',
        check: (c) => running(c) && /analogWrite\s*\(\s*9\s*,/.test(code(c)),
      },
      {
        id: 'scope',
        text: 'Open the scope, put CH1 on pin 9 and press Auto: a square wave at about 490 Hz, HIGH about half the time.',
        check: (c) => between(scopeFreq(c, uno(c), 9) ?? 0, 450, 530),
      },
      {
        id: 'off',
        text: 'Turn the knob to one end: the LED goes out, and after a few seconds the scope’s trace is flat at 0 V (its readings cover the last 4 seconds).',
        check: (c) => running(c) && (scopeRange(c, uno(c), 9)?.[1] ?? 5) < 0.5 && dark(c, first(c, 'led')),
      },
      {
        id: 'full',
        text: 'And to the other end: full brightness, and soon the trace is flat at 5 V. In between, the pulses get wider and narrower as you turn.',
        check: (c) => (scopeRange(c, uno(c), 9)?.[0] ?? 0) > 4 && lit(c, first(c, 'led')),
      },
    ],
    experiment: [],
    why: {
      arduino: 'analogRead on A0 measures the knob; analogWrite on pin 9 (a ~ pin) makes PWM pulses for the LED.',
      potentiometer: 'The knob: a voltage from 0 V to 5 V on A0.',
    },
  },
];
