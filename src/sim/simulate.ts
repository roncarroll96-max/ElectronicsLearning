/**
 * The simulator's front door: give it a circuit, get back every pin's
 * voltage, every part's currents and power, and the current in every wire.
 */
import { pinKey, type Circuit } from '../model/circuit';
import { evaluate } from './devices';
import { solveDense } from './linalg';
import { buildNetlist, type SimOptions } from './netlist';
import { solveDC } from './solver';

export type { SimOptions } from './netlist';

export interface PartReading {
  /** Voltage at each pin, relative to 0 V (ground), V. */
  v: number[];
  /** Current flowing INTO the part at each pin, A. They add up to zero. */
  i: number[];
  /** Power the part absorbs, W. Negative means it supplies power (a battery). */
  power: number;
}

export interface SimResult {
  /** The solver found a consistent answer. */
  ok: boolean;
  /** There's nothing to drive current (no battery), so everything is at rest. */
  idle: boolean;
  iterations: number;
  nodes: number;
  parts: Map<string, PartReading>;
  /** Current in each wire, A. Positive means it flows from the wire's start pin (a) to its end pin (b). */
  wires: Map<string, number>;
}

export function simulate(c: Circuit, opts?: SimOptions): SimResult {
  const net = buildNetlist(c, opts);
  const sol = net.hasSource ? solveDC(net) : { x: new Float64Array(net.size), ok: true, iterations: 0 };
  const V = (k: number) => (k < 0 ? 0 : sol.x[k]);

  const parts = new Map<string, PartReading>();
  const pinI = new Map<string, number>();
  for (const pn of net.parts) {
    const pinCount = pn.pinNodes.length;
    const i = new Array<number>(pinCount).fill(0);
    for (const d of pn.devices) {
      const e = evaluate(d, d.t.map(V), 1, false);
      d.lt.forEach((l, j) => {
        if (l < pinCount) i[l] += e.i[j];
      });
    }
    const v = pn.pinNodes.map(V);
    parts.set(pn.part.id, { v, i, power: 0 });
    i.forEach((cur, pin) => pinI.set(pinKey({ part: pn.part.id, pin }), cur));
  }

  // Ground symbols carry whatever current their net hands to the shared ground.
  const netSum = new Map<string, number>();
  const grounds = new Map<string, string[]>();
  for (const p of c.parts) {
    const pins = parts.get(p.id)!.i;
    pins.forEach((cur, pin) => {
      const k = pinKey({ part: p.id, pin });
      const root = net.netOf.get(k)!;
      if (p.kind === 'ground') grounds.set(root, [...(grounds.get(root) ?? []), p.id]);
      else netSum.set(root, (netSum.get(root) ?? 0) + cur);
    });
  }
  for (const [root, ids] of grounds) {
    const share = -(netSum.get(root) ?? 0) / ids.length;
    for (const id of ids) {
      parts.get(id)!.i[0] = share;
      pinI.set(pinKey({ part: id, pin: 0 }), share);
    }
  }

  for (const r of parts.values()) r.power = r.v.reduce((s, v, k) => s + v * r.i[k], 0);

  return {
    ok: sol.ok,
    idle: !net.hasSource,
    iterations: sol.iterations,
    nodes: net.size,
    parts,
    wires: wireCurrents(c, net.netOf, pinI),
  };
}

/**
 * Splits each net's current among its wires. Within a net every wire is ideal,
 * so for a chain or tree of wires the split is fixed by Kirchhoff's current
 * law alone. Where wires form a loop, the current shares equally between
 * equal paths, as it would through real wires of equal length.
 */
function wireCurrents(c: Circuit, netOf: Map<string, string>, pinI: Map<string, number>): Map<string, number> {
  const byNet = new Map<string, typeof c.wires>();
  for (const w of c.wires) {
    const root = netOf.get(pinKey(w.a));
    if (root === undefined) continue;
    byNet.set(root, [...(byNet.get(root) ?? []), w]);
  }

  const out = new Map<string, number>();
  for (const ws of byNet.values()) {
    const index = new Map<string, number>();
    const vertex = (k: string) => {
      let v = index.get(k);
      if (v === undefined) {
        v = index.size;
        index.set(k, v);
      }
      return v;
    };
    const edges = ws.map((w) => [vertex(pinKey(w.a)), vertex(pinKey(w.b))]);
    const m = index.size - 1; // vertex 0 is held at potential 0
    const L = new Float64Array(m * m);
    const rhs = new Float64Array(m);
    for (const [a, b] of edges) {
      if (a > 0) L[(a - 1) * m + (a - 1)] += 1;
      if (b > 0) L[(b - 1) * m + (b - 1)] += 1;
      if (a > 0 && b > 0) {
        L[(a - 1) * m + (b - 1)] -= 1;
        L[(b - 1) * m + (a - 1)] -= 1;
      }
    }
    // Current entering the wires at a pin is the current leaving the part there.
    for (const [k, v] of index) if (v > 0) rhs[v - 1] = -(pinI.get(k) ?? 0);
    const phi = m > 0 ? solveDense(L, rhs, m) : new Float64Array(0);
    const at = (v: number) => (v === 0 || !phi ? 0 : phi[v - 1]);
    ws.forEach((w, j) => out.set(w.id, at(edges[j][0]) - at(edges[j][1])));
  }
  return out;
}
