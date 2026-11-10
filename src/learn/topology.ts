/**
 * Who is connected to whom: the facts the explanations and the fault finder
 * need ("this resistor is in series with an LED", "this pin is dangling").
 */
import { pinKey, type Circuit, type Part, type PinRef } from '../model/circuit';
import { PART_DEFS, type PartKind } from '../model/parts';
import { UnionFind } from '../sim/unionFind';

export interface PinAt {
  part: Part;
  pin: number;
}

export interface Topology {
  /** Every pin in the same net as this pin, including itself. */
  net(ref: PinRef): PinAt[];
  /** Number of wires ending on this pin. */
  wires(ref: PinRef): number;
  /** Whether two pins are joined by wires. */
  joined(a: PinRef, b: PinRef): boolean;
}

export function topology(c: Circuit): Topology {
  const uf = new UnionFind<string>();
  const wires = new Map<string, number>();
  for (const p of c.parts) PART_DEFS[p.kind].pins.forEach((_, i) => uf.add(pinKey({ part: p.id, pin: i })));
  for (const w of c.wires) {
    const a = pinKey(w.a);
    const b = pinKey(w.b);
    uf.union(a, b);
    wires.set(a, (wires.get(a) ?? 0) + 1);
    wires.set(b, (wires.get(b) ?? 0) + 1);
  }
  const members = new Map<string, PinAt[]>();
  for (const p of c.parts) {
    PART_DEFS[p.kind].pins.forEach((_, i) => {
      const root = uf.find(pinKey({ part: p.id, pin: i }));
      members.set(root, [...(members.get(root) ?? []), { part: p, pin: i }]);
    });
  }
  return {
    net: (ref) => members.get(uf.find(pinKey(ref))) ?? [],
    wires: (ref) => wires.get(pinKey(ref)) ?? 0,
    joined: (a, b) => uf.find(pinKey(a)) === uf.find(pinKey(b)),
  };
}

/** The other pins sharing a net with this pin. */
export function others(t: Topology, part: Part, pin: number): PinAt[] {
  return t.net({ part: part.id, pin }).filter((x) => x.part.id !== part.id);
}

/**
 * A part directly in series with this pin: the net holds exactly this pin and
 * one other pin, so the same current must flow through both.
 */
export function seriesPartner(t: Topology, part: Part, pin: number): PinAt | null {
  const o = others(t, part, pin);
  return o.length === 1 && t.net({ part: part.id, pin }).length === 2 ? o[0] : null;
}

/** First neighbor of a given kind on either side of a part. */
export function neighborOfKind(t: Topology, part: Part, kinds: PartKind[]): PinAt | null {
  for (let i = 0; i < PART_DEFS[part.kind].pins.length; i++) {
    const hit = others(t, part, i).find((x) => kinds.includes(x.part.kind));
    if (hit) return hit;
  }
  return null;
}
