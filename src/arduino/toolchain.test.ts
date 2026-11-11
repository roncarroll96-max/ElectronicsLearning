/**
 * The in-browser Arduino compiler, checked end to end: real sketches are
 * compiled from the prepared files in public/arduino (scripts/prepare-arduino.mjs,
 * run before the tests) and the programs are run on the avr8js ATmega328P
 * emulator to show they behave as on a real Uno.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { AVRIOPort, AVRTimer, AVRUSART, CPU, avrInstruction, portBConfig, timer0Config, usart0Config } from 'avr8js';
import { compileSketch, loadToolkit, type CompileResult, type Toolkit } from './toolchain';

const dir = new URL('../../public/arduino/', import.meta.url);
let kit: Toolkit;

beforeAll(async () => {
  kit = await loadToolkit(async (name) => new Uint8Array(gunzipSync(readFileSync(new URL(name + '.gz', dir)))));
}, 60_000);

function ok(r: CompileResult) {
  if (!r.ok) throw new Error('compile failed:\n' + r.diagnostics.map((d) => `${d.line ?? '-'}: ${d.message}`).join('\n'));
  return r;
}

/** Run a program for some simulated seconds; report pin 13 changes and serial output. */
function run(program: Uint8Array, seconds: number) {
  const cpu = new CPU(new Uint16Array(program.buffer, program.byteOffset, program.byteLength / 2));
  new AVRTimer(cpu, timer0Config);
  const portB = new AVRIOPort(cpu, portBConfig);
  const usart = new AVRUSART(cpu, usart0Config, 16e6);
  let serial = '';
  usart.onByteTransmit = (b) => (serial += String.fromCharCode(b));
  const d13: number[] = [];
  let last = false;
  portB.addListener(() => {
    const on = portB.pinState(5) === 1; // D13 is PB5
    if (on !== last) {
      d13.push(cpu.cycles / 16e6);
      last = on;
    }
  });
  while (cpu.cycles < seconds * 16e6) {
    avrInstruction(cpu);
    cpu.tick();
  }
  return { d13, serial };
}

const BLINK = `
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hello, Uno");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(100);
  digitalWrite(13, LOW);
  delay(100);
  Serial.println(millis());
}
`;

describe('Arduino compiler', () => {
  it('compiles Blink with Serial, and the program blinks and prints like a real Uno', async () => {
    const r = ok(await compileSketch(kit, BLINK));
    expect(r.hex.startsWith(':')).toBe(true);
    // The IDE reports about 2 KB for this sketch; the whole core would be several times that.
    expect(r.flashBytes).toBeGreaterThan(1000);
    expect(r.flashBytes).toBeLessThan(3000);
    expect(r.ramBytes).toBeGreaterThan(150); // Serial's buffers
    expect(r.ramBytes).toBeLessThan(400);

    const { d13, serial } = run(r.program, 0.75);
    // On at 0, off at 0.1 s, on at 0.2 s... (delay() is exact to well under a millisecond)
    expect(d13.length).toBeGreaterThanOrEqual(7);
    d13.slice(1, 7).forEach((t, i) => expect(t - d13[0]).toBeCloseTo(0.1 * (i + 1), 2));
    expect(serial.startsWith('Hello, Uno\r\n')).toBe(true);
    expect(serial).toMatch(/\r\n(199|200)\r\n(399|400)\r\n/);
  }, 30_000);

  it('lets a function be used above where it is written (automatic prototypes)', async () => {
    const r = ok(
      await compileSketch(
        kit,
        `void setup() { pinMode(13, OUTPUT); }
void loop() { flash(3); delay(500); }
void flash(int times) {
  for (int i = 0; i < times; i++) { digitalWrite(13, HIGH); delay(50); digitalWrite(13, LOW); delay(50); }
}`,
      ),
    );
    expect(run(r.program, 0.35).d13.length).toBe(6);
  }, 30_000);

  it('links only the parts of the core a sketch uses, so a sketch may use a timer interrupt itself', async () => {
    // tone() uses Timer 2's interrupt. A sketch that doesn't call tone() may claim it,
    // exactly as on a real Uno; linking the whole core would make this fail.
    const r = ok(
      await compileSketch(
        kit,
        `volatile unsigned long ticks = 0;
ISR(TIMER2_COMPA_vect) { ticks++; }
void setup() { TCCR2A = 2; TCCR2B = 4; OCR2A = 249; TIMSK2 = 2; }
void loop() {}`,
      ),
    );
    expect(r.flashBytes).toBeLessThan(1000);
  }, 30_000);

  it('reports a syntax error at the learner’s own line, with a plain-English hint', async () => {
    const r = await compileSketch(kit, 'void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n');
    expect(r.ok).toBe(false);
    const e = r.diagnostics.find((d) => d.severity === 'error')!;
    expect(e.line).toBe(3); // GCC points at the token after the missing ;
    expect(e.message).toMatch(/expected ';'/);
    expect(e.hint).toMatch(/semicolon/);
  }, 30_000);

  it('points a mistake inside a macro at the sketch line', async () => {
    const r = await compileSketch(kit, 'void setup() {\n  pinMode(13 OUTPUT);\n}\nvoid loop() {}\n');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].line).toBe(2);
  }, 30_000);

  it('explains a misspelt name', async () => {
    const r = await compileSketch(kit, 'void setup() { pinmode(13, OUTPUT); }\nvoid loop() {}\n');
    expect(r.ok).toBe(false);
    const e = r.diagnostics.find((d) => d.severity === 'error')!;
    expect(e.line).toBe(1);
    expect(e.hint).toMatch(/case-sensitive/);
  }, 30_000);

  it('explains a missing loop()', async () => {
    const r = await compileSketch(kit, 'void setup() {}\n');
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => /loop\(\) function/.test(d.hint ?? ''))).toBe(true);
  }, 30_000);

  it('says a library is not available', async () => {
    const r = await compileSketch(kit, '#include <Servo.h>\nvoid setup() {}\nvoid loop() {}\n');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].line).toBe(1);
    expect(r.diagnostics[0].hint).toMatch(/doesn’t have “Servo\.h”/);
  }, 30_000);

  it('refuses a sketch that needs more than the Uno’s 2 KB of memory', async () => {
    const r = await compileSketch(kit, 'byte big[3000];\nvoid setup() { big[5] = 1; Serial.begin(9600); Serial.write(big, 3000); }\nvoid loop() {}\n');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toMatch(/Not enough memory/);
  }, 30_000);

  it('compiles quickly once loaded', async () => {
    const r = ok(await compileSketch(kit, BLINK));
    expect(r.ms).toBeLessThan(3000);
  }, 30_000);
});
