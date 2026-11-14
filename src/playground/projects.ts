/**
 * The Playground: finished circuits that go beyond the lessons, to open,
 * poke at and break. Each comes with a short guide: what it does, how it
 * works, things to try, and a safe way to wreck it.
 */
import type { Circuit } from '../model/circuit';
import { P555 } from '../model/parts';
import { starter, type Placed } from '../learn/lessons/checks';

export type ProjectKind = 'Analog' | 'Digital' | 'Arduino';

export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  /** One line for the gallery. */
  blurb: string;
  /** How it works, a few short sentences. */
  how: string[];
  /** Things to try. */
  tryThis: string[];
  /** Safe ways to break it, and what that teaches. */
  breakIt: string[];
  /** The circuit, built fresh each time. */
  build: () => Circuit;
}

type W = [number, number, number, number];
const { gnd: GND, trig: TRIG, out: OUT, reset: RESET, ctrl: CTRL, thr: THR, dis: DIS, vcc: VCC } = P555;

/**
 * A 555 astable's timing parts placed beside a chip at (x, y), indexes from `at`:
 * R1 (+ to Discharge), R2 (Discharge to Threshold), C1 (Threshold to ground).
 * `plus` is the index and pin of the supply's +, `ground` a ground symbol's index.
 */
function timing555(at: number, chip: number, x: number, y: number, r1: number, r2: number, cap: number) {
  const parts: Placed[] = [
    { kind: 'resistor', x: x - 140, y: y - 60, rot: 90, value: r1 },
    { kind: 'resistor', x: x - 220, y, rot: 90, value: r2 },
    { kind: 'capacitor', x: x - 140, y: y + 80, rot: 90, value: cap },
  ];
  const wires = (plus: [number, number], ground: number): W[] => [
    [plus[0], plus[1], at, 0],
    [at, 1, chip, DIS],
    [chip, DIS, at + 1, 0],
    [at + 1, 1, chip, THR],
    [chip, THR, chip, TRIG],
    [chip, THR, at + 2, 0],
    [at + 2, 1, ground, 0],
  ];
  return { parts, wires };
}

/* ---------- 1. Fade-out lamp ---------- */

const fadeLamp = starter(
  [
    { kind: 'battery', x: -320, y: 40, rot: 90 }, // 0 B1
    { kind: 'pushbutton', x: -180, y: -100 }, // 1 PB1
    { kind: 'resistor', x: -60, y: -100, value: 1000 }, // 2 R1 charging resistor
    { kind: 'capacitor', x: 20, y: 20, rot: 90, value: 220e-6 }, // 3 C1
    { kind: 'resistor', x: 120, y: 120, value: 47_000 }, // 4 R2 base resistor
    { kind: 'npn', x: 240, y: 120 }, // 5 Q1
    { kind: 'led', x: 260, y: 0, rot: 90 }, // 6 LED1
    { kind: 'resistor', x: 260, y: -120, rot: 90, value: 470 }, // 7 R3
    { kind: 'ground', x: 20, y: 140 }, // 8
    { kind: 'ground', x: 260, y: 240 }, // 9
    { kind: 'ground', x: -320, y: 140 }, // 10
  ],
  [
    [0, 0, 1, 0],
    [1, 1, 2, 0],
    [2, 1, 3, 0],
    [3, 1, 8, 0],
    [3, 0, 4, 0],
    [4, 1, 5, 0],
    [5, 2, 9, 0],
    [0, 0, 7, 0],
    [7, 1, 6, 0],
    [6, 1, 5, 1],
    [0, 1, 10, 0],
  ],
);

/* ---------- 2. Two-tone siren ---------- */

function siren(): Circuit {
  // U1 (slow, about 1.4 Hz) switches U2's Control pin between two levels, so U2's pitch jumps between two notes.
  const slow = timing555(9, 1, -100, 0, 10_000, 47_000, 10e-6);
  const tone = timing555(12, 2, 480, 0, 1000, 47_000, 22e-9);
  return starter(
    [
      { kind: 'battery', x: -560, y: 40, rot: 90 }, // 0 B1
      { kind: 'timer555', x: -100, y: 0 }, // 1 U1 the slow one
      { kind: 'timer555', x: 480, y: 0 }, // 2 U2 the tone
      { kind: 'ground', x: -560, y: 160 }, // 3
      { kind: 'ground', x: -100, y: 180 }, // 4
      { kind: 'ground', x: 480, y: 180 }, // 5
      { kind: 'resistor', x: 220, y: 260, value: 10_000 }, // 6 R1 U1 → U2 Control
      { kind: 'resistor', x: 640, y: 0, value: 330 }, // 7 R2
      { kind: 'speaker', x: 720, y: 60, rot: 90 }, // 8 SPK1
      ...slow.parts, // 9–11 R3, R4, C1
      ...tone.parts, // 12–14 R5, R6, C2
      { kind: 'ground', x: 720, y: 180 }, // 15
      { kind: 'resistor', x: 40, y: 60, rot: 90, value: 1000 }, // 16 R7 for the beat light
      { kind: 'led', x: 40, y: 160, rot: 90 }, // 17 LED1 shows the slow beat
      { kind: 'ground', x: 40, y: 260 }, // 18
    ],
    [
      [0, 1, 3, 0],
      ...[1, 2].flatMap((u): W[] => [
        [0, 0, u, VCC],
        [u, VCC, u, RESET],
        [u, GND, u === 1 ? 4 : 5, 0],
      ]),
      ...slow.wires([0, 0], 4),
      ...tone.wires([0, 0], 5),
      [1, OUT, 6, 0],
      [6, 1, 2, CTRL],
      [2, OUT, 7, 0],
      [7, 1, 8, 0],
      [8, 1, 15, 0],
      [1, OUT, 16, 0],
      [16, 1, 17, 0],
      [17, 1, 18, 0],
    ],
  )();
}

/* ---------- 3. Light-beam alarm ---------- */

function beamAlarm(): Circuit {
  // A 555 tone generator whose Reset pin is held LOW (silent) while light falls on the sensor.
  const tone = timing555(7, 1, 100, 0, 1000, 33_000, 22e-9);
  return starter(
    [
      { kind: 'battery', x: -360, y: 40, rot: 90 }, // 0 B1
      { kind: 'timer555', x: 100, y: 0 }, // 1 U1
      { kind: 'ground', x: 100, y: 180 }, // 2
      { kind: 'resistor', x: 260, y: 0, value: 330 }, // 3 R1
      { kind: 'speaker', x: 340, y: 60, rot: 90 }, // 4 SPK1
      { kind: 'potentiometer', x: 120, y: -200, rot: 180, value: 47_000, set: { pos: 0.5 } }, // 5 VR1 sensitivity
      { kind: 'ldr', x: 260, y: -140, rot: 90, set: { light: 0.9 } }, // 6 LDR1 the beam
      ...tone.parts, // 7–9 R2, R3, C1
      { kind: 'ground', x: 340, y: 180 }, // 10
      { kind: 'ground', x: 260, y: -40 }, // 11
      { kind: 'ground', x: -360, y: 160 }, // 12
    ],
    [
      [0, 1, 12, 0],
      [0, 0, 1, VCC],
      [1, GND, 2, 0],
      ...tone.wires([0, 0], 2),
      [1, OUT, 3, 0],
      [3, 1, 4, 0],
      [4, 1, 10, 0],
      // The sensor and the knob make a voltage divider on Reset.
      [0, 0, 5, 0],
      [5, 2, 1, RESET],
      [1, RESET, 6, 0],
      [6, 1, 11, 0],
    ],
  )();
}

/* ---------- 4. Four-bit binary counter ---------- */

function counter(): Circuit {
  // A 555 clock (run from U1's 5 V pin) drives a chain of four flip-flops; each one's Q̄ clocks the next.
  const X = [0, 280, 560, 840];
  const clock = timing555(17, 0, -320, 0, 10_000, 33_000, 10e-6);
  const placed: Placed[] = [
    { kind: 'timer555', x: -320, y: 0 }, // 0 the clock
    ...X.map((x): Placed => ({ kind: 'dff', x, y: 0 })), // 1–4 U2–U5
    ...X.map((x): Placed => ({ kind: 'resistor', x: x + 120, y: -140, rot: 90, value: 330 })), // 5–8
    ...X.map((x): Placed => ({ kind: 'led', x: x + 120, y: -240, rot: 270 })), // 9–12
    ...X.map((x): Placed => ({ kind: 'ground', x, y: 140 })), // 13–16
    ...clock.parts, // 17–19 R1, R2, C1
    { kind: 'ground', x: -320, y: 180 }, // 20
  ];
  const wires: W[] = [
    // The 555 runs from U2's 5 V supply.
    [1, 4, 0, VCC],
    [0, VCC, 0, RESET],
    [0, GND, 20, 0],
    ...clock.wires([1, 4], 20),
    [0, OUT, 1, 1],
    ...[0, 1, 2, 3].flatMap((k): W[] => [
      [1 + k, 3, 1 + k, 0], // Q̄ back to D: flips on every clock
      [1 + k, 5, 13 + k, 0],
      [1 + k, 2, 5 + k, 0],
      [5 + k, 1, 9 + k, 0],
      [9 + k, 1, 1 + k, 5],
      ...(k < 3 ? ([[1 + k, 3, 2 + k, 1]] as W[]) : []), // Q̄ clocks the next one
    ]),
  ];
  return starter(placed, wires)();
}

/* ---------- 5. Full adder ---------- */

const fullAdder = starter(
  [
    { kind: 'battery', x: -620, y: 0, rot: 90, value: 5 }, // 0 B1
    { kind: 'switch', x: -460, y: -220 }, // 1 S1 A
    { kind: 'switch', x: -460, y: -60 }, // 2 S2 B
    { kind: 'switch', x: -460, y: 160 }, // 3 S3 carry in
    { kind: 'resistor', x: -340, y: -160, rot: 90, value: 10_000 }, // 4 pull-downs
    { kind: 'resistor', x: -280, y: 0, rot: 90, value: 10_000 }, // 5
    { kind: 'resistor', x: -340, y: 220, rot: 90, value: 10_000 }, // 6
    { kind: 'xor', x: -120, y: -160 }, // 7 U1 A XOR B
    { kind: 'and', x: -120, y: 120 }, // 8 U2 A AND B
    { kind: 'xor', x: 180, y: -120 }, // 9 U3 sum
    { kind: 'and', x: 180, y: 140 }, // 10 U4
    { kind: 'or', x: 440, y: 180 }, // 11 U5 carry out
    { kind: 'resistor', x: 340, y: -120, value: 330 }, // 12 R4
    { kind: 'led', x: 420, y: -60, rot: 90 }, // 13 LED1 sum
    { kind: 'resistor', x: 600, y: 180, value: 330 }, // 14 R5
    { kind: 'led', x: 680, y: 240, rot: 90 }, // 15 LED2 carry
    ...[-620, -340, -280, -340, -120, -120, 180, 180, 440, 420, 680].map((x, k): Placed => ({
      kind: 'ground',
      x,
      y: [120, -60, 100, 320, -40, 240, 0, 260, 300, 40, 340][k],
    })), // 16–26
  ],
  [
    [0, 1, 16, 0],
    // Switches from + to each input; a pull-down holds the input LOW while the switch is open.
    [0, 0, 1, 0],
    [0, 0, 2, 0],
    [0, 0, 3, 0],
    [1, 1, 4, 0],
    [4, 1, 17, 0],
    [2, 1, 5, 0],
    [5, 1, 18, 0],
    [3, 1, 6, 0],
    [6, 1, 19, 0],
    // A and B into U1 (XOR) and U2 (AND).
    [1, 1, 7, 0],
    [2, 1, 7, 1],
    [1, 1, 8, 0],
    [2, 1, 8, 1],
    // A XOR B, with carry in, into U3 (XOR) and U4 (AND).
    [7, 2, 9, 0],
    [3, 1, 9, 1],
    [7, 2, 10, 0],
    [3, 1, 10, 1],
    // Carry out = (A AND B) OR ((A XOR B) AND carry in).
    [8, 2, 11, 0],
    [10, 2, 11, 1],
    // Outputs to the LEDs.
    [9, 2, 12, 0],
    [12, 1, 13, 0],
    [13, 1, 25, 0],
    [11, 2, 14, 0],
    [14, 1, 15, 0],
    [15, 1, 26, 0],
    // Each chip's GND.
    [7, 4, 20, 0],
    [8, 4, 21, 0],
    [9, 4, 22, 0],
    [10, 4, 23, 0],
    [11, 4, 24, 0],
  ],
);

/* ---------- 6. Arduino dice ---------- */

export const DICE_SKETCH = `// Electronic dice: hold the button on pin 2 to roll, let go to stop.
// The display's segments a to g are on pins 3 to 9.

const byte SEGMENTS[7] = {3, 4, 5, 6, 7, 8, 9};   // a b c d e f g

// The segments each face lights, one bit per segment (bit 0 = a ... bit 6 = g).
const byte FACES[7] = {
  0b0000000,   // (unused)
  0b0000110,   // 1: b c
  0b1011011,   // 2: a b d e g
  0b1001111,   // 3: a b c d g
  0b1100110,   // 4: b c f g
  0b1101101,   // 5: a c d f g
  0b1111101,   // 6: a c d e f g
};

void show(byte face) {
  for (byte s = 0; s < 7; s++) {
    digitalWrite(SEGMENTS[s], bitRead(FACES[face], s));
  }
}

void setup() {
  for (byte s = 0; s < 7; s++) pinMode(SEGMENTS[s], OUTPUT);
  pinMode(2, INPUT_PULLUP);   // reads LOW while the button is pressed
  show(1);
}

void loop() {
  if (digitalRead(2) == LOW) {
    randomSeed(micros());        // how long you waited makes every roll different
    while (digitalRead(2) == LOW) {
      show(random(1, 7));        // 1 to 6
      delay(50);
    }
    // Let go: the dice slows down, then stops.
    for (int wait = 60; wait <= 360; wait += 60) {
      show(random(1, 7));
      delay(wait);
    }
  }
}
`;

const dice = starter(
  [
    { kind: 'arduino', x: 0, y: 0, set: { sketch: DICE_SKETCH } }, // 0 U1
    { kind: 'sevenseg', x: 0, y: -500 }, // 1 DS1
    // 2–8: a resistor above each of pins 3–9 (D3 at x 80, D4 60, D5 40, D6 20, D7 0, D8 −40, D9 −60),
    // staggered over three rows so their labels don't overlap.
    ...[80, 60, 40, 20, 0, -40, -60].map((x, k): Placed => ({ kind: 'resistor', x, y: -180 - 60 * (k % 3), rot: 90, value: 330 })),
    { kind: 'pushbutton', x: 220, y: -180 }, // 9 PB1
    { kind: 'ground', x: 300, y: -120 }, // 10
    { kind: 'ground', x: -100, y: 180 }, // 11
    { kind: 'ground', x: 120, y: -380 }, // 12
  ],
  [
    ...[0, 1, 2, 3, 4, 5, 6].flatMap((k): W[] => [
      [0, 3 + k, 2 + k, 1],
      [2 + k, 0, 1, k],
    ]),
    [0, 2, 9, 0],
    [9, 1, 10, 0],
    [0, 22, 11, 0],
    [1, 9, 12, 0],
  ],
);

/* ---------- The catalog ---------- */

export const PROJECTS: Project[] = [
  {
    id: 'fade-lamp',
    title: 'Fade-out lamp',
    kind: 'Analog',
    blurb: 'Press the button and the light stays on after you let go, then slowly fades away. No chip, no code.',
    how: [
      'Holding PB1 fills C1 in about a second through R1. Let go, and C1 drains slowly through the much bigger R2 into Q1’s base.',
      'Q1 is an amplifier: its collector lets through about 200 times the base current, so a trickle from the capacitor runs the LED. As C1 empties, the trickle shrinks and the LED dims.',
    ],
    tryThis: [
      'Hold PB1 for a second, let go, then watch the LED. Probe C1’s + leg with the scope to see the voltage sink.',
      'Swap C1 for 1000 µF: about four times longer before it goes dark.',
      'Change R2 to 10 kΩ. It drains C1 faster, so the fade is quicker, but it starts out just as bright.',
      'Add a second LED with its own 470 Ω resistor, in parallel with LED1 and R3.',
    ],
    breakIt: [
      'Delete R2 and wire C1 straight to the base: the full charge rushes into Q1. Watch what the inspector says about its base current.',
      'Change R1 to 10 Ω and press the button. An empty capacitor acts like a short circuit for a moment, and that rush of current is too much for R1.',
    ],
    build: fadeLamp,
  },
  {
    id: 'siren',
    title: 'Two-tone siren',
    kind: 'Analog',
    blurb: 'Two 555 timers: a slow one flips the fast one between two notes. Nee-naw.',
    how: [
      'U1 is a slow 555 blinker (LED1 shows its beat). U2 makes a tone for the speaker.',
      'A 555’s Control pin (pin 5) sets how far its capacitor charges before it flips. U1’s output pulls U2’s Control up and down through R1, so U2’s pitch jumps between two notes.',
    ],
    tryThis: [
      'Switch sound on, then put both scope probes on: one on U1’s output, one on U2’s output.',
      'Change C1 to 4.7 µF for a faster, more urgent siren.',
      'Change R1 to 2.2 kΩ: U1 pulls harder, so the two notes are further apart.',
      'Make it wail: add a 100 µF capacitor from U2’s Control pin to ground. Now the pitch slides between notes instead of jumping.',
    ],
    breakIt: [
      'Delete R1 and wire U1’s output straight to U2’s Control. Now U2 is pulled right down to 0 V on every other beat, and it can’t oscillate at all.',
      'Want it louder? Turn the speaker’s resistor R2 down to 10 Ω. It is louder, for a moment, until R2 can’t get rid of the heat.',
    ],
    build: siren,
  },
  {
    id: 'beam-alarm',
    title: 'Light-beam alarm',
    kind: 'Analog',
    blurb: 'Silent while light shines on the sensor. Break the beam and it screams.',
    how: [
      'A 555’s Reset pin (pin 4) stops it dead whenever it’s held below about 0.7 V.',
      'VR1 and the light sensor make a voltage divider on Reset. In bright light the sensor’s resistance is low and pulls Reset down: silence. In the dark its resistance shoots up, Reset rises, and the 555 sings.',
    ],
    tryThis: [
      'Switch sound on, select LDR1 and slide its light down. Find the exact level where the alarm goes off.',
      'Turn VR1 (the sensitivity knob) and find that level again. Which way makes the alarm harder to set off?',
      'Put the meter on Reset (pin 4) and watch it cross 0.7 V just as the sound starts.',
      'Change C1 to 47 nF for a lower, angrier tone.',
    ],
    breakIt: [
      'Slide VR1 all the way to End A, so there’s almost 0 Ω between + and Reset. Now no amount of light can pull Reset down, and it never stops.',
      'Swap VR1 and LDR1 over: it becomes a night alarm that goes off when the lights come on.',
    ],
    build: beamAlarm,
  },
  {
    id: 'counter',
    title: 'Four-bit binary counter',
    kind: 'Digital',
    blurb: 'A 555 clock and four flip-flops count from 0 to 15 in binary, then start again.',
    how: [
      'U1 is a 555 ticking about twice a second, running off U2’s 5 V pin. Each tick clocks U2, which flips because its Q̄ feeds its own D.',
      'Each flip-flop’s Q̄ clocks the next one, so U3 flips half as often as U2, U4 half as often again, and so on. Read the LEDs right to left: LED4 is the 8s, LED3 the 4s, LED2 the 2s, LED1 the 1s.',
    ],
    tryThis: [
      'Watch it count, adding up the lit LEDs (8 + 4 + 2 + 1) to read each number.',
      'Put the scope on U1’s output and U2’s Q: each flip-flop halves the frequency.',
      'Change C1 to 1 µF and it counts ten times faster.',
      'Add a fifth flip-flop, wired just like the others, and it counts to 31.',
    ],
    breakIt: [
      'Delete the wire from U3’s Q̄ to its D. U3 gets stuck and the count jumps around: every bit depends on the one before it.',
      'Clock each flip-flop from the one before’s Q instead of its Q̄ (three wires to move). Now it counts down: 15, 14, 13…',
    ],
    build: counter,
  },
  {
    id: 'full-adder',
    title: 'Full adder',
    kind: 'Digital',
    blurb: 'Five logic gates that add three bits. Every computer adds numbers with chains of these.',
    how: [
      'Switches SW1 and SW2 are the two bits to add (A and B); SW3 is a “carry in” from the column before.',
      'U1 and U3 (both XOR) work out the sum bit: it’s 1 when an odd number of inputs are 1. U2, U4 and U5 work out the carry: it’s 1 when two or more inputs are 1, just like carrying in long addition.',
    ],
    tryThis: [
      'Close SW1 and SW2: 1 + 1 = 2, which in binary is 10. The carry LED lights and the sum goes dark.',
      'Close all three: 1 + 1 + 1 = 3, binary 11. Both LEDs light.',
      'Go through all eight combinations and write down the table. That table is the full adder.',
      'Challenge: delete U2, U4 and U5 and rebuild the carry out of NAND gates only.',
    ],
    breakIt: [
      'Delete SW1’s pull-down resistor R1. With SW1 open, U1’s input is left floating (here it reads LOW, but on a real chip it could read anything).',
      'Swap U3 for an OR gate. When is the answer now wrong?',
    ],
    build: fullAdder,
  },
  {
    id: 'dice',
    title: 'Electronic dice',
    kind: 'Arduino',
    blurb: 'Hold the button to roll, let go and it tumbles to a stop on a number from 1 to 6.',
    how: [
      'The Arduino drives the seven segments of the display from pins 3 to 9, each through its own resistor. A table in the code lists which segments make each face.',
      'Pin 2 uses the chip’s own pull-up resistor, so it reads LOW while the button is pressed. While it’s held, the sketch flashes random faces; when you let go, it slows down and stops.',
    ],
    tryThis: [
      'Select PB1 and hold its button to roll. Do it a few times: no two rolls run the same.',
      'Open the code and change random(1, 7) to random(1, 4) for a three-sided die (both places).',
      'Make it tumble longer: change 360 to 900 in the for loop.',
      'Show 0 to 9: add the faces for 0 and 7–9 to the table (0 = 0b0111111, 7 = 0b0000111, 8 = 0b1111111, 9 = 0b1101111) and roll random(0, 10).',
    ],
    breakIt: [
      'Replace one segment’s 330 Ω resistor with a wire. The Arduino pin is now trying to light an LED with nothing to limit the current.',
      'In the code, change INPUT_PULLUP to INPUT. With nothing holding pin 2 HIGH, what does the button do now?',
    ],
    build: dice,
  },
];

export const projectById = (id: string) => PROJECTS.find((p) => p.id === id);
