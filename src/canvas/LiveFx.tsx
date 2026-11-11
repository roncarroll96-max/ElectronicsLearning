/**
 * What the simulation looks like on the canvas: glowing LEDs and lamps,
 * buzzer sound waves, smoke from burned-out parts. All drawn in a part's
 * local coordinates unless noted, and never catching the pointer.
 */
import type { Part } from '../model/circuit';
import { UNO } from '../model/parts';
import { LAMP } from '../sim/models';
import type { PartReading } from '../sim/simulate';
import type { View } from '../components/TopBar';

export interface PartLive {
  /** 0 = off, 1 = full brightness. */
  glow: number;
  /** A buzzer that is sounding. */
  sound: boolean;
  /** Running above its rating. */
  hot: boolean;
}

/** How brightly a part shines for a given reading. */
export function liveOf(part: Part, r: PartReading | undefined, hot: boolean): PartLive {
  let glow = 0;
  let sound = false;
  if (r && !part.burn) {
    if (part.kind === 'led') {
      // Light output is roughly proportional to current, but our eyes compress it:
      // 1 mA already looks clearly lit, 20 mA is full brightness.
      const i = r.i[0];
      glow = i > 1e-5 ? Math.min(1, Math.sqrt(i / 0.02)) : 0;
    } else if (part.kind === 'lamp') {
      // A filament barely glows (dull orange) until it gets near its rated power.
      const p = Math.max(0, r.power) / (LAMP.v * LAMP.i);
      glow = Math.min(1, p) ** 1.5;
      if (glow < 0.02) glow = 0;
    } else if (part.kind === 'buzzer') {
      sound = r.i[0] > 0.005;
    } else if (part.kind === 'arduino') {
      // The board's L light follows pin 13 (through a buffer, so it doesn't load the pin).
      glow = r.v[13] - r.v[UNO.gnd] > 2.5 ? 1 : 0;
    }
  }
  return { glow, sound, hot };
}

/** Gradients shared by every glow. */
export function GlowDefs() {
  return (
    <defs>
      <radialGradient id="glow-led">
        <stop offset="0" stopColor="#ff6b6b" stopOpacity="0.95" />
        <stop offset="0.35" stopColor="#ff3b3b" stopOpacity="0.45" />
        <stop offset="1" stopColor="#ff3b3b" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-lamp">
        <stop offset="0" stopColor="#fff4cf" stopOpacity="0.95" />
        <stop offset="0.4" stopColor="#ffc861" stopOpacity="0.45" />
        <stop offset="1" stopColor="#ff9d2e" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** Light and sound, drawn over the part body. */
export function PartGlow({ part, view, live }: { part: Part; view: View; live: PartLive }) {
  const g = live.glow;
  if (part.kind === 'led' && g > 0) {
    return (
      <g className="live-fx">
        <circle cy={view === 'realistic' ? -2 : 0} r={14 + 22 * g} fill="url(#glow-led)" opacity={0.35 + 0.65 * g} />
        {view === 'realistic' ? (
          <>
            <path d="M-11 8V-4a11 11 0 0 1 22 0V8z" fill="#ffd0d0" opacity={0.75 * g} />
            <circle cy="-2" r={3 + 3 * g} fill="#fff" opacity={0.8 * g} />
          </>
        ) : (
          <path d="M-10 -10L10 0L-10 10Z" fill="#ff5b5b" opacity={g} />
        )}
      </g>
    );
  }
  if (part.kind === 'arduino') {
    if (view !== 'realistic') return null;
    // The ON light is lit while it has power; L shows pin 13.
    return (
      <g className="live-fx">
        <circle cx="132" cy="-61.5" r="9" fill="url(#glow-led)" opacity="0.3" />
        <rect x="128" y="-64" width="8" height="5" rx="1" fill="#8dff9a" />
        {g > 0 && (
          <>
            <circle cx="-104" cy="-61.5" r="13" fill="url(#glow-led)" opacity="0.9" />
            <rect x="-108" y="-64" width="8" height="5" rx="1" fill="#ffb070" />
          </>
        )}
      </g>
    );
  }
  if (part.kind === 'lamp' && g > 0) {
    // Dim filaments glow deep orange; bright ones are warm white.
    const filament = g > 0.6 ? '#fff6d8' : g > 0.25 ? '#ffc35c' : '#ff8a3d';
    return (
      <g className="live-fx">
        <circle r={16 + 26 * g} fill="url(#glow-lamp)" opacity={0.25 + 0.75 * g} />
        {view === 'realistic' ? (
          <>
            <circle r="14" fill="#ffd27a" opacity={0.45 * g} />
            <path
              d="M-9 3q2.25-8 4.5 0t4.5 0t4.5 0t4.5 0"
              fill="none"
              stroke={filament}
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity={Math.min(1, 0.4 + g)}
            />
          </>
        ) : (
          <circle r="13" fill={filament} opacity={0.55 * g} />
        )}
      </g>
    );
  }
  if ((part.kind === 'buzzer' || part.kind === 'speaker') && live.sound) {
    return (
      <g className="live-fx sound-waves">
        <path d="M21 -7a10 10 0 0 1 0 14" />
        <path d="M26 -12a17 17 0 0 1 0 24" />
      </g>
    );
  }
  return null;
}

/** Scorch mark on a burned-out part (local coordinates). */
export function Scorch() {
  return (
    <g className="live-fx scorch">
      <ellipse rx="13" ry="9" fill="#000" opacity="0.45" />
      <path d="M-6 -4l3 3M4 -5l-2 4M-2 5l2-3" stroke="#000" strokeWidth="1.4" opacity="0.6" />
    </g>
  );
}

/** A puff of smoke rising from a part that just burned out (world coordinates). */
export function Smoke({ part }: { part: Part }) {
  return (
    <g className="smoke" transform={`translate(${part.x} ${part.y})`} aria-hidden="true">
      <circle r="7" cx="-4" />
      <circle r="9" cx="4" />
      <circle r="6" cx="0" />
    </g>
  );
}
