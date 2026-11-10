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
- `npm test`: run the simulator's tests (it's checked against hand calculations)

## Progress

- Milestone 1, step 1: app shell (theme, layout, parts tray). Done.
- Milestone 1, step 2: circuit canvas (drag parts in, wire pin to pin, move, rotate, delete, undo/redo, pan and zoom, realistic and schematic views). Done.
- Milestone 1, step 3: simulator (calculates every voltage and current; live readings in the Sandbox inspector; switch, push button, potentiometer and light-sensor controls). Done.

### Canvas controls

- **Add a part:** drag it from the tray, or click it to drop it in the middle
- **Wire:** drag from one pin to another, or tap one pin and then the other
- **Move:** drag a part; **Shift+click** selects several
- **R** rotates, **Delete** removes, **Ctrl+Z / Ctrl+Y** undo and redo, **Esc** cancels
- **Pan:** drag empty space (two fingers on a tablet); **zoom:** mouse wheel or pinch; click the % to fit
