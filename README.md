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
- `npm test`: run the tests (the simulator is checked against hand calculations)

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
- Milestone 2, step 3: sound. A speaker part plays the simulated waveform; buzzers play their own tone; sound button and volume in the top bar (off on the first visit), with a limiter. The simulator now runs in a background thread. Done (fast transistor tone circuits are still too demanding to play live: a later speed-up task).
- Milestone 2, step 4: new parts. An AC source (signal generator: up to 25 V peak, 1 Hz to 20 kHz, sine, square or triangle), an inductor, a transformer, a bridge rectifier and a 555 timer, each with readings, ratings and a "Why this value?" explanation. Done.
- Milestone 2, step 5: the Sound & Timing track, 10 lessons: the oscilloscope, a two-transistor blinker, from blink to beep, the 555 one-shot, the 555 blinker, 555 tones (tune to A, 440 Hz), a light theremin, AC signals, rectifiers, and a DC power supply project. Lesson steps can now check what the scope measures, whether an LED is blinking, and whether a speaker is sounding. Each lesson is proven completable by an automated walk-through. Done.

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
- **Pan:** drag empty space (two fingers on a tablet); **zoom:** mouse wheel or pinch; click the % to fit
