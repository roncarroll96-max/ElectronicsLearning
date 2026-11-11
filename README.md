# Electronics Tutorial

Learn electronics by building circuits that a real simulator runs. See [APP-SPEC.md](APP-SPEC.md) for the full specification.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

## Other commands

- `npm run build`: production build into `dist/` (a static site that can be hosted anywhere; after the first visit it works offline)
- `npm run preview`: serve the production build at http://localhost:4180 (offline support only runs in the built site)
- `npm run typecheck`: check the TypeScript code for errors
- `npm test`: run the tests (the simulator is checked against hand calculations; the Arduino compiler tests run last, on their own, because they would otherwise slow the simulator's speed checks)
- `npm run prepare-arduino`: prepare the in-browser Arduino compiler in `public/arduino/` from the pinned `@horang-corp/avr-gcc-wasm` package (runs automatically before `dev`, `build` and `test`; the output isn't committed)

## Progress

- Milestone 1, step 1: app shell (theme, layout, parts tray). Done.
- Milestone 1, step 2: circuit canvas (drag parts in, wire pin to pin, move, rotate, delete, undo/redo, pan and zoom, realistic and schematic views). Done.
- Milestone 1, step 3: simulator (calculates every voltage and current; live readings in the Sandbox inspector; switch, push button, potentiometer and light-sensor controls). Done.
- Milestone 1, step 4: the circuit comes alive (glowing LEDs and lamps, buzzer waves, current-flow animation, burnouts with explanations and one-click replace, multimeter with volts, amps and ohms). Done.
- Milestone 1, step 5: value sliders through standard values, "Why this value?" worked from your own circuit, and "Why isn't it working?" graduated hints. Done.
- Milestone 1, step 6: lessons and first-launch welcome. Lesson system, track list, and all 20 lessons: Foundations (first LED, voltage, current, resistance, Ohm’s law, power, series, parallel, voltage dividers, switches and logic) and Components in Depth (diodes, LEDs, capacitors, potentiometers, light sensors, transistor switch, transistor gain, choosing a base resistor, a night-light project, diode logic). Each lesson is proven completable by an automated walk-through. Done.
- Milestone 1, step 7: saving. Autosave of the sandbox and every lesson circuit, lesson progress, and where you were; "Continue where you left off"; named saves, export and import in "My circuits". Done.
- Milestone 1 review: switches and push buttons work directly on the canvas, offline support after the first visit, and layout fixes. Spec checks 1, 2, 4 and 6 pass (3 and 5 belong to milestones 2 and 3). Done.
- Milestone 2, step 1: circuits that change over time. Capacitors charge and discharge (with a charge gauge), LEDs fade, a two-transistor blinker blinks; a clock with pause, slow motion and power off/on; the Capacitors lesson now watches a capacitor charge. Done.
- Milestone 2, step 2: oscilloscope. Two channels probed like the multimeter, sampled at every simulation step; volts/division, position, time/division, trigger, Auto, and readings of voltage, range and frequency; the panel can be dragged anywhere and docked back. Done.
- Milestone 2, step 3: sound. A speaker part plays the simulated waveform; buzzers play their own tone; sound button and volume in the top bar (off on the first visit), with a limiter. The simulator now runs in a background thread. Done; a later speed-up lets fast transistor tone circuits play live.
- Milestone 2, step 4: new parts. An AC source (signal generator: up to 25 V peak, 1 Hz to 20 kHz, sine, square or triangle), an inductor, a transformer, a bridge rectifier and a 555 timer, each with readings, ratings and a "Why this value?" explanation. Done.
- Milestone 2, step 5: the Sound & Timing track, 10 lessons: the oscilloscope, a two-transistor blinker, from blink to beep, the 555 one-shot, the 555 blinker, 555 tones (tune to A, 440 Hz), a light theremin, AC signals, rectifiers, and a DC power supply project. Lesson steps can now check what the scope measures, whether an LED is blinking, and whether a speaker is sounding. Each lesson is proven completable by an automated walk-through. Done.
- Milestone 2 review: “Show the math” now works out a blinker capacitor’s half-cycle and a 555’s frequency or pulse length from the parts in your circuit, and tests check those predictions against the simulated scope (spec check 3). The blinker lesson’s quoted rate corrected to the simulated 1.7 Hz. Spec checks 1, 2, 3, 4 and 6 pass (5 belongs to milestone 3). Done.
- Milestone 3, step 1: in-browser Arduino compiler. Real avr-gcc 7.3.0 (the Arduino IDE’s Uno compiler), binutils, avr-libc 2.0.0 and the Arduino AVR core, built for WebAssembly, run in a background thread: a 6.6 MB one-time download, kept on the device so it works offline, and nothing is sent anywhere. Sketches are prepared like the IDE does (Arduino.h, automatic prototypes), the core is linked as an archive so only what a sketch uses goes in, and errors point at the sketch line with a plain-English hint. Blink compiles in about 0.2 s. The About panel (ⓘ in the top bar) downloads, tests or removes the compiler and lists the open-source licences. Tests compile real sketches and run them on the avr8js emulator. Done.
- Milestone 3, step 2: the Arduino Uno part. A board with D0–D13, A0–A5, 5V, 3.3V and GND, running its sketch on an emulated ATmega328P (avr8js) inside the circuit simulator. Output pins drive through about 25 Ω as the real chip does, inputs read real voltages (with INPUT_PULLUP’s 35 kΩ), analogRead measures A0–A5, analogWrite makes 490 Hz PWM, tone() plays through a speaker, and every pin change lands at its exact clock cycle. The program keeps running while you rewire; a new sketch starts it afresh. More than 40 mA from a pin burns the board out, with an explanation. Its panel picks a built-in example (Blink, Button, Fade, Read a voltage, Play notes, Traffic light), shows whether it compiled and how much memory it uses, resets it, and shows its Serial output. Tests check the timing, PWM, tone, analogRead, pull-ups and burn-out against a real Uno. Done.
- Milestone 3, step 3: code editor and serial monitor. “Edit code” on an Uno opens an editor with C++ highlighting, auto-indent and bracket matching over the canvas: Check compiles without uploading, Upload (or Ctrl+S) compiles and starts the board afresh, and compile errors are underlined in the code with a plain-English hint (click one to jump to its line). Unuploaded edits are kept while the page stays open; uploaded code is saved with the circuit. The serial monitor shows what the board prints, with autoscroll and Clear, and sends typed text to the board (Serial.read) with a choice of line ending. Done.
- Milestone 3, step 4: digital parts. AND, OR, NOT, NAND, NOR and XOR gates and a D flip-flop, modelled on 74HC chips: each runs on a hidden 5 V supply (a stated simplification; wire its GND, and its 5V pin feeds switches and pull-ups), reads HIGH above 2.75 V and LOW below 2.25 V, and drives its output through about 25 Ω. A small green light marks each HIGH output. The flip-flop copies D to Q on Clock’s rising edge and keeps its state while the circuit is edited, so latches made of gates and ripple counters made of flip-flops work. A common-cathode 7-segment display lights each segment from its own pin. Each part has readings, ratings with burn-out explanations, and a “Why this value?” explanation. Tests check every gate’s truth table, a NAND latch, the flip-flop’s edge triggering, a two-bit counter and the display. Done.

### Canvas controls

- **Add a part:** drag it from the tray, or click it to drop it in the middle
- **Wire:** drag from one pin to another, or tap one pin and then the other
- **Move:** drag a part; **Shift+click** selects several
- **R** rotates, **Delete** removes, **Ctrl+Z / Ctrl+Y** undo and redo, **Esc** cancels
- **Change a value:** select a resistor, capacitor, potentiometer, battery, inductor, transformer or AC source and use the slider, chips, or type a value like 4.7k (or 10m for 10 mH)
- **AC source:** select it to set its frequency (slider or presets) and wave shape
- **Stuck?** click "Why isn't it working?" at the top left of the canvas
- **My circuits** (top bar): save, open, rename, delete, export to a file, import a file. Work is also saved automatically in this browser.
- **Switches and push buttons:** click a switch to flip it; press and hold a push button to press it
- **Circuit time** (appears when a circuit has a capacitor, coil, transformer, AC source or 555): pause, slow motion, and the power button to empty every capacitor and start again
- **Oscilloscope:** click the scope button in the toolbar, drag the CH1 (yellow) and CH2 (cyan) probes onto pins, then press Auto; drag the panel by its title to move it
- **Sound:** the speaker button in the top bar turns sound on (it starts off) and shows a volume slider; buzzers beep, speakers play whatever the circuit does
- **Multimeter:** click the meter button in the toolbar, then drag the red and black probes onto pins
- **About** (ⓘ, top bar): download the Arduino compiler now, test it by compiling Blink, remove it, and see the open-source licences
- **Arduino Uno:** drag it in and it runs Blink (watch its L light); select it to pick another example, reset it, and read what it prints over Serial. The first time, the Arduino compiler downloads (6.6 MB, once)
- **Digital logic:** gates and the flip-flop run on a hidden 5 V supply: wire each one’s GND, and use its 5V pin for switches and pull-up resistors; a green light marks a HIGH output
- **Code editor:** select an Uno and click Edit code; Check finds mistakes, Upload (Ctrl+S) runs your code; the serial monitor below shows what it prints and sends what you type
- **Pan:** drag empty space (two fingers on a tablet); **zoom:** mouse wheel or pinch; click the % to fit
