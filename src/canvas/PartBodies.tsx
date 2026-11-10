/**
 * How each part looks, in local coordinates (horizontal, pins at x = ±40).
 * Schematic: standard circuit symbols. Realistic: what the physical part looks like.
 */
import type { Part } from '../model/circuit';
import { resistorBands } from '../model/parts';

const ZIGZAG = 'M-40 0H-18l3-8 6 16 6-16 6 16 6-16 6 16 3-8H40';

export function SchematicBody({ part }: { part: Part }) {
  switch (part.kind) {
    case 'resistor':
      return <path className="sym" d={ZIGZAG} />;
    case 'potentiometer':
      return (
        <>
          <path className="sym" d={ZIGZAG} />
          <path className="sym" d="M0 -40V-12M-4 -18l4 6 4-6" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path className="sym" d={ZIGZAG} />
          <path className="sym thin" d="M-16 -26l8 8M-8 -18h-5M-8 -18v-5M-4 -26l8 8M4 -18h-5M4 -18v-5" />
        </>
      );
    case 'capacitor':
      return (
        <>
          <path className="sym" d="M-40 0H-5M5 0H40M-5 -14V14M5 -14V14" />
        </>
      );
    case 'diode':
      return (
        <>
          <path className="sym" d="M-40 0H-10M10 0H40M10 -10V10" />
          <path className="sym fill" d="M-10 -10L10 0L-10 10Z" />
        </>
      );
    case 'led':
      return (
        <>
          <path className="sym" d="M-40 0H-10M10 0H40M10 -10V10" />
          <path className="sym fill" d="M-10 -10L10 0L-10 10Z" />
          <path className="sym thin" d="M0 -12l7-8M7 -20h-5M7 -20v5M8 -8l7-8M15 -16h-5M15 -16v5" />
        </>
      );
    case 'lamp':
      return (
        <>
          <path className="sym" d="M-40 0H-14M14 0H40" />
          <circle className="sym" r="14" />
          <path className="sym" d="M-10 -10L10 10M10 -10L-10 10" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path className="sym" d="M-40 0H-12M12 0H40" />
          <rect className="sym" x="-12" y="-12" width="24" height="24" rx="2" />
          <path className="sym thin" d="M-5 -5v10l6 4V-9z" />
        </>
      );
    case 'switch':
      return (
        <>
          <path className="sym" d="M-40 0H-16M16 0H40M-14 -1L13 -14" />
          <circle className="sym-dot" cx="-16" r="2.5" />
          <circle className="sym-dot" cx="16" r="2.5" />
        </>
      );
    case 'pushbutton':
      return (
        <>
          <path className="sym" d="M-40 0H-16M16 0H40M-18 -10H18M0 -10V-20M-6 -20H6" />
          <circle className="sym-dot" cx="-16" r="2.5" />
          <circle className="sym-dot" cx="16" r="2.5" />
        </>
      );
    case 'battery':
      return (
        <>
          <path className="sym" d="M-40 0H-6M6 0H40M-6 -16V16" />
          <path className="sym" d="M6 -8V8" strokeWidth={4} />
        </>
      );
    case 'npn':
      return (
        <>
          <circle className="sym" cx="4" cy="0" r="24" />
          <path className="sym" d="M-40 0H-8M-8 -14V14M-8 -6L20 -20V-40M-8 6L20 20V40" />
          <path className="sym fill" d="M20 20l-10-1 5-7z" />
        </>
      );
    case 'ground':
      return <path className="sym ground" d="M0 -20V0M-12 0H12M-7 6H7M-2 12H2" />;
  }
}

export function RealisticBody({ part }: { part: Part }) {
  switch (part.kind) {
    case 'resistor': {
      const bands = resistorBands(part.value ?? 0);
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40" />
          <rect x="-21" y="-8" width="42" height="16" rx="7" fill="#d8c398" stroke="#a8915f" />
          <rect x="-13" y="-8" width="4" height="16" fill={bands[0]} />
          <rect x="-6" y="-8" width="4" height="16" fill={bands[1]} />
          <rect x="1" y="-8" width="4" height="16" fill={bands[2]} />
          <rect x="11" y="-8" width="4" height="16" fill={bands[3]} />
          <rect x="-19" y="-6" width="38" height="3" rx="1.5" fill="#fff" opacity="0.25" />
        </>
      );
    }
    case 'potentiometer':
      return (
        <>
          <path className="lead" d="M-40 0H-18M18 0H40M0 -40V-16" />
          <rect x="-18" y="-16" width="36" height="30" rx="4" fill="#2459c9" stroke="#163b8c" />
          <circle cy="-1" r="9" fill="#e7e9ee" stroke="#9aa2b1" />
          <path d="M-5 -6l10 10" stroke="#59606e" strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path className="lead" d="M-40 0H-12M12 0H40" />
          <circle r="13" fill="#f1cf8a" stroke="#b48c45" />
          <path
            d="M-7 -6h11a2 2 0 0 1 0 4h-8a2 2 0 0 0 0 4h8a2 2 0 0 1 0 4h-11"
            fill="none"
            stroke="#a4492e"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      );
    case 'capacitor':
      return (
        <>
          <path className="lead" d="M-40 0H-12M12 0H40" />
          <rect x="-13" y="-16" width="26" height="32" rx="5" fill="#1f3c8f" stroke="#132764" />
          <rect x="6" y="-16" width="6" height="32" fill="#9cc2f5" opacity="0.85" />
          <path d="M8 -10v4M8 -2v4M8 6v4" stroke="#1f3c8f" strokeWidth="1.6" />
          <rect x="-11" y="-14" width="4" height="28" rx="2" fill="#fff" opacity="0.15" />
        </>
      );
    case 'diode':
      return (
        <>
          <path className="lead" d="M-40 0H-13M13 0H40" />
          <rect x="-13" y="-6.5" width="26" height="13" rx="2.5" fill="#22252b" stroke="#0e1013" />
          <rect x="6" y="-6.5" width="3.5" height="13" fill="#c8ccd3" />
        </>
      );
    case 'led':
      return (
        <>
          <path className="lead" d="M-40 0H-10M10 0H40" />
          <path d="M-12 8H12" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" />
          <path d="M-11 8V-4a11 11 0 0 1 22 0V8z" fill="#ef4444" fillOpacity="0.9" stroke="#b91c1c" />
          <ellipse cx="-4" cy="-6" rx="3" ry="5" fill="#fff" opacity="0.35" />
        </>
      );
    case 'lamp':
      return (
        <>
          <path className="lead" d="M-40 0H-14M14 0H40" />
          <circle r="15" className="bulb-glass" />
          <path
            d="M-9 3q2.25-8 4.5 0t4.5 0t4.5 0t4.5 0"
            fill="none"
            stroke="#8a6d3b"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path className="lead" d="M-40 0H-16M16 0H40" />
          <circle r="17" fill="#15181d" stroke="#363b45" />
          <circle r="11" fill="none" stroke="#2a2f38" />
          <circle r="3.5" fill="#363b45" />
          <path d="M-12 -12h4M-10 -14v4" stroke="#cfd4dc" strokeWidth="1.4" />
        </>
      );
    case 'switch':
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40" />
          <rect x="-20" y="-10" width="40" height="20" rx="4" fill="#2f343d" stroke="#1b1e24" />
          <rect x="-16" y="-6" width="32" height="12" rx="2" fill="#1b1e24" />
          <rect x="-15" y="-5" width="13" height="10" rx="2" fill="#e3e6eb" />
        </>
      );
    case 'pushbutton':
      return (
        <>
          <path className="lead" d="M-40 0H-18M18 0H40" />
          <rect x="-18" y="-16" width="36" height="28" rx="4" fill="#2a2e36" stroke="#16191e" />
          <circle cy="-2" r="10" fill="#e5484d" stroke="#a32a2e" />
          <ellipse cx="-3" cy="-6" rx="4" ry="2.5" fill="#fff" opacity="0.3" />
        </>
      );
    case 'battery':
      return (
        <>
          <path className="lead" d="M-40 0H-30M30 0H40" />
          <rect x="-30" y="-19" width="60" height="38" rx="5" fill="#1d2129" stroke="#0f1115" />
          <rect x="-30" y="-19" width="22" height="38" rx="5" fill="#e0a526" />
          <rect x="-12" y="-19" width="4" height="38" fill="#e0a526" />
          <text x="10" y="5" className="batt-text">
            9V
          </text>
          <text x="-19" y="5" className="batt-sign">
            +
          </text>
        </>
      );
    case 'npn':
      return (
        <>
          <path className="lead" d="M-40 0H-12M6 -10L20 -22V-40M6 10L20 22V40" />
          <path d="M-12 -16H4A16 16 0 0 1 4 16H-12Z" fill="#23262c" stroke="#0e1013" />
          <text x="-3" y="3" className="npn-text">
            NPN
          </text>
        </>
      );
    case 'ground':
      return <path className="sym ground" d="M0 -20V0M-12 0H12M-7 6H7M-2 12H2" />;
  }
}
