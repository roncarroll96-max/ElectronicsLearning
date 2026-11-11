import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { formatReading } from '../model/parts';
import { formatTime } from '../components/TimeControls';
import { autoSet, DIVS_X, DIVS_Y, formatDiv, TIME_DIVS, V_DIVS, type Channel, type ScopeState } from './scope';
import type { Trace } from './trace';

/** Classic scope colours: yellow for channel 1, cyan for channel 2. */
export const CH_COLOR = ['#facc15', '#22d3ee'] as const;

const W = 400;
const H = 240;

interface Props {
  scope: ScopeState;
  onChange: (s: ScopeState) => void;
  trace: Trace;
  /** Circuit time now, s. */
  now: number;
  /** The circuit changes over time (otherwise each channel is a steady line). */
  dynamic: boolean;
  /** Each channel's present voltage (null: probe not on a pin). */
  steady: [number | null, number | null];
  /** What each probe touches, e.g. "Q1 · Collector". */
  names: [string | null, string | null];
  /** Changes every animation frame, to redraw. */
  frame: number;
  onClose: () => void;
}

/** The two-channel oscilloscope: voltage over time at the points its probes touch. */
export function ScopePanel({ scope, onChange, trace, now, dynamic, steady, names, frame, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const span = scope.timeDiv * DIVS_X;

  // Which stretch of time is on screen: the latest (rolling), or held still on a CH1 rising edge.
  let t0 = now - span;
  let triggered = false;
  if (dynamic && scope.trigger && trace.length) {
    const st = trace.stats(0, now - 3 * span, now);
    if (st && st.max - st.min > 0.05) {
      const level = (st.max + st.min) / 2;
      const edges = trace.risingEdges(0, now - 3 * span, now - 0.9 * span, level, (st.max - st.min) * 0.1);
      if (edges.length) {
        t0 = edges[edges.length - 1] - 0.1 * span;
        triggered = true;
      }
    }
  }
  const t1 = t0 + span;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== W * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, scope, trace, t0, t1, dynamic, steady, triggered);
  });

  const measure = (ch: Channel) => {
    if (!scope.on[ch] || steady[ch] === null) return null;
    if (!dynamic || !trace.length) return { now: steady[ch]!, min: steady[ch]!, max: steady[ch]!, f: null as number | null };
    const st = trace.stats(ch, t0, t1);
    return { now: steady[ch]!, min: st?.min ?? steady[ch]!, max: st?.max ?? steady[ch]!, f: trace.frequency(ch, t0, t1) };
  };

  const set = (patch: Partial<ScopeState>) => onChange({ ...scope, ...patch });
  const setCh = <K extends 'on' | 'vDiv' | 'zero'>(key: K, ch: Channel, value: ScopeState[K][number]) => {
    const arr = [...scope[key]] as ScopeState[K];
    arr[ch] = value as never;
    set({ [key]: arr } as Partial<ScopeState>);
  };

  // Drag the panel by its title bar (the pointer is captured, so fast moves never lose it); "Dock" puts it back.
  const drag = useRef<{ id: number; sx: number; sy: number } | null>(null);
  const onHeadDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX - (offset?.x ?? 0), sy: e.clientY - (offset?.y ?? 0) };
  };
  const onHeadMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) setOffset({ x: e.clientX - d.sx, y: e.clientY - d.sy });
  };
  const onHeadUp = () => {
    drag.current = null;
  };

  return (
    <section
      className={`scope${offset ? ' floating' : ''}`}
      aria-label="Oscilloscope"
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      data-frame={frame}
    >
      <header
        className="scope-head"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        onLostPointerCapture={onHeadUp}
      >
        <span className="scope-title">Oscilloscope</span>
        <span className="scope-head-actions">
          <button
            className="scope-chip"
            onClick={() => onChange(autoSet(scope, trace, now, steady))}
            title="Fit both signals on the screen and choose a time base"
          >
            Auto
          </button>
          {offset && (
            <button className="scope-chip" onClick={() => setOffset(null)} title="Put the scope back in its corner">
              Dock
            </button>
          )}
          <button className="icon-btn scope-close" onClick={onClose} aria-label="Put the oscilloscope away">
            ×
          </button>
        </span>
      </header>

      <div className="scope-screen">
        <canvas ref={canvas} style={{ width: W, height: H }} role="img" aria-label="Oscilloscope screen" />
        <span className="scope-overlay tl">{formatDiv(scope.timeDiv)}/div</span>
        <span className="scope-overlay tr">
          {!dynamic ? 'Steady: nothing changes over time' : triggered ? 'Trig’d ▲ CH1' : scope.trigger ? 'Waiting for trigger' : 'Roll'}
        </span>
        <span className="scope-overlay br">t = {formatTime(Math.max(0, t1))}</span>
      </div>

      <div className="scope-channels">
        {([0, 1] as const).map((ch) => {
          const m = measure(ch);
          return (
            <div key={ch} className={`scope-ch${scope.on[ch] ? '' : ' off'}`} style={{ ['--ch' as string]: CH_COLOR[ch] }}>
              <button className="scope-ch-toggle" aria-pressed={scope.on[ch]} onClick={() => setCh('on', ch, !scope.on[ch])}>
                CH{ch + 1}
              </button>
              <select
                aria-label={`Channel ${ch + 1} volts per division`}
                value={scope.vDiv[ch]}
                onChange={(e) => setCh('vDiv', ch, Number(e.target.value))}
              >
                {V_DIVS.map((v) => (
                  <option key={v} value={v}>
                    {v} V/div
                  </option>
                ))}
              </select>
              <span className="scope-pos" role="group" aria-label={`Channel ${ch + 1} position`}>
                <button onClick={() => setCh('zero', ch, Math.min(DIVS_Y / 2, scope.zero[ch] + 0.5))} aria-label="Move up">
                  ▲
                </button>
                <button onClick={() => setCh('zero', ch, Math.max(-DIVS_Y / 2, scope.zero[ch] - 0.5))} aria-label="Move down">
                  ▼
                </button>
              </span>
              <span className="scope-ch-info">
                <span className="scope-ch-name">{names[ch] ?? 'Drag its probe onto a pin'}</span>
                {m && (
                  <span className="scope-ch-read mono">
                    {formatReading(m.now, 'V')}
                    {dynamic && m.max - m.min >= 0.01 && ` · ${formatReading(m.min, 'V')} to ${formatReading(m.max, 'V')}`}
                    {m.f && ` · ${m.f >= 1 ? `${m.f.toPrecision(3)} Hz` : `every ${formatTime(1 / m.f)}`}`}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="scope-time">
        <label>
          <span>Time</span>
          <select value={scope.timeDiv} onChange={(e) => set({ timeDiv: Number(e.target.value) })} aria-label="Time per division">
            {TIME_DIVS.map((d) => (
              <option key={d} value={d}>
                {formatDiv(d)}/div
              </option>
            ))}
          </select>
        </label>
        <button className="scope-chip" aria-pressed={scope.trigger} onClick={() => set({ trigger: !scope.trigger })} title="Hold a repeating signal still">
          Trigger {scope.trigger ? 'on' : 'off'}
        </button>
      </div>
    </section>
  );
}

/** Draws the grid and both traces. */
function draw(
  g: CanvasRenderingContext2D,
  s: ScopeState,
  trace: Trace,
  t0: number,
  t1: number,
  dynamic: boolean,
  steady: [number | null, number | null],
  triggered: boolean,
) {
  const dx = W / DIVS_X;
  const dy = H / DIVS_Y;
  g.fillStyle = '#0b1015';
  g.fillRect(0, 0, W, H);

  // Grid: dotted divisions, solid centre lines with ticks.
  g.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  g.lineWidth = 1;
  g.setLineDash([2, 3]);
  g.beginPath();
  for (let i = 1; i < DIVS_X; i++) {
    g.moveTo(i * dx + 0.5, 0);
    g.lineTo(i * dx + 0.5, H);
  }
  for (let j = 1; j < DIVS_Y; j++) {
    g.moveTo(0, j * dy + 0.5);
    g.lineTo(W, j * dy + 0.5);
  }
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(148, 163, 184, 0.32)';
  g.beginPath();
  g.moveTo(W / 2 + 0.5, 0);
  g.lineTo(W / 2 + 0.5, H);
  g.moveTo(0, H / 2 + 0.5);
  g.lineTo(W, H / 2 + 0.5);
  for (let i = 0; i <= DIVS_X * 5; i++) {
    g.moveTo(i * (dx / 5) + 0.5, H / 2 - 3);
    g.lineTo(i * (dx / 5) + 0.5, H / 2 + 3);
  }
  g.stroke();

  const tx = (t: number) => ((t - t0) / (t1 - t0)) * W;
  for (const ch of [1, 0] as const) {
    if (!s.on[ch] || steady[ch] === null) continue;
    const vy = (v: number) => H / 2 - (s.zero[ch] * dy + (v / s.vDiv[ch]) * dy);
    g.strokeStyle = CH_COLOR[ch];
    g.fillStyle = CH_COLOR[ch];

    // The channel's 0 V marker on the left edge.
    const zy = vy(0);
    if (zy >= -6 && zy <= H + 6) {
      g.beginPath();
      g.moveTo(0, zy - 6);
      g.lineTo(9, zy);
      g.lineTo(0, zy + 6);
      g.fill();
    }

    g.lineWidth = 1.6;
    g.shadowColor = CH_COLOR[ch];
    g.shadowBlur = 6;
    g.beginPath();
    if (!dynamic || !trace.length) {
      g.moveTo(0, vy(steady[ch]!));
      g.lineTo(W, vy(steady[ch]!));
    } else {
      let i = Math.max(0, trace.indexAt(t0) - 1);
      const end = trace.indexAt(t1);
      const count = end - i;
      let started = false;
      const point = (x: number, y: number) => {
        if (started) g.lineTo(x, y);
        else {
          g.moveTo(x, y);
          started = true;
        }
      };
      if (count < W) {
        // Few samples: join them with straight lines.
        for (; i <= end && i < trace.length; i++) {
          const v = trace.value(ch, i);
          if (!Number.isNaN(v)) point(tx(trace.timeAt(i)), vy(v));
        }
      } else {
        // Many samples per pixel: draw each column from its lowest to its highest value, so no spike is lost.
        const per = (t1 - t0) / W;
        for (let x = 0; x < W && i < trace.length; x++) {
          const tEnd = t0 + (x + 1) * per;
          let lo = Infinity;
          let hi = -Infinity;
          for (; i < trace.length && trace.timeAt(i) < tEnd; i++) {
            const v = trace.value(ch, i);
            if (Number.isNaN(v)) continue;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          if (lo <= hi) {
            point(x, vy(lo));
            if (hi > lo) point(x, vy(hi));
          }
        }
      }
      // Nothing changing since the last sample (settled or paused): carry the line on to now.
      if (started && trace.last < t1) {
        const v = trace.value(ch, trace.length - 1);
        if (!Number.isNaN(v)) {
          point(Math.max(0, tx(trace.last)), vy(v));
          point(W, vy(v));
        }
      }
    }
    g.stroke();
    g.shadowBlur = 0;
  }

  if (triggered) {
    // The trigger point, one division in.
    g.fillStyle = CH_COLOR[0];
    g.beginPath();
    g.moveTo(dx - 5, 0);
    g.lineTo(dx + 5, 0);
    g.lineTo(dx, 7);
    g.fill();
  }
}
