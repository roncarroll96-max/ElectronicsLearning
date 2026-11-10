import { useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PartKind } from '../model/parts';
import { PartIcon } from './PartIcon';

interface PartEntry {
  kind: PartKind;
  name: string;
  hint: string;
}

interface PartGroup {
  title: string;
  parts: PartEntry[];
}

const GROUPS: PartGroup[] = [
  {
    title: 'Power',
    parts: [
      { kind: 'battery', name: 'Battery', hint: '9 V' },
      { kind: 'ground', name: 'Ground', hint: '0 V reference' },
    ],
  },
  {
    title: 'Passive',
    parts: [
      { kind: 'resistor', name: 'Resistor', hint: 'Limits current' },
      { kind: 'potentiometer', name: 'Potentiometer', hint: 'Adjustable' },
      { kind: 'capacitor', name: 'Capacitor', hint: 'Stores charge' },
      { kind: 'ldr', name: 'Light sensor', hint: 'Photoresistor' },
    ],
  },
  {
    title: 'Output',
    parts: [
      { kind: 'led', name: 'LED', hint: 'Lights up' },
      { kind: 'lamp', name: 'Lamp', hint: 'Incandescent' },
      { kind: 'buzzer', name: 'Buzzer', hint: 'Makes sound' },
    ],
  },
  {
    title: 'Control',
    parts: [
      { kind: 'switch', name: 'Switch', hint: 'On / off' },
      { kind: 'pushbutton', name: 'Push button', hint: 'Momentary' },
    ],
  },
  {
    title: 'Semiconductors',
    parts: [
      { kind: 'diode', name: 'Diode', hint: 'One-way valve' },
      { kind: 'npn', name: 'NPN transistor', hint: 'Switch, amplifier' },
    ],
  },
];

interface Props {
  /** Pointer pressed on a tile: the app decides whether it becomes a drag or a click. */
  onTileDown: (kind: PartKind, e: RPointerEvent) => void;
  /** Keyboard activation (Enter/Space) of a tile. */
  onTileActivate: (kind: PartKind) => void;
}

export function PartsTray({ onTileDown, onTileActivate }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      parts: g.parts.filter((p) => `${p.name} ${p.hint}`.toLowerCase().includes(q)),
    })).filter((g) => g.parts.length > 0);
  }, [query]);

  return (
    <aside className="tray" aria-label="Parts">
      <div className="tray-head">
        <span className="panel-title">Parts</span>
        <input
          className="search"
          type="search"
          placeholder="Search parts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="tray-body">
        {groups.map((g) => (
          <section key={g.title} className="tray-group">
            <h3 className="tray-group-title">{g.title}</h3>
            <ul className="tray-grid">
              {g.parts.map((p) => (
                <li key={p.kind}>
                  <button
                    className="part-tile"
                    title={`${p.name}: drag onto the canvas, or click to add`}
                    onPointerDown={(e) => onTileDown(p.kind, e)}
                    onClick={(e) => {
                      // detail === 0 means keyboard activation; pointer clicks are handled on pointer up.
                      if (e.detail === 0) onTileActivate(p.kind);
                    }}
                  >
                    <span className="part-icon">
                      <PartIcon kind={p.kind} />
                    </span>
                    <span className="part-name">{p.name}</span>
                    <span className="part-hint">{p.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="empty-note">No parts match “{query}”.</p>}
      </div>
    </aside>
  );
}
