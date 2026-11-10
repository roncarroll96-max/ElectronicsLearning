import type { PointerEvent as RPointerEvent } from 'react';
import { pinKey, type Part, type PinRef } from '../model/circuit';
import { DIR_VEC, PART_DEFS, formatValue, rotateDir, rotatePoint, rotatedBounds, type Dir } from '../model/parts';
import type { View } from '../components/TopBar';
import { RealisticBody, SchematicBody } from './PartBodies';
import { PartGlow, Scorch, type PartLive } from './LiveFx';

interface Props {
  part: Part;
  view: View;
  selected: boolean;
  wireCount: Map<string, number>;
  targetKey: string | null;
  live?: PartLive;
  focused?: boolean;
  onPartDown: (e: RPointerEvent, part: Part) => void;
  onPinDown: (e: RPointerEvent, ref: PinRef) => void;
}

/** One part on the canvas: body, selection outline and connectable pins. */
export function PartShape({ part, view, selected, wireCount, targetKey, live, focused, onPartDown, onPinDown }: Props) {
  const def = PART_DEFS[part.kind];
  const b = def.bounds;
  return (
    <g
      className={`part kind-${part.kind}${selected ? ' selected' : ''}${part.burn ? ' burned' : ''}${live?.hot ? ' hot' : ''}`}
      transform={`translate(${part.x} ${part.y}) rotate(${part.rot})`}
      onPointerDown={(e) => onPartDown(e, part)}
    >
      <rect className="part-hit" x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="8" />
      {focused && <rect className="part-focus" x={b.x - 12} y={b.y - 12} width={b.w + 24} height={b.h + 24} rx="12" />}
      {live?.hot && <rect className="part-hot" x={b.x - 9} y={b.y - 9} width={b.w + 18} height={b.h + 18} rx="10" />}
      {selected && <rect className="part-sel" x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="8" />}
      <g className="body">{view === 'schematic' ? <SchematicBody part={part} /> : <RealisticBody part={part} />}</g>
      {part.burn ? <Scorch /> : live && <PartGlow part={part} view={view} live={live} />}
      {def.pins.map((pin, i) => {
        const key = pinKey({ part: part.id, pin: i });
        const connected = (wireCount.get(key) ?? 0) > 0;
        return (
          <g key={i} className="pin" onPointerDown={(e) => onPinDown(e, { part: part.id, pin: i })}>
            <circle className="pin-hit" cx={pin.x} cy={pin.y} r="10" />
            <circle
              className={`pin-dot${connected ? ' connected' : ''}${targetKey === key ? ' target' : ''}`}
              cx={pin.x}
              cy={pin.y}
              r={targetKey === key ? 6 : connected ? 3 : 4}
            />
            <PinName name={pin.name} x={pin.x} y={pin.y} dir={rotateDir(pin.dir, part.rot)} rot={part.rot} />
          </g>
        );
      })}
    </g>
  );
}

/** The pin's full name, shown beside it while the pointer is over it. Counter-rotated to stay upright. */
function PinName({ name, x, y, dir, rot }: { name: string; x: number; y: number; dir: Dir; rot: number }) {
  const at = { l: { x: -12, y: 4, a: 'end' }, r: { x: 12, y: 4, a: 'start' }, u: { x: 0, y: -12, a: 'middle' }, d: { x: 0, y: 20, a: 'middle' } }[dir];
  return (
    <g transform={`translate(${x} ${y}) rotate(${-rot})`}>
      <text className="pin-name" x={at.x} y={at.y} textAnchor={at.a}>
        {name}
      </text>
    </g>
  );
}

/**
 * Short pin labels for parts where it matters which way round they go:
 * + and − for polarized parts, A/W/B for a potentiometer, B/C/E for a transistor.
 * Drawn beside each lead, near the body, and always upright.
 */
const PIN_LABELS: Partial<Record<Part['kind'], string[]>> = {
  led: ['+', '−'],
  diode: ['+', '−'],
  buzzer: ['+', '−'],
  capacitor: ['+', '−'],
  battery: ['+', '−'],
  potentiometer: ['A', 'B', 'W'],
  npn: ['B', 'C', 'E'],
};

export function PinLabels({ part, view }: { part: Part; view: View }) {
  const labels = PIN_LABELS[part.kind];
  // The realistic battery already has its + printed on it.
  if (!labels || (part.kind === 'battery' && view === 'realistic')) return null;
  const pins = PART_DEFS[part.kind].pins;
  return (
    <>
      {labels.map((text, i) => {
        const pin = pins[i];
        const v = DIR_VEC[pin.dir];
        // A little in from the pin, along the lead, and off to one side of it.
        // Vertical leads sit closer to the body, clear of the reference/value label.
        const side = v.x !== 0 ? { x: 0, y: -9 } : { x: 9, y: 0 };
        const inset = v.x !== 0 ? 12 : 20;
        const local = { x: pin.x - v.x * inset + side.x, y: pin.y - v.y * inset + side.y };
        const p = rotatePoint(local.x, local.y, part.rot);
        const sign = text === '+' || text === '−';
        return (
          <text
            key={i}
            className={`pin-label${sign ? ' sign' : ''}`}
            x={part.x + p.x}
            y={part.y + p.y + (sign ? 4.5 : 3.5)}
            textAnchor="middle"
          >
            {text}
          </text>
        );
      })}
    </>
  );
}

/** Reference and value text, kept upright whatever the part's rotation. */
export function PartLabel({ part }: { part: Part }) {
  if (part.kind === 'ground') return null;
  const def = PART_DEFS[part.kind];
  const rb = rotatedBounds(def.bounds, part.rot);
  const value = part.value !== undefined && def.unit ? formatValue(part.value, def.unit) : null;
  const horizontal = part.rot % 180 === 0;

  if (horizontal) {
    return (
      <text className="part-label" x={part.x + rb.x + rb.w / 2} y={part.y + rb.y - 8} textAnchor="middle">
        <tspan className="ref">{part.ref}</tspan>
        {value && <tspan dx="5">{value}</tspan>}
      </text>
    );
  }
  const x = part.x + rb.x + rb.w + 10;
  const cy = part.y + rb.y + rb.h / 2;
  return (
    <text className="part-label" x={x} y={value ? cy - 2 : cy + 4}>
      <tspan className="ref">{part.ref}</tspan>
      {value && (
        <tspan x={x} dy="14">
          {value}
        </tspan>
      )}
    </text>
  );
}
