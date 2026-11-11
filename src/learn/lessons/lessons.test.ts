/**
 * Every lesson can be completed: each test plays the learner, doing exactly
 * what the steps ask, and checks the steps tick off in order. This catches a
 * step whose check is impossible (or too easy) before a real learner does.
 */
import { describe, expect, it } from 'vitest';
import { flipPart } from '../../model/circuit';
import { LESSONS } from './index';
import { isComplete } from './progress';
import { allSteps } from './types';
import { play } from './harness';

describe('lessons', () => {
  it('every lesson has a concept, steps with unique ids, and a summary', () => {
    for (const l of LESSONS) {
      expect(l.concept.length, l.id).toBeGreaterThan(0);
      const ids = allSteps(l).map((s) => s.id);
      expect(new Set(ids).size, l.id).toBe(ids.length);
      expect(l.summary.length, l.id).toBeGreaterThan(0);
    }
  });

  it('nothing ticks off by itself in a starter circuit', () => {
    for (const l of LESSONS) expect(play(l.id).tick(), l.id).toEqual([]);
  });

  it('Light your first LED', () => {
    const p = play('first-led');
    const bat = p.add('battery');
    p.expectDone(['battery']);
    const r = p.add('resistor');
    const led = p.add('led');
    p.expectDone(['battery', 'resistor', 'led']);
    p.wire(bat, 0, r, 0);
    p.wire(r, 1, led, 0);
    p.expectDone(['battery', 'resistor', 'led', 'wire-1', 'wire-2']);
    p.wire(led, 1, bat, 1);
    p.set(r, { value: 1000 });
    p.tick();
    p.set(r, { value: 100 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Voltage: the push', () => {
    const p = play('voltage');
    const bat = p.find('battery');
    const lamp = p.find('lamp');
    p.meter('V');
    p.expectDone(['meter']);
    p.meter('V', [bat, 0], [bat, 1]);
    p.expectDone(['meter', 'battery']);
    p.meter('V', [lamp, 0], [lamp, 1]);
    p.expectDone(['meter', 'battery', 'lamp']);
    p.set(bat, { value: 4.5 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Current: the flow (including the blown fuse)', () => {
    const p = play('current');
    const bat = p.find('battery');
    const led = p.find('led');
    p.unwire(led, 1, bat, 1);
    p.expectDone(['open']);
    p.meter('A', [led, 1], [bat, 1]);
    p.expectDone(['open', 'amps', 'bridge']);
    p.meter('A', [bat, 0], [bat, 1]);
    p.expectDone(['open', 'amps', 'bridge', 'fuse']);
    p.replaceFuse(); // probes still across the battery: blows again at once
    p.expectDone(['open', 'amps', 'bridge', 'fuse']);
    p.meter('A', [led, 1], [bat, 1]);
    p.replaceFuse();
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Ohm’s law, with the design challenge', () => {
    const p = play('ohms-law');
    const bat = p.find('battery');
    const r = p.find('resistor');
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['volts']);
    p.unwire(r, 1, bat, 1);
    p.meter('A', [r, 1], [bat, 1]);
    p.expectDone(['volts', 'amps']);
    p.set(r, { value: 2200 });
    p.expectDone(['volts', 'amps', 'double']);
    // Challenge: put the meter away, then R → LED → battery −, with 470 Ω.
    p.closeMeter();
    const led = p.add('led');
    p.wire(r, 1, led, 0);
    p.wire(led, 1, bat, 1);
    p.set(r, { value: 470 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Diodes: one-way streets', () => {
    const p = play('diodes');
    const d = p.find('diode');
    const r = p.find('resistor');
    p.meter('V', [d, 0], [d, 1]);
    p.expectDone(['forward']);
    p.c = flipPart(p.c, d.id);
    p.expectDone(['forward', 'reverse', 'blocking']);
    p.c = flipPart(p.c, d.id);
    p.set(r, { value: 1000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Foundations, lessons 4 and 6–10 ---------- */

  it('Resistance: the squeeze', () => {
    const p = play('resistance');
    const r = p.ref('R1');
    const ldr = p.ref('LDR1');
    p.meter('Ω');
    p.expectDone(['ohms']);
    p.meter('Ω', [r, 0], [r, 1]);
    p.expectDone(['ohms', 'measure']);
    p.set(r, { value: 4700 });
    p.expectDone(['ohms', 'measure', 'change']);
    p.meter('Ω', [ldr, 0], [ldr, 1]);
    p.expectDone(['ohms', 'measure', 'change']); // medium light: about 22 kΩ
    p.set(ldr, { light: 0 });
    p.expectDone(['ohms', 'measure', 'change', 'dark']);
    p.set(ldr, { light: 1 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Power: why parts get hot, with the design challenge', () => {
    const p = play('power');
    const r = p.ref('R1');
    p.set(r, { value: 470 });
    p.expectDone(['p470']);
    p.set(r, { value: 220 });
    p.expectDone(['p470', 'hot']);
    p.set(r, { value: 100 });
    p.expectDone(['p470', 'hot', 'burn']);
    expect(p.ref('R1').burn).toBeDefined();
    p.set(r, { value: 220, burn: undefined }); // Ctrl+Z
    p.set(r, { value: 330 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Series circuits', () => {
    const p = play('series');
    const [r1, r2, r3] = [p.ref('R1'), p.ref('R2'), p.ref('R3')];
    p.meter('V', [r1, 0], [r1, 1]);
    p.expectDone(['v1']);
    p.meter('V', [r2, 0], [r2, 1]);
    p.expectDone(['v1']);
    p.meter('V', [r3, 0], [r3, 1]);
    p.expectDone(['v1', 'v3']);
    p.unwire(r1, 1, r2, 0);
    p.meter('A', [r1, 1], [r2, 0]);
    p.expectDone(['v1', 'v3', 'current']);
    p.wire(r1, 1, r2, 0);
    p.set(r2, { value: 10_000 });
    p.expectDone(['v1', 'v3', 'current', 'grow']);
    p.closeMeter();
    p.unwire(r2, 1, r3, 0);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Parallel circuits', () => {
    const p = play('parallel');
    const bat = p.find('battery');
    const l1 = p.ref('L1');
    const l2 = p.add('lamp');
    p.expectDone(['second']);
    p.wire(l2, 0, l1, 0);
    p.wire(l2, 1, l1, 1);
    p.expectDone(['second', 'parallel']);
    p.meter('V', [l2, 0], [l2, 1]);
    p.expectDone(['second', 'parallel', 'measure']);
    p.unwire(l1, 1, bat, 1);
    p.meter('A', [l1, 1], [bat, 1]);
    p.expectDone(['second', 'parallel', 'measure', 'total']);
    p.closeMeter();
    p.wire(l1, 1, bat, 1);
    const sw = p.add('switch');
    p.unwire(l2, 1, l1, 1);
    p.wire(l2, 1, sw, 0);
    p.wire(sw, 1, l1, 1);
    p.expectDone(['second', 'parallel', 'measure', 'total', 'switch']);
    p.set(sw, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Voltage dividers', () => {
    const p = play('divider');
    const bat = p.find('battery');
    const [r1, r2] = [p.ref('R1'), p.ref('R2')];
    p.meter('V', [r2, 0], [r2, 1]);
    p.expectDone(['half']);
    p.set(r1, { value: 22_000 });
    p.expectDone(['half', 'unequal']);
    const vr = p.add('potentiometer');
    p.wire(vr, 1, bat, 0);
    p.wire(vr, 0, bat, 1);
    p.meter('V', [vr, 2], [vr, 0]);
    p.expectDone(['half', 'unequal', 'pot']);
    p.set(vr, { pos: 0.9 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Switches and logic, with the AND challenge', () => {
    const p = play('switches');
    const bat = p.find('battery');
    const lamp = p.ref('L1');
    const sw = p.add('switch');
    p.expectDone(['add']);
    p.unwire(lamp, 1, bat, 1);
    p.wire(lamp, 1, sw, 0);
    p.wire(sw, 1, bat, 1);
    p.expectDone(['add', 'wire']);
    p.set(sw, { on: true });
    p.expectDone(['add', 'wire', 'on']);
    p.set(sw, { on: false });
    p.expectDone(['add', 'wire', 'on', 'off']);
    const pb = p.add('pushbutton');
    p.wire(pb, 0, sw, 0);
    p.wire(pb, 1, sw, 1);
    p.set(pb, { on: true });
    p.expectDone(['add', 'wire', 'on', 'off', 'or']);
    // In parallel, the switch alone lights the lamp: that isn't AND.
    p.set(pb, { on: false });
    p.set(sw, { on: true });
    p.expectDone(['add', 'wire', 'on', 'off', 'or']);
    // Rewire in series: lamp → switch → button → battery −.
    p.unwire(pb, 0, sw, 0);
    p.unwire(pb, 1, sw, 1);
    p.unwire(sw, 1, bat, 1);
    p.wire(sw, 1, pb, 0);
    p.wire(pb, 1, bat, 1);
    p.expectDone(['add', 'wire', 'on', 'off', 'or', 'and-1']);
    p.set(pb, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Components in Depth, lessons 2–10 ---------- */

  it('LEDs: voltage and current, with the design challenge', () => {
    const p = play('leds');
    const bat = p.find('battery');
    const r = p.ref('R1');
    const led = p.ref('LED1');
    p.meter('V', [led, 0], [led, 1]);
    p.expectDone(['vf']);
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['vf', 'vr']);
    p.closeMeter();
    const led2 = p.add('led');
    p.unwire(led, 1, bat, 1);
    p.wire(led, 1, led2, 0);
    p.wire(led2, 1, bat, 1);
    p.expectDone(['vf', 'vr', 'two']);
    p.set(r, { value: 470 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Capacitors: storing charge (watched in time)', () => {
    const p = play('capacitors');
    const r = p.ref('R1');
    const cap = p.ref('C1');
    p.meter('V', [cap, 0], [cap, 1]);
    p.expectDone([]); // the lesson has only just opened: still charging
    p.wait(1); // τ = 0.1 s: full well within a second
    p.expectDone(['vc']);
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['vc', 'vr']);
    p.closeMeter();
    const led = p.add('led');
    p.unwire(r, 1, cap, 0);
    p.wire(r, 1, led, 0);
    p.wire(led, 1, cap, 0);
    p.wait(0.5);
    p.expectDone(['vc', 'vr', 'led']);
    p.set(cap, { value: 100e-6 });
    p.expectDone(['vc', 'vr', 'led', 'size']);
    // Watch it charge: LED out, 1000 µF, power off and on. τ = 10 s.
    p.remove(led);
    p.wire(r, 1, cap, 0);
    p.set(cap, { value: 1000e-6 });
    p.restart();
    p.expectDone(['vc', 'vr', 'led', 'size']); // just powered on: empty
    p.wait(2); // 9·(1 − e^−0.2) ≈ 1.6 V: not yet
    p.expectDone(['vc', 'vr', 'led', 'size']);
    p.wait(4); // t = 6 s: 9·(1 − e^−0.6) ≈ 4.1 V
    p.expectDone(['vc', 'vr', 'led', 'size', 'slow']);
    // Reversed, a charged electrolytic is forced the wrong way and fails.
    p.c = flipPart(p.c, cap.id);
    p.wait(30);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
    expect(p.ref('C1').burn?.quantity).toBe('reverse');
  });

  it('Potentiometers: a dimmer', () => {
    const p = play('potentiometers');
    const vr = p.ref('VR1');
    const r = p.ref('R1');
    const led = p.ref('LED1');
    p.set(vr, { pos: 0.1 });
    p.expectDone([]); // brighter, but not at the end yet
    p.set(vr, { pos: 0 });
    p.expectDone(['bright']);
    p.set(vr, { pos: 1 });
    p.expectDone(['bright', 'dim']);
    const before = p.c;
    p.remove(r);
    p.wire(vr, 2, led, 0);
    p.set(vr, { pos: 0 });
    p.expectDone(['bright', 'dim', 'no-resistor']);
    expect(p.ref('LED1').burn).toBeDefined();
    p.c = before; // Ctrl+Z back to the resistor
    p.set(vr, { pos: 0 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Light sensors', () => {
    const p = play('light-sensors');
    const r = p.ref('R1');
    const ldr = p.ref('LDR1');
    p.meter('V', [r, 0], [r, 1]);
    p.expectDone(['measure']);
    p.set(ldr, { light: 0 });
    p.expectDone(['measure', 'dark']);
    p.set(ldr, { light: 1 });
    p.expectDone(['measure', 'dark', 'bright']);
    p.set(r, { value: 100_000 });
    // Search the slider for the half-way point, as a learner would.
    let found = false;
    for (let l = 0; l <= 1.0001 && !found; l += 0.01) {
      p.set(ldr, { light: l });
      found = isComplete(p.lesson, p.tick());
    }
    expect(found).toBe(true);
  });

  it('Transistors: a switch', () => {
    const p = play('transistor-switch');
    const bat = p.find('battery');
    const q = p.ref('Q1');
    const r2 = p.ref('R2');
    p.wire(bat, 0, r2, 0);
    p.expectDone([]); // only one end wired: nothing yet
    p.wire(r2, 1, q, 0);
    p.expectDone(['base']);
    p.meter('V', [q, 0], [q, 2]);
    p.expectDone(['base', 'vbe']);
    p.meter('V', [q, 1], [q, 2]);
    p.expectDone(['base', 'vbe', 'vce']);
    p.closeMeter();
    const pb = p.add('pushbutton');
    p.unwire(bat, 0, r2, 0);
    p.wire(bat, 0, pb, 0);
    p.wire(pb, 1, r2, 0);
    p.expectDone(['base', 'vbe', 'vce']);
    p.set(pb, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Transistors: gain', () => {
    const p = play('transistor-gain');
    const q = p.ref('Q1');
    const led = p.ref('LED1');
    const r2 = p.ref('R2');
    p.unwire(r2, 1, q, 0);
    p.meter('A', [r2, 1], [q, 0]);
    p.expectDone(['ib']);
    p.wire(r2, 1, q, 0);
    p.unwire(led, 1, q, 1);
    p.meter('A', [led, 1], [q, 1]);
    p.expectDone(['ib', 'ic']);
    p.closeMeter();
    p.wire(led, 1, q, 1);
    p.set(r2, { value: 100_000 });
    p.expectDone(['ib', 'ic', 'more']);
    p.set(r2, { value: 10_000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Choosing a base resistor, with the design challenge', () => {
    const p = play('base-resistor');
    const q = p.ref('Q1');
    const r = p.ref('R1');
    p.meter('V', [q, 1], [q, 2]);
    p.expectDone(['dim']);
    p.closeMeter();
    p.set(r, { value: 100_000 });
    p.expectDone(['dim', 'partway']);
    p.set(r, { value: 100 });
    p.expectDone(['dim', 'partway', 'too-small']);
    expect(p.ref('R1').burn).toBeDefined();
    p.set(r, { value: 100_000, burn: undefined }); // Ctrl+Z
    p.set(r, { value: 22_000 }); // base current too small for the challenge
    p.expectDone(['dim', 'partway', 'too-small']);
    p.set(r, { value: 10_000 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Project: automatic night light', () => {
    const p = play('night-light');
    const bat = p.find('battery');
    const q = p.ref('Q1');
    const ldr = p.ref('LDR1');
    p.wire(ldr, 0, q, 0);
    p.wire(ldr, 1, bat, 1);
    p.expectDone(['sensor']);
    p.set(ldr, { light: 0.3 });
    p.expectDone(['sensor', 'dark']);
    p.set(ldr, { light: 0.8 });
    p.expectDone(['sensor', 'dark', 'bright']);
    p.set(p.ref('R1'), { value: 1_000_000 });
    p.set(ldr, { light: 0.5 });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Diode logic', () => {
    const p = play('diode-logic');
    const [sw1, sw2, d2, r1] = [p.ref('SW1'), p.ref('SW2'), p.ref('D2'), p.ref('R1')];
    p.set(sw1, { on: true });
    p.expectDone(['a']);
    p.set(sw1, { on: false });
    p.set(sw2, { on: true });
    p.expectDone(['a', 'b']);
    p.set(sw1, { on: true });
    p.expectDone(['a', 'b', 'both']);
    p.remove(d2);
    p.wire(sw2, 1, r1, 0);
    p.set(sw2, { on: false });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  /* ---------- Sound & Timing ---------- */

  it('Watching time: the oscilloscope', () => {
    const p = play('scope-intro');
    const cap = p.find('capacitor');
    const pb = p.find('pushbutton');
    p.probe();
    p.expectDone(['open']);
    p.probe([cap, 0]);
    p.expectDone(['open', 'probe']);
    p.set(pb, { on: true });
    p.wait(3);
    p.expectDone(['open', 'probe', 'charge']);
    p.set(pb, { on: false });
    p.wait(1);
    p.expectDone(['open', 'probe', 'charge', 'drain']);
    p.set(p.ref('R2'), { value: 10_000 });
    p.wait(4);
    p.expectDone(['open', 'probe', 'charge', 'drain', 'drain-fast']);
    p.set(cap, { value: 10e-6 });
    p.set(pb, { on: true });
    p.wait(0.6);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Oscillators: a two-transistor blinker', () => {
    const p = play('blinker');
    const q1 = p.ref('Q1');
    p.probe([q1, 1]);
    p.wait(4.5);
    p.expectDone(['probe', 'auto']);
    p.probe([q1, 1], [q1, 0]);
    p.wait(4.5);
    p.expectDone(['probe', 'auto', 'base']);
    p.set(p.ref('C1'), { value: 4.7e-6 });
    p.set(p.ref('C2'), { value: 4.7e-6 });
    p.wait(4.5);
    p.expectDone(['probe', 'auto', 'base', 'faster']);
    p.set(p.ref('C1'), { value: 22e-6 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('From blink to beep', () => {
    const p = play('beeper');
    p.sound(true);
    p.expectDone(['sound']);
    p.set(p.ref('C1'), { value: 10e-9 });
    p.set(p.ref('C2'), { value: 10e-9 });
    p.wait(0.1);
    p.expectDone(['sound', 'tone']);
    p.probe([p.ref('Q2'), 1]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure']);
    p.set(p.ref('R2'), { value: 100_000 });
    p.set(p.ref('R3'), { value: 100_000 });
    p.probe([p.ref('Q2'), 1]);
    p.wait(0.1);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: a one-shot, with the design challenge', () => {
    const p = play('555-oneshot');
    const pb = p.find('pushbutton');
    p.wait(0.1);
    p.set(pb, { on: true });
    p.wait(0.1);
    p.expectDone(['press']);
    p.set(pb, { on: false });
    p.wait(0.2);
    p.expectDone(['press', 'hold']);
    p.wait(1.2);
    p.expectDone(['press', 'hold', 'off']);
    p.probe([p.find('capacitor'), 0], [p.find('timer555'), 2]);
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(1.5);
    p.expectDone(['press', 'hold', 'off', 'scope']);
    p.set(p.find('capacitor'), { value: 47e-6 });
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(0.5);
    p.expectDone(['press', 'hold', 'off', 'scope', 'longer']);
    p.wait(6); // let the 5 s pulse end
    p.set(p.find('capacitor'), { value: 100e-6 });
    p.set(pb, { on: true });
    p.wait(0.1);
    p.set(pb, { on: false });
    p.wait(0.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: a blinker', () => {
    const p = play('555-astable');
    const u = p.find('timer555');
    const r3 = p.ref('R3');
    const cap = p.find('capacitor');
    const gnd = p.find('ground');
    p.wire(r3, 0, u, 6);
    p.wire(r3, 1, u, 5);
    p.expectDone(['r3']);
    p.wire(u, 5, u, 1);
    p.expectDone(['r3', 'trig']);
    p.wire(cap, 0, u, 5);
    p.wire(cap, 1, gnd, 0);
    p.wait(2);
    p.expectDone(['r3', 'trig', 'cap', 'blink']);
    p.probe([cap, 0], [u, 2]);
    p.wait(4.5);
    p.expectDone(['r3', 'trig', 'cap', 'blink', 'saw']);
    p.set(p.ref('R2'), { value: 47_000 });
    p.set(r3, { value: 4700 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 555 timer: making tones, tuned to A', () => {
    const p = play('555-tone');
    const u = p.find('timer555');
    const cap = p.find('capacitor');
    p.sound(true);
    p.expectDone(['sound']);
    p.set(cap, { value: 68e-9 });
    p.wait(0.1);
    p.expectDone(['sound', 'tone']);
    p.probe([u, 2]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure']);
    p.set(cap, { value: 33e-9 });
    p.probe([u, 2]);
    p.wait(0.1);
    p.expectDone(['sound', 'tone', 'measure', 'octave']);
    p.set(cap, { value: 150e-9 });
    p.probe([u, 2]);
    p.wait(0.1);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Sound effects: a light theremin', () => {
    const p = play('theremin');
    const u = p.find('timer555');
    const ldr = p.find('ldr');
    p.sound(true);
    p.wait(0.05);
    p.expectDone(['sound']);
    p.probe([u, 2]);
    p.wait(0.05);
    p.expectDone(['sound', 'probe']);
    p.set(ldr, { light: 0.1 });
    p.probe([u, 2]);
    p.wait(0.3);
    p.expectDone(['sound', 'probe', 'dark']);
    p.set(ldr, { light: 0.9 });
    p.probe([u, 2]);
    p.wait(0.05);
    p.expectDone(['sound', 'probe', 'dark', 'bright']);
    p.set(p.ref('R3'), { value: 47_000 });
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('AC: signals that swing', () => {
    const p = play('ac-signals');
    const src = p.find('acsource');
    const r = p.ref('R1');
    p.probe([src, 0]);
    p.wait(0.2);
    p.expectDone(['probe', 'auto']);
    p.set(src, { freq: 1 });
    p.expectDone(['probe', 'auto', 'slow']);
    p.unwire(r, 1, src, 1);
    const led = p.add('led');
    p.wire(r, 1, led, 0);
    p.wire(led, 1, src, 1);
    p.wait(1.5);
    p.expectDone(['probe', 'auto', 'slow', 'led']);
    p.set(src, { wave: 'square' });
    p.expectDone(['probe', 'auto', 'slow', 'led', 'square']);
    p.unwire(led, 1, src, 1);
    const spk = p.add('speaker');
    p.wire(led, 1, spk, 0);
    p.wire(spk, 1, src, 1);
    p.set(src, { freq: 440 });
    p.sound(true);
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Rectifiers: AC to DC', () => {
    const p = play('rectifiers');
    const src = p.find('acsource');
    const r = p.ref('R1');
    p.probe([r, 0]);
    p.wait(0.2);
    p.expectDone(['half']);
    p.remove(p.find('diode'));
    p.unwire(r, 1, src, 1);
    const br = p.add('bridge');
    const gnd = p.add('ground');
    p.wire(src, 0, br, 0);
    p.wire(src, 1, br, 1);
    p.wire(br, 2, r, 0);
    p.wire(br, 3, r, 1);
    p.wire(br, 3, gnd, 0);
    p.probe([r, 0]);
    p.wait(0.2);
    p.expectDone(['half', 'bridge']);
    const cap = p.add('capacitor', 100e-6);
    p.wire(cap, 0, br, 2);
    p.wire(cap, 1, br, 3);
    p.wait(4.5);
    p.expectDone(['half', 'bridge', 'smooth']);
    p.set(cap, { value: 1000e-6 });
    p.wait(4.5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Project: a DC power supply', () => {
    const p = play('power-supply');
    const [src, t, br] = [p.find('acsource'), p.find('transformer'), p.find('bridge')];
    const r1 = p.ref('R1');
    p.wire(src, 0, t, 0);
    p.wire(src, 1, t, 1);
    p.expectDone(['primary']);
    p.wire(t, 2, br, 0);
    p.wire(t, 3, br, 1);
    p.expectDone(['primary', 'secondary']);
    p.wait(0.5);
    p.meter('V', [r1, 0], [r1, 1]);
    p.wait(0.1);
    p.expectDone(['primary', 'secondary', 'dc']);
    p.closeMeter();
    const r2 = p.ref('R2');
    const led = p.find('led');
    p.wire(r2, 0, br, 2);
    p.wire(r2, 1, led, 0);
    p.wire(led, 1, p.find('ground'), 0);
    p.wait(0.1);
    p.expectDone(['primary', 'secondary', 'dc', 'led']);
    p.set(t, { value: 0.25 });
    p.wait(1);
    p.expectDone(['primary', 'secondary', 'dc', 'led', 'ratio']);
    p.probe([r1, 0]);
    p.remove(p.find('capacitor'));
    p.wait(0.2);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('HIGH and LOW', () => {
    const p = play('logic-levels');
    const [gate, led, sw] = [p.find('not'), p.find('led'), p.find('switch')];
    p.wire(led, 1, gate, 3);
    p.expectDone(['gnd']);
    p.set(sw, { on: true });
    p.expectDone(['gnd', 'flip']);
    p.meter('V', [gate, 0], [gate, 3]);
    p.expectDone(['gnd', 'flip', 'measure-high']);
    p.set(sw, { on: false });
    p.expectDone(['gnd', 'flip', 'measure-high', 'measure-low']);
    p.remove(sw);
    p.remove(p.ref('R1'));
    const pot = p.add('potentiometer', 10_000);
    p.wire(pot, 0, gate, 2);
    p.wire(pot, 1, gate, 3);
    p.wire(pot, 2, gate, 0);
    p.set(pot, { pos: 0.1 }); // 4.5 V: HIGH, LED off
    p.wait(0.05);
    p.expectDone(['gnd', 'flip', 'measure-high', 'measure-low', 'pot-high']);
    p.set(pot, { pos: 0.5 }); // 2.5 V: inside the gap, still HIGH
    p.wait(0.05);
    p.expectDone(['gnd', 'flip', 'measure-high', 'measure-low', 'pot-high']);
    p.set(pot, { pos: 0.9 }); // 0.5 V: LOW, LED on
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('AND, OR, NOT', () => {
    const p = play('gates');
    const [s1, s2] = [p.find('switch'), p.find('switch', 1)];
    p.set(s1, { on: true });
    p.set(s2, { on: true });
    p.expectDone(['and-both']);
    p.set(s2, { on: false });
    p.expectDone(['and-both', 'and-one']);
    // Swap in the OR gate: delete the AND (its wires go with it) and wire U2 the same way.
    const or = p.find('or');
    const [r1, r2, r3, led] = [p.ref('R1'), p.ref('R2'), p.ref('R3'), p.find('led')];
    p.remove(p.find('and'));
    p.wire(or, 3, s1, 0);
    p.wire(s1, 1, or, 0);
    p.wire(or, 3, s2, 0);
    p.wire(s2, 1, or, 1);
    p.wire(or, 0, r1, 1);
    p.wire(r1, 0, or, 4);
    p.wire(or, 1, r2, 0);
    p.wire(r2, 1, or, 4);
    p.wire(or, 2, r3, 0);
    p.wire(led, 1, or, 4);
    p.expectDone(['and-both', 'and-one', 'or']);
    p.set(s1, { on: false });
    p.expectDone(['and-both', 'and-one', 'or', 'or-none']);
    const n = p.add('not');
    p.unwire(or, 2, r3, 0);
    p.wire(n, 0, or, 2);
    p.wire(n, 1, r3, 0);
    p.wire(n, 3, or, 4);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('NAND builds everything', () => {
    const p = play('nand');
    const [s1, s2] = [p.find('switch'), p.find('switch', 1)];
    const [u1, u2, r3] = [p.find('nand'), p.find('nand', 1), p.ref('R3')];
    p.set(s1, { on: true });
    p.set(s2, { on: true });
    p.expectDone(['nand-both']);
    p.set(s2, { on: false });
    p.expectDone(['nand-both', 'nand-one']);
    p.wire(u2, 0, u1, 2);
    p.wire(u2, 1, u1, 2);
    p.wire(u2, 4, u1, 4);
    p.unwire(u1, 2, r3, 0);
    p.wire(u2, 2, r3, 0);
    p.expectDone(['nand-both', 'nand-one', 'make-not']);
    p.set(s2, { on: true });
    p.expectDone(['nand-both', 'nand-one', 'make-not', 'and']);
    p.set(s2, { on: false });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('A memory latch', () => {
    const p = play('latch');
    const [u1, u2] = [p.find('nand'), p.find('nand', 1)];
    const [set, reset] = [p.find('pushbutton'), p.find('pushbutton', 1)];
    p.wire(u2, 2, u1, 1);
    p.expectDone(['feedback']);
    p.set(reset, { on: true });
    p.expectDone(['feedback', 'reset']);
    p.set(reset, { on: false });
    p.expectDone(['feedback', 'reset', 'hold-0']);
    p.set(set, { on: true });
    p.expectDone(['feedback', 'reset', 'hold-0', 'set']);
    p.set(set, { on: false });
    p.expectDone(['feedback', 'reset', 'hold-0', 'set', 'hold-1']);
    p.set(set, { on: true });
    p.set(reset, { on: true });
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('Flip-flops and counting', () => {
    const p = play('counter');
    const u2 = p.find('dff', 1);
    const btn = p.find('pushbutton');
    p.wire(u2, 3, u2, 0);
    p.expectDone(['feedback']);
    const press = () => {
      p.set(btn, { on: true });
      p.wait(0.02);
      p.set(btn, { on: false });
      p.wait(0.02);
    };
    press();
    p.expectDone(['feedback', 'one']);
    press();
    p.expectDone(['feedback', 'one', 'two']);
    press();
    p.expectDone(['feedback', 'one', 'two', 'three']);
    press();
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('The 7-segment display', () => {
    const p = play('seven-seg');
    const d = p.find('sevenseg');
    const seg = (r: string, k: number) => p.wire(p.ref(r), 1, d, k);
    seg('R1', 1);
    seg('R2', 2);
    p.expectDone(['one']);
    seg('R3', 0);
    p.expectDone(['one', 'seven']);
    seg('R4', 3);
    seg('R5', 6);
    p.expectDone(['one', 'seven', 'three']);
    seg('R6', 4);
    seg('R7', 5);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  });

  it('each track has ten lessons, in a sensible order', () => {
    expect(LESSONS.filter((l) => l.track === 'foundations').map((l) => l.id)).toEqual([
      'first-led',
      'voltage',
      'current',
      'resistance',
      'ohms-law',
      'power',
      'series',
      'parallel',
      'divider',
      'switches',
    ]);
    expect(LESSONS.filter((l) => l.track === 'components')).toHaveLength(10);
    expect(LESSONS.filter((l) => l.track === 'timing')).toHaveLength(10);
    expect(LESSONS.filter((l) => l.track === 'digital')).toHaveLength(10);
  });
});
