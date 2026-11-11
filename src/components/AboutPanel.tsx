import { useEffect, useRef, useState } from 'react';
import { compile, forgetCompiler, prepareCompiler, useCompilerState, type CompileResult } from '../arduino/compiler';
import { UNO_FLASH_BYTES, UNO_RAM_BYTES } from '../arduino/elf';

const TEST_SKETCH = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
`;

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;

/** Open-source software the app is built from, with its licence and where its source code is. */
const CREDITS: { name: string; what: string; licence: string; url: string }[] = [
  { name: 'GCC 7.3.0 (avr-gcc)', what: 'the Arduino compiler', licence: 'GNU GPL v3', url: 'https://ftp.gnu.org/gnu/gcc/gcc-7.3.0/' },
  { name: 'GNU Binutils 2.42', what: 'the assembler, linker and objcopy', licence: 'GNU GPL v3', url: 'https://ftp.gnu.org/gnu/binutils/' },
  { name: 'avr-gcc-wasm', what: 'the WebAssembly build of the compiler and tools', licence: 'GPL v3 (tools)', url: 'https://github.com/horang-corp/avr-gcc-wasm' },
  { name: 'avr-libc 2.0.0', what: 'the C library for AVR chips', licence: 'Modified BSD', url: 'https://github.com/avrdudes/avr-libc' },
  { name: 'Arduino AVR core', what: 'digitalWrite, Serial, delay and the rest of the Arduino language', licence: 'GNU LGPL v2.1', url: 'https://github.com/arduino/ArduinoCore-avr' },
  { name: 'avr8js', what: 'the ATmega328P emulator', licence: 'MIT', url: 'https://github.com/wokwi/avr8js' },
  { name: 'React', what: 'the user interface', licence: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'Inter and JetBrains Mono', what: 'the typefaces', licence: 'SIL Open Font License', url: 'https://fontsource.org/' },
];

/** About: what the app is, the Arduino compiler's download, and open-source licences. */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const compiler = useCompilerState();
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<CompileResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current && !box.current.contains(t) && !t.closest('.about-btn')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setTest(await compile(TEST_SKETCH));
    setTesting(false);
  };

  return (
    <div className="circuits-menu about-panel" ref={box} role="dialog" aria-label="About">
      <div className="cm-head">
        <span className="panel-title">About Electronics Tutorial</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="cm-section">
        <p className="cm-hint">
          Learn electronics by building circuits that a real simulator runs. Everything happens in this browser: no account, and nothing you make is sent
          anywhere.
        </p>
      </div>

      <div className="cm-section">
        <span className="cm-label">Arduino compiler</span>
        {compiler.phase === 'unknown' && <p className="cm-hint">Checking…</p>}
        {compiler.phase === 'absent' && (
          <>
            <p className="cm-hint">
              Arduino code is compiled right here in the browser by the same compiler the Arduino IDE uses. It’s a one-time download
              {compiler.bytes ? ` of ${mb(compiler.bytes)}` : ''}, then it works offline.
            </p>
            <div className="cm-current">
              <button className="btn primary" onClick={prepareCompiler}>
                Download now
              </button>
            </div>
          </>
        )}
        {compiler.phase === 'downloading' && (
          <>
            <p className="cm-hint">
              Downloading… {mb(compiler.loaded)} of {mb(compiler.total)}
            </p>
            <progress className="about-progress" value={compiler.loaded} max={compiler.total} />
          </>
        )}
        {compiler.phase === 'error' && (
          <>
            <p className="cm-msg warn">{compiler.message}</p>
            <div className="cm-current">
              <button className="btn" onClick={prepareCompiler}>
                Try again
              </button>
            </div>
          </>
        )}
        {compiler.phase === 'ready' && (
          <>
            <p className="cm-hint">Downloaded: it works offline on this device.</p>
            <div className="cm-current">
              <button className="btn" onClick={runTest} disabled={testing}>
                {testing ? 'Compiling…' : 'Test it: compile Blink'}
              </button>
              <button className="btn danger" onClick={() => void forgetCompiler()} disabled={testing} title="Free the space; it downloads again when needed">
                Remove
              </button>
            </div>
            {test &&
              (test.ok ? (
                <p className="cm-msg ok">
                  Compiled Blink in {(test.ms / 1000).toFixed(2)} s. It uses {test.flashBytes.toLocaleString()} bytes ({pct(test.flashBytes, UNO_FLASH_BYTES)}) of the
                  Uno’s program storage and {test.ramBytes} bytes ({pct(test.ramBytes, UNO_RAM_BYTES)}) of its memory.
                </p>
              ) : (
                <p className="cm-msg warn">{test.diagnostics[0]?.message ?? 'It didn’t compile.'}</p>
              ))}
          </>
        )}
      </div>

      <div className="cm-section">
        <span className="cm-label">Open-source software</span>
        <p className="cm-hint">Electronics Tutorial is built on these projects. Each link leads to its source code.</p>
        <ul className="about-credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.name}
              </a>{' '}
              <span className="about-licence">{c.licence}</span>
              <div className="cm-hint">{c.what}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
