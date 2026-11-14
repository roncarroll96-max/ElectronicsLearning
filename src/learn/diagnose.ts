/**
 * "Why isn't it working?": finds common faults and phrases each one as three
 * graduated hints: where to look, what the problem is, and how to fix it.
 * Faults are listed most important first.
 */
import { flipPart, pinKey, updatePart, type BurnInfo, type Circuit, type Part, type PinRef } from '../model/circuit';
import { PART_DEFS, SEG, P555, UNO, formatReading, formatValue, isLogic, ledLook, logicPins } from '../model/parts';
import { standardUp } from '../model/values';
import { explainBurn, explainHot } from '../sim/explain';
import { stressOf } from '../sim/ratings';
import type { SimResult } from '../sim/simulate';
import { UnionFind } from '../sim/unionFind';
import { seriesPartner, topology } from './topology';

export type IssueKind =
  | 'burned'
  | 'short'
  | 'no-battery'
  | 'battery-unconnected'
  | 'missing-ground'
  | 'open-switch'
  | 'capacitor-blocks'
  | 'dangling'
  | 'open-loop'
  | 'backwards'
  | 'bypassed'
  | 'too-dim'
  | 'low-voltage'
  | 'transistor-off'
  | 'hot';

export interface Issue {
  /** Stable while the same fault persists: kind plus the part. */
  id: string;
  kind: IssueKind;
  /** Parts and pins to highlight for "where to look". */
  parts: string[];
  pins: PinRef[];
  where: string;
  what: string;
  fix: string;
  /** A fix the app can apply for the learner, if it's simple. */
  action?: { label: string; apply: (c: Circuit) => Circuit };
}

const A = (x: number) => formatReading(Math.abs(x), 'A');
const V = (x: number) => formatReading(x, 'V');
const pinName = (p: Part, i: number) => PART_DEFS[p.kind].pins[i].name;

const OPEN_LOOP: IssueKind[] = ['battery-unconnected', 'missing-ground', 'open-switch', 'capacitor-blocks', 'dangling', 'open-loop'];

/** `c` is the circuit as it is right now (held buttons pressed); `sim` its simulation. */
/** A chip's output pin: one that switches what's wired to it on and off by itself. */
function outputPin(p: Part, i: number): boolean {
  if (p.kind === 'arduino') return i < UNO.io;
  if (isLogic(p.kind)) return logicPins(p.kind).outputs.includes(i);
  if (p.kind === 'timer555') return i === P555.out || i === P555.dis;
  return false;
}

/** Pins that are normally left unconnected, so an empty one isn't a broken loop. */
function optionalPin(p: Part, i: number): boolean {
  if (p.kind === 'potentiometer') return i === 2;
  if (p.kind === 'arduino') return true;
  if (isLogic(p.kind)) return i === logicPins(p.kind).v5 || logicPins(p.kind).outputs.includes(i);
  if (p.kind === 'timer555') return i === P555.ctrl || i === P555.reset;
  if (p.kind === 'sevenseg') return i < SEG.count || i === SEG.com2;
  return false;
}

export function diagnose(c: Circuit, sim: SimResult): Issue[] {
  const parts = c.parts.filter((p) => !p.id.startsWith('__'));
  if (parts.length === 0) return [];
  const t = topology(c);
  const live = sim.ok && !sim.idle;
  const reading = (p: Part) => (live ? sim.parts.get(p.id) : undefined);
  const wired = (p: Part, i: number) => t.wires({ part: p.id, pin: i }) > 0;
  const issues: Issue[] = [];
  const supply = parts.find((p) => p.kind === 'battery')?.value ?? 9;
  const batteries = parts.filter((p) => p.kind === 'battery');
  const grounds = parts.filter((p) => p.kind === 'ground');
  const loads = parts.filter((p) => p.kind !== 'battery' && p.kind !== 'ground');

  /* Burned-out parts. */
  for (const p of parts) {
    if (!p.burn) continue;
    const ex = explainBurn(p, p.burn, supply);
    issues.push({
      id: `burned:${p.id}`,
      kind: 'burned',
      parts: [p.id],
      pins: [],
      where: `Look at ${p.ref}.`,
      what: `${p.ref} has burned out. A burned part is broken open, so no current gets through it. ${ex.why}`,
      fix: `${ex.fix} Then replace it.`,
      action: { label: `Replace ${p.ref}`, apply: (x) => updatePart(x, p.id, { burn: undefined }) },
    });
  }

  /* Short circuits. */
  for (const b of batteries) {
    const r = reading(b);
    if (r && Math.abs(r.i[0]) > 1) {
      issues.push({
        id: `short:${b.id}`,
        kind: 'short',
        parts: [b.id],
        pins: [
          { part: b.id, pin: 0 },
          { part: b.id, pin: 1 },
        ],
        where: `Look at the wires around ${b.ref}.`,
        what: `There’s a short circuit: current rushes from ${b.ref}’s + back to its − with nothing to limit it (${A(r.i[0])}).`,
        fix: 'Find the wire that links + to − without passing through a part, and remove it. On its way back to −, current should always pass through a load, such as an LED with its resistor, or a lamp.',
      });
    }
  }

  /* No battery (an Arduino, or a logic chip on its own 5 V, powers itself). */
  const selfPowered = parts.some((p) => p.kind === 'arduino' || isLogic(p.kind));
  if (batteries.length === 0 && loads.length > 0 && !selfPowered) {
    issues.push({
      id: 'no-battery',
      kind: 'no-battery',
      parts: [],
      pins: [],
      where: 'Look at the Power section of the parts tray.',
      what: 'Nothing powers the circuit: there’s no battery.',
      fix: 'Add a battery, then wire a loop from its + terminal through your parts and back to its − terminal.',
    });
  }

  /* Batteries with no current: something breaks the loop. */
  const pieces = new UnionFind<string>();
  for (const p of parts) {
    const keys = PART_DEFS[p.kind].pins.map((_, i) => pinKey({ part: p.id, pin: i }));
    keys.forEach((k) => pieces.add(k));
    for (const k of keys.slice(1)) pieces.union(keys[0], k);
  }
  for (const w of c.wires) pieces.union(pinKey(w.a), pinKey(w.b));
  const pieceOf = (p: Part) => pieces.find(pinKey({ part: p.id, pin: 0 }));
  /** A part wired, directly or through a series resistor, to a chip's output, which switches it on and off. */
  const drivenByChip = (p: Part) =>
    [0, 1].some((i) => {
      const near = t.net({ part: p.id, pin: i });
      const res = seriesPartner(t, p, i);
      const far = res?.part.kind === 'resistor' ? t.net({ part: res.part.id, pin: 1 - res.pin }) : [];
      return [...near, ...far].some((x) => outputPin(x.part, x.pin));
    });

  // Parts that stop all current on their own, and get a more specific hint below.
  const isBackwards = (p: Part) => {
    const r = reading(p);
    return ['led', 'diode', 'buzzer'].includes(p.kind) && !p.burn && !!r && r.v[0] - r.v[1] < -0.5;
  };
  const isOffTransistor = (q: Part) => {
    const r = reading(q);
    return q.kind === 'npn' && !q.burn && wired(q, 1) && !!r && r.i[0] <= 1e-7;
  };

  for (const b of batteries) {
    const r = reading(b);
    if (!r || Math.abs(r.i[0]) > 1e-6 || b.burn) continue;
    const before = issues.length;
    const unwired = [0, 1].filter((i) => !wired(b, i));
    if (unwired.includes(1) && grounds.length > 0 && !wired(b, 1)) {
      issues.push({
        id: `missing-ground:${b.id}`,
        kind: 'missing-ground',
        parts: [b.id, ...grounds.map((g) => g.id)],
        pins: [{ part: b.id, pin: 1 }],
        where: `Look at ${b.ref}’s − terminal and the ground symbols.`,
        what: `Your circuit returns to ground, but ${b.ref}’s − terminal isn’t connected to ground. Ground symbols only connect to each other, so the loop back to the battery isn’t closed.`,
        fix: `Wire ${b.ref}’s − terminal to a ground symbol.`,
      });
      continue;
    }
    if (unwired.length > 0) {
      const i = unwired[0];
      issues.push({
        id: `battery-unconnected:${b.id}`,
        kind: 'battery-unconnected',
        parts: [b.id],
        pins: [{ part: b.id, pin: i }],
        where: `Look at ${b.ref}’s ${pinName(b, i)} terminal.`,
        what: `${b.ref}’s ${pinName(b, i)} terminal isn’t connected, so there’s no complete loop. Current has to flow out of + and all the way back into −.`,
        fix: `Wire ${b.ref}’s ${pinName(b, i)} terminal into the circuit.`,
      });
    }
    const piece = pieceOf(b);
    for (const p of parts) {
      if (p === b || pieceOf(p) !== piece || p.burn) continue;
      const bothWired = wired(p, 0) && wired(p, 1);
      if ((p.kind === 'switch' || p.kind === 'pushbutton') && !p.on && bothWired) {
        issues.push({
          id: `open-switch:${p.id}`,
          kind: 'open-switch',
          parts: [p.id],
          pins: [],
          where: `Look at ${p.ref}.`,
          what: `${p.ref} is open, so it breaks the loop.`,
          fix:
            p.kind === 'switch'
              ? 'Close it: select it and choose Closed in the inspector.'
              : 'Hold it down: select it and use “Hold to press” in the inspector.',
          action: p.kind === 'switch' ? { label: `Close ${p.ref}`, apply: (x) => updatePart(x, p.id, { on: true }) } : undefined,
        });
      } else if (p.kind === 'capacitor' && bothWired) {
        issues.push({
          id: `capacitor-blocks:${p.id}`,
          kind: 'capacitor-blocks',
          parts: [p.id],
          pins: [],
          where: `Look at ${p.ref}.`,
          what: `${p.ref} sits in the loop, and a capacitor blocks steady current once it has charged, so current can’t keep flowing.`,
          fix: 'In a steady (DC) circuit, a capacitor belongs across the supply or in a timing circuit, not in series. Replace it with a wire or a resistor, or connect it across the battery instead.',
        });
      } else if (p.kind !== 'npn' && p.kind !== 'ground') {
        const pins = PART_DEFS[p.kind].pins.map((_, i) => i).filter((i) => !optionalPin(p, i));
        const loose = pins.filter((i) => !wired(p, i));
        if (loose.length > 0 && loose.length < pins.length) {
          const i = loose[0];
          issues.push({
            id: `dangling:${p.id}`,
            kind: 'dangling',
            parts: [p.id],
            pins: [{ part: p.id, pin: i }],
            where: `Look at ${p.ref}’s ${pinName(p, i)}.`,
            what: `${p.ref}’s ${pinName(p, i)} isn’t connected to anything, so the loop is broken there.`,
            fix: `Wire ${p.ref}’s ${pinName(p, i)} to the next part, or back to the battery.`,
          });
        }
      }
    }
    const explained = parts.some((p) => pieceOf(p) === piece && (p.burn || isBackwards(p) || isOffTransistor(p)));
    if (issues.length === before && !explained) {
      issues.push({
        id: `open-loop:${b.id}`,
        kind: 'open-loop',
        parts: [b.id],
        pins: [
          { part: b.id, pin: 0 },
          { part: b.id, pin: 1 },
        ],
        where: `Follow the path from ${b.ref}’s + terminal back to its − terminal.`,
        what: 'There’s no complete loop: current can’t get from + all the way back to −.',
        fix: 'Make sure an unbroken path of wires and parts runs from the battery’s + terminal back to its − terminal.',
      });
    }
  }

  /* Parts connected backwards. */
  for (const p of parts) {
    if (!isBackwards(p)) continue;
    issues.push({
      id: `backwards:${p.id}`,
      kind: 'backwards',
      parts: [p.id],
      pins: [{ part: p.id, pin: 0 }],
      where: `Look at ${p.ref}.`,
      what: `${p.ref} is backwards: its ${pinName(p, 0).toLowerCase()} faces the battery’s −, so it blocks the current.`,
      fix: `Turn it around so its ${p.kind === 'buzzer' ? '+ leg' : 'anode (+, the longer leg)'} faces the battery’s +.`,
      action: { label: `Turn ${p.ref} around`, apply: (x) => flipPart(x, p.id) },
    });
  }

  /* Parts bypassed by a wire. */
  for (const p of parts) {
    if (PART_DEFS[p.kind].pins.length !== 2 || p.kind === 'battery' || p.burn) continue;
    if (!wired(p, 0) || !wired(p, 1) || !t.joined({ part: p.id, pin: 0 }, { part: p.id, pin: 1 })) continue;
    issues.push({
      id: `bypassed:${p.id}`,
      kind: 'bypassed',
      parts: [p.id],
      pins: [
        { part: p.id, pin: 0 },
        { part: p.id, pin: 1 },
      ],
      where: `Look at the wires at both ends of ${p.ref}.`,
      what: `${p.ref} is bypassed: wires join its two ends, so the current takes the easy path around it.`,
      fix: `Remove the wire that connects ${p.ref}’s two ends directly.`,
    });
  }

  /* LEDs that are on but too dim. */
  const loopBroken = issues.some((x) => OPEN_LOOP.includes(x.kind));
  for (const p of parts) {
    if (p.kind !== 'led' || p.burn || loopBroken || issues.some((x) => x.parts.includes(p.id))) continue;
    const r = reading(p);
    if (!r || r.v[0] - r.v[1] < 0 || r.i[0] >= 1e-3) continue;
    // An LED switched by a chip's output is meant to be dark some of the time.
    if (drivenByChip(p)) continue;
    const res = [0, 1].map((i) => seriesPartner(t, p, i)).find((x) => x?.part.kind === 'resistor');
    const rr = res ? reading(res.part) : undefined;
    const look = ledLook(p.color);
    if (res && rr && Math.abs(rr.v[0] - rr.v[1]) > 1) {
      const target = standardUp((supply - look.vf) / 0.015);
      issues.push({
        id: `too-dim:${p.id}`,
        kind: 'too-dim',
        parts: [res.part.id, p.id],
        pins: [],
        where: `Look at ${res.part.ref}.`,
        what: `${p.ref} is barely lit: only ${A(r.i[0])} flows, because ${res.part.ref} (${formatValue(res.part.value ?? 0, 'Ω')}) is too large. LEDs need about 5–20 mA.`,
        fix: `Use a smaller resistor. For 15 mA: (${supply} − ${look.vf}) ÷ 0.015 = ${Math.round((supply - look.vf) / 0.015)} Ω, so ${formatValue(target, 'Ω')}.`,
        action: { label: `Use ${formatValue(target, 'Ω')}`, apply: (x) => updatePart(x, res.part.id, { value: target }) },
      });
    } else {
      issues.push({
        id: `low-voltage:${p.id}`,
        kind: 'low-voltage',
        parts: [p.id],
        pins: [],
        where: `Look at ${p.ref} and whatever is in series with it.`,
        what: `${p.ref} only gets ${V(r.v[0] - r.v[1])}, not enough to turn on (a ${look.name.toLowerCase()} LED needs about ${look.vf} V).`,
        fix: 'Use a higher battery voltage, or put fewer parts in series with it.',
      });
    }
  }

  /* Transistors that never switch on. */
  for (const q of parts) {
    if (!isOffTransistor(q) || loopBroken) continue;
    const baseWired = wired(q, 0);
    issues.push({
      id: `transistor-off:${q.id}`,
      kind: 'transistor-off',
      parts: [q.id],
      pins: [{ part: q.id, pin: 0 }],
      where: `Look at ${q.ref}’s base.`,
      what: baseWired
        ? `No current reaches ${q.ref}’s base, so it stays off and no collector current flows.`
        : `${q.ref}’s base isn’t connected, so it stays off and no collector current flows.`,
      fix: 'Connect the base to + through a resistor (1 kΩ to 10 kΩ is typical). That small base current switches on the much bigger collector current.',
    });
  }

  /* Parts running hot. */
  for (const p of parts) {
    if (p.kind === 'battery') continue;
    const r = reading(p);
    const s = stressOf(p, r);
    if (!r || !s || s.level !== 'hot') continue;
    const pseudo: BurnInfo = { quantity: s.quantity, value: s.value, limit: s.max, v: r.v, i: r.i };
    issues.push({
      id: `hot:${p.id}`,
      kind: 'hot',
      parts: [p.id],
      pins: [],
      where: `Look at ${p.ref}.`,
      what: explainHot(p, s, r),
      fix: explainBurn(p, pseudo, supply).fix,
    });
  }

  return issues;
}
