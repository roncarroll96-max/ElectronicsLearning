/**
 * The Playground: finished circuits that go beyond the lessons, to open,
 * poke at and break. Each comes with a short guide: what it does, how it
 * works, things to try, and a safe way to wreck it.
 */
import type { Circuit } from '../model/circuit';
import { P555, type LedColor } from '../model/parts';
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

/* ---------- 7. Police flasher ---------- */

function policeFlasher(): Circuit {
  // One 555 output, two LEDs: the red one from the output to ground (lit while it's HIGH),
  // the blue one from + to the output (lit while it's LOW).
  const blink = timing555(7, 1, 100, 0, 10_000, 100_000, 2.2e-6);
  return starter(
    [
      { kind: 'battery', x: -360, y: 40, rot: 90 }, // 0 B1
      { kind: 'timer555', x: 100, y: 0 }, // 1 U1
      { kind: 'ground', x: 100, y: 180 }, // 2
      { kind: 'resistor', x: 260, y: 0, value: 330 }, // 3 R1
      { kind: 'led', x: 360, y: 80, rot: 90 }, // 4 LED1 red
      { kind: 'resistor', x: 220, y: -160, rot: 90, value: 390 }, // 5 R2
      { kind: 'led', x: 220, y: -60, rot: 90, set: { color: 'blue' } }, // 6 LED2 blue
      ...blink.parts, // 7–9 R3, R4, C1
      { kind: 'ground', x: 360, y: 180 }, // 10
      { kind: 'ground', x: -360, y: 160 }, // 11
    ],
    [
      [0, 1, 11, 0],
      ...blink.wires([0, 0], 2),
      [7, 0, 1, VCC],
      [1, VCC, 1, RESET],
      [1, GND, 2, 0],
      [1, OUT, 3, 0],
      [3, 1, 4, 0],
      [4, 1, 10, 0],
      [0, 0, 5, 0],
      [5, 1, 6, 0],
      [6, 1, 1, OUT],
    ],
  )();
}

/* ---------- 8. Metronome ---------- */

function metronome(): Circuit {
  // A 555 whose output dips LOW for a moment on every beat. VR1 (with R1 as its safety stop) sets how long it waits between dips.
  const beat = timing555(4, 1, 100, 0, 33_000, 4700, 10e-6);
  return starter(
    [
      { kind: 'battery', x: -420, y: 40, rot: 90 }, // 0 B1
      { kind: 'timer555', x: 100, y: 0 }, // 1 U1
      { kind: 'ground', x: 100, y: 180 }, // 2
      { kind: 'potentiometer', x: -40, y: -180, rot: 180, value: 220_000, set: { pos: 0.5 } }, // 3 VR1 tempo
      ...beat.parts, // 4–6 R1, R2, C1
      { kind: 'resistor', x: 220, y: -160, rot: 90, value: 390 }, // 7 R3
      { kind: 'led', x: 220, y: -60, rot: 90 }, // 8 LED1 flashes on the beat
      { kind: 'resistor', x: 260, y: 0, value: 150 }, // 9 R4
      { kind: 'capacitor', x: 360, y: 0, value: 47e-6 }, // 10 C2 passes only the edges: a click
      { kind: 'speaker', x: 460, y: 80, rot: 90 }, // 11 SPK1
      { kind: 'ground', x: 460, y: 180 }, // 12
      { kind: 'ground', x: -420, y: 160 }, // 13
    ],
    [
      [0, 1, 13, 0],
      [0, 0, 3, 1],
      ...beat.wires([3, 2], 2),
      [0, 0, 7, 0],
      [7, 0, 1, VCC],
      [1, VCC, 1, RESET],
      [1, GND, 2, 0],
      [7, 1, 8, 0],
      [8, 1, 1, OUT],
      [1, OUT, 9, 0],
      [9, 1, 10, 0],
      [10, 1, 11, 0],
      [11, 1, 12, 0],
    ],
  )();
}

/* ---------- 9. Voltage doubler ---------- */

const voltageDoubler = starter(
  [
    { kind: 'acsource', x: -360, y: 40, rot: 90, value: 6, set: { freq: 50, wave: 'sine' } }, // 0 AC1
    { kind: 'capacitor', x: -240, y: -40, rot: 180, value: 47e-6 }, // 1 C1 (+ towards the diodes)
    { kind: 'diode', x: -140, y: 40, rot: 270 }, // 2 D1 ground up to C1
    { kind: 'diode', x: -40, y: -40 }, // 3 D2 C1 on to C2
    { kind: 'capacitor', x: 60, y: 40, rot: 90, value: 10e-6 }, // 4 C2 holds the output
    { kind: 'resistor', x: 180, y: 40, rot: 90, value: 100_000 }, // 5 R1 the load
    { kind: 'ground', x: -360, y: 160 }, // 6
    { kind: 'ground', x: -140, y: 140 }, // 7
    { kind: 'ground', x: 60, y: 140 }, // 8
    { kind: 'ground', x: 180, y: 140 }, // 9
  ],
  [
    [0, 1, 6, 0],
    [0, 0, 1, 1],
    [1, 0, 2, 1],
    [1, 0, 3, 0],
    [3, 1, 4, 0],
    [3, 1, 5, 0],
    [2, 0, 7, 0],
    [4, 1, 8, 0],
    [5, 1, 9, 0],
  ],
);

/* ---------- 10. Tuned circuit ---------- */

const tunedCircuit = starter(
  [
    { kind: 'acsource', x: -300, y: 40, rot: 90, value: 2, set: { freq: 100, wave: 'sine' } }, // 0 AC1
    { kind: 'resistor', x: -160, y: -40, value: 10_000 }, // 1 R1 feeds the signal in gently
    { kind: 'inductor', x: -20, y: 40, rot: 90, value: 0.1 }, // 2 L1
    { kind: 'capacitor', x: 100, y: 40, rot: 90, value: 1e-6 }, // 3 C1
    { kind: 'ground', x: -300, y: 160 }, // 4
    { kind: 'ground', x: -20, y: 140 }, // 5
    { kind: 'ground', x: 100, y: 140 }, // 6
  ],
  [
    [0, 1, 4, 0],
    [0, 0, 1, 0],
    [1, 1, 2, 0],
    [1, 1, 3, 0],
    [2, 1, 5, 0],
    [3, 1, 6, 0],
  ],
);

/* ---------- 11. Coin toss ---------- */

function coinToss(): Circuit {
  // A 555 ticking about 1000 times a second (run from U2's 5 V pin) reaches the flip-flop's Clock only while PB1 is held.
  const clock = timing555(12, 0, -320, 0, 1000, 6800, 100e-9);
  return starter(
    [
      { kind: 'timer555', x: -320, y: 0 }, // 0 U1 the clock
      { kind: 'dff', x: 60, y: 0 }, // 1 U2 the coin
      { kind: 'pushbutton', x: -120, y: 20 }, // 2 PB1
      { kind: 'resistor', x: -40, y: 100, rot: 90, value: 10_000 }, // 3 R1 holds Clock LOW while PB1 is up
      { kind: 'ground', x: -40, y: 200 }, // 4
      { kind: 'resistor', x: 220, y: -100, value: 330 }, // 5 R2
      { kind: 'led', x: 320, y: -40, rot: 90, set: { color: 'green' } }, // 6 LED1 heads
      { kind: 'ground', x: 320, y: 60 }, // 7
      { kind: 'resistor', x: 220, y: 100, value: 330 }, // 8 R3
      { kind: 'led', x: 320, y: 160, rot: 90 }, // 9 LED2 tails
      { kind: 'ground', x: 320, y: 260 }, // 10
      { kind: 'ground', x: 60, y: 120 }, // 11
      ...clock.parts, // 12–14 R4, R5, C1
      { kind: 'ground', x: -320, y: 180 }, // 15
    ],
    [
      [1, 4, 0, VCC],
      [0, VCC, 0, RESET],
      [0, GND, 15, 0],
      ...clock.wires([1, 4], 15),
      [0, OUT, 2, 0],
      [2, 1, 1, 1],
      [3, 0, 1, 1],
      [3, 1, 4, 0],
      [1, 3, 1, 0], // Q̄ back to D: flips on every clock
      [1, 5, 11, 0],
      [1, 2, 5, 0],
      [5, 1, 6, 0],
      [6, 1, 7, 0],
      [1, 3, 8, 0],
      [8, 1, 9, 0],
      [9, 1, 10, 0],
    ],
  )();
}

/* ---------- 12. Traffic light ---------- */

export const TRAFFIC_SKETCH = `// Traffic light with a pedestrian crossing.
// For the cars: red on pin 12, yellow on pin 9, green on pin 7.
// The white WALK light is on pin 4. The button on pin 2 asks to cross.

const int RED = 12;
const int YELLOW = 9;
const int GREEN = 7;
const int WALK = 4;
const int BUTTON = 2;

bool waiting = false;   // has someone asked to cross?

void lights(int red, int yellow, int green, int walk) {
  digitalWrite(RED, red);
  digitalWrite(YELLOW, yellow);
  digitalWrite(GREEN, green);
  digitalWrite(WALK, walk);
}

// Like delay(), but it keeps watching the button the whole time.
void pause(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    if (digitalRead(BUTTON) == LOW) waiting = true;
  }
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(WALK, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);   // reads LOW while the button is pressed
  Serial.begin(9600);
}

void loop() {
  lights(LOW, LOW, HIGH, LOW);     // green for the cars...
  pause(3000);                     // ...for at least 3 seconds
  while (!waiting) pause(50);      // ...and then until someone asks to cross
  Serial.println("Button pressed: stopping the cars");

  lights(LOW, HIGH, LOW, LOW);     // yellow
  pause(1500);
  lights(HIGH, LOW, LOW, LOW);     // red, and a moment for the road to clear
  pause(1000);
  lights(HIGH, LOW, LOW, HIGH);    // WALK
  pause(4000);
  for (int i = 0; i < 5; i++) {    // WALK flashes: hurry up
    digitalWrite(WALK, LOW);
    pause(250);
    digitalWrite(WALK, HIGH);
    pause(250);
  }
  lights(HIGH, LOW, LOW, LOW);     // red
  pause(1000);
  lights(HIGH, HIGH, LOW, LOW);    // red and yellow: get ready
  pause(1000);
  waiting = false;                 // presses during the crossing don't count
}
`;

/**
 * LEDs in a row above an Uno (part 0), each on its own pin through a resistor, cathodes joined along the top.
 * Where a column isn't straight above its pin, its wire turns halfway up to its resistor, so resistors at
 * different heights (`resistorY`, the outermost lowest) keep the wires from crossing.
 */
function ledColumns(first: number, xs: number[], pins: number[], colors: (LedColor | undefined)[], ground: number, resistorY: number[] = xs.map(() => -180), ledY = -300) {
  const n = xs.length;
  const parts: Placed[] = [
    ...xs.map((x, k): Placed => ({ kind: 'resistor', x, y: resistorY[k], rot: 90, value: 330 })),
    ...xs.map((x, k): Placed => ({ kind: 'led', x, y: ledY, rot: 270, ...(colors[k] ? { set: { color: colors[k] } } : {}) })),
  ];
  const wires: W[] = [
    ...xs.flatMap((_, k): W[] => [
      [0, pins[k], first + k, 1],
      [first + k, 0, first + n + k, 0],
      ...(k > 0 ? ([[first + n + k - 1, 1, first + n + k, 1]] as W[]) : []),
    ]),
    [first + n, 1, ground, 0],
  ];
  return { parts, wires };
}

function trafficLight(): Circuit {
  const cols = ledColumns(1, [-240, -140, -40, 60], [12, 9, 7, 4], [undefined, 'yellow', 'green', 'white'], 9, [-200, -240, -280, -280], -400);
  return starter(
    [
      { kind: 'arduino', x: 0, y: 0, set: { sketch: TRAFFIC_SKETCH } }, // 0 U1
      ...cols.parts, // 1–4 R1–R4, 5–8 LED1–LED4
      { kind: 'ground', x: -320, y: -420 }, // 9
      { kind: 'pushbutton', x: 200, y: -200 }, // 10 PB1
      { kind: 'ground', x: 300, y: -140 }, // 11
      { kind: 'ground', x: -100, y: 180 }, // 12
    ],
    [...cols.wires, [0, 2, 10, 0], [10, 1, 11, 0], [0, 22, 12, 0]],
  )();
}

/* ---------- 13. Reaction timer ---------- */

export const REACTION_SKETCH = `// Reaction timer: when the light comes on, press the button as fast as you can.
// The LED is on pin 9, the button on pin 2. Your time appears in the serial monitor.

const int LED = 9;
const int BUTTON = 2;

unsigned long best = 0;   // your fastest time so far, in milliseconds

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);   // reads LOW while the button is pressed
  Serial.begin(9600);
  Serial.println("Reaction timer. Wait for the light, then press!");
}

void loop() {
  // Wait a random 2 to 5 seconds, so you can't guess when the light will come.
  unsigned long hold = random(2000, 5000);
  unsigned long start = millis();
  while (millis() - start < hold) {
    if (digitalRead(BUTTON) == LOW) {
      Serial.println("Too soon! Wait for the light.");
      while (digitalRead(BUTTON) == LOW) {}   // let go first
      start = millis();                       // and the wait starts again
    }
  }

  digitalWrite(LED, HIGH);
  unsigned long lit = millis();
  while (digitalRead(BUTTON) == HIGH) {}      // wait for the press
  unsigned long ms = millis() - lit;
  digitalWrite(LED, LOW);

  Serial.print(ms);
  Serial.println(" ms");
  if (best == 0 || ms < best) {
    best = ms;
    Serial.println("That's your best so far!");
  }

  randomSeed(micros());                       // the moment you pressed makes the next wait different
  while (digitalRead(BUTTON) == LOW) {}       // let go
  delay(1000);
}
`;

function reactionTimer(): Circuit {
  const cols = ledColumns(1, [-60], [9], ['green'], 3);
  return starter(
    [
      { kind: 'arduino', x: 0, y: 0, set: { sketch: REACTION_SKETCH } }, // 0 U1
      ...cols.parts, // 1 R1, 2 LED1
      { kind: 'ground', x: -140, y: -320 }, // 3
      { kind: 'pushbutton', x: 200, y: -200 }, // 4 PB1
      { kind: 'ground', x: 300, y: -140 }, // 5
      { kind: 'ground', x: -100, y: 180 }, // 6
    ],
    [...cols.wires, [0, 2, 4, 0], [4, 1, 5, 0], [0, 22, 6, 0]],
  )();
}

/* ---------- 14. Mini piano ---------- */

export const PIANO_SKETCH = `// Mini piano: four buttons, four notes, one speaker.
// The keys are on pins 12, 9, 7 and 4 (left to right). The speaker is on pin 2.

const int KEYS[4] = {12, 9, 7, 4};
const int NOTES[4] = {262, 294, 330, 392};   // C, D, E and G, in hertz
const int SPEAKER = 2;

int playing = -1;   // the key that's sounding now (-1 means none)

void setup() {
  for (int k = 0; k < 4; k++) {
    pinMode(KEYS[k], INPUT_PULLUP);   // each key reads LOW while it's pressed
  }
}

void loop() {
  // Find the first key that's pressed (-1 if none is).
  int pressed = -1;
  for (int k = 0; k < 4; k++) {
    if (pressed < 0 && digitalRead(KEYS[k]) == LOW) pressed = k;
  }

  if (pressed != playing) {
    noTone(SPEAKER);                                    // stop the old note
    if (pressed >= 0) tone(SPEAKER, NOTES[pressed]);    // start the new one
    playing = pressed;
  }
}
`;

const PIANO_KEYS = [12, 9, 7, 4];
const miniPiano = starter(
  [
    { kind: 'arduino', x: 0, y: 0, set: { sketch: PIANO_SKETCH } }, // 0 U1
    // 1–4: the keys, stepping up from left to right (so the wires from pins 12, 9, 7 and 4 don't cross).
    ...[-240, -140, -40, 60].map((x, k): Placed => ({ kind: 'pushbutton', x, y: [-200, -240, -280, -280][k], rot: 90 })),
    { kind: 'ground', x: 140, y: -300 }, // 5
    { kind: 'resistor', x: 200, y: -160, value: 220 }, // 6 R1
    { kind: 'speaker', x: 320, y: -100, rot: 90 }, // 7 SPK1
    { kind: 'ground', x: 320, y: 0 }, // 8
    { kind: 'ground', x: -100, y: 180 }, // 9
  ],
  [
    ...PIANO_KEYS.flatMap((pin, k): W[] => [
      [0, pin, 1 + k, 1],
      ...(k > 0 ? ([[k, 0, 1 + k, 0]] as W[]) : []),
    ]),
    [4, 0, 5, 0],
    [0, 2, 6, 0],
    [6, 1, 7, 0],
    [7, 1, 8, 0],
    [0, 22, 9, 0],
  ],
);

/* ---------- 15. LED chaser ---------- */

export const CHASER_SKETCH = `// LED chaser: a light runs back and forth, with a dim tail behind it.
// The knob on A0 sets the speed.

const int LEDS[6] = {11, 10, 9, 6, 5, 3};   // all PWM pins (marked ~), so analogWrite can dim them

int level[6] = {0, 0, 0, 0, 0, 0};          // each LED's brightness, 0 to 255
int head = 0;                               // the LED at the front
int step = 1;                               // +1 moving right, -1 moving left

void setup() {
  for (int k = 0; k < 6; k++) pinMode(LEDS[k], OUTPUT);
}

void loop() {
  for (int k = 0; k < 6; k++) level[k] = level[k] / 16;  // every LED fades to a sixteenth
  level[head] = 255;                                     // the front one is full on
  for (int k = 0; k < 6; k++) analogWrite(LEDS[k], level[k]);

  if (head == 5) step = -1;                 // bounce off the ends
  if (head == 0) step = 1;
  head = head + step;

  int knob = analogRead(A0);                // 0 to 1023
  delay(map(knob, 0, 1023, 300, 30));       // turn it up: shorter wait, faster chase
}
`;

function ledChaser(): Circuit {
  // The six PWM pins sit unevenly along the header, so the LEDs fan out from them.
  const cols = ledColumns(1, [-220, -140, -60, 20, 100, 180], [11, 10, 9, 6, 5, 3], [], 13, [-200, -240, -240, -240, -240, -200], -360);
  return starter(
    [
      { kind: 'arduino', x: 0, y: 0, set: { sketch: CHASER_SKETCH } }, // 0 U1
      ...cols.parts, // 1–6 R1–R6, 7–12 LED1–LED6
      { kind: 'ground', x: -300, y: -380 }, // 13
      { kind: 'potentiometer', x: -260, y: 200, rot: 180, value: 10_000, set: { pos: 0.5 } }, // 14 VR1 speed
      { kind: 'ground', x: -60, y: 220 }, // 15
    ],
    [
      ...cols.wires,
      // The knob: 5 V at one end, ground at the other, its wiper to A0.
      [0, 20, 14, 1],
      [0, 22, 14, 0],
      [0, 22, 15, 0],
      [14, 2, 0, 14],
    ],
  )();
}

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
    id: 'police-flasher',
    title: 'Police flasher',
    kind: 'Analog',
    blurb: 'One 555 flashes a red and a blue light in turn. When one is on, the other is off.',
    how: [
      'U1 is a 555 blinker whose output swings HIGH and LOW about three times a second.',
      'LED1 (red) runs from the output to ground, so it lights while the output is HIGH. LED2 (blue) runs from + to the output, so it lights while the output is LOW: the chip then lets current in instead of pushing it out. One pin, two lights, never on together.',
      'A blue LED needs about 3.1 V where a red one needs 2.0 V, which is why R2 isn’t the same value as R1.',
    ],
    tryThis: [
      'Put the scope on U1’s output (pin 3) and match each light to the HIGH and LOW halves of the wave.',
      'Change C1 to 1 µF for a faster flash, or 10 µF for a lazy one.',
      'Select LED1 and try other colours. Which ones come out brighter or dimmer with the same resistor?',
      'Move LED2 and R2 so they also run from the output to ground. Now both flash together.',
    ],
    breakIt: [
      'Turn R4 right down to 10 Ω. C1 now empties in an instant, so the output is hardly ever LOW: the red light looks stuck on and the blue one stays dark.',
      'Want a brighter blue? Change R2 to 47 Ω. It is brighter, once.',
    ],
    build: policeFlasher,
  },
  {
    id: 'metronome',
    title: 'Metronome',
    kind: 'Analog',
    blurb: 'Tick… tick… tick. A knob sets the tempo, a speaker clicks and a light flashes on every beat.',
    how: [
      'U1 is a 555 that spends most of its time with its output HIGH, then dips LOW for a moment on each beat. C1 fills slowly through VR1 and R1 (the wait), then empties quickly through R2 (the dip).',
      'LED1 runs from + to the output, so it flashes during each dip.',
      'C2 passes only changes on to the speaker. Each time the output jumps, a short burst of current gets through and the speaker clicks.',
    ],
    tryThis: [
      'Switch sound on, select VR1 and slide it. Towards End B is faster, from about 33 beats a minute up to about 200.',
      'Put the scope on U1’s output to see the dips, then on C1’s + leg to see the slow climb and the quick drop.',
      'Change R2 to 22 kΩ: each dip lasts longer, so the flash is longer and the click splits into two.',
      'Change C1 to 100 nF. It now ticks a hundred times faster, and the ticks run together into a buzz: a metronome and a tone generator are the same circuit.',
    ],
    breakIt: [
      'Change R1 to 10 Ω, then slide VR1 all the way to End B. At that end VR1 is 0 Ω, so R1 is all that stands between the battery and the 555’s Discharge pin. That’s why a knob like this always has a fixed resistor in series.',
    ],
    build: metronome,
  },
  {
    id: 'voltage-doubler',
    title: 'Voltage doubler',
    kind: 'Analog',
    blurb: 'Two diodes and two capacitors turn 6 V of AC into about 11 V of DC. No transformer needed.',
    how: [
      'When the AC swings negative, D1 lets C1 charge up to the wave’s peak.',
      'When the AC swings positive, C1’s charge rides on top of it, like standing on a lift going up. The far side of C1 reaches almost twice the peak, and D2 passes that on to C2.',
      'C2 holds the doubled voltage for R1, the load. Each diode takes about half a volt on the way, so 6 V peak gives about 11 V, not the full 12.',
    ],
    tryThis: [
      'Open the scope with one probe on AC1’s + and the other on C2’s + leg. The input swings between −6 V and +6 V while the output sits steady, well above its peak.',
      'Move the second probe to where C1 meets the diodes: it’s the input wave, lifted so that its bottom sits near 0 V.',
      'Change R1 to 1 kΩ. A heavier load drains C2 between top-ups, so the output sags and ripples.',
      'With R1 still at 1 kΩ, raise AC1’s frequency to 500 Hz. The top-ups now come ten times as often and most of the sag goes away.',
    ],
    breakIt: [
      'Turn AC1 up to 14 V. Double that is more than C2’s 16 V rating can stand: a doubler doubles the stress too.',
      'Change C1 to 100 nF. C1 is the bucket that carries charge up to C2, and a bucket that small can’t keep up with even this light load.',
    ],
    build: voltageDoubler,
  },
  {
    id: 'tuned-circuit',
    title: 'Tuned circuit',
    kind: 'Analog',
    blurb: 'A coil and a capacitor that answer to one frequency and ignore the rest. This is how a radio picks its station.',
    how: [
      'A coil and a capacitor pass energy back and forth at one natural rate, like a swing: f = 1 ÷ (2π√(L × C)), which is about 500 Hz for 100 mH and 1 µF.',
      'R1 feeds the signal in gently. At low frequencies L1 is an easy path to ground, and at high ones C1 is, so hardly any voltage appears across them.',
      'Near 500 Hz their two currents cancel. The pair then acts like a large resistance, and the voltage across it shoots up.',
    ],
    tryThis: [
      'Open the scope with one probe on AC1’s + and the other on the top of L1, and press Auto. At 100 Hz the second trace is almost flat.',
      'Select AC1 and raise its frequency a little at a time. Find where the second trace is tallest: that’s resonance.',
      'Change C1 to 470 nF and find the new peak. The formula says about 730 Hz.',
      'Set AC1 to a 50 Hz square wave. Each edge strikes the pair like a bell, and it rings at its own 500 Hz before dying away.',
    ],
    breakIt: [
      'Change R1 to 100 Ω. The source now overpowers the pair, and every frequency gets through about the same: no tuning left.',
      'Add a 100 Ω resistor across L1 (from its top to ground). It soaks up the energy on every swing, and the peak all but vanishes. A tuned circuit only rings if it loses little.',
    ],
    build: tunedCircuit,
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
    id: 'coin-toss',
    title: 'Coin toss',
    kind: 'Digital',
    blurb: 'Hold the button to flip the coin, let go to see how it lands: green for heads, red for tails.',
    how: [
      'U1 is a 555 ticking about 1000 times a second, running off U2’s 5 V pin. Its ticks only reach U2’s Clock while PB1 is held; R1 keeps Clock LOW the rest of the time.',
      'U2 is a flip-flop with its Q̄ wired back to its D, so every tick flips it. Q lights the green LED and Q̄ the red one.',
      'When you let go, it stays wherever it happened to be. It flips far too fast for you to time, and it spends exactly half its time each way, so the toss is fair.',
    ],
    tryThis: [
      'Select PB1, hold its button for a moment and let go. Toss it twenty times and keep score.',
      'Put the scope on U1’s output and U2’s Q while holding the button: Q runs at exactly half the clock’s frequency.',
      'Change R5 to 1 kΩ. The clock’s HIGH and LOW times become very unequal. Is the coin still fair? (Look at Q on the scope.)',
      'Add a second flip-flop clocked from U2’s Q̄, with two more LEDs. Now you have four outcomes: a four-sided die.',
    ],
    breakIt: [
      'Change C1 to 10 µF. The clock slows to about ten ticks a second, slow enough to watch the lights swap and let go at the right moment. A coin toss is only fair while it’s too fast to follow.',
      'Delete R1. Here it still works, because this simulator reads an unconnected input as LOW. On a real chip a floating Clock picks up stray signals and the coin flips on its own.',
    ],
    build: coinToss,
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
  {
    id: 'traffic-light',
    title: 'Traffic light',
    kind: 'Arduino',
    blurb: 'Green for the cars until someone presses the button. Then yellow, red, and a WALK light for the crossing.',
    how: [
      'Each light is an LED on its own pin with its own resistor: red on 12, yellow on 9, green on 7 and the white WALK light on 4.',
      'The sketch never uses delay(), because a sleeping program can’t notice a button. Its own pause() keeps checking pin 2 while it waits, and remembers a press in the variable “waiting”.',
      'After a press the lights run through a fixed sequence: yellow, red, WALK, flashing WALK, red, red and yellow, then green again.',
    ],
    tryThis: [
      'Select PB1 and press its button, then watch the whole sequence. Select the Arduino to see what it prints.',
      'Press the button while the cars’ light is yellow: the press is remembered, not lost.',
      'Open the code and give people longer to cross: change pause(4000) to pause(8000).',
      'Make it a plain junction that cycles by itself: delete the line “while (!waiting) pause(50);”.',
    ],
    breakIt: [
      'In the code, change INPUT_PULLUP to INPUT. Nothing holds pin 2 HIGH any more, so it reads LOW, just as if the button were stuck down, and the lights never rest on green. (A real floating pin would read at random.)',
      'Delete the wire from PB1 to ground. Pressing does nothing now: the button can only pull pin 2 LOW if it has a path to ground.',
    ],
    build: trafficLight,
  },
  {
    id: 'reaction-timer',
    title: 'Reaction timer',
    kind: 'Arduino',
    blurb: 'Wait for the light, then hit the button. The Arduino tells you how many milliseconds you took.',
    how: [
      'The sketch waits a random 2 to 5 seconds, lights the LED on pin 9 and notes the time with millis(). When pin 2 goes LOW it subtracts the two times and prints the answer.',
      'Press before the light and it prints “Too soon!” and starts the wait again.',
      'The first wait is the same every time the board starts, because random() always begins from the same place. After each press, randomSeed(micros()) reshuffles it using the exact moment you pressed.',
    ],
    tryThis: [
      'Select the Arduino so you can see what it prints. Wait for the green light, then press PB1 as fast as you can. Around 250 ms is typical.',
      'Try to beat your best. Then try guessing, and see what the sketch says.',
      'Open the code and change random(2000, 5000) to random(500, 8000) to make the wait harder to guess.',
      'For finer timing, measure with micros() instead of millis() (two places) and print “us”: millionths of a second.',
    ],
    breakIt: [
      'In the code, delete the whole “Too soon!” block (the five lines starting at “if (digitalRead(BUTTON) == LOW) {”). Now hold the button down before the light comes on: 0 ms, every time. That block was the only thing stopping a cheat.',
    ],
    build: reactionTimer,
  },
  {
    id: 'mini-piano',
    title: 'Mini piano',
    kind: 'Arduino',
    blurb: 'Four buttons, four notes. Enough for “Mary Had a Little Lamb”.',
    how: [
      'Each button connects a pin to ground, and the pins use the chip’s own pull-up resistors, so a pressed key reads LOW.',
      'tone() switches pin 2 on and off hundreds of times a second: 262 times for C, 294 for D, 330 for E and 392 for G. The speaker turns that into sound, and R1 keeps the current within what a pin can supply.',
      'The sketch remembers which key is sounding, and only calls tone() or noTone() when that changes.',
    ],
    tryThis: [
      'Switch sound on. Press PB3, PB2, PB1, PB2, PB3, PB3, PB3 (the notes E D C D E E E).',
      'Put the scope on pin 2 and hold each key in turn: higher notes have narrower waves.',
      'Change 392 to 349 in the code: the top key now plays F, and the four keys run C, D, E, F.',
      'Add a fifth key from pin 10 to ground. In the code, make both lists five long (add pin 10 and note 440) and change both 4s in the loops to 5.',
    ],
    breakIt: [
      'Delete the noTone(SPEAKER) line. Now a note never stops when you let go: tone() carries on until something tells it to stop.',
      'Hold two keys at once. Only the lower note sounds: one pin can play only one tone() at a time, so a chord needs a speaker pin for every note.',
    ],
    build: miniPiano,
  },
  {
    id: 'led-chaser',
    title: 'LED chaser',
    kind: 'Arduino',
    blurb: 'A light runs back and forth along six LEDs, with a dim tail behind it. A knob sets the speed.',
    how: [
      'The six LEDs are on the pins marked ~, the ones analogWrite() can dim. It dims an LED by switching it on and off hundreds of times a second (PWM): the longer each “on”, the brighter it looks.',
      'On every step the sketch cuts every LED’s brightness to a sixteenth, then sets the front LED to full. That leaves a dim tail one LED long: 255, then 15, then off.',
      'VR1 puts a voltage between 0 and 5 V on A0. analogRead() turns it into a number from 0 to 1023, and map() turns that into the wait between steps.',
    ],
    tryThis: [
      'Select VR1 and slide it towards End B: faster. Back towards End A: slower.',
      'Put the scope on pin 10 to see the PWM: full on, then short pulses that get narrower as the tail fades.',
      'In the code, change level[k] / 16 to level[k] / 4 for a longer tail. (The clock may say it’s running slower than shown: every dimmed LED means hundreds more switches a second to simulate.)',
      'Change map(knob, 0, 1023, 300, 30) to end in 5 instead of 30. How fast can it go before it looks like all six are lit?',
    ],
    breakIt: [
      'Delete the line that fades (“level[k] = level[k] / 16”). Nothing ever dims now: after one pass all six LEDs stay lit.',
      'Move LED1’s wire from pin 11 to pin 12, and change 11 to 12 in the code. Pin 12 has no ~, so analogWrite() can only switch it fully on or off: that LED loses its tail.',
    ],
    build: ledChaser,
  },
];

export const projectById = (id: string) => PROJECTS.find((p) => p.id === id);
