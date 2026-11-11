import { describe, expect, it } from 'vitest';
import { findFunctions, maskSource, prepareSketch } from './sketch';
import { hintFor, parseCompilerOutput, parseLinkerOutput } from './diagnostics';
import { hexToFlash } from './elf';

describe('sketch preparation (like the Arduino IDE)', () => {
  it('adds Arduino.h and keeps line numbers', () => {
    const { code } = prepareSketch('int x = 1;\n');
    expect(code.startsWith('#include <Arduino.h>\n#line 1 "sketch.ino"\nint x = 1;')).toBe(true);
  });

  it('declares each function before the first one, pointing at its line', () => {
    const src = '// blink\nint led = 13;\n\nvoid setup() {\n  pinMode(led, OUTPUT);\n}\n\nvoid loop() { flash(2, "hi"); }\n\nunsigned long flash(int n, const char *msg) {\n  return n;\n}\n';
    const r = prepareSketch(src);
    expect(r.prototypes).toEqual(['void setup()', 'void loop()', 'unsigned long flash(int n, const char* msg)']);
    const lines = r.code.split('\n');
    const at = lines.indexOf('void setup();');
    expect(lines[at - 1]).toBe('#line 4 "sketch.ino"');
    expect(lines).toContain('#line 10 "sketch.ino"');
    // The globals stay above the prototypes, and the code resumes at line 4.
    expect(lines.indexOf('int led = 13;')).toBeLessThan(at);
    expect(lines[lines.indexOf('void setup() {') - 1]).toBe('#line 4 "sketch.ino"');
  });

  it('ignores braces in comments, strings and preprocessor lines', () => {
    const src = '#define BLOCK { }\n/* void fake() { } */\nconst char *s = "{ void nope() {";\nchar c = \'{\';\nvoid real() { }\n';
    expect(findFunctions(src).map((f) => f.name)).toEqual(['real']);
    expect(maskSource('a "x{" b').length).toBe(8);
  });

  it('leaves ISRs, classes, structs, member functions and templates alone', () => {
    const src = [
      'struct Point { int x; int y; };',
      'class Led { public: void on() { } };',
      'void Led2::off() { }',
      'template <typename T> T twice(T v) { return v * 2; }',
      'ISR(TIMER1_COMPA_vect) { }',
      'int area(Point p) { return p.x * p.y; }',
    ].join('\n');
    expect(findFunctions(src).map((f) => f.name)).toEqual(['area']);
    expect(prepareSketch(src).prototypes).toEqual(['int area(Point p)']);
  });

  it('gives no prototype to a function with default values', () => {
    expect(prepareSketch('void beep(int ms = 100) { }\nvoid setup() { beep(); }\nvoid loop() {}\n').prototypes).toEqual(['void setup()', 'void loop()']);
  });

  it('handles pointer and reference return types and multi-line headers', () => {
    const r = prepareSketch('char *name(int i)\n{\n  return 0;\n}\nint &pick(int &a,\n          int &b) { return a; }\n');
    expect(r.prototypes).toEqual(['char* name(int i)', 'int& pick(int& a, int& b)']);
  });
});

describe('compiler messages', () => {
  it('reads GCC messages and keeps only sketch locations', () => {
    const d = parseCompilerOutput(
      [
        'sketch.ino: In function \'void setup()\':',
        "sketch.ino:3:1: error: expected ';' before '}' token",
        "/arduino/core/Arduino.h:44:16: error: expected ')' before numeric constant",
        "sketch.ino:2:26: note: in expansion of macro 'OUTPUT'",
      ].join('\n'),
    );
    expect(d[0]).toMatchObject({ severity: 'error', line: 3, col: 1 });
    expect(d[0].hint).toMatch(/semicolon/);
    // The header error is moved to the sketch line the note names.
    expect(d[1]).toMatchObject({ severity: 'error', line: 2, col: 26 });
  });

  it('reads linker errors', () => {
    const d = parseLinkerOutput("/libs/libcore.a(main.cpp.o): In function `main':\nmain.cpp:(.text.main+0x8): undefined reference to `loop'\n");
    expect(d).toHaveLength(1);
    expect(d[0].hint).toMatch(/loop\(\) function/);
  });

  it('explains curly quotes pasted from the web', () => {
    expect(hintFor("stray '\\342' in program")).toMatch(/curly quote/);
  });
});

describe('Intel HEX', () => {
  it('fills the flash image, with unused bytes left at 0xFF', () => {
    const f = hexToFlash(':0400000001020304F2\n:00000001FF\n');
    expect([...f.subarray(0, 5)]).toEqual([1, 2, 3, 4, 0xff]);
    expect(f.length).toBe(0x8000);
  });
});
