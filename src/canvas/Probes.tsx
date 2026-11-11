import type { PointerEvent as RPointerEvent } from 'react';
import type { Pt } from '../model/circuit';

/** Multimeter probes (red, black) and oscilloscope probes (channel 1, channel 2). */
export type ProbeColor = 'red' | 'black' | 'ch1' | 'ch2';

const TITLE: Record<ProbeColor, string> = {
  red: 'Red probe (+): drag onto a pin',
  black: 'Black probe (COM): drag onto a pin',
  ch1: 'Oscilloscope channel 1: drag onto a pin',
  ch2: 'Oscilloscope channel 2: drag onto a pin',
};
const LABEL: Record<ProbeColor, string> = { red: '+', black: 'COM', ch1: 'CH1', ch2: 'CH2' };

/**
 * A multimeter probe, drawn as a pen whose metal tip sits exactly on `at`.
 * The red probe leans right and the black one left, so both fit on
 * neighboring pins.
 */
export function ProbeMarker({
  color,
  at,
  attached,
  onDown,
}: {
  color: ProbeColor;
  at: Pt;
  attached: boolean;
  onDown: (e: RPointerEvent, color: ProbeColor) => void;
}) {
  // Lean apart so two probes fit on neighbouring pins: red and channel 1 lean right.
  const s = color === 'red' || color === 'ch1' ? 1 : -1;
  return (
    <g
      className={`probe probe-${color}${attached ? ' attached' : ''}`}
      transform={`translate(${at.x} ${at.y})`}
      onPointerDown={(e) => onDown(e, color)}
    >
      <title>{TITLE[color]}</title>
      {attached && <circle className="probe-ring" r="8" />}
      <path className="probe-metal" d={`M0 0L${6 * s} -8`} />
      <path className="probe-handle" d={`M${7 * s} -10L${21 * s} -30`} />
      <path className="probe-collar" d={`M${4 * s} -12L${10 * s} -8`} />
      <text className="probe-label" x={25 * s} y={-34} textAnchor={s > 0 ? 'start' : 'end'}>
        {LABEL[color]}
      </text>
      <circle className="probe-hit" cx={12 * s} cy={-16} r={16} />
    </g>
  );
}
