# Circuit Lab

Learn electronics by building circuits that a real simulator runs. See [APP-SPEC.md](APP-SPEC.md) for the full specification.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

## Other commands

- `npm run build`: production build into `dist/` (a static site that can be hosted anywhere)
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

### Canvas controls

- **Add a part:** drag it from the tray, or click it to drop it in the middle
- **Wire:** drag from one pin to another, or tap one pin and then the other
- **Move:** drag a part; **Shift+click** selects several
- **R** rotates, **Delete** removes, **Ctrl+Z / Ctrl+Y** undo and redo, **Esc** cancels
- **Change a value:** select a resistor, capacitor, potentiometer or battery and use the slider, chips, or type a value like 4.7k
- **Stuck?** click "Why isn't it working?" at the top left of the canvas
- **My circuits** (top bar): save, open, rename, delete, export to a file, import a file. Work is also saved automatically in this browser.
- **Multimeter:** click the meter button in the toolbar, then drag the red and black probes onto pins
- **Pan:** drag empty space (two fingers on a tablet); **zoom:** mouse wheel or pinch; click the % to fit
