/** The multimeter behaves like a real one. */
import { describe, expect, it } from 'vitest';
import { BATTERY_R } from '../sim/models';
import { simulate } from '../sim/simulate';
import { bench, near, type Pin } from '../test/bench';
import { circuitWithMeter, fuseOverload, INITIAL_METER, METER, readMeter, type MeterMode, type MeterState } from './meter';

const probes = (mode: MeterMode, red: Pin, black: Pin): MeterState => ({
  ...INITIAL_METER,
  open: true,
  mode,
  red: { pin: { part: red[0].id, pin: red[1] } },
  black: { pin: { part: black[0].id, pin: black[1] } },
});

function measure(b: ReturnType<typeof bench>, m: MeterState) {
  const c = b.circuit();
  const sim = simulate(circuitWithMeter(c, m));
  return { reading: readMeter(c, m, sim), sim };
}

/** Battery and two resistors in series (a divider). */
function divider(r1: number, r2: number) {
  const b = bench();
  const bat = b.add('battery', 9);
  const top = b.add('resistor', r1);
  const bottom = b.add('resistor', r2);
  b.wire([bat, 0], [top, 0]);
  b.wire([top, 1], [bottom, 0]);
  b.wire([bottom, 1], [bat, 1]);
  return { b, bat, top, bottom };
}

describe('volts', () => {
  it('reads the middle of a 1 kΩ / 1 kΩ divider (its 10 MΩ input barely loads it)', () => {
    const { b, bat, bottom } = divider(1000, 1000);
    const { reading } = measure(b, probes('V', [bottom, 0], [bat, 1]));
    near(reading.value!, (9 * 1000) / (2000 + BATTERY_R), 1e-3);
  });

  it('loads a high-resistance divider noticeably, like a real meter', () => {
    // 1 MΩ / 1 MΩ: unloaded 4.5 V. With the meter's 10 MΩ across the bottom: 1M ∥ 10M = 909.1 kΩ
    // ⇒ 9 × 909.1k ÷ (1M + 909.1k) = 4.286 V.
    const { b, bat, bottom } = divider(1e6, 1e6);
    const { reading } = measure(b, probes('V', [bottom, 0], [bat, 1]));
    const par = (1e6 * METER.voltmeterR) / (1e6 + METER.voltmeterR);
    near(reading.value!, (9 * par) / (1e6 + par + BATTERY_R), 1e-6);
  });

  it('reads negative with the probes swapped', () => {
    const { b, bat } = divider(1000, 1000);
    const { reading } = measure(b, probes('V', [bat, 1], [bat, 0]));
    expect(reading.value!).toBeLessThan(-8.9);
  });
});

describe('amps', () => {
  it('in series (bridging a gap in the loop), it reads the loop current', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const r1 = b.add('resistor', 1000);
    b.wire([bat, 0], [r1, 0]);
    // No wire from R1 back to the battery: the meter closes the loop.
    const { reading } = measure(b, probes('A', [r1, 1], [bat, 1]));
    near(reading.value!, 9 / (1000 + BATTERY_R + METER.ammeterR));
  });

  it('across a battery it is nearly a short circuit and blows its fuse', () => {
    const b = bench();
    const bat = b.add('battery', 9);
    const m = probes('A', [bat, 0], [bat, 1]);
    const { sim } = measure(b, m);
    near(fuseOverload(m, sim)!, 9 / (BATTERY_R + METER.ammeterR));
    const blown = { ...m, fuseBlownAt: 4.5 };
    expect(measure(b, blown).reading.display).toBe('FUSE');
  });
});

describe('ohms', () => {
  it('measures a resistor, and resistors in series add', () => {
    const b = bench();
    const r1 = b.add('resistor', 1000);
    const r2 = b.add('resistor', 2200);
    b.wire([r1, 1], [r2, 0]);
    near(measure(b, probes('Ω', [r1, 0], [r1, 1])).reading.value!, 1000, 1e-6);
    near(measure(b, probes('Ω', [r1, 0], [r2, 1])).reading.value!, 3200, 1e-6);
  });

  it('refuses while a battery is connected', () => {
    const { b, top } = divider(1000, 1000);
    const { reading } = measure(b, probes('Ω', [top, 0], [top, 1]));
    expect(reading.value).toBeNull();
    expect(reading.note).toMatch(/Disconnect the battery/);
  });

  it('an LED reads OL; an open circuit reads OL', () => {
    const b = bench();
    const led = b.add('led');
    const r1 = b.add('resistor', 1000);
    expect(measure(b, probes('Ω', [led, 0], [led, 1])).reading.display).toBe('OL');
    expect(measure(b, probes('Ω', [r1, 0], [led, 1])).reading.display).toBe('OL');
  });

  it('unattached probes show nothing', () => {
    const b = bench();
    b.add('resistor', 1000);
    expect(measure(b, { ...INITIAL_METER, open: true }).reading.value).toBeNull();
  });
});
