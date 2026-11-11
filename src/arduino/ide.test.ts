/**
 * Spec check 5, as far as software can take it: the same sketch built by the
 * official Arduino IDE (2.x: arduino-cli 1.2.0, Arduino AVR core 1.8.6,
 * avr-gcc 7.3.0-atmel3.6.1-arduino7; the .hex files in fixtures/ide) and by
 * the in-browser compiler behaves the same on the emulated chip: the same pin
 * changes in the same order at (nearly) the same moments, and the same
 * Serial output.
 *
 * The two builds aren't byte-identical. The IDE links with -flto (link-time
 * optimization), which the WebAssembly compiler can't do, so its code is a
 * little tighter: a loop of digitalWrite and delayMicroseconds calls runs
 * about 0.1% faster in the IDE's build. Anything timed by millis() lands on
 * the same millisecond either way; other code (tone()'s set-up, a busy
 * loop) can be up to 0.2 ms behind the IDE's build at the start.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hexToFlash } from './elf';
import { UnoCore } from './uno';
import { program, testToolkit } from './testKit';

beforeAll(async () => {
  await testToolkit();
}, 60_000);

const fixture = (name: string) => new TextDecoder().decode(readFileSync(new URL(`./fixtures/ide/${name}`, import.meta.url)));

interface Change {
  t: number;
  pin: number;
  drive: string;
}

/** Runs a program for `seconds` with A0 at `a0` volts: every pin change, and everything printed. */
function run(prog: Uint8Array, seconds: number, a0 = 0) {
  const core = new UnoCore(prog, 0);
  core.setVoltages((pin) => (pin === 14 ? a0 : 0), 5);
  let before = core.drives.slice();
  const changes: Change[] = [];
  while (core.runUntil(seconds)) {
    core.drives.forEach((d, pin) => d !== before[pin] && changes.push({ t: core.time, pin, drive: d }));
    before = core.drives.slice();
  }
  return { changes, serial: core.takeSerial() };
}

/**
 * Each pin went through the same changes in both runs, each at the same
 * moment to within `abs` seconds plus `rel` of the time elapsed. Returns the
 * largest difference found.
 */
function expectSameChanges(ours: Change[], ide: Change[], abs: number, rel: number): number {
  expect(ours.length).toBeGreaterThan(0);
  let worst = 0;
  for (const pin of new Set(ide.map((c) => c.pin))) {
    const a = ours.filter((c) => c.pin === pin);
    const b = ide.filter((c) => c.pin === pin);
    expect(a.map((c) => c.drive), `pin ${pin}`).toEqual(b.map((c) => c.drive));
    a.forEach((c, k) => {
      const d = Math.abs(c.t - b[k].t);
      worst = Math.max(worst, d);
      expect(d, `pin ${pin}, change ${k} at ${b[k].t.toFixed(6)} s`).toBeLessThanOrEqual(abs + rel * b[k].t);
    });
  }
  return worst;
}

describe('same behaviour as the Arduino IDE’s own build (spec check 5)', () => {
  it('a millis() traffic light: the same lights at the same moments, and the same printout', async () => {
    const ours = run(await program(fixture('traffic.ino')), 2);
    const ide = run(hexToFlash(fixture('traffic.ino.hex')), 2);
    expectSameChanges(ours.changes, ide.changes, 50e-6, 0);
    expect(ours.serial).toBe(ide.serial);
    // And it is the program it says it is: phases of 300, 100 and 250 ms.
    expect(ours.serial.split('\r\n').slice(0, 4)).toEqual(['0 phase 0', '300 phase 1', '400 phase 2', '650 phase 0']);
  }, 60_000);

  it('Serial at 9600 baud, analogRead, micros() and delayMicroseconds', async () => {
    const ours = run(await program(fixture('serialclock.ino')), 1.5, 2);
    const ide = run(hexToFlash(fixture('serialclock.ino.hex')), 1.5, 2);
    // A busy loop: the IDE's tighter build starts a little sooner and pulls ahead by about 0.1%.
    expectSameChanges(ours.changes, ide.changes, 200e-6, 0.002);
    const lines = (s: string) => s.split('\r\n').filter((l) => l).map((l) => l.split(' ').map(Number));
    const [a, b] = [lines(ours.serial), lines(ide.serial)];
    expect(a.length).toBeGreaterThanOrEqual(14);
    expect(a.length - b.length).toBeLessThanOrEqual(1);
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      expect(a[k][0]).toBe(b[k][0]); // the counter
      expect(a[k][1]).toBe(409); // 2 V on A0: 2 ÷ 5 × 1023, as a real Uno reads it
      expect(b[k][1]).toBe(409);
      expect(Math.abs(a[k][2] - b[k][2])).toBeLessThanOrEqual(3); // micros() ÷ 1000: the 0.1%
    }
  }, 60_000);

  it('PWM on four pins and tone(): the same waveforms', async () => {
    const ours = run(await program(fixture('pwmtone.ino')), 0.5);
    const ide = run(hexToFlash(fixture('pwmtone.ino.hex')), 0.5);
    expectSameChanges(ours.changes, ide.changes, 200e-6, 0.002);
  }, 60_000);
});
