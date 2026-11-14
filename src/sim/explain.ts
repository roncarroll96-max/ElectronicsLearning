/**
 * Plain-English explanations for burnouts and warnings: what happened, why,
 * and how to choose the right part. Numbers come from the actual circuit.
 */
import type { BurnInfo, Part } from '../model/circuit';
import { UNO, formatReading, formatValue, ledLook } from '../model/parts';
import type { PartReading } from './simulate';
import type { Stress } from './ratings';
import { standardUp } from '../model/values';

export { standardUp };

const A = (x: number) => formatReading(Math.abs(x), 'A');
const V = (x: number) => formatReading(Math.abs(x), 'V');
const W = (x: number) => formatReading(Math.abs(x), 'W');
const fmt = (x: number, q: BurnInfo['quantity']) => (q === 'current' ? A(x) : q === 'power' ? W(x) : V(x));

export interface Explanation {
  headline: string;
  why: string;
  fix: string;
}

/** Why a part burned out and how to avoid it. `supply` is the circuit's battery voltage. */
export function explainBurn(part: Part, b: BurnInfo, supply: number): Explanation {
  const headline = `${part.ref} burned out`;
  const across = b.v[0] - b.v[1];
  switch (part.kind) {
    case 'led': {
      const vf = ledLook(part.color).vf;
      const r = (supply - vf) / 0.02;
      return {
        headline,
        why: `${A(b.value)} flowed through it. An LED can handle about 30 mA; much more overheats the tiny chip inside in moments.`,
        fix:
          supply > vf + 0.5
            ? `Put a resistor in series to limit the current. Ohm’s law picks it: R = (battery voltage − LED voltage) ÷ current. For 20 mA from ${V(supply)}: (${supply} − ${vf}) ÷ 0.02 = ${Math.round(r)} Ω, so use the next standard value up, ${formatValue(standardUp(r), 'Ω')}.`
            : 'Put a resistor in series to limit the current: R = (battery voltage − LED voltage) ÷ current.',
      };
    }
    case 'diode':
      return {
        headline,
        why: `${A(b.value)} flowed through it. A small signal diode like this is made for about 200 mA.`,
        fix: 'Add a resistor in series to limit the current: R = (battery voltage − 0.7 V) ÷ current.',
      };
    case 'resistor': {
      const rMin = (across * across) / 0.25;
      return {
        headline,
        why: `It had to turn ${W(b.value)} into heat (power = voltage × current = ${V(across)} × ${A(b.i[0])}). A small resistor like this is rated for ¼ W (0.25 W) and burns at about twice that.`,
        fix: `Use a larger resistance so less current flows. With ${V(across)} across it, it needs at least V² ÷ 0.25 W = ${formatValue(rMin, 'Ω')}, so ${formatValue(standardUp(rMin), 'Ω')} or more (or a resistor rated for more power).`,
      };
    }
    case 'potentiometer':
      return {
        headline,
        why: `${W(b.value)} was spent in its track, more than the 0.25 W it can take. Turned close to one end with nothing else limiting the current, the full voltage lands on a tiny piece of track.`,
        fix: 'Put a fixed resistor (say 1 kΩ) in series with it, so the current stays limited even at the end of the track.',
      };
    case 'ldr':
      return {
        headline,
        why: `It had to handle ${W(b.value)}, more than the 0.1 W it’s made for. In bright light its resistance drops to about 500 Ω, so with ${V(across)} straight across it, a lot of current flows.`,
        fix: 'Use it in a voltage divider: put a fixed resistor (for example 10 kΩ) in series with it.',
      };
    case 'lamp':
      return {
        headline,
        why: `It was driven at ${V(across)}, using ${W(b.value)}. It’s made for 9 V (0.45 W); too much voltage overheats the filament until it melts.`,
        fix: 'Run it from 9 V, or add a resistor in series to drop the extra voltage.',
      };
    case 'buzzer':
      return {
        headline,
        why: `${A(b.value)} flowed through it; it’s made for about 30 mA, from a 3–12 V supply.`,
        fix: 'Keep its supply between 3 V and 12 V.',
      };
    case 'speaker':
      return {
        headline,
        why: `${W(b.value)} went into its voice coil; a small speaker like this takes about 0.5 W. Its coil is only 8 Ω, so even a 9 V battery straight across it pushes over an amp through it.`,
        fix: 'Never connect a speaker straight across a battery. Drive it through a resistor (100 Ω or more), or from a transistor with a resistor in series.',
      };
    case 'npn': {
      const ib = b.i[0];
      if (b.quantity === 'power' && ib > 0.05) {
        return {
          headline,
          why: `${A(ib)} poured into its base. The base was connected to the battery without a resistor, so nothing limited that current.`,
          fix: 'Always feed the base through a resistor, typically 1 kΩ to 10 kΩ. A small base current is all it needs to switch a much bigger collector current.',
        };
      }
      if (b.quantity === 'current') {
        return {
          headline,
          why: `${A(b.value)} flowed into its collector; a small transistor like this handles about 200 mA.`,
          fix: 'Something has to limit the collector current: put the load (an LED with its resistor, a lamp…) between the battery and the collector, never a bare wire.',
        };
      }
      return {
        headline,
        why: `It had to turn ${W(b.value)} into heat; a small transistor like this handles about 0.6 W.`,
        fix: 'Limit the collector current with a resistor, and drive the base so the transistor is either fully on or fully off; halfway is where it heats up most.',
      };
    }
    case 'capacitor':
      return b.quantity === 'reverse'
        ? {
            headline,
            why: `It’s an electrolytic capacitor, so it has a + leg and a − leg. It was connected backwards (its − leg ${V(b.value)} above its + leg), which makes it overheat and vent.`,
            fix: 'Turn it around so its + leg (the longer one) faces the higher voltage.',
          }
        : {
            headline,
            why: `It had ${V(b.value)} across it; it’s rated for 16 V.`,
            fix: 'Use a capacitor rated for a higher voltage than your supply.',
          };
    case 'inductor':
      return {
        headline,
        why: `${W(b.value)} was turned into heat in its winding; a small coil like this takes about 0.5 W before its thin wire and insulation overheat.`,
        fix: 'Limit the current through it with a resistor in series, or use a coil with a lower resistance.',
      };
    case 'transformer':
      return {
        headline,
        why: `${W(b.value)} was lost as heat in its windings, more than the 1 W a small transformer can shed. Something on the secondary side was drawing far too much current (a short, or too small a load resistance).`,
        fix: 'Check the secondary side for a short circuit, and make sure the load draws less current.',
      };
    case 'bridge':
      return {
        headline,
        why: `${A(b.value)} flowed out of it; its diodes are rated for about 1 A.`,
        fix: 'Draw less current from the DC side: a larger load resistance, and no short across + and −.',
      };
    case 'timer555':
      return b.quantity === 'voltage'
        ? {
            headline,
            why: `It was powered from ${V(b.value)}; a 555 takes at most 16 V (18 V destroys it).`,
            fix: 'Run it from 4.5 V to 15 V: a 9 V battery is ideal.',
          }
        : {
            headline,
            why: `${A(b.value)} flowed through its output pin; it can drive about 200 mA.`,
            fix: 'Put a resistor in series with whatever the output drives, or switch bigger loads with a transistor.',
          };
    case 'arduino': {
      const pin = worstUnoPin(b.i);
      return {
        headline,
        why: `${A(b.value)} flowed through pin ${pin}. Each pin of the Uno’s chip is rated for 20 mA, and 40 mA is the absolute maximum: past it the pin, or the whole chip, is destroyed. A pin wired straight to an LED, to GND or to 5V with nothing to limit the current does this.`,
        fix: 'Put a resistor in series with whatever the pin drives (220 Ω for an LED), and switch anything that needs more current (a motor, a lamp, a buzzer) with a transistor.',
      };
    }
    case 'and':
    case 'or':
    case 'not':
    case 'nand':
    case 'nor':
    case 'xor':
    case 'dff':
      return {
        headline,
        why: `${A(b.value)} flowed through its output. A 74HC logic chip’s output is rated for 20 mA (25 mA absolute maximum); only about 25 Ω inside it limited the current, so an output wired straight to an LED, to GND, or to another output fighting it burns it out.`,
        fix: 'Put a resistor in series with whatever the output drives (330 Ω for an LED), and never join two outputs together.',
      };
    case 'sevenseg':
      return {
        headline,
        why: `${A(b.value)} flowed through one segment. Each segment is a small LED rated for about 20 mA, and nothing limited its current.`,
        fix: 'Give each segment its own resistor (330 Ω from a 5 V signal gives about 9 mA).',
      };
    default:
      return { headline, why: `It was pushed to ${fmt(b.value, b.quantity)}, past its limit.`, fix: 'Reduce the current through it.' };
  }
}

/** The name of the Uno pin carrying the most current (as in the burn record's currents). */
export function worstUnoPin(i: number[]): string {
  let best = 0;
  for (let k = 1; k < UNO.io; k++) if (Math.abs(i[k] ?? 0) > Math.abs(i[best] ?? 0)) best = k;
  return best < 14 ? `D${best}` : `A${best - 14}`;
}

/** A warning for a part running above its rating but not (yet) burning. */
export function explainHot(part: Part, s: Stress, r: PartReading): string {
  if (part.kind === 'battery' || part.kind === 'acsource') {
    return `Short circuit! ${A(r.i[0])} flows, limited only by the battery’s own internal resistance. A real battery would get hot and drain in minutes. Add a resistor or a load to limit the current.`;
  }
  const what = s.quantity === 'reverse' ? 'reverse voltage' : s.quantity;
  return `Running hot: its ${what} (${fmt(s.value, s.quantity)}) is above its ${fmt(s.max, s.quantity)} rating. It burns out at about ${fmt(s.burn, s.quantity)}.`;
}
