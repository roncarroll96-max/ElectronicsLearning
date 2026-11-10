import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import {
  addPart,
  addWire,
  analyzeNets,
  createPart,
  moveParts,
  newId,
  pinKey,
  pinWorld,
  pinWorldDir,
  samePin,
  type Circuit,
  type Part,
  type PinRef,
  type Pt,
  type Wire,
} from '../model/circuit';
import { GRID, PART_DEFS, rotatedBounds, type Dir, type PartKind } from '../model/parts';
import type { EditFn } from '../state/useCircuit';
import type { Mode, View } from '../components/TopBar';
import { probePin, type MeterState, type Probe } from '../meter/meter';
import { stressOf } from '../sim/ratings';
import type { SimResult } from '../sim/simulate';
import { GlowDefs, liveOf, Smoke, type PartLive } from './LiveFx';
import { PartLabel, PartMarks, PartShape } from './PartShape';
import { ProbeMarker, type ProbeColor } from './Probes';
import { roundedPath, routeWire } from './wirePath';

/** What the rest of the app can ask the canvas to do. */
export interface CanvasApi {
  /** Drop a part at a screen point. Returns false if the point isn't over the canvas. */
  dropPart(kind: PartKind, clientX: number, clientY: number): boolean;
  /** Place a part in the middle of the visible area, avoiding existing parts. */
  addPartAtCenter(kind: PartKind): void;
  /** Zoom and pan so the whole circuit is in view. */
  fit(): void;
}

interface Props {
  mode: Mode;
  view: View;
  circuit: Circuit;
  edit: EditFn;
  selection: string[];
  onSelect: (ids: string[]) => void;
  apiRef: MutableRefObject<CanvasApi | null>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onRotate: () => void;
  onDelete: () => void;
  sim: SimResult;
  meter: MeterState;
  onMeter: (m: MeterState) => void;
  /** Parts and pins to point at ("where to look"). */
  focus?: { parts: string[]; pins: PinRef[] };
  /** Overlays drawn on top of the canvas (meter panel, notices). */
  children?: ReactNode;
}

interface Viewport {
  x: number;
  y: number;
  k: number;
}

interface Draft {
  from: PinRef;
  to: Pt;
  target: PinRef | null;
  /** Tap-to-wire: first pin chosen, waiting for the second tap. */
  pending: boolean;
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'drag'; pointerId: number; ids: Set<string>; start: Pt; applied: Pt; recorded: boolean }
  | { kind: 'wire'; pointerId: number; from: PinRef; sx: number; sy: number; moved: boolean }
  | { kind: 'pinch'; d0: number; m0: Pt; v0: Viewport }
  | { kind: 'probe'; pointerId: number; color: ProbeColor; offset: Pt };

const MIN_K = 0.3;
const MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));
const snap = (n: number) => Math.round(n / GRID) * GRID;
const PIN_SNAP_RADIUS = 16;
const PROBE_SNAP_RADIUS = 22;

/** Below this, current is too small to show as moving dots. */
const FLOW_MIN = 1e-6;
const FLOW_PERIOD = 16;

/**
 * Speed of the current-flow dots. Currents in a circuit span from microamps
 * to amps, so speed follows the logarithm: every 10× more current adds the
 * same amount of speed (1 µA crawls, 20 mA moves briskly, 1 A races).
 */
function flowStyle(i: number) {
  const speed = 25 * Math.log10(Math.abs(i) / 1e-7); // canvas units per second
  return { animationDuration: `${(FLOW_PERIOD / speed).toFixed(3)}s`, animationDirection: i > 0 ? 'normal' : 'reverse' } as const;
}

export function CircuitCanvas(props: Props) {
  const { mode, view, circuit, edit, selection, onSelect, apiRef, sim, meter, onMeter, focus } = props;
  const [showFlow, setShowFlow] = useState(true);
  const hostRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panning, setPanning] = useState(false);

  // Refs mirror the latest values for use inside pointer handlers.
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const meterRef = useRef(meter);
  meterRef.current = meter;
  const gesture = useRef<Gesture>({ kind: 'none' });
  const touches = useRef(new Map<number, Pt>());

  const selSet = useMemo(() => new Set(selection), [selection]);
  const nets = useMemo(() => analyzeNets(circuit), [circuit]);
  const partById = useMemo(() => new Map(circuit.parts.map((p) => [p.id, p])), [circuit.parts]);

  // How each part looks given the simulation: glowing, sounding, running hot.
  const live = useMemo(() => {
    const out = new Map<string, PartLive>();
    if (!sim.ok || sim.idle) return out;
    for (const p of circuit.parts) {
      const r = sim.parts.get(p.id);
      const s = stressOf(p, r);
      out.set(p.id, liveOf(p, r, !!s && s.level !== 'ok'));
    }
    return out;
  }, [circuit.parts, sim]);

  // Start with the world origin in the middle of the canvas.
  useLayoutEffect(() => {
    const r = hostRef.current!.getBoundingClientRect();
    setVp({ x: Math.round(r.width / 2), y: Math.round(r.height / 2), k: 1 });
  }, []);

  /* ---------- Coordinate helpers ---------- */

  const toLocal = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  }, []);

  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const l = toLocal(cx, cy);
      const v = vpRef.current;
      return { x: (l.x - v.x) / v.k, y: (l.y - v.y) / v.k };
    },
    [toLocal],
  );

  const findPinNear = (w: Pt, exclude: PinRef | null, radius = PIN_SNAP_RADIUS): PinRef | null => {
    let best: PinRef | null = null;
    let bestD = radius;
    for (const p of circuitRef.current.parts) {
      PART_DEFS[p.kind].pins.forEach((_, i) => {
        const ref = { part: p.id, pin: i };
        if (exclude && samePin(ref, exclude)) return;
        const pw = pinWorld(p, i);
        const d = Math.hypot(pw.x - w.x, pw.y - w.y);
        if (d < bestD) {
          bestD = d;
          best = ref;
        }
      });
    }
    return best;
  };

  /* ---------- Zoom ---------- */

  const zoomAt = useCallback((lx: number, ly: number, factor: number) => {
    setVp((v) => {
      const k = clampK(v.k * factor);
      const wx = (lx - v.x) / v.k;
      const wy = (ly - v.y) / v.k;
      return { k, x: lx - wx * k, y: ly - wy * k };
    });
  }, []);

  const zoomCenter = (factor: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  };

  const fitToContent = () => {
    const r = svgRef.current!.getBoundingClientRect();
    const parts = circuitRef.current.parts;
    if (parts.length === 0) {
      setVp({ x: Math.round(r.width / 2), y: Math.round(r.height / 2), k: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of parts) {
      const b = rotatedBounds(PART_DEFS[p.kind].bounds, p.rot);
      minX = Math.min(minX, p.x + b.x, p.x - 40);
      minY = Math.min(minY, p.y + b.y - 24);
      maxX = Math.max(maxX, p.x + b.x + b.w, p.x + 40);
      maxY = Math.max(maxY, p.y + b.y + b.h);
    }
    const pad = 60;
    const k = clampK(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY), 1.5));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setVp({ k, x: r.width / 2 - cx * k, y: r.height / 2 - cy * k });
  };

  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const l = toLocal(e.clientX, e.clientY);
      const step = e.deltaMode === 1 ? 0.05 : 0.0015;
      zoomAt(l.x, l.y, Math.exp(-e.deltaY * step));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toLocal, zoomAt]);

  /* ---------- Placing parts ---------- */

  const placePart = useCallback(
    (kind: PartKind, x: number, y: number) => {
      const part = createPart(kind, x, y);
      edit((c) => addPart(c, part));
      onSelect([part.id]);
    },
    [edit, onSelect],
  );

  const freeSpot = (x: number, y: number): Pt => {
    const taken = (px: number, py: number) =>
      circuitRef.current.parts.some((p) => Math.abs(p.x - px) < 120 && Math.abs(p.y - py) < 80);
    for (let ring = 0; ring < 6; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const px = x + dx * 140;
          const py = y + dy * 100;
          if (!taken(px, py)) return { x: px, y: py };
        }
      }
    }
    return { x, y };
  };

  useEffect(() => {
    apiRef.current = {
      dropPart(kind, clientX, clientY) {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
        const w = toWorld(clientX, clientY);
        placePart(kind, snap(w.x), snap(w.y));
        return true;
      },
      addPartAtCenter(kind) {
        const r = svgRef.current!.getBoundingClientRect();
        const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
        const spot = freeSpot(snap(w.x), snap(w.y));
        placePart(kind, spot.x, spot.y);
      },
      fit: fitToContent,
    };
  });

  /* ---------- Wiring ---------- */

  const connect = (a: PinRef, b: PinRef) => {
    const id = newId('w');
    edit((c) => addWire(c, id, a, b));
  };

  const updateDraft = (clientX: number, clientY: number) => {
    const d = draftRef.current;
    if (!d) return;
    const w = toWorld(clientX, clientY);
    const target = findPinNear(w, d.from);
    const tp = target ? partById.get(target.part) : undefined;
    setDraft({ ...d, target, to: target && tp ? pinWorld(tp, target.pin) : w });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Pointer handling ---------- */

  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onBackgroundDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, toLocal(e.clientX, e.clientY));
      capture(e.pointerId);
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        gesture.current = {
          kind: 'pinch',
          d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          v0: vpRef.current,
        };
        return;
      }
    }
    if (e.button !== 0 && e.button !== 1) return;
    if (draftRef.current) setDraft(null);
    if (!e.shiftKey) onSelect([]);
    capture(e.pointerId);
    gesture.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: vpRef.current.x,
      oy: vpRef.current.y,
    };
    setPanning(true);
  };

  const onPartDown = (e: RPointerEvent, part: Part) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (draftRef.current) setDraft(null);

    let ids: Set<string>;
    if (e.shiftKey) {
      const next = selSet.has(part.id) ? selection.filter((id) => id !== part.id) : [...selection, part.id];
      onSelect(next);
      if (!next.includes(part.id)) return;
      ids = new Set(next);
    } else if (selSet.has(part.id)) {
      ids = new Set(selection);
    } else {
      onSelect([part.id]);
      ids = new Set([part.id]);
    }
    capture(e.pointerId);
    gesture.current = {
      kind: 'drag',
      pointerId: e.pointerId,
      ids,
      start: toWorld(e.clientX, e.clientY),
      applied: { x: 0, y: 0 },
      recorded: false,
    };
  };

  const onPinDown = (e: RPointerEvent, ref: PinRef) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const d = draftRef.current;
    if (d?.pending) {
      if (!samePin(d.from, ref)) connect(d.from, ref);
      setDraft(null);
      return;
    }
    const part = partById.get(ref.part);
    if (!part) return;
    capture(e.pointerId);
    gesture.current = { kind: 'wire', pointerId: e.pointerId, from: ref, sx: e.clientX, sy: e.clientY, moved: false };
    setDraft({ from: ref, to: pinWorld(part, ref.pin), target: null, pending: false });
  };

  const onWireDown = (e: RPointerEvent, wire: Wire) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (draftRef.current) setDraft(null);
    if (e.shiftKey) {
      onSelect(selSet.has(wire.id) ? selection.filter((id) => id !== wire.id) : [...selection, wire.id]);
    } else {
      onSelect([wire.id]);
    }
  };

  /* ---------- Multimeter probes ---------- */

  const probeAt = (p: Probe): Pt | null => {
    if ('at' in p) return p.at;
    const part = partById.get(p.pin.part);
    return part ? pinWorld(part, p.pin.pin) : null;
  };

  const onProbeDown = (e: RPointerEvent, color: ProbeColor) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const tip = probeAt(meterRef.current[color]);
    if (!tip) return;
    const w = toWorld(e.clientX, e.clientY);
    capture(e.pointerId);
    gesture.current = { kind: 'probe', pointerId: e.pointerId, color, offset: { x: tip.x - w.x, y: tip.y - w.y } };
  };

  const toggleMeter = () => {
    const m = meterRef.current;
    if (m.open) {
      onMeter({ ...m, open: false });
      return;
    }
    // Park any loose probes in view, near the bottom right.
    const r = svgRef.current!.getBoundingClientRect();
    const park = (dx: number): Probe => ({ at: toWorld(r.right - dx, r.bottom - 110) });
    onMeter({
      ...m,
      open: true,
      red: probePin(circuitRef.current, m.red) ? m.red : park(70),
      black: probePin(circuitRef.current, m.black) ? m.black : park(150),
    });
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, toLocal(e.clientX, e.clientY));
    const g = gesture.current;
    switch (g.kind) {
      case 'pinch': {
        const pts = [...touches.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const k = clampK((g.v0.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const wx = (g.m0.x - g.v0.x) / g.v0.k;
        const wy = (g.m0.y - g.v0.y) / g.v0.k;
        setVp({ k, x: m.x - wx * k, y: m.y - wy * k });
        return;
      }
      case 'pan':
        if (e.pointerId !== g.pointerId) return;
        setVp((v) => ({ ...v, x: g.ox + e.clientX - g.sx, y: g.oy + e.clientY - g.sy }));
        return;
      case 'drag': {
        if (e.pointerId !== g.pointerId) return;
        const w = toWorld(e.clientX, e.clientY);
        const sx = snap(w.x - g.start.x);
        const sy = snap(w.y - g.start.y);
        const dx = sx - g.applied.x;
        const dy = sy - g.applied.y;
        if (dx === 0 && dy === 0) return;
        const ids = g.ids;
        // The first step of a drag is recorded for undo; the rest fold into it.
        edit((c) => moveParts(c, ids, dx, dy), !g.recorded);
        g.recorded = true;
        g.applied = { x: sx, y: sy };
        return;
      }
      case 'probe': {
        if (e.pointerId !== g.pointerId) return;
        const w = toWorld(e.clientX, e.clientY);
        const tip = { x: w.x + g.offset.x, y: w.y + g.offset.y };
        const pin = findPinNear(tip, null, PROBE_SNAP_RADIUS);
        onMeter({ ...meterRef.current, [g.color]: pin ? { pin } : { at: tip } });
        return;
      }
      case 'wire':
        if (e.pointerId !== g.pointerId) return;
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 4) g.moved = true;
        updateDraft(e.clientX, e.clientY);
        return;
      default:
        if (draftRef.current?.pending) updateDraft(e.clientX, e.clientY);
    }
  };

  const endGesture = (e: RPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (touches.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'none' || g.pointerId !== e.pointerId) return;
    gesture.current = { kind: 'none' };
    setPanning(false);

    if (g.kind === 'wire') {
      const d = draftRef.current;
      if (!cancelled && d?.target) {
        connect(g.from, d.target);
        setDraft(null);
      } else if (!cancelled && !g.moved) {
        // A tap on a pin: wait for a tap on the second pin.
        setDraft((cur) => (cur ? { ...cur, pending: true } : cur));
      } else {
        setDraft(null);
      }
    }
  };

  /* ---------- Rendering ---------- */

  const draftPath = useMemo(() => {
    if (!draft) return null;
    const part = partById.get(draft.from.part);
    if (!part) return null;
    const a = pinWorld(part, draft.from.pin);
    const da = pinWorldDir(part, draft.from.pin);
    let db: Dir;
    const tp = draft.target ? partById.get(draft.target.part) : undefined;
    if (draft.target && tp) {
      db = pinWorldDir(tp, draft.target.pin);
    } else {
      const dx = draft.to.x - a.x;
      const dy = draft.to.y - a.y;
      db = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'l' : 'r') : dy > 0 ? 'u' : 'd';
    }
    return roundedPath(routeWire(a, da, draft.to, db));
  }, [draft, partById]);

  const targetKey = draft?.target ? pinKey(draft.target) : null;
  const empty = circuit.parts.length === 0;

  return (
    <main className="canvas" ref={hostRef} aria-label="Circuit canvas">
      <div
        className="canvas-grid"
        style={{
          backgroundSize: `${GRID * vp.k}px ${GRID * vp.k}px`,
          backgroundPosition: `${vp.x - (GRID * vp.k) / 2}px ${vp.y - (GRID * vp.k) / 2}px`,
        }}
      />
      <svg
        ref={svgRef}
        className={`circuit-svg view-${view}${draft ? ' wiring' : ''}${panning ? ' panning' : ''}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <GlowDefs />
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.k})`}>
          <g className="wires">
            {circuit.wires.map((w) => {
              const pa = partById.get(w.a.part);
              const pb = partById.get(w.b.part);
              if (!pa || !pb) return null;
              const d = roundedPath(
                routeWire(pinWorld(pa, w.a.pin), pinWorldDir(pa, w.a.pin), pinWorld(pb, w.b.pin), pinWorldDir(pb, w.b.pin)),
              );
              const role = nets.role.get(pinKey(w.a)) ?? 'signal';
              const amps = sim.ok && !sim.idle ? (sim.wires.get(w.id) ?? 0) : 0;
              return (
                <g
                  key={w.id}
                  className={`wire role-${role}${selSet.has(w.id) ? ' selected' : ''}`}
                  onPointerDown={(e) => onWireDown(e, w)}
                >
                  <path className="wire-hit" d={d} />
                  <path className="wire-line" d={d} />
                  {showFlow && Math.abs(amps) >= FLOW_MIN && <path className="wire-flow" d={d} style={flowStyle(amps)} />}
                </g>
              );
            })}
          </g>
          {draftPath && <path className="draft-line" d={draftPath} />}
          <g className="parts">
            {circuit.parts.map((p) => (
              <PartShape
                key={p.id}
                part={p}
                view={view}
                selected={selSet.has(p.id)}
                wireCount={nets.wireCount}
                targetKey={targetKey}
                live={live.get(p.id)}
                focused={!!focus?.parts.includes(p.id)}
                onPartDown={onPartDown}
                onPinDown={onPinDown}
              />
            ))}
          </g>
          <g className="labels">
            {view === 'schematic' && circuit.parts.map((p) => <PartMarks key={`m${p.id}`} part={p} />)}
            {circuit.parts.map((p) => (
              <PartLabel key={p.id} part={p} />
            ))}
          </g>
          {focus && (
            <g className="pin-focus-layer">
              {focus.pins.map((ref) => {
                const part = partById.get(ref.part);
                if (!part) return null;
                const at = pinWorld(part, ref.pin);
                return <circle key={pinKey(ref)} className="pin-focus" cx={at.x} cy={at.y} r="9" />;
              })}
            </g>
          )}
          <g className="smokes">
            {circuit.parts.map((p) => p.burn && <Smoke key={p.id} part={p} />)}
          </g>
          {meter.open && (
            <g className="probes">
              {(['black', 'red'] as const).map((color) => {
                const at = probeAt(meter[color]);
                return (
                  at && (
                    <ProbeMarker key={color} color={color} at={at} attached={!!probePin(circuit, meter[color])} onDown={onProbeDown} />
                  )
                );
              })}
            </g>
          )}
        </g>
      </svg>

      <div className="canvas-badge">{view === 'realistic' ? 'Realistic view' : 'Schematic view'}</div>

      {draft && (
        <div className="canvas-hint" role="status">
          {draft.pending ? 'Now tap the pin to connect to' : 'Release on another pin to connect'}
          <kbd>Esc</kbd> cancels
        </div>
      )}

      {empty && (
        <div className="empty-state">
          <div className="empty-glyph" aria-hidden="true">
            <svg viewBox="0 0 64 40" width="96" height="60" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h14l3-7 5 14 5-14 5 14 5-14 3 7h16" stroke="var(--accent)" strokeWidth="2" />
              <circle cx="4" cy="20" r="2.5" fill="var(--accent)" />
              <circle cx="60" cy="20" r="2.5" fill="var(--accent)" />
            </svg>
          </div>
          <h2>{mode === 'learn' ? 'Your first circuit starts here' : 'Blank canvas'}</h2>
          <p>Drag a part from the tray, or click one to drop it here. Then drag from pin to pin to wire them up.</p>
        </div>
      )}

      {props.children}

      <Toolbar
        {...props}
        zoom={vp.k}
        onZoomIn={() => zoomCenter(1.2)}
        onZoomOut={() => zoomCenter(1 / 1.2)}
        onFit={fitToContent}
        showFlow={showFlow}
        onToggleFlow={() => setShowFlow((f) => !f)}
        onToggleMeter={toggleMeter}
      />
    </main>
  );
}

/* ---------- Floating toolbar ---------- */

interface ToolbarProps extends Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  showFlow: boolean;
  onToggleFlow: () => void;
  onToggleMeter: () => void;
}

function Toolbar({
  undo,
  redo,
  canUndo,
  canRedo,
  selection,
  circuit,
  onRotate,
  onDelete,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  showFlow,
  onToggleFlow,
  meter,
  onToggleMeter,
}: ToolbarProps) {
  const hasPart = selection.some((id) => circuit.parts.some((p) => p.id === id));
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <ToolBtn label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <path d="M7 5L3 9l4 4M3.5 9H12a5 5 0 0 1 0 10H9" />
      </ToolBtn>
      <ToolBtn label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
        <path d="M13 5l4 4-4 4M16.5 9H8a5 5 0 0 0 0 10h3" />
      </ToolBtn>
      <span className="tb-sep" />
      <ToolBtn label="Rotate (R)" disabled={!hasPart} onClick={onRotate}>
        <path d="M16 10a6 6 0 1 1-2-4.5M16 3v4h-4" />
      </ToolBtn>
      <ToolBtn label="Delete (Del)" disabled={selection.length === 0} onClick={onDelete}>
        <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
      </ToolBtn>
      <span className="tb-sep" />
      <ToolBtn label={showFlow ? 'Hide current flow' : 'Show current flow'} pressed={showFlow} onClick={onToggleFlow}>
        <path d="M2 10h3M8 10h4M15 10h3M14 7l3 3-3 3" />
      </ToolBtn>
      <ToolBtn label={meter.open ? 'Put the multimeter away' : 'Multimeter'} pressed={meter.open} onClick={onToggleMeter}>
        <rect x="5" y="2.5" width="10" height="15" rx="2" />
        <rect x="7" y="4.5" width="6" height="4" rx="0.8" />
        <circle cx="10" cy="13" r="2" />
      </ToolBtn>
      <span className="tb-sep" />
      <ToolBtn label="Zoom out" onClick={onZoomOut}>
        <path d="M5 10h10" />
      </ToolBtn>
      <button className="zoom-readout" onClick={onFit} title="Fit circuit to screen">
        {Math.round(zoom * 100)}%
      </button>
      <ToolBtn label="Zoom in" onClick={onZoomIn}>
        <path d="M5 10h10M10 5v10" />
      </ToolBtn>
      <ToolBtn label="Fit to screen" onClick={onFit}>
        <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`tb-btn${pressed ? ' on' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
