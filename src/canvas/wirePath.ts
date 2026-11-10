/**
 * Wire routing: neat right-angle paths between two pins, leaving each pin in
 * the direction it faces, with softly rounded corners.
 */
import type { Pt } from '../model/circuit';
import { DIR_VEC, GRID, type Dir } from '../model/parts';

const STUB = GRID;

const ahead = (from: number, to: number, sign: number) => sign !== 0 && Math.sign(to - from) === sign;

export function routeWire(a: Pt, da: Dir, b: Pt, db: Dir): Pt[] {
  const va = DIR_VEC[da];
  const vb = DIR_VEC[db];
  const sa = { x: a.x + va.x * STUB, y: a.y + va.y * STUB };
  const sb = { x: b.x + vb.x * STUB, y: b.y + vb.y * STUB };
  const aHoriz = va.x !== 0;
  const bHoriz = vb.x !== 0;

  if (aHoriz && bHoriz) {
    // Facing each other: a Z through the midpoint.
    if (ahead(a.x, b.x, va.x) && ahead(b.x, a.x, vb.x)) {
      if (a.y === b.y) return [a, b];
      const mx = Math.round((a.x + b.x) / 2 / GRID) * GRID;
      return simplify([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]);
    }
    const x = va.x > 0 ? Math.max(sa.x, sb.x) : Math.min(sa.x, sb.x);
    return simplify([a, { x, y: a.y }, { x, y: b.y }, b]);
  }

  if (!aHoriz && !bHoriz) {
    if (ahead(a.y, b.y, va.y) && ahead(b.y, a.y, vb.y)) {
      if (a.x === b.x) return [a, b];
      const my = Math.round((a.y + b.y) / 2 / GRID) * GRID;
      return simplify([a, { x: a.x, y: my }, { x: b.x, y: my }, b]);
    }
    const y = va.y > 0 ? Math.max(sa.y, sb.y) : Math.min(sa.y, sb.y);
    return simplify([a, { x: a.x, y }, { x: b.x, y }, b]);
  }

  // One horizontal, one vertical: a single L when both pins face the corner.
  if (aHoriz) {
    if (ahead(a.x, b.x, va.x) && ahead(b.y, a.y, vb.y)) return [a, { x: b.x, y: a.y }, b];
    return simplify([a, sa, { x: sa.x, y: sb.y }, sb, b]);
  }
  if (ahead(a.y, b.y, va.y) && ahead(b.x, a.x, vb.x)) return [a, { x: a.x, y: b.y }, b];
  return simplify([a, sa, { x: sb.x, y: sa.y }, sb, b]);
}

/** Drops repeated points and points in the middle of a straight run. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      if ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y)) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

export function roundedPath(pts: Pt[], r = 6): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = p1.x - ((p1.x - p0.x) / l1) * rr;
    const ay = p1.y - ((p1.y - p0.y) / l1) * rr;
    const bx = p1.x + ((p2.x - p1.x) / l2) * rr;
    const by = p1.y + ((p2.y - p1.y) / l2) * rr;
    d += ` L${ax} ${ay} Q${p1.x} ${p1.y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x} ${last.y}`;
}
