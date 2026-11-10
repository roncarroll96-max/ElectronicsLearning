/** Foundations track: voltage, current, resistance, Ohm's law. */
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
  powerOf,
  probesAcross,
  probesAcrossPart,
  probesOn,
  starter,
  voltageAcross,
  wired,
} from './checks';
import type { Lesson } from './types';

/** Battery, resistor and LED wired in a loop (the circuit from lesson 1). */
const ledLoop = (ohms = 330) =>
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

export const FOUNDATIONS: Lesson[] = [
  {
    id: 'first-led',
    track: 'foundations',
    title: 'Light your first LED',
    summary: 'Build a complete circuit, and see why the LED needs a resistor.',
    minutes: 5,
    concept: [
      'Every circuit is a loop. Current flows out of the battery’s + terminal, through the parts, and back into its − terminal. Break the loop anywhere and everything stops.',
      'An LED (light-emitting diode) turns current into light. It’s fussy in two ways: it only works one way round, and it can’t limit its own current. Connected straight to a battery, it would take far too much current and burn out in a moment.',
      'So we add a resistor to limit the current to a safe amount. Once your LED is on, you’ll see exactly how its value was chosen.',
    ],
    build: [
      { id: 'battery', text: 'Add a battery: drag it from the Power section of the parts tray, or click it.', tray: ['battery'], check: (c) => has(c, 'battery') },
      { id: 'resistor', text: 'Add a resistor from the Passive section.', tray: ['resistor'], check: (c) => has(c, 'resistor') },
      { id: 'led', text: 'Add an LED from the Output section.', tray: ['led'], check: (c) => has(c, 'led') },
      {
        id: 'wire-1',
        text: 'Wire the battery’s + terminal to one end of the resistor: drag from one pin to the other.',
        hint: 'Pins are the small dots at the ends of each part. The battery’s + terminal is on its yellow end. Hover over a pin to see its name.',
        check: (c) => wired(c, 'battery', 0, 'resistor', null),
      },
      {
        id: 'wire-2',
        text: 'Wire the resistor’s other end to the LED’s anode (+), the pin on its left.',
        hint: 'The anode is the LED’s + side. Current must go in at the anode and out at the cathode.',
        check: (c) => parts(c, 'resistor').some((r) => [0, 1].some((i) => joinedTo(c, r, i, 'battery', 0) && joinedTo(c, r, 1 - i, 'led', 0))),
      },
      {
        id: 'wire-3',
        text: 'Close the loop: wire the LED’s cathode (−) back to the battery’s − terminal. Your LED should light up!',
        hint: 'If the LED stays dark, click “Why isn’t it working?” at the top left of the canvas.',
        check: (c) => ledLit(c),
      },
    ],
    experiment: [
      {
        id: 'dimmer',
        text: 'Select the resistor and read “Why this value?” below. Then drag its slider up to 1 kΩ: the LED dims, because less current flows.',
        check: (c) => parts(c, 'resistor').some((r) => (r.value ?? 0) >= 1000) && ledLit(c, 2e-3) && ledCurrent(c) < 0.012,
      },
      {
        id: 'too-small',
        text: 'Now slide it down to 100 Ω. What happens? (Replace the LED afterwards, or press Ctrl+Z.)',
        hint: 'With only 100 Ω, about 66 mA would flow: twice what an LED can take.',
        check: (c) => anyBurned(c) || ledCurrent(c) > 0.03,
      },
    ],
    why: {
      resistor: 'In this circuit the resistor has one job: to keep the LED’s current at a safe level.',
    },
  },

  {
    id: 'voltage',
    track: 'foundations',
    title: 'Voltage: the push',
    summary: 'Measure a battery with the multimeter, and see where its voltage goes.',
    minutes: 5,
    concept: [
      'Voltage is the push that drives current around a circuit. It’s measured in volts (V), and it’s always a difference between two points, like the difference in height between the top and bottom of a slide.',
      'A battery keeps a steady voltage between its terminals: about 9 V for this one. The parts in the loop use up that push as current flows through them. Add up the voltage across every part in a loop and you get back the battery’s voltage.',
      'You measure voltage with a voltmeter, placed across a part: one probe on each side.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 80 },
        { kind: 'lamp', x: 0, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      { id: 'meter', text: 'Open the multimeter: click the meter button in the toolbar at the bottom of the canvas.', check: (c) => c.meter.open },
      {
        id: 'battery',
        text: 'Make sure it’s set to V (volts). Drag the red probe onto the battery’s + terminal and the black probe onto its −.',
        hint: 'Drag a probe by its handle; its tip snaps onto the nearest pin.',
        check: (c) => probesOn(c, 'battery', 0, 1) && (meterValue(c, 'V') ?? 0) > 8,
      },
      {
        id: 'lamp',
        text: 'Now measure across the lamp: one probe on each of its pins. The lamp gets almost all of the battery’s voltage; the wires use practically none.',
        check: (c) => probesAcross(c, 'lamp') && Math.abs(meterValue(c, 'V') ?? 0) > 8,
      },
    ],
    experiment: [
      {
        id: 'half',
        text: 'Select the battery and choose 4.5 V. Half the push: watch how much dimmer the lamp gets.',
        check: (c) => parts(c, 'battery').some((b) => b.value === 4.5) && has(c, 'lamp'),
      },
      {
        id: 'measure-half',
        text: 'Measure across the lamp again. Does the meter agree with the battery?',
        check: (c) => probesAcross(c, 'lamp') && Math.abs(meterValue(c, 'V') ?? 0) > 4 && Math.abs(meterValue(c, 'V') ?? 0) < 4.6,
      },
    ],
  },

  {
    id: 'current',
    track: 'foundations',
    title: 'Current: the flow',
    summary: 'Measure current the right way (in series), and the wrong way.',
    minutes: 6,
    concept: [
      'Current is the flow of electric charge, measured in amps (A). Small circuits use thousandths of an amp: milliamps (mA).',
      'In a single loop, the same current flows through every part. Current doesn’t get used up, only the voltage does: 20 mA leaving the battery is 20 mA arriving back.',
      'To measure current, the meter has to be part of the loop so the current flows through it. That means opening the circuit and letting the meter bridge the gap: an ammeter goes in series.',
    ],
    starter: ledLoop(),
    build: [
      {
        id: 'open',
        text: 'Click the wire between the LED and the battery’s − terminal, then press Delete. The LED goes out: the loop is broken.',
        check: (c) => !anyBurned(c) && has(c, 'led') && !wired(c, 'led', 1, 'battery', 1) && ledCurrent(c) < 1e-6,
      },
      { id: 'amps', text: 'Open the multimeter and switch it to A (amps).', check: (c) => c.meter.open && c.meter.mode === 'A' && c.meter.fuseBlownAt === null },
      {
        id: 'bridge',
        text: 'Bridge the gap: red probe on the LED’s cathode, black probe on the battery’s −. The LED lights again, and the meter shows the current flowing through it: about 21 mA.',
        hint: 'Current goes in at the red probe and out at the black one, so the red probe goes on the side nearer the battery’s +.',
        check: (c) => (meterValue(c, 'A') ?? 0) > 0.015,
      },
    ],
    experiment: [
      {
        id: 'fuse',
        text: 'Now the classic mistake: keep the meter on A and put both probes across the battery (red on +, black on −). An ammeter is nearly a short circuit, so…',
        check: (c) => c.meter.fuseBlownAt !== null,
      },
      {
        id: 'replace',
        text: 'The fuse blew, just as it would on a real meter. Take the probes off the battery, then click “Replace the fuse”. Remember: an ammeter goes in series, never across a voltage.',
        hint: 'With the probes still across the battery, a new fuse would blow straight away.',
        check: (c) => c.meter.fuseBlownAt === null,
      },
    ],
  },

  {
    id: 'resistance',
    track: 'foundations',
    title: 'Resistance: the squeeze',
    summary: 'Measure resistance with the ohmmeter, and meet a resistor that changes with light.',
    minutes: 5,
    concept: [
      'Resistance is how hard it is for current to get through something. It’s measured in ohms (Ω): a wire has almost none, a resistor has exactly the amount printed on it, and air has so much that no current flows at all.',
      'Resistors are made in standard sizes, such as 1 kΩ (1,000 Ω) and 4.7 kΩ (4,700 Ω). Real ones are only made to within 1% or 5% of their value; in this simulator they’re exact.',
      'You measure resistance with an ohmmeter. It sends its own small current through the part, so the part must not be powered: a battery in the way would upset the measurement.',
    ],
    starter: starter(
      [
        { kind: 'resistor', x: -100, y: 0, value: 1000 },
        { kind: 'ldr', x: 100, y: 0 },
      ],
      [],
    ),
    build: [
      { id: 'ohms', text: 'Open the multimeter (toolbar, bottom of the canvas) and switch it to Ω (ohms).', check: (c) => c.meter.open && c.meter.mode === 'Ω' },
      {
        id: 'measure',
        text: 'Put one probe on each end of R1. It reads 1 kΩ. For resistance it doesn’t matter which probe goes where.',
        hint: 'Drag each probe by its handle until its tip snaps onto a pin.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'Ω'), 950, 1050),
      },
      {
        id: 'change',
        text: 'Select R1 and drag its value slider to 4.7 kΩ. The meter follows.',
        check: (c) => byRef(c, 'R1')?.value === 4700 && probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'Ω'), 4600, 4800),
      },
    ],
    experiment: [
      {
        id: 'dark',
        text: 'Now measure the light sensor (LDR1). Its resistance depends on the light falling on it. Select it and slide its light all the way down to dark.',
        hint: 'The light slider is in the inspector, under “Selected part”.',
        check: (c) => probesAcrossPart(c, byRef(c, 'LDR1')) && meterMag(c, 'Ω') > 200_000,
      },
      {
        id: 'bright',
        text: 'Slide it up to bright. From about 1 MΩ in the dark down to a few hundred ohms in bright light: that change is how circuits sense light.',
        check: (c) => probesAcrossPart(c, byRef(c, 'LDR1')) && meterMag(c, 'Ω') < 2000,
      },
    ],
  },

  {
    id: 'ohms-law',
    track: 'foundations',
    title: 'Ohm’s law',
    summary: 'V = I × R: predict a current, measure it, then design with it.',
    minutes: 8,
    concept: [
      'Resistance is how strongly something resists current, measured in ohms (Ω). Voltage, current and resistance are tied together by one simple rule, Ohm’s law: V = I × R.',
      'Rearranged, it answers most design questions: I = V ÷ R tells you the current, and R = V ÷ I tells you which resistor you need. Double the resistance and the current halves.',
      'Engineers then round to a standard value, because resistors are only made in set sizes, and check the power: P = V × I.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 80 },
        { kind: 'resistor', x: 0, y: -40, value: 1000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'volts',
        text: 'Measure the voltage across the 1 kΩ resistor: meter on V, one probe on each of its pins.',
        check: (c) => probesAcross(c, 'resistor') && Math.abs(meterValue(c, 'V') ?? 0) > 8,
      },
      {
        id: 'amps',
        text: 'Ohm’s law predicts the current: I = V ÷ R = 9 V ÷ 1000 Ω = 9 mA. Check it: delete one wire and bridge the gap with the meter on A.',
        hint: 'Exactly as in the Current lesson: an ammeter goes in series. Expect slightly under 9 mA: the battery itself has a little resistance.',
        check: (c) => {
          const a = Math.abs(meterValue(c, 'A') ?? 0);
          return a > 0.0085 && a < 0.0092;
        },
      },
      {
        id: 'double',
        text: 'Change the resistor to 2.2 kΩ (select it and use the slider). Ohm’s law says 9 ÷ 2200 = 4.1 mA. Does the meter, or the resistor’s live readings, agree?',
        check: (c) =>
          parts(c, 'resistor').some((r) => r.value === 2200 && Math.abs(currentOf(c, r)) > 0.0039 && Math.abs(currentOf(c, r)) < 0.0042),
      },
    ],
    experiment: [],
    challenge: [
      {
        id: 'design',
        text: 'Design challenge: put the multimeter away, then add an LED in series with the resistor and make it draw between 14 and 16 mA from the 9 V battery. Work out the resistor first: the LED uses about 2 V, so R = (9 − 2) ÷ 0.015 = ?',
        hint: '7 ÷ 0.015 = 467 Ω. That isn’t a standard value; the nearest one is 470 Ω. (An ammeter left across the gap would short out your LED.)',
        tray: ['led'],
        check: (c) => {
          const i = ledCurrent(c);
          return i >= 0.014 && i <= 0.016;
        },
      },
    ],
  },

  {
    id: 'power',
    track: 'foundations',
    title: 'Power: why parts get hot',
    summary: 'P = V × I, the ¼ W resistor, and rounding the safe way.',
    minutes: 6,
    concept: [
      'Power is how fast energy is used, measured in watts (W). For any part, power = voltage across it × current through it: P = V × I.',
      'In a resistor all of that power turns into heat. A small resistor like ours is rated at ¼ W (250 mW). Give it more and it runs hot; give it much more and it burns.',
      'Combining P = V × I with Ohm’s law gives a handy shortcut: P = V² ÷ R. Smaller resistance means more current, and more heat.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 80 },
        { kind: 'resistor', x: 0, y: -40, value: 1000 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      {
        id: 'p470',
        text: 'Select the resistor and look at its live readings: 9 V × 9 mA = 81 mW. Now change it to 470 Ω: 9 V × 19 mA ≈ 170 mW, still under its 250 mW rating.',
        check: (c) => byRef(c, 'R1')?.value === 470 && between(powerOf(c, byRef(c, 'R1')), 0.15, 0.19),
      },
    ],
    experiment: [
      {
        id: 'hot',
        text: 'Change it to 220 Ω: about 370 mW. It’s marked as running hot. A real one would be too hot to touch.',
        check: (c) => byRef(c, 'R1')?.value === 220 && !anyBurned(c) && powerOf(c, byRef(c, 'R1')) > 0.25,
      },
      {
        id: 'burn',
        text: 'Now 100 Ω: 9 V × 89 mA = 0.8 W, more than three times its rating. Watch…',
        check: (c) => anyBurned(c) || powerOf(c, byRef(c, 'R1')) > 0.5,
      },
    ],
    challenge: [
      {
        id: 'safe',
        text: 'Design challenge: undo the burnout (Ctrl+Z), then find the smallest standard resistor that stays under ¼ W on 9 V. Use P = V² ÷ R, turned around: R = V² ÷ P = 81 ÷ 0.25 = ?',
        hint: '81 ÷ 0.25 = 324 Ω. That isn’t a standard value. Round up, never down: rounding down would overload it. The next standard value up is 330 Ω.',
        check: (c) => {
          const r = byRef(c, 'R1');
          return r?.value === 330 && !r.burn && between(powerOf(c, r), 0.2, 0.25);
        },
      },
    ],
    why: {
      resistor: 'Here the resistor is the whole load: all of the battery’s power turns into heat inside it.',
    },
  },

  {
    id: 'series',
    track: 'foundations',
    title: 'Series circuits',
    summary: 'One path: the current is shared by all, the voltage is split between them.',
    minutes: 6,
    concept: [
      'Parts are in series when they are connected end to end, so there’s only one path for the current. The same current flows through every one of them.',
      'Their resistances add up: 1 kΩ + 2.2 kΩ + 3.3 kΩ = 6.5 kΩ. The battery’s voltage is shared between them in proportion: the biggest resistor gets the biggest share.',
      'Break the loop anywhere and the current stops everywhere, like a string of old Christmas lights where one dead bulb blacks out the lot.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'resistor', x: -140, y: -40, value: 1000 },
        { kind: 'resistor', x: 0, y: -40, value: 2200 },
        { kind: 'resistor', x: 140, y: -40, value: 3300 },
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
        id: 'v1',
        text: 'Measure across R1 (meter on V): about 1.4 V.',
        hint: 'Open the multimeter from the toolbar, then put one probe on each of R1’s pins.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R1')) && between(meterMag(c, 'V'), 1.2, 1.6),
      },
      {
        id: 'v3',
        text: 'Now R2 (about 3 V), then R3: about 4.6 V. Add them up: 1.4 + 3 + 4.6 = 9 V, the whole battery. The bigger the resistor, the bigger its share.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R3')) && between(meterMag(c, 'V'), 4.3, 4.8),
      },
      {
        id: 'current',
        text: 'The current is the same everywhere in the loop. Check it: delete the wire between R1 and R2, and bridge the gap with the meter on A. About 1.4 mA: 9 V ÷ 6.5 kΩ.',
        hint: 'Red probe on R1’s free pin, black on R2’s.',
        check: (c) => between(meterMag(c, 'A'), 0.0013, 0.0015),
      },
    ],
    experiment: [
      {
        id: 'grow',
        text: 'Put the wire back, then change R2 to 10 kΩ. Its share of the voltage jumps to about 6.3 V, and the current falls for everyone.',
        check: (c) => byRef(c, 'R2')?.value === 10_000 && between(voltageAcross(c, byRef(c, 'R2')!), 6.0, 6.6),
      },
      {
        id: 'break',
        text: 'Put the meter away and delete any one wire. Everything stops: in series, one break stops the lot.',
        check: (c) => !c.meter.open && has(c, 'resistor', 3) && parts(c, 'resistor').every((r) => Math.abs(currentOf(c, r)) < 1e-9),
      },
    ],
  },

  {
    id: 'parallel',
    track: 'foundations',
    title: 'Parallel circuits',
    summary: 'Side by side: every branch gets the full voltage, and the currents add up.',
    minutes: 6,
    concept: [
      'Parts are in parallel when they are connected side by side, both ends joined, so each has its own path. Every branch gets the battery’s full voltage.',
      'Each branch takes its own current, and the battery supplies the total: two 50 mA lamps draw 100 mA together.',
      'Breaking one branch leaves the others working. That’s why the lights and sockets in a house are wired in parallel.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'lamp', x: -60, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      { id: 'second', text: 'Add a second lamp from the Output section.', tray: ['lamp'], check: (c) => has(c, 'lamp', 2) },
      {
        id: 'parallel',
        text: 'Wire it side by side with the first: one of its pins to each of L1’s pins. Both lamps glow fully.',
        hint: 'A pin can take more than one wire. Wire L2’s left pin to L1’s left pin, and L2’s right pin to L1’s right pin.',
        check: (c) => parts(c, 'lamp').filter((l) => Math.abs(currentOf(c, l)) > 0.04).length >= 2,
      },
      {
        id: 'measure',
        text: 'Measure across the new lamp (meter on V): almost the full 9 V. In parallel, each branch gets the whole voltage.',
        check: (c) => probesAcrossPart(c, byRef(c, 'L2')) && meterMag(c, 'V') > 8.5,
      },
    ],
    experiment: [
      {
        id: 'total',
        text: 'Measure the total current: delete the wire to the battery’s − terminal and bridge the gap with the meter on A. About 100 mA: the two lamps’ 50 mA added together.',
        hint: 'If the wire you delete goes to only one lamp, you’ll measure just that lamp’s 50 mA. Choose a wire that carries both lamps’ current.',
        check: (c) => between(meterMag(c, 'A'), 0.09, 0.105),
      },
      {
        id: 'switch',
        text: 'Put the meter away and repair the wire. Then add a switch in one lamp’s branch only, and leave it open. That lamp goes out, but the other stays bright.',
        hint: 'Delete one of the second lamp’s wires, then wire the switch into the gap.',
        tray: ['switch'],
        check: (c) => {
          const lamps = parts(c, 'lamp').map((l) => Math.abs(currentOf(c, l)));
          return parts(c, 'switch').some((s) => !s.on) && lamps.some((i) => i > 0.04) && lamps.some((i) => i < 1e-4);
        },
      },
      {
        id: 'close',
        text: 'Click the switch to close it: both on again. Each branch has its own path, and its own switch.',
        check: (c) =>
          parts(c, 'switch').some((s) => s.on) && parts(c, 'lamp').filter((l) => Math.abs(currentOf(c, l)) > 0.04).length >= 2,
      },
    ],
  },

  {
    id: 'divider',
    track: 'foundations',
    title: 'Voltage dividers',
    summary: 'Two resistors make any voltage you need, and a knob makes it adjustable.',
    minutes: 7,
    concept: [
      'Two resistors in series share the battery’s voltage in proportion to their sizes. Take the voltage from the point between them and you have a voltage divider: a way to make a smaller voltage from a bigger one.',
      'The rule: Vout = Vin × R2 ÷ (R1 + R2), where R2 is the resistor you measure across. Two equal resistors give exactly half.',
      'A potentiometer is a divider in a single part: one long resistor with a sliding contact (the wiper) between its ends. Volume knobs and many sensors work this way.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'resistor', x: -80, y: -40, value: 10_000 },
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
        id: 'half',
        text: 'Measure across R2 (meter on V). Two equal resistors split the 9 V in half: 4.5 V.',
        check: (c) => probesAcrossPart(c, byRef(c, 'R2')) && between(meterMag(c, 'V'), 4.3, 4.7),
      },
      {
        id: 'unequal',
        text: 'Change R1 to 22 kΩ and measure R2 again. Now R2 gets less: 9 × 10 ÷ (22 + 10) ≈ 2.8 V.',
        check: (c) => byRef(c, 'R1')?.value === 22_000 && probesAcrossPart(c, byRef(c, 'R2')) && between(meterMag(c, 'V'), 2.6, 3.0),
      },
    ],
    experiment: [
      {
        id: 'pot',
        text: 'Add a potentiometer. Wire its End B to the battery’s +, its End A to the battery’s −, then measure from its wiper (red probe) to End A (black): 4.5 V with the knob in the middle.',
        hint: 'Hover over the potentiometer’s pins to see their names. The wiper is the pin on top.',
        tray: ['potentiometer'],
        check: (c) => probesOn(c, 'potentiometer', 2, 0) && between(meterMag(c, 'V'), 3.5, 5.5),
      },
      {
        id: 'turn',
        text: 'Select the potentiometer and move its slider. The voltage follows it, anywhere from 0 to 9 V.',
        check: (c) => probesOn(c, 'potentiometer', 2, 0) && (meterMag(c, 'V') < 2 || meterMag(c, 'V') > 7),
      },
    ],
    why: {
      resistor: 'In a divider, it’s the ratio of the two resistors that sets the voltage; their size only sets how much current the divider wastes.',
    },
  },

  {
    id: 'switches',
    track: 'foundations',
    title: 'Switches and logic',
    summary: 'Open and close the loop, then build AND and OR from switches.',
    minutes: 7,
    concept: [
      'A switch is a deliberate break in the loop. Closed, it’s like a wire; open, it’s a gap that no current can cross.',
      'A toggle switch stays where you put it. A push button only closes while you hold it down, like a doorbell.',
      'Combine switches and you get logic. Two in series: the lamp lights only if the first AND the second are closed. Two in parallel: either one OR the other will do. Computers are built from exactly these ideas.',
    ],
    starter: starter(
      [
        { kind: 'battery', x: 0, y: 100 },
        { kind: 'lamp', x: -60, y: -40 },
      ],
      [
        [0, 0, 1, 0],
        [1, 1, 0, 1],
      ],
    ),
    build: [
      { id: 'add', text: 'Add a switch from the Input section.', tray: ['switch'], check: (c) => has(c, 'switch') },
      {
        id: 'wire',
        text: 'Put it in the loop: delete the wire from the lamp to the battery’s −, and wire the switch into the gap. The lamp goes out: the switch starts open.',
        check: (c) => parts(c, 'switch').some((s) => !s.on && bridges(c, s, 'lamp', 'battery')),
      },
      {
        id: 'on',
        text: 'Click the switch to close it. The lamp lights: the loop is complete.',
        check: (c) => parts(c, 'switch').some((s) => s.on) && parts(c, 'lamp').some((l) => Math.abs(currentOf(c, l)) > 0.04),
      },
      {
        id: 'off',
        text: 'Click it again to open it, and the lamp goes out.',
        check: (c) => parts(c, 'switch').every((s) => !s.on) && parts(c, 'lamp').every((l) => Math.abs(currentOf(c, l)) < 1e-4),
      },
    ],
    experiment: [
      {
        id: 'or',
        text: 'Add a push button and wire it across the switch: one of its pins to each of the switch’s pins. Leave the switch open, then press and hold the button. Either one lights the lamp: that’s OR.',
        tray: ['pushbutton'],
        check: (c) =>
          parts(c, 'pushbutton').some((b) => b.on) &&
          parts(c, 'switch').every((s) => !s.on) &&
          parts(c, 'lamp').some((l) => Math.abs(currentOf(c, l)) > 0.04),
      },
    ],
    challenge: [
      {
        id: 'and-1',
        text: 'Design challenge: rewire it so the lamp lights only when the switch AND the button are both closed, like a machine that needs two hands to start. First close the switch on its own: the lamp must stay dark.',
        hint: 'For AND, the current has to pass through both, one after the other: put the button in series with the switch, not across it.',
        check: (c) =>
          has(c, 'pushbutton') &&
          !anyBurned(c) &&
          parts(c, 'switch').some((s) => s.on) &&
          parts(c, 'pushbutton').every((b) => !b.on) &&
          parts(c, 'lamp').every((l) => Math.abs(currentOf(c, l)) < 1e-4),
      },
      {
        id: 'and-2',
        text: 'Now hold the button too. The lamp lights only with both closed.',
        check: (c) =>
          parts(c, 'switch').some((s) => s.on) &&
          parts(c, 'pushbutton').some((b) => b.on) &&
          parts(c, 'lamp').some((l) => Math.abs(currentOf(c, l)) > 0.04),
      },
    ],
  },
];
