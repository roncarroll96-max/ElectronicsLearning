/** Components in Depth track: diodes, capacitors, transistors, sensors. */
import {
  anyBurned,
  between,
  bridges,
  byRef,
  currentOf,
  has,
  joinedTo,
  ledCurrent,
  ledLit,
  meterMag,
  meterValue,
  parts,
  pinCurrent,
  powerOf,
  probesAcross,
  probesAcrossPart,
  probesOn,
  starter,
  voltageAcross,
} from './checks';
import type { CheckCtx, Lesson } from './types';

/** Battery, resistor and LED wired in a loop. */
const ledLoop = (ohms: number) =>
  starter(
    [
      { kind: 'battery', x: 0, y: 80 },
      { kind: 'resistor', x: -100, y: -40, value: ohms },
      { kind: 'led', x: 60, y: -40 },
    ],
    [
      [0, 0, 1, 0],
      [1, 1, 2, 0],
      [2, 1, 0, 1],
    ],
  );

/** Is the switch with this reference closed? */
const on = (c: CheckCtx, ref: string) => !!byRef(c, ref)?.on;
/** Is the LED with this reference lit? */
const lit = (c: CheckCtx, ref: string) => {
  const p = byRef(c, ref);
  return !!p && currentOf(c, p) > 1e-3;
};

export const COMPONENTS: Lesson[] = [
  {
    id: 'diodes',
    track: 'components',
    title: 'Diodes: one-way streets',
    summary: 'Current flows one way only, and costs about 0.7 V.',
    minutes: 6,
    concept: [
      'A diode lets current flow one way only: from its anode (+) to its cathode, the end with the stripe. Turned around, it blocks.',
      'While it conducts, a silicon diode uses up about 0.6–0.7 V, almost whatever the current. That “0.7 V” is one of the most useful rules of thumb in electronics.',
      'Diodes protect circuits from batteries connected backwards, turn alternating current into direct current, and much more. An LED is a diode too: one that happens to glow.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'resistor', x: -140, y: -40, value: 470 },
        { kind: 'diode', x: 0, y: -40 },
        { kind: 'led', x: 140, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 3, 0],
        [3, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'forward',
        text: 'Measure across the diode: meter on V, red probe on its anode (left), black on its cathode (right). About 0.7 V.',
        hint: 'Open the multimeter from the toolbar if it isn’t open yet.',
        check: (c) => {
          const v = probesOn(c, 'diode', 0, 1) ? (meterValue(c, 'V') ?? 0) : 0;
          return v > 0.5 && v < 0.8;
        },
      },
      {
        id: 'reverse',
        text: 'Select the diode and click “Turn around” in the inspector. The LED goes dark: the diode now blocks the current.',
        check: (c) => parts(c, 'diode').some((d) => voltageAcross(c, d) < -0.5) && !ledLit(c, 1e-6),
      },
      {
        id: 'blocking',
        text: 'Measure across the diode again. Now it holds back most of the battery’s voltage: with no current flowing, the resistor drops nothing.',
        check: (c) => probesAcross(c, 'diode') && Math.abs(meterValue(c, 'V') ?? 0) > 6,
      },
    ],
    experiment: [
      {
        id: 'rule-of-thumb',
        text: 'Turn the diode back the right way. Then change the 470 Ω resistor to 1 kΩ: the current roughly halves, but the diode’s voltage hardly moves. That’s why 0.7 V works as a rule of thumb.',
        check: (c) =>
          parts(c, 'diode').some((d) => voltageAcross(c, d) > 0.4) && parts(c, 'resistor').some((r) => (r.value ?? 0) >= 1000) && ledLit(c),
      },
    ],
    why: {
      diode: 'Here the diode is in series with the LED, so you can see its 0.7 V “cost”: the resistor gets 9 − 0.7 − 2 = 6.3 V.',
    },
  },

  {
    id: 'leds',
    track: 'components',
    title: 'LEDs: voltage and current',
    summary: 'An LED takes a fixed voltage; the resistor gets the rest and sets the current.',
    minutes: 7,
    concept: [
      'An LED behaves like a diode with a bigger “cost”: a red LED takes about 1.9 V whenever it’s lit, almost no matter how much current flows. (Green, blue and white LEDs take more, up to about 3 V.)',
      'That fixed voltage is why an LED needs a resistor. The resistor gets whatever voltage is left over, and Ohm’s law then sets the current: I = (battery − LED) ÷ R.',
      'Most small LEDs are happiest at 5–20 mA. Brightness follows the current, not the voltage.',
    ],
    starter: ledLoop(330),
    build: [
      {
        id: 'vf',
        text: 'Measure across the LED: meter on V, red probe on its anode (+), black on its cathode (−). About 1.9 V.',
        hint: 'Open the multimeter from the toolbar at the bottom of the canvas.',
        check: (c) => probesOn(c, 'led', 0, 1) && between(meterMag(c, 'V'), 1.7, 2.1),
      },
      {
        id: 'vr',
        text: 'Now measure across the resistor: it gets the rest, about 7 V. Ohm’s law gives the current: 7 V ÷ 330 Ω ≈ 21 mA.',
        check: (c) => probesAcross(c, 'resistor') && between(meterMag(c, 'V'), 6.7, 7.4),
      },
    ],
    experiment: [
      {
        id: 'two',
        text: 'Add a second LED in series with the first: delete the wire from the first LED’s cathode to the battery, and route it through the new LED. Both glow, a little dimmer: each takes its 1.9 V, leaving less for the resistor.',
        hint: 'First LED’s cathode → new LED’s anode; new LED’s cathode → battery −.',
        tray: ['led'],
        check: (c) => parts(c, 'led').length >= 2 && parts(c, 'led').every((l) => between(currentOf(c, l), 0.012, 0.018)),
      },
    ],
    challenge: [
      {
        id: 'design',
        text: 'Design challenge: keep both LEDs and choose the resistor that runs them at about 10 mA (between 9 and 12 mA). Each LED takes about 1.9 V.',
        hint: '(9 − 2 × 1.9) ÷ 0.010 = 520 Ω. That isn’t standard: 470 Ω gives about 11 mA and 560 Ω about 9.3 mA. Either works.',
        check: (c) => parts(c, 'led').length >= 2 && parts(c, 'led').every((l) => between(currentOf(c, l), 0.009, 0.012)),
      },
    ],
    why: {
      resistor: 'The resistor gets the battery’s voltage minus the LED’s. Every LED you add in series takes another 1.9 V away from it.',
    },
  },

  {
    id: 'capacitors',
    track: 'components',
    title: 'Capacitors: storing charge',
    summary: 'A charged capacitor holds its voltage and blocks steady current.',
    minutes: 6,
    concept: [
      'A capacitor is two metal plates separated by a thin insulator. Current flows into it only while it charges up; once its voltage matches the battery, the current stops. A charged capacitor blocks steady (DC) current.',
      'Its size, in farads (F), says how much charge it stores per volt. Practical sizes are tiny: microfarads (µF) and nanofarads (nF).',
      'A note on this simulator: for now it shows circuits after they have settled, so capacitors appear already charged. Watching them charge and discharge over time (the basis of timers and blinkers) arrives with the Sound & Timing track.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'resistor', x: -80, y: -40, value: 10_000 },
        { kind: 'capacitor', x: 80, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'vc',
        text: 'Measure across the capacitor (meter on V): the full 9 V. It has charged up to match the battery.',
        check: (c) => probesAcross(c, 'capacitor') && meterMag(c, 'V') > 8.5,
      },
      {
        id: 'vr',
        text: 'Now measure across the resistor: 0 V. No voltage across it means no current through it. Once charged, the capacitor stops the current.',
        check: (c) => probesAcross(c, 'resistor') && meterMag(c, 'V') < 0.05,
      },
      {
        id: 'led',
        text: 'Prove it: put the meter away, delete the wire between the resistor and the capacitor, and wire an LED into the gap. It stays dark.',
        tray: ['led'],
        check: (c) => !c.meter.open && parts(c, 'led').some((l) => bridges(c, l, 'resistor', 'capacitor')) && !ledLit(c, 1e-6),
      },
    ],
    experiment: [
      {
        id: 'size',
        text: 'Select the capacitor and change its value. Bigger or smaller, the LED stays dark: once settled, every capacitor blocks DC. (Size will matter when we watch it charge, in Sound & Timing.)',
        check: (c) => parts(c, 'capacitor').some((p) => p.value !== 10e-6) && !ledLit(c, 1e-6),
      },
      {
        id: 'reverse',
        text: 'This kind of capacitor (an electrolytic) has a + and a −, marked on its body. Take the LED out (wire the resistor straight to the capacitor), then select the capacitor and click “Turn around”…',
        hint: 'Reversed, the thin insulating layer inside breaks down. Real ones can pop.',
        check: (c) => parts(c, 'capacitor').some((p) => p.burn),
      },
    ],
    why: {
      capacitor: 'Here the capacitor is fully charged, so it holds 9 V and passes no current. Its + side must face the battery’s +.',
    },
  },

  {
    id: 'potentiometers',
    track: 'components',
    title: 'Potentiometers: a dimmer',
    summary: 'A knob that changes resistance, and why it still needs a fixed resistor.',
    minutes: 6,
    concept: [
      'A potentiometer (“pot”) has a resistor track between its two ends, and a wiper that slides along it. Between one end and the wiper, the resistance goes from 0 to the full value as you turn the knob.',
      'Used with just one end and the wiper, it becomes a variable resistor, perfect for a dimmer: more resistance, less current, dimmer LED.',
      'But at one end of its travel its resistance is zero. Something else has to limit the current there.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 120 },
        { kind: 'potentiometer', x: -140, y: -40 },
        { kind: 'resistor', x: 0, y: -40, value: 330 },
        { kind: 'led', x: 140, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 2, 2, 0],
        [2, 1, 3, 0],
        [3, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'bright',
        text: 'Select the potentiometer and slide it all the way to End A. The LED gets brighter and brighter as the resistance between End A and the wiper shrinks.',
        check: (c) => parts(c, 'potentiometer').some((p) => (p.pos ?? 0.5) < 0.05) && ledCurrent(c) > 0.012,
      },
      {
        id: 'dim',
        text: 'Slide it all the way the other way. The LED dims to a glimmer: now the whole 10 kΩ is in the way.',
        check: (c) => parts(c, 'potentiometer').some((p) => (p.pos ?? 0.5) > 0.85) && between(ledCurrent(c), 1e-4, 0.0015),
      },
    ],
    experiment: [
      {
        id: 'no-resistor',
        text: 'Why the 330 Ω resistor? Delete it, wire the wiper straight to the LED’s anode, then slide the knob all the way to End A…',
        hint: 'At End A there’s no resistance left between the battery and the LED.',
        check: (c) => !has(c, 'resistor') && (anyBurned(c) || ledCurrent(c) > 0.06),
      },
      {
        id: 'fixed',
        text: 'That’s why a dimmer always has a fixed resistor too: it sets the most current the knob can ever allow. Undo until the resistor is back (Ctrl+Z), and check the LED survives at End A.',
        check: (c) =>
          has(c, 'resistor') && !anyBurned(c) && parts(c, 'potentiometer').some((p) => (p.pos ?? 0.5) < 0.05) && between(ledCurrent(c), 0.015, 0.03),
      },
    ],
    why: {
      resistor: 'The fixed resistor protects the LED when the knob is turned to zero: 7 V ÷ 330 Ω ≈ 21 mA is the most it can ever get.',
      potentiometer: 'Only one end and the wiper are used here, so the pot acts as a variable resistor from 0 to 10 kΩ.',
    },
  },

  {
    id: 'light-sensors',
    track: 'components',
    title: 'Light sensors',
    summary: 'Turn light into a voltage with a light sensor and one resistor.',
    minutes: 6,
    concept: [
      'A light-dependent resistor (LDR) changes its resistance with light: about 1 MΩ in the dark, a few hundred ohms in bright light.',
      'Circuits understand voltages, not resistances. Put the sensor in a voltage divider with a fixed resistor, and the voltage between them rises and falls with the light.',
      'Choosing the fixed resistor sets where the circuit is most sensitive: it should be close to the sensor’s resistance at the light level you care about.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'ldr', x: -80, y: -40 },
        { kind: 'resistor', x: 80, y: -40, value: 10_000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'measure',
        text: 'Measure across R1, the 10 kΩ resistor (meter on V): a few volts, in medium light.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'V'), 1.5, 4),
      },
      {
        id: 'dark',
        text: 'Select the light sensor and slide its light down to dark. The voltage falls almost to 0: the sensor’s resistance soars and takes nearly all of the 9 V.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && meterMag(c, 'V') < 0.5,
      },
      {
        id: 'bright',
        text: 'Now slide it up to bright: the voltage rises towards 9 V. Light in, voltage out.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && meterMag(c, 'V') > 7.5,
      },
    ],
    experiment: [
      {
        id: 'sensitivity',
        text: 'Change R1 to 100 kΩ, then find the light level where R1 gets about half the battery (4–5 V). It’s much darker than before: a bigger resistor makes the circuit respond to dimmer light.',
        check: (c) => byRef(c, 'R1')?.value === 100_000 && probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'V'), 4, 5),
      },
    ],
    why: {
      resistor: 'The 10 kΩ is close to the sensor’s resistance in ordinary room light, so the voltage swings most around normal light levels.',
      ldr: 'The sensor’s resistance falls as light rises. Paired with a fixed resistor, that becomes a voltage.',
    },
  },

  {
    id: 'transistor-switch',
    track: 'components',
    title: 'Transistors: a switch',
    summary: 'A small base current switches a much bigger current on and off.',
    minutes: 7,
    concept: [
      'A transistor is a switch with no moving parts. An NPN transistor has three pins: the base, the collector and the emitter.',
      'A small current flowing into the base, and out of the emitter, lets a much bigger current flow from the collector to the emitter. No base current, and the transistor blocks.',
      'The base behaves like a diode: it needs about 0.7 V above the emitter before current flows. So it always gets a resistor, to keep its current small and safe.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 160 },
        { kind: 'resistor', x: -60, y: -80, value: 470 },
        { kind: 'led', x: 80, y: -80 },
        { kind: 'npn', x: 140, y: 20 },
        { kind: 'resistor', x: -60, y: 20, value: 10_000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 3, 1],
        [3, 2, 0, 1],
      ],
    ),
    build: [
      {
        id: 'base',
        text: 'The LED is off: no base current, so the transistor blocks. Now wire R2 (10 kΩ) from the battery’s + to the transistor’s base. The LED lights!',
        hint: 'The base is the transistor’s pin on the left. Hover over a pin to see its name.',
        check: (c) => ledLit(c, 0.005) && pinCurrent(c, parts(c, 'npn')[0], 0) > 1e-4,
      },
      {
        id: 'vbe',
        text: 'Measure from the base (red probe) to the emitter (black): about 0.7 V, just like a diode.',
        check: (c) => probesOn(c, 'npn', 0, 2) && between(meterMag(c, 'V'), 0.6, 0.85),
      },
      {
        id: 'vce',
        text: 'Now from the collector (red) to the emitter (black): almost 0 V. The transistor is fully on, like a closed switch.',
        check: (c) => probesOn(c, 'npn', 1, 2) && meterMag(c, 'V') < 0.3,
      },
    ],
    experiment: [
      {
        id: 'button',
        text: 'Put the meter away. Add a push button between the battery’s + and R2 (in place of the wire), then press and hold it. A tiny button current, under 1 mA, switches the LED’s 15 mA.',
        hint: 'Delete the wire from the battery to R2, then wire the button into the gap.',
        tray: ['pushbutton'],
        check: (c) => !c.meter.open && parts(c, 'pushbutton').some((b) => b.on) && ledLit(c, 0.005),
      },
    ],
    why: {
      resistor:
        'R1 (470 Ω) sets the LED’s current, as always. R2 (10 kΩ) limits the base current to about 0.8 mA: ten times more than the 0.08 mA strictly needed (15 mA ÷ 200), so the transistor is sure to switch fully on.',
      npn: 'Used as a switch: either fully off (no base current) or fully on (plenty of base current).',
    },
  },

  {
    id: 'transistor-gain',
    track: 'components',
    title: 'Transistors: gain',
    summary: 'The collector current is about 200 × the base current, until it can’t be.',
    minutes: 8,
    concept: [
      'Between fully off and fully on, a transistor is an amplifier: the collector current is a fixed multiple of the base current. That multiple is its gain, written β (beta). For our transistor it’s about 200.',
      'So 10 µA into the base allows about 2 mA through the collector. Double the base current and the collector current doubles.',
      'But the collector current can’t be more than the rest of the circuit allows. Once the transistor is passing all it can, more base current changes nothing: it’s saturated, fully on, a switch again.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 160 },
        { kind: 'resistor', x: -60, y: -80, value: 330 },
        { kind: 'led', x: 80, y: -80 },
        { kind: 'npn', x: 140, y: 20 },
        { kind: 'resistor', x: -60, y: 20, value: 1_000_000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 0],
        [2, 1, 3, 1],
        [3, 2, 0, 1],
        [0, 0, 4, 0],
        [4, 1, 3, 0],
      ],
    ),
    build: [
      {
        id: 'ib',
        text: 'Measure the base current: delete the wire from R2 to the base, and bridge the gap with the meter on A (red on R2, black on the base). About 8 µA: tiny.',
        hint: 'R2 is 1 MΩ, and about 8.3 V is across it: 8.3 V ÷ 1,000,000 Ω ≈ 8 µA.',
        check: (c) => between(meterMag(c, 'A'), 7e-6, 9.5e-6),
      },
      {
        id: 'ic',
        text: 'Put that wire back. Now measure the collector current the same way, between the LED and the collector: about 1.7 mA. That’s 200 times the base current.',
        check: (c) => between(meterMag(c, 'A'), 0.0014, 0.0019),
      },
      {
        id: 'more',
        text: 'Put the meter away and repair the wire. Change R2 to 100 kΩ: ten times the base current, so about ten times the collector current, roughly 17 mA. Select the LED to check its current.',
        check: (c) => !c.meter.open && byRef(c, 'R2')?.value === 100_000 && between(ledCurrent(c), 0.014, 0.019),
      },
    ],
    experiment: [
      {
        id: 'saturate',
        text: 'Now 10 kΩ: ten times more base current again, yet the LED only goes from 17 to about 20 mA. The current is now limited by R1 and the LED, not by the transistor: it’s saturated, fully on.',
        check: (c) => byRef(c, 'R2')?.value === 10_000 && between(ledCurrent(c), 0.019, 0.022),
      },
    ],
    why: {
      resistor:
        'R2 sets the base current: about 8.3 V ÷ R2. R1 (330 Ω) sets the most current the LED can ever get, about 21 mA, however hard the transistor is turned on.',
      npn: 'Here it works as an amplifier: collector current ≈ 200 × base current, up to the limit R1 allows.',
    },
  },

  {
    id: 'base-resistor',
    track: 'components',
    title: 'Choosing a base resistor',
    summary: 'Design a transistor switch for a lamp: enough base current, but not too much.',
    minutes: 8,
    concept: [
      'To use a transistor as a switch, give it enough base current to switch fully on, with a safety margin, and no more.',
      'Work back from the load. This lamp needs 50 mA. With a gain of 200, the base needs at least 50 ÷ 200 = 0.25 mA. Gains vary a lot between transistors, so engineers give it 2 to 5 times that: 0.5–1.25 mA.',
      'Then Ohm’s law gives the resistor: the base sits at about 0.7 V, so the resistor gets 9 − 0.7 = 8.3 V. R = 8.3 V ÷ base current.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 160 },
        { kind: 'lamp', x: 60, y: -80 },
        { kind: 'npn', x: 140, y: 20 },
        { kind: 'resistor', x: -60, y: 20, value: 1_000_000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 2, 1],
        [2, 2, 0, 1],
        [0, 0, 3, 0],
        [3, 1, 2, 0],
      ],
    ),
    build: [
      {
        id: 'dim',
        text: 'With 1 MΩ the lamp is dark. Measure from collector (red) to emitter (black): nearly all of the 9 V is across the transistor, and none is left for the lamp.',
        check: (c) => probesOn(c, 'npn', 1, 2) && meterMag(c, 'V') > 7,
      },
      {
        id: 'partway',
        text: 'Change R1 to 100 kΩ. The base current is now about 0.08 mA, so the transistor passes about 200 × 0.08 ≈ 17 mA: a glow, but the lamp wants 50 mA.',
        check: (c) => byRef(c, 'R1')?.value === 100_000 && between(Math.abs(currentOf(c, parts(c, 'lamp')[0])), 0.01, 0.025),
      },
    ],
    experiment: [
      {
        id: 'too-small',
        text: 'More must be better? Change R1 to 100 Ω…',
        hint: '8.3 V across 100 Ω is 83 mA, and 0.7 W of heat in a ¼ W resistor.',
        check: (c) => byRef(c, 'R1')?.value === 100 && (anyBurned(c) || powerOf(c, byRef(c, 'R1')) > 0.5),
      },
    ],
    challenge: [
      {
        id: 'design',
        text: 'Design challenge: undo the burnout (Ctrl+Z), then choose R1 so the lamp is fully on (at least 45 mA), with a base current 2–10 times the minimum (0.5–2.5 mA). Use R = 8.3 V ÷ base current.',
        hint: 'For three times the minimum, 0.75 mA: 8.3 ÷ 0.00075 ≈ 11 kΩ. 10 kΩ or 12 kΩ both work; anything from 3.3 kΩ to 15 kΩ passes.',
        check: (c) => {
          const q = parts(c, 'npn')[0];
          const lamp = parts(c, 'lamp')[0];
          return !anyBurned(c) && !!lamp && Math.abs(currentOf(c, lamp)) > 0.045 && between(pinCurrent(c, q, 0), 0.0005, 0.0025);
        },
      },
    ],
    why: {
      resistor: 'This is the base resistor: it decides how hard the transistor is turned on. Too big and the lamp stays dim; too small and it wastes power, or burns.',
    },
  },

  {
    id: 'night-light',
    track: 'components',
    title: 'Project: automatic night light',
    summary: 'A light sensor and a transistor turn an LED on when it gets dark.',
    minutes: 8,
    concept: [
      'Put together what you know: a light sensor in a voltage divider makes a voltage that changes with light, and a transistor switches on once its base gets about 0.7 V.',
      'Here the sensor sits between the base and the battery’s −, with R1 above it. In bright light the sensor’s resistance is low and it holds the base below 0.7 V: off. In the dark its resistance soars, R1 pulls the base up, and the transistor switches the LED on.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 180 },
        { kind: 'resistor', x: -60, y: 20, value: 100_000 },
        { kind: 'resistor', x: -60, y: -80, value: 470 },
        { kind: 'led', x: 80, y: -80 },
        { kind: 'npn', x: 140, y: 20 },
        { kind: 'ldr', x: 0, y: 100 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 4, 0],
        [0, 0, 2, 0],
        [2, 1, 3, 0],
        [3, 1, 4, 1],
        [4, 2, 0, 1],
      ],
    ),
    build: [
      {
        id: 'sensor',
        text: 'Right now nothing holds the base down, so the LED is always on. Wire the light sensor from the transistor’s base to the battery’s −.',
        hint: 'One sensor pin to the base (it can share the pin with R1’s wire), the other to the battery’s − terminal or the transistor’s emitter.',
        check: (c) => parts(c, 'ldr').some((l) => [0, 1].some((i) => joinedTo(c, l, i, 'npn', 0) && (joinedTo(c, l, 1 - i, 'battery', 1) || joinedTo(c, l, 1 - i, 'npn', 2)))),
      },
      {
        id: 'dark',
        text: 'Select the sensor and slide its light down towards dark. The LED comes on.',
        check: (c) => parts(c, 'ldr').some((l) => (l.light ?? 0.5) < 0.35) && ledCurrent(c) > 0.008,
      },
      {
        id: 'bright',
        text: 'Slide it up to bright: the LED switches off. Your night light works!',
        check: (c) => parts(c, 'ldr').some((l) => (l.light ?? 0.5) > 0.75) && ledCurrent(c) < 5e-4,
      },
    ],
    experiment: [
      {
        id: 'later',
        text: 'It comes on a little too early. Change R1 to 1 MΩ and set the light to the middle of its range: now the LED stays off until it’s properly dark. R1 sets the switching point.',
        check: (c) =>
          byRef(c, 'R1')?.value === 1_000_000 && parts(c, 'ldr').some((l) => between(l.light ?? 0.5, 0.4, 0.6)) && ledCurrent(c) < 5e-4,
      },
    ],
    why: {
      resistor: 'R1 and the sensor form a divider feeding the base. The bigger R1, the darker it has to get before the base reaches 0.7 V. R2 sets the LED current.',
      ldr: 'The sensor holds the base down in the light. In the dark its resistance rises, and the base voltage with it.',
    },
  },

  {
    id: 'diode-logic',
    track: 'components',
    title: 'Diode logic',
    summary: 'Two switches, two diodes, one LED: an OR gate, and why the diodes matter.',
    minutes: 7,
    concept: [
      'Diodes can steer current: they let signals join together without leaking back into each other.',
      'Here two switches each feed the same LED through their own diode. Close either one, and the LED lights: that’s an OR gate, one of the basic building blocks of every computer.',
      'A second LED, LED2, shows whether SW2’s side is powered. Watch it: the diodes keep each switch’s side separate.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 240 },
        { kind: 'switch', x: -180, y: -60 },
        { kind: 'switch', x: -180, y: 60 },
        { kind: 'diode', x: -40, y: -60 },
        { kind: 'diode', x: -40, y: 60 },
        { kind: 'resistor', x: 80, y: -60, value: 470 },
        { kind: 'led', x: 200, y: -60 },
        { kind: 'resistor', x: -40, y: 160, value: 1000 },
        { kind: 'led', x: 80, y: 160 },
      ],
      [
        [0, 0, 1, 0],
        [0, 0, 2, 0],
        [1, 1, 3, 0],
        [2, 1, 4, 0],
        [3, 1, 5, 0],
        [4, 1, 5, 0],
        [5, 1, 6, 0],
        [6, 1, 0, 1],
        [2, 1, 7, 0],
        [7, 1, 8, 0],
        [8, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'a',
        text: 'Close SW1 (click it). LED1 lights. LED2 stays dark: D2 stops the current flowing back into SW2’s side.',
        check: (c) => on(c, 'SW1') && !on(c, 'SW2') && lit(c, 'LED1') && !lit(c, 'LED2'),
      },
      {
        id: 'b',
        text: 'Open SW1 and close SW2. LED1 lights again (and LED2, which is on SW2’s side). Either switch will do: that’s OR.',
        check: (c) => !on(c, 'SW1') && on(c, 'SW2') && lit(c, 'LED1'),
      },
      {
        id: 'both',
        text: 'Close both. Still on: OR means either one, or both.',
        check: (c) => on(c, 'SW1') && on(c, 'SW2') && lit(c, 'LED1'),
      },
    ],
    experiment: [
      {
        id: 'no-diode',
        text: 'So why the diodes? Delete D2 and wire SW2’s side straight to R1. Then close only SW1: LED2 lights too, though SW2 is open. Without the diode, current leaks backwards into the other side.',
        check: (c) => parts(c, 'diode').length < 2 && on(c, 'SW1') && !on(c, 'SW2') && lit(c, 'LED1') && lit(c, 'LED2'),
      },
    ],
    why: {
      diode: 'Each diode lets its switch’s current through to the LED, but blocks current coming the other way, from the other switch.',
    },
  },
];
