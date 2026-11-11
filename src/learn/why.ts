/**
 * "Why this value?": for any part, the goal it serves, the reasoning, and how
 * its value is chosen (standard values, tolerance, safety margin), worked out
 * with the numbers from the learner's own circuit. Plain English first; the
 * formulas go in `math`, shown behind a "Show the math" button.
 */
import type { Circuit, Part } from '../model/circuit';
import { AC_DEFAULT_F, UNO, formatFreq, formatReading, formatValue } from '../model/parts';
import { E6, standardDown, standardUp } from '../model/values';
import { inductorResistance, ldrResistance } from '../sim/models';
import type { PartReading, SimResult } from '../sim/simulate';
import { neighborOfKind, others, seriesPartner, topology, type PinAt, type Topology } from './topology';

export interface Why {
  /** The part's job in this circuit, e.g. "LED current limiter". */
  role: string;
  goal: string;
  reasoning: string;
  choice?: string;
  /** What the learner's own value does, from the simulation. */
  yours?: string;
  math: string[];
}

interface Ctx {
  c: Circuit;
  t: Topology;
  supply: number;
  r?: PartReading;
}

/* ---------- Number formatting ---------- */

const n3 = (x: number) => String(parseFloat(x.toPrecision(3)));
const A = (x: number) => formatReading(Math.abs(x), 'A');
const V = (x: number) => formatReading(x, 'V');
const W = (x: number) => formatReading(Math.abs(x), 'W');
const R = (x: number) => formatValue(x, 'Ω');
const F = (x: number) => formatValue(x, 'F');
function time(t: number): string {
  if (t >= 1) return `${n3(t)} s`;
  if (t >= 1e-3) return `${n3(t * 1e3)} ms`;
  return `${n3(t * 1e6)} µs`;
}

/* ---------- Entry point ---------- */

export function whyThisValue(part: Part, c: Circuit, sim: SimResult): Why {
  const ctx: Ctx = {
    c,
    t: topology(c),
    supply: c.parts.find((p) => p.kind === 'battery')?.value ?? 9,
    r: sim.ok && !sim.idle && !part.burn ? sim.parts.get(part.id) : undefined,
  };
  switch (part.kind) {
    case 'resistor':
      return resistor(part, ctx);
    case 'led':
      return led(part, ctx);
    case 'battery':
      return battery(part, ctx);
    case 'capacitor':
      return capacitor(part, ctx);
    case 'npn':
      return npn(part, ctx);
    case 'diode':
      return diode(part, ctx);
    case 'lamp':
      return lamp(part, ctx);
    case 'buzzer':
      return {
        role: 'Sound maker',
        goal: 'Beep when power reaches it.',
        reasoning:
          'This is an active buzzer: it has its own tiny oscillator inside, so it only needs steady (DC) power, 3–12 V at about 15–30 mA. It is polarized: its + leg goes toward the battery’s +.',
        yours: ctx.r ? (ctx.r.i[0] > 0.005 ? `It’s sounding, drawing ${A(ctx.r.i[0])}.` : 'It’s silent: not enough current reaches it.') : undefined,
        math: [],
      };
    case 'speaker':
      return {
        role: 'Sound maker',
        goal: 'Turn a changing current into sound: the current pushes the cone in and out, and the cone pushes the air.',
        reasoning:
          'Unlike a buzzer, a speaker has no oscillator of its own: steady (DC) current just holds the cone pushed out, silently. To make a tone, the circuit has to change the current hundreds or thousands of times a second; the pitch you hear is how many times a second it changes. Its coil is only 8 Ω, so it always needs something limiting the current.',
        yours: ctx.r
          ? Math.abs(ctx.r.i[0]) > 1e-4
            ? `${A(Math.abs(ctx.r.i[0]))} flows through it right now. If that current is changing quickly, you hear a tone (turn the sound on in the top bar).`
            : 'Almost no current flows through it, so it is silent.'
          : undefined,
        math: ctx.r ? [`Power = I² × R = (${A(Math.abs(ctx.r.i[0]))})² × 8 Ω = ${W(ctx.r.i[0] ** 2 * 8)} (it takes about 0.5 W)`] : [],
      };
    case 'switch':
    case 'pushbutton':
      return {
        role: part.kind === 'switch' ? 'On/off control' : 'Momentary control',
        goal: 'Open or close the loop, so you control whether current can flow.',
        reasoning:
          part.kind === 'switch'
            ? 'Closed, a switch has almost no resistance (about 0.01 Ω); open, it is a gap that no current crosses. Put it anywhere in the loop: a series circuit is broken wherever the gap is.'
            : 'A push button only conducts while it is held down, like a doorbell. Springs push it open again when you let go.',
        yours: ctx.r ? (Math.abs(ctx.r.i[0]) > 1e-9 ? `Closed: ${A(ctx.r.i[0])} flows through it.` : 'Open: no current flows.') : undefined,
        math: [],
      };
    case 'potentiometer':
      return pot(part, ctx);
    case 'ldr':
      return {
        role: 'Light sensor',
        goal: 'Sense light: its resistance falls as light increases.',
        reasoning:
          'A light-dependent resistor is about 1 MΩ in darkness, 10–20 kΩ in room light and about 500 Ω in bright light. Paired with a fixed resistor (a voltage divider), that change becomes a voltage the rest of the circuit can use, for example to switch a transistor on at night.',
        yours: `At ${Math.round((part.light ?? 0.5) * 100)}% light it measures ${R(ldrResistance(part.light ?? 0.5))}.`,
        math: [],
      };
    case 'acsource':
      return acsource(part, ctx);
    case 'inductor':
      return inductor(part, ctx);
    case 'transformer':
      return transformer(part, ctx);
    case 'bridge':
      return {
        role: 'Rectifier',
        goal: 'Turn AC, which flows both ways, into DC that flows one way only.',
        reasoning:
          'Inside are four diodes in a diamond. Whichever way the AC pushes, two of them conduct and steer the current out of the + pin and back in at the − pin, so both halves of the wave come out pointing the same way (“full-wave” rectification). A single diode would pass only one half and waste the other (“half-wave”). The output still rises and falls 100 times a second for 50 Hz AC; a big capacitor across + and − fills in the dips.',
        yours: ctx.r ? `Its DC output is ${V(ctx.r.v[2] - ctx.r.v[3])} right now.` : undefined,
        math: ['Peak DC out ≈ AC peak − 2 × 0.7 V (two diodes conduct at a time)', 'Ripple ≈ I_load ÷ (2 × f × C) for full-wave'],
      };
    case 'timer555':
      return timer555(part, ctx);
    case 'arduino': {
      const r = ctx.r;
      const vcc = r ? r.v[UNO.v5] - r.v[UNO.gnd] : 5;
      return {
        role: 'Microcontroller board',
        goal: 'Run a program that reads its input pins and switches its output pins: a small computer that controls a circuit.',
        reasoning:
          'The Arduino Uno’s chip, an ATmega328P, runs your sketch 16 million steps a second. Each of pins D0–D13 and A0–A5 can be an output (connected inside to 5 V or to GND through about 25 Ω, which is why an output pin can light an LED but sags under heavy load) or an input (which reads HIGH above about 3 V and LOW below about 1.5 V, drawing almost no current). A0–A5 can also measure a voltage, 0–5 V as a number from 0 to 1023. Power comes from USB, and its 5V and 3.3V pins can supply the rest of a small circuit.',
        choice: 'Keep each pin to 20 mA (40 mA is the absolute maximum, and past it the pin or the whole chip can die): an LED on a pin needs a resistor, 220 Ω is typical.',
        yours: r ? `Its 5V pin is at ${V(vcc)}.` : undefined,
        math: ['Pin current = (5 V − LED voltage) ÷ (R + 25 Ω)', 'analogRead = V_pin ÷ V_5V × 1023'],
      };
    }
    case 'ground':
      return {
        role: '0 V reference',
        goal: 'Mark the point all voltages are measured from.',
        reasoning:
          'Voltage is always a difference between two points. Ground names one point “0 V” so every other voltage has a meaning. All ground symbols are connected to each other, even without a wire drawn between them.',
        math: [],
      };
  }
}

/* ---------- Timing predictions ---------- */

const RESISTIVE = ['resistor', 'ldr', 'potentiometer'] as const;

function ohms(p: Part): number {
  return p.kind === 'ldr' ? ldrResistance(p.light ?? 0.5) : (p.value ?? 0);
}

/** A resistor-like part with one pin on net a and the other on net b. */
function resistorBetween(t: Topology, c: Circuit, a: PinAt, b: PinAt): Part | null {
  for (const p of c.parts) {
    if (!(RESISTIVE as readonly string[]).includes(p.kind)) continue;
    const pa = { part: p.id, pin: 0 };
    const pb = { part: p.id, pin: 1 };
    const ra = { part: a.part.id, pin: a.pin };
    const rb = { part: b.part.id, pin: b.pin };
    if ((t.joined(pa, ra) && t.joined(pb, rb)) || (t.joined(pa, rb) && t.joined(pb, ra))) return p;
  }
  return null;
}

export interface Timing {
  /** The lines for "Show the math", with the learner's own values. */
  math: string[];
  /** One plain sentence with the prediction. */
  summary: string;
}

/** How a 555 is wired (astable or one-shot), and the timing its parts predict. */
export function timing555(u: Part, c: Circuit, t: Topology = topology(c)): Timing | null {
  const pin = (n: number): PinAt => ({ part: u, pin: n });
  const cap = c.parts.find((p) => p.kind === 'capacitor' && [0, 1].some((i) => t.joined({ part: p.id, pin: i }, { part: u.id, pin: 5 })));
  if (!cap) return null;
  const C = cap.value ?? 10e-6;
  const thrDis = t.joined({ part: u.id, pin: 5 }, { part: u.id, pin: 6 });
  if (thrDis) {
    const r = resistorBetween(t, c, pin(7), pin(5));
    if (!r) return null;
    const T = 1.1 * ohms(r) * C;
    return {
      summary: `Wired as a one-shot: each trigger gives a pulse of about ${time(T)}.`,
      math: [`Pulse = 1.1 × ${r.ref} × ${cap.ref} = 1.1 × ${R(ohms(r))} × ${F(C)} = ${time(T)}`],
    };
  }
  const ra = resistorBetween(t, c, pin(7), pin(6));
  const rb = resistorBetween(t, c, pin(6), pin(5));
  if (!ra || !rb || !t.joined({ part: u.id, pin: 5 }, { part: u.id, pin: 1 })) return null;
  const a = ohms(ra);
  const b = ohms(rb);
  const hi = 0.693 * (a + b) * C;
  const lo = 0.693 * b * C;
  const f = 1 / (hi + lo);
  return {
    summary: `Wired as an astable: it should run at about ${formatFreq(f)} (high ${time(hi)}, low ${time(lo)}). Probe the output and compare with the scope’s reading.`,
    math: [
      `High time = 0.693 × (${ra.ref} + ${rb.ref}) × ${cap.ref} = 0.693 × ${R(a + b)} × ${F(C)} = ${time(hi)}`,
      `Low time = 0.693 × ${rb.ref} × ${cap.ref} = 0.693 × ${R(b)} × ${F(C)} = ${time(lo)}`,
      `f = 1 ÷ (high + low) = 1.44 ÷ ((${ra.ref} + 2·${rb.ref}) × ${cap.ref}) = ${formatFreq(f)}`,
    ],
  };
}

/**
 * A capacitor in a two-transistor blinker: one pin on a transistor's base.
 * Its half of the cycle lasts about 0.69 × R × C, R being that base's resistor.
 */
export function blinkerHalf(cap: Part, c: Circuit, t: Topology = topology(c)): { r: Part; half: number } | null {
  for (const i of [0, 1]) {
    const net = t.net({ part: cap.id, pin: i });
    const base = net.find((x) => x.part.kind === 'npn' && x.pin === 0);
    if (!base) continue;
    const other = t.net({ part: cap.id, pin: 1 - i });
    if (!other.some((x) => x.part.kind === 'npn' && x.pin === 1)) continue;
    const r = net.find((x) => (RESISTIVE as readonly string[]).includes(x.part.kind) && x.part.id !== cap.id);
    if (!r) continue;
    return { r: r.part, half: Math.LN2 * ohms(r.part) * (cap.value ?? 10e-6) };
  }
  return null;
}

/* ---------- AC, coils and the 555 ---------- */

function acsource(part: Part, ctx: Ctx): Why {
  const vp = part.value ?? 5;
  const f = part.freq ?? AC_DEFAULT_F;
  const wave = part.wave ?? 'sine';
  return {
    role: 'Signal source',
    goal: 'Make a voltage that keeps changing direction: alternating current (AC).',
    reasoning:
      'A battery always pushes the same way (DC). This source pushes one way, then the other, over and over: mains power does this 50 or 60 times a second, and audio signals hundreds or thousands of times a second. The peak voltage is how far it swings each way; the frequency is how many complete swings it makes each second. Watch it on the oscilloscope to see the wave shape.',
    choice: 'Pick the frequency for what you’re testing: low (1–10 Hz) to watch things slowly, 50 Hz like mains, or hundreds of hertz and up for sounds.',
    yours: `It swings between +${V(vp)} and −${V(vp)}, ${formatFreq(f)} (${n3(f)} complete ${wave} waves every second, each lasting ${time(1 / f)}).${ctx.r ? ` Right now ${A(ctx.r.i[0])} flows through it.` : ''}`,
    math: [
      `Period T = 1 ÷ f = 1 ÷ ${n3(f)} Hz = ${time(1 / f)}`,
      ...(wave === 'sine' ? [`rms voltage = peak ÷ √2 = ${V(vp / Math.SQRT2)} (the steady DC voltage that would heat a resistor as much)`] : []),
    ],
  };
}

function inductor(part: Part, ctx: Ctx): Why {
  const l = part.value ?? 0.01;
  const r = inductorResistance(l);
  const i = ctx.r?.i[0] ?? 0;
  return {
    role: 'Coil (inductor)',
    goal: 'Resist changes in current: it stores energy in a magnetic field.',
    reasoning:
      'An inductor is a coil of wire. Current through it builds a magnetic field, and building or collapsing that field takes time, so the current through a coil can’t change suddenly: switched on, it rises gradually; switched off, the coil fights to keep it flowing, sometimes with a big voltage spike. It is the mirror image of a capacitor, whose voltage can’t jump. Once the current is steady, a coil is just a piece of wire (here about ' +
      R(r) +
      ' of winding resistance).',
    choice: 'With a resistor R, current builds up with time constant τ = L ÷ R: after about 5τ it has finished changing.',
    yours: ctx.r ? `${A(i)} flows through it, storing ${formatReading(0.5 * l * i * i, 'W').replace('W', 'J')}.` : undefined,
    math: [`Winding resistance ≈ ${R(r)}`, 'Energy stored = ½ × L × I²', 'Opposition to AC (reactance) X = 2π × f × L: more at higher frequencies'],
  };
}

function transformer(part: Part, ctx: Ctx): Why {
  const n = part.value ?? 0.5;
  const r = ctx.r;
  return {
    role: n < 1 ? 'Step-down transformer' : n > 1 ? 'Step-up transformer' : 'Isolating transformer',
    goal: 'Change an AC voltage up or down, with no wire between the two sides.',
    reasoning:
      'Two coils share an iron core. Changing current in the first (primary) coil makes a changing magnetic field, and that field makes a voltage in the second (secondary). The voltage changes by the ratio of their turns of wire. It only works while the current keeps changing, so it passes AC but not steady DC. Power can’t be created: stepping the voltage down steps the available current up by the same ratio.',
    choice: 'Turns ratio = secondary turns ÷ primary turns. A mains adapter uses about 0.05 to bring 230 V down to about 12 V.',
    yours: r
      ? `Its secondary has ${V(r.v[2] - r.v[3])} across it right now; the primary has ${V(r.v[0] - r.v[1])}.`
      : `Turns ratio ${n3(n)}: the secondary voltage is ${n3(n)} times the primary’s.`,
    math: [`V_secondary = V_primary × ${n3(n)}`, `I_secondary ≈ I_primary ÷ ${n3(n)} (the power is the same on both sides, less a little loss)`],
  };
}

function timer555(part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  const tm = timing555(part, ctx.c, ctx.t);
  const vcc = r ? r.v[7] - r.v[0] : ctx.supply;
  const high = r ? r.v[2] - r.v[0] > vcc / 2 : false;
  return {
    role: '555 timer',
    goal: 'Make timed pulses: a steady on–off rhythm (astable), or one pulse of set length when triggered (monostable).',
    reasoning:
      'Inside are a voltage divider, two comparators and a memory (a flip-flop). When the Trigger pin drops below ⅓ of the supply, the output switches high; when the Threshold pin rises above ⅔, the output switches low and the Discharge pin connects to ground. A capacitor charging and discharging between ⅓ and ⅔ of the supply therefore sets the timing, and resistors set how fast it charges. Reset held low stops everything.',
    choice: 'Astable: R1 from VCC to Discharge, R2 from Discharge to Threshold (tied to Trigger), C to ground. It runs at about 1.44 ÷ ((R1 + 2 R2) × C).',
    yours: [r ? `Its output is ${high ? 'high' : 'low'} (${V(r.v[2] - r.v[0])}), running from ${V(vcc)}.` : '', tm?.summary ?? ''].filter(Boolean).join(' ') || undefined,
    math: tm?.math ?? ['Astable frequency f = 1.44 ÷ ((R1 + 2·R2) × C)', 'High time = 0.693 × (R1 + R2) × C, low time = 0.693 × R2 × C', 'Monostable pulse = 1.1 × R × C'],
  };
}

/* ---------- Resistors ---------- */

function resistor(part: Part, ctx: Ctx): Why {
  const { t } = ctx;
  for (const pin of [0, 1]) {
    const partner = seriesPartner(t, part, pin);
    if (partner?.part.kind === 'led') return ledLimiter(part, partner, ctx);
  }
  const base = neighborOfKind(t, part, ['npn']);
  if (base && base.pin === 0) return baseResistor(part, base.part, ctx);
  for (const pin of [0, 1]) {
    const partner = seriesPartner(t, part, pin);
    if (partner && ['resistor', 'ldr'].includes(partner.part.kind)) return divider(part, partner, pin, ctx);
  }
  return plainResistor(part, ctx);
}

function ledLimiter(part: Part, led: PinAt, ctx: Ctx): Why {
  const vs = ctx.supply;
  const vr = vs - 2;
  const value = part.value ?? 0;
  const role = 'LED current limiter';
  const goal = `Limit the current through ${led.part.ref}. Once an LED turns on, its voltage barely changes, so without a resistor it would take as much current as the battery can push and burn out. The target is 15–20 mA: bright, but safely below the LED’s 30 mA maximum.`;
  if (vr < 0.5) {
    return {
      role,
      goal,
      reasoning: `A red LED needs about 2 V, and the battery only gives ${V(vs)}. There’s almost nothing left for a resistor to set the current with. Use a higher battery voltage.`,
      math: [],
    };
  }
  const ideal = vr / 0.02;
  const std = standardUp(ideal);
  const lo = std * 0.95;
  const hi = std * 1.05;
  const math = [
    `V(resistor) = V(battery) − V(LED) = ${vs} − 2 = ${n3(vr)} V`,
    `R = V ÷ I = ${n3(vr)} V ÷ 0.020 A = ${Math.round(ideal)} Ω  →  next standard value up: ${R(std)}`,
    `I = ${n3(vr)} V ÷ ${std} Ω = ${A(vr / std)}`,
    `P = V × I = ${n3(vr)} V × ${n3(vr / std)} A = ${W(vr * (vr / std))}  (rating: 0.25 W)`,
    `Tolerance ±5%: ${R(lo)} to ${R(hi)}  →  ${A(vr / hi)} to ${A(vr / lo)}`,
  ];
  let yours: string | undefined;
  const r = ctx.r;
  if (r) {
    const i = Math.abs(r.i[0]);
    math.push(`Yours: ${R(value)}  →  measured ${A(i)}, ${W(r.power)} of heat`);
    if (i > 0.03) yours = `Yours is ${R(value)}: ${A(i)} flows, more than the LED’s 30 mA maximum. Choose a larger value.`;
    else if (i < 0.001) yours = `Yours is ${R(value)}: only ${A(i)} flows, so the LED is dim or dark. A smaller value lets more current through.`;
    else
      yours = `Yours is ${R(value)}: ${A(i)} flows, ${Math.round(100 - (i / 0.03) * 100)}% below the LED’s 30 mA maximum, and it turns ${W(r.power)} into heat, ${r.power < 0.25 ? 'well within' : 'over'} its ¼ W rating.`;
  }
  return {
    role,
    goal,
    reasoning: `The LED uses about 2 V, so this resistor must take up the rest of the battery’s voltage: ${vs} − 2 = ${n3(vr)} V. Ohm’s law then gives the value: resistance = voltage ÷ current.`,
    choice: `${n3(vr)} V ÷ 20 mA = ${Math.round(ideal)} Ω. Resistors only come in standard values, so take the next one up: ${R(std)}, for about ${A(vr / std)}. Its gold band means ±5% tolerance, so a real one could be anywhere from ${R(lo)} to ${R(hi)}, giving ${A(vr / hi)} to ${A(vr / lo)}. That’s safe either way, with a comfortable margin below 30 mA.`,
    yours,
    math,
  };
}

function baseResistor(part: Part, q: Part, ctx: Ctx): Why {
  const vs = ctx.supply;
  const value = part.value ?? 0;
  // How much collector current the load needs: from a collector resistor if there is one, else 20 mA.
  const t = ctx.t;
  const load = others(t, q, 1).find((x) => x.part.kind === 'resistor');
  const ic = load ? (vs - 0.2) / (load.part.value ?? 1000) : 0.02;
  const ibMin = ic / 200;
  const ibTarget = ibMin * 10;
  const rb = (vs - 0.7) / ibTarget;
  const std = standardDown(rb);
  const math = [
    `Load current Ic ≈ ${load ? `(${vs} − 0.2) V ÷ ${R(load.part.value ?? 0)}` : 'about 20 mA'} = ${A(ic)}`,
    `Minimum base current = Ic ÷ β = ${A(ic)} ÷ 200 = ${A(ibMin)}`,
    `Aim for 10× that: ${A(ibTarget)}`,
    `R = (${vs} − 0.7) V ÷ ${A(ibTarget)} = ${R(rb)}  →  round down: ${R(std)}`,
  ];
  let yours: string | undefined;
  if (ctx.r) {
    const ib = Math.abs(ctx.r.i[0]);
    yours = `Yours is ${R(value)}: ${A(ib)} flows into ${q.ref}’s base. Select ${q.ref} to see whether that switches it fully on.`;
    math.push(`Yours: (${vs} − 0.7) V ÷ ${R(value)} ≈ ${A((vs - 0.7) / value)}`);
  }
  return {
    role: 'Transistor base resistor',
    goal: `Feed ${q.ref}’s base a small, controlled current that switches it on. The base behaves like a diode (about 0.7 V), so wired straight to the battery it would take a huge current and burn out.`,
    reasoning:
      'A transistor multiplies its base current by its gain (β, about 200 here, though it varies a lot from part to part). To make sure it switches fully on, designers give the base about ten times the minimum current it needs.',
    choice: `The load needs about ${A(ic)}, so the base needs at least ${A(ibMin)}; aim for ${A(ibTarget)}. The resistor drops ${vs} − 0.7 = ${n3(vs - 0.7)} V, so R = ${R(rb)}. Round down to ${R(std)}, because a little more base current is the safe side here.`,
    yours,
    math,
  };
}

function divider(part: Part, partner: PinAt, pin: number, ctx: Ctx): Why {
  const isLdr = partner.part.kind === 'ldr';
  const r1 = part.value ?? 0;
  const r2 = isLdr ? ldrResistance(partner.part.light ?? 0.5) : (partner.part.value ?? 0);
  const vs = ctx.supply;
  const math = [
    `Total resistance = ${R(r1)} + ${R(r2)} = ${R(r1 + r2)}`,
    `Current = ${vs} V ÷ ${R(r1 + r2)} = ${A(vs / (r1 + r2))}`,
    `This resistor’s share = ${vs} × ${R(r1)} ÷ ${R(r1 + r2)} = ${V((vs * r1) / (r1 + r2))}`,
  ];
  const mid = ctx.r ? ctx.r.v[pin] : undefined;
  return {
    role: isLdr ? 'Light-sensor divider' : 'Voltage divider',
    goal: isLdr
      ? `Turn ${partner.part.ref}’s changing resistance into a changing voltage, at the point between them, that the rest of the circuit can use.`
      : `Share the battery’s voltage with ${partner.part.ref}, making an in-between voltage at the point where they meet.`,
    reasoning:
      'In series, the same current flows through both, so each takes a share of the voltage in proportion to its resistance: twice the resistance, twice the voltage.',
    choice: isLdr
      ? 'Pick the fixed resistor close to the sensor’s resistance at the light level you care about: that’s where the middle voltage changes fastest. For room light (10–20 kΩ), 10 kΩ is the classic choice.'
      : 'The ratio sets the voltage; the size sets the current. Larger values waste less battery, but anything connected to the middle point disturbs a high-value divider more.',
    yours: mid !== undefined ? `The voltage between them is ${V(mid)}.` : undefined,
    math,
  };
}

function plainResistor(part: Part, ctx: Ctx): Why {
  const value = part.value ?? 0;
  const r = ctx.r;
  return {
    role: 'Current limiter',
    goal: 'Limit how much current flows: the bigger the resistance, the smaller the current for the same voltage.',
    reasoning:
      'Ohm’s law: current = voltage ÷ resistance. A resistor also turns electrical energy into heat (power = voltage × current), so it needs a power rating; small ones like this are ¼ W.',
    choice:
      'Resistors come in standard values (10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, then ×10, ×100…). The bands show its value, and the last band its tolerance: gold means within ±5%.',
    yours: r ? `It has ${V(Math.abs(r.v[0] - r.v[1]))} across it, so ${A(r.i[0])} flows (${n3(Math.abs(r.v[0] - r.v[1]))} V ÷ ${R(value)}), making ${W(r.power)} of heat.` : undefined,
    math: r
      ? [`I = V ÷ R = ${n3(Math.abs(r.v[0] - r.v[1]))} V ÷ ${R(value)} = ${A(r.i[0])}`, `P = V × I = ${W(r.power)}  (rating: 0.25 W)`]
      : [],
  };
}

/* ---------- Other parts ---------- */

function led(_part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  let yours: string | undefined;
  if (r) {
    const vf = r.v[0] - r.v[1];
    const i = r.i[0];
    if (vf < -0.5) yours = 'It’s backwards: its anode (+) faces the battery’s −, so it blocks all current.';
    else if (i < 1e-5) yours = `It’s off: ${V(vf)} across it isn’t enough to turn it on (a red LED needs about 1.7–2 V).`;
    else {
      const look = i < 0.001 ? 'dimly lit' : i < 0.005 ? 'lit' : i <= 0.03 ? 'brightly lit' : 'overloaded';
      yours = `${V(vf)} across it and ${A(i)} through it: ${look}.`;
    }
  }
  return {
    role: 'Light',
    goal: 'Turn current into light. Brightness follows current: about 5 mA is clearly lit, 20 mA is full brightness, 30 mA is the maximum.',
    reasoning:
      'An LED only conducts one way, from anode (+, the longer leg) to cathode (−). It needs about 2 V before it lights (red; blue and white need about 3 V). Above that, its voltage hardly changes however much current flows, which is why a resistor in series must set the current.',
    choice: 'Red LEDs need the least voltage, so they work from the smallest batteries. A typical design current is 15–20 mA.',
    yours,
    math: r ? [`Brightness ∝ current: ${A(r.i[0])} of 20 mA = ${Math.round((r.i[0] / 0.02) * 100)}%`] : [],
  };
}

function battery(part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  const vs = part.value ?? 9;
  let yours: string | undefined;
  const math: string[] = [];
  if (r) {
    const i = -r.i[0];
    yours = `${V(r.v[0] - r.v[1])} at its terminals, supplying ${A(i)}.`;
    math.push(`V(terminals) = ${vs} V − I × 1.5 Ω = ${vs} − ${n3(i)} × 1.5 = ${V(r.v[0] - r.v[1])}`);
    if (vs === 9 && i > 1e-4) {
      const hours = 0.5 / i;
      yours += ` A 9 V alkaline battery holds about 500 mAh, so at this current it would last about ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${n3(hours)} hours`}.`;
      math.push(`Battery life ≈ 500 mAh ÷ ${A(i)} = ${n3(hours)} hours`);
    }
  }
  return {
    role: 'Power source',
    goal: 'Push current around the loop. Voltage is the “push”; current is how much charge actually flows.',
    reasoning:
      'A battery keeps a steady voltage between + and −, as long as there is a complete loop for current to flow out of + and back into −. Real batteries have a little internal resistance (about 1.5 Ω here), so their voltage sags slightly as more current is drawn.',
    choice: '9 V is a convenient, safe choice for learning: enough voltage for LEDs, transistors and buzzers, too little to hurt you.',
    yours,
    math,
  };
}

function capacitor(part: Part, ctx: Ctx): Why {
  const C = part.value ?? 10e-6;
  const rn = neighborOfKind(ctx.t, part, ['resistor', 'ldr', 'potentiometer']);
  const Rv = rn ? (rn.part.kind === 'ldr' ? ldrResistance(rn.part.light ?? 0.5) : (rn.part.value ?? 0)) : 0;
  const tau = Rv * C;
  const half = standardDown(C / 2, E6);
  const double = standardUp(C * 2, E6);
  const vs = ctx.supply;
  const math: string[] = [];
  let choice: string;
  const u = ctx.c.parts.find((p) => p.kind === 'timer555' && [0, 1].some((i) => ctx.t.joined({ part: part.id, pin: i }, { part: p.id, pin: 5 })));
  const tm = u ? timing555(u, ctx.c, ctx.t) : null;
  const bl = tm ? null : blinkerHalf(part, ctx.c, ctx.t);
  if (tm) {
    choice = `It sets the timing of ${u!.ref}. ${tm.summary} A bigger capacitor makes everything proportionally slower.`;
    math.push(...tm.math);
  } else if (bl) {
    const period = 2 * bl.half;
    choice = `It times one half of the blink: after its transistor’s partner switches on, it holds this side’s base below 0 V until it recharges through ${bl.r.ref} (${R(ohms(bl.r))}), about 0.69 × R × C = ${time(bl.half)} (real blinkers run up to about 10% quicker, because the base can only be pulled about 7 V below 0 V). With both halves alike, one blink takes about ${time(period)} (${formatFreq(1 / period)}). Double the capacitor and that half takes twice as long. Probe a collector and compare with the scope’s reading.`;
    math.push(
      `Half cycle ≈ ln 2 × ${bl.r.ref} × ${part.ref} = 0.693 × ${R(ohms(bl.r))} × ${F(C)} = ${time(bl.half)}`,
      `If the other half matches: period ≈ ${time(period)}, f ≈ ${formatFreq(1 / period)}`,
    );
  } else if (rn && Rv > 0) {
    choice = `With ${rn.part.ref} (${R(Rv)}) feeding it, τ = R × C = ${time(tau)}: the time to charge to about 63%, and about 5τ = ${time(5 * tau)} to be practically full. Half the capacitance would charge twice as fast; double, twice as slow. So designers decide the time they need, then pick C = τ ÷ R. Electrolytics are only accurate to ±20%, so timing like this is approximate.`;
    math.push(
      `τ = R × C = ${R(Rv)} × ${F(C)} = ${time(tau)}`,
      `Full (5τ) ≈ ${time(5 * tau)}`,
      `With ${F(half)} instead: τ = ${time(Rv * half)};  with ${F(double)}: τ = ${time(Rv * double)}`,
    );
  } else {
    choice =
      'How fast a capacitor charges depends on the resistance feeding it: the time constant τ = R × C. Put a resistor in series with it to choose the speed: bigger R or bigger C means slower.';
  }
  choice += vs * 1.5 > 16 ? ` It’s rated 16 V; for a ${vs} V circuit, choose a 25 V one (a rating about 1.5× the supply is a safe margin).` : '';
  const r = ctx.r;
  return {
    role: 'Charge store',
    goal: 'Store electric charge. In a steady circuit it blocks current once it’s charged; it matters when things change: smoothing a supply, timing, filtering.',
    reasoning:
      'A capacitor fills up like a bucket. The bigger the capacitance (measured in farads; 10 µF is ten millionths of a farad), the more charge it needs to reach the same voltage, so the longer it takes to fill through a given resistor.',
    choice,
    yours: r
      ? Math.abs(r.i[0]) >= 1e-9
        ? `Right now it’s at ${V(Math.abs(r.v[0] - r.v[1]))}, with ${A(Math.abs(r.i[0]))} flowing as it ${Math.sign(r.i[0]) === Math.sign(r.v[0] - r.v[1] || r.i[0]) ? 'charges' : 'discharges'}. Watch its gauge on the canvas; the clock at the top lets you slow it down or start again.`
        : `Settled: charged to ${V(Math.abs(r.v[0] - r.v[1]))}, with no current flowing. Click the power button in the clock at the top of the canvas to empty it and watch it charge again.`
      : undefined,
    math,
  };
}

function npn(_part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  let yours: string | undefined;
  const math: string[] = [];
  if (r) {
    const ib = r.i[0];
    const ic = r.i[1];
    const vce = r.v[1] - r.v[2];
    if (ib < 1e-7) yours = 'Off: no current reaches its base, so no collector current flows.';
    else if (vce < 0.3) yours = `Fully on (saturated): base current ${A(ib)} is more than enough, Vce has dropped to ${V(vce)}, and the load sets the collector current (${A(ic)}).`;
    else yours = `Partly on: ${A(ib)} into the base allows ${A(ic)} through the collector (${n3(ic / ib)}× more). It’s amplifying; if it’s meant to be a switch, give the base more current.`;
    if (ib > 1e-9) math.push(`Gain = Ic ÷ Ib = ${A(ic)} ÷ ${A(ib)} = ${n3(ic / ib)}`);
    math.push(`Vce = ${V(vce)}  (fully on: about 0.1–0.2 V)`);
  }
  return {
    role: 'Electronic switch / amplifier',
    goal: 'Let a small current control a much bigger one: a tiny current into the base lets a big current flow from collector to emitter.',
    reasoning:
      'Collector current ≈ β × base current, with β (the gain) about 200 here. Give the base more current than the load needs and the transistor is fully on, like a closed switch; give it none and it’s off.',
    yours,
    math,
  };
}

function diode(_part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  let yours: string | undefined;
  if (r) {
    const vf = r.v[0] - r.v[1];
    yours = vf < -0.3 ? `Blocking: it’s reverse-biased, with ${V(-vf)} trying to push the wrong way.` : r.i[0] > 1e-6 ? `Conducting ${A(r.i[0])} and dropping ${V(vf)}.` : 'Not conducting.';
  }
  return {
    role: 'One-way valve',
    goal: 'Let current flow in one direction only, for example protecting a circuit from a battery connected backwards.',
    reasoning:
      'A silicon diode conducts from anode (+) to cathode (the end with the band) once it has about 0.6–0.7 V across it, and blocks the other way. That 0.7 V is a handy rule of thumb in hand calculations.',
    yours,
    math: r && r.i[0] > 1e-6 ? [`Drop: ${V(r.v[0] - r.v[1])} at ${A(r.i[0])} (rule of thumb: 0.7 V)`] : [],
  };
}

function lamp(_part: Part, ctx: Ctx): Why {
  const r = ctx.r;
  const v = r ? Math.abs(r.v[0] - r.v[1]) : 0;
  const i = r ? Math.abs(r.i[0]) : 0;
  return {
    role: 'Light (incandescent)',
    goal: 'Make light by heating a thin tungsten filament until it glows.',
    reasoning:
      'This lamp is rated 9 V, 50 mA (0.45 W). A filament’s resistance rises a lot as it heats, about 10× from cold to hot, so a lamp isn’t a fixed resistor: at half voltage it draws more than half the current.',
    yours: r && i > 1e-6 ? `${V(v)} across it and ${A(i)} through it, so right now it behaves like ${R(v / i)}.` : undefined,
    math: r && i > 1e-6 ? [`R = V ÷ I = ${n3(v)} V ÷ ${A(i)} = ${R(v / i)}  (fully hot at 9 V: 180 Ω)`] : [],
  };
}

function pot(part: Part, ctx: Ctx): Why {
  const t = ctx.t;
  const used = [0, 1, 2].map((pin) => t.wires({ part: part.id, pin }) > 0);
  const asDivider = used[0] && used[1] && used[2];
  const value = part.value ?? 10e3;
  const r = ctx.r;
  return {
    role: asDivider ? 'Adjustable voltage divider' : 'Variable resistor',
    goal: asDivider
      ? 'Give an adjustable voltage at the wiper, anywhere from the voltage at End A to the voltage at End B.'
      : 'Adjust the current: sliding the wiper changes how much of the track the current passes through.',
    reasoning:
      'A potentiometer is a resistive track with a sliding contact (the wiper). With both ends connected across the supply, the wiper taps off a share of the voltage. Used as a variable resistor, add a fixed resistor in series so that turning it to the end can’t short the circuit.',
    choice: `${R(value)} is a common choice: large enough to waste little current (${V(ctx.supply)} ÷ ${R(value)} = ${A(ctx.supply / value)}), small enough that whatever you connect to the wiper doesn’t pull its voltage around.`,
    yours: r && asDivider ? `The wiper is at ${Math.round((part.pos ?? 0.5) * 100)}% and outputs ${V(r.v[2])}.` : undefined,
    math: [`Wiper voltage ≈ V(A) − (V(A) − V(B)) × position`],
  };
}
