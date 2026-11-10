# Electronics Tutorial: Specification
_Interview date: 2026-11-10 · Status: Approved 2026-11-10_

## Purpose
Electronics Tutorial is a browser-based electronics lab where anyone can learn electricity and electronics by building circuits that a real simulator runs. It's inspired by the *idea* of the classic "150-in-1" project kits, but not their look. Its core difference: the old kits gave a wiring diagram and hoped it worked. Electronics Tutorial explains **why** every part and value was chosen, and when a circuit doesn't work, it helps you find out **why not**.

**Success looks like:** a complete beginner can go from "what is voltage?" to designing their own working circuit (choosing the parts and values themselves), with plenty of "aha" moments along the way.

## People and access
- **Who:** the owner, plus anyone interested in electronics, starting from absolute zero.
- **Sign-in:** none. No accounts, no ads, no tracking.
- Everyone gets the same full app; all parts and lessons are available from the start.

## Features

### Must have (version 1)
Built in three milestones. Each milestone is a usable app on its own.

**Milestone 1: Foundations, Components, Sandbox**
1. **Circuit canvas:** a modern, dark dot-grid workspace. Drag parts from a side tray and drag between pins to wire them; wires route neatly. Zoom and pan. Works with a mouse and with touch on tablets.
2. **Two linked views:** a realistic view and a schematic view of the same circuit. Hovering or selecting a part highlights it in both.
3. **Real circuit simulation:** every circuit is actually calculated (voltages and currents), with no scripted "it works" results. Powered parts come alive: LEDs glow, current is shown as animated flow (faster means more current).
4. **Overload behavior:** an overloaded part visibly burns out (smoke puff, goes dark) with an explanation of why and how to calculate the right value. One click replaces it.
5. **Multimeter:** probe any point for volts, amps, or ohms.
6. **"Why this value?":** every part in every lesson explains the goal, the reasoning, and the choice (including standard values, tolerance, and safety margin). Plain English first, with a "Show the math" button for formulas and worked numbers.
7. **Live value sliders:** change a part's value (resistance, capacitance, and so on) and watch the circuit respond in real time.
8. **"Why isn't it working?" helper:** spots common faults (wrong connection, backwards part, missing ground, value too small or too large, open circuit) and gives graduated hints: (1) where to look, (2) what the problem is, (3) the fix.
9. **Design challenges:** a goal ("make this LED draw 15 mA from 9 V") where the learner calculates and picks the parts, and the simulator checks the result.
10. **Guided lessons:** Foundations track (about 10 lessons) and Components in Depth track (about 10 lessons). Each has a short concept explanation, a guided build, "Why this value?" notes, and a "Try changing this" experiment.
11. **Sandbox:** a blank canvas with every part, for free experimenting.
12. **Undo/redo:** full Ctrl+Z / Ctrl+Y for every change.
13. **Saving:** autosave in the browser, plus named saved circuits and export/import of circuit files for backup and sharing.
14. **Progress tracking:** lessons marked complete; suggested order but nothing locked.
15. **First launch:** a 30-second welcome, then the "Light your first LED" guided build, with options to skip to the sandbox or pick a track.

**Milestone 2: Sound and Timing**
16. **Time-based simulation:** capacitors charging, oscillators, and timers behave correctly over time.
17. **Oscilloscope:** two channels showing voltage over time at any probed point.
18. **Real sound:** speaker parts play the actual simulated waveform through the computer's speakers. Starts muted on first visit, with a master volume slider and a built-in limiter so no circuit can be harmfully loud.
19. **Sound & Timing track:** about 10 lessons (oscillators, the 555 timer, sound effects).
19a. **AC and power parts (added 2026-11-10):** a low-voltage AC source / signal generator with adjustable frequency (never household mains), half-wave and full-wave (4-diode bridge) rectifiers with a smoothing capacitor, a transformer, and an inductor. Shown on the oscilloscope: the wave chopped, flipped, then smoothed, with ripple shrinking as the capacitor grows.

**Milestone 3: Digital Logic and Arduino**
20. **Digital parts:** logic gates, flip-flops, and a 7-segment display.
21. **Arduino (real code):** a microcontroller part running real Arduino code on an emulated ATmega328 (the Arduino Uno chip). Code that works here works on a real Arduino.
22. **In-browser compiling:** the compiler runs inside the page (a one-time download when the Arduino track is first opened), works offline, and sends nothing anywhere.
23. **Code editor and serial monitor:** write code in the app; see messages the program prints.
24. **Digital Logic & Arduino track:** about 10 lessons.

### Later (not in version 1)
- **More parts, added as lessons need them (added 2026-11-10):** more LED colors (green, blue, white, each with its own voltage) and an RGB LED, Zener diode, PNP transistor, MOSFET, thermistor, 5 V voltage regulator (7805), motor, relay with protection diode, and fuse. These work in the settled-state simulator, so any can be pulled into milestone 1 if a lesson calls for it.
- Block-based programming with a "Show me the code" button revealing the equivalent Arduino code
- Logic analyzer instrument
- "Build it for real" panel: a real-world parts list per lesson
- Breadboard view
- Troubleshooting puzzles (find the hidden fault in a pre-built circuit)
- Radio projects with simulated stations
- More lessons, growing toward 150+
- More modern parts (servo, OLED screen, RGB LEDs, extra sensors)

### Out of scope
- User accounts, cloud sync, ads, analytics, or tracking
- Simulating mains (household) voltage or anything implying it's safe to try at home
- PCB layout or professional circuit design (this is a learning tool, not engineering CAD)

## Data
- **What's stored:** saved circuits, lesson progress, and settings (theme, volume, view preferences).
- **Where:** only in the person's own browser. Nothing is sent to any server.
- **Backup:** export circuits to a file and import them back. If browser data is cleared, only exported files survive. The app should say so plainly.
- **Private information:** none collected.

## Rules and edge cases
- **Simulation accuracy is non-negotiable:** a teaching tool must never teach wrong physics. Where the simulator simplifies something, the lesson says so.
- **Simulator assumptions (added in milestone 1, step 3):** every part model and its source is listed in `src/sim/models.ts`, and the simulator is checked against hand calculations in `src/sim/simulate.test.ts`. Known simplifications so far:
  - The 9 V battery has 1.5 Ω of internal resistance, like a fresh alkaline one, so readings come out slightly below the "ideal battery" textbook answer (21.1 mA instead of 21.2 mA for an LED with 330 Ω).
  - Circuits without capacitors are solved once, in their settled state. Circuits with capacitors run in time (milestone 2, step 1): 0.2 ms steps of circuit time (smaller in slow motion) using the BDF2 method SPICE calls "Gear", checked against e^(−t/RC) to within 0.2%. Every capacitor gets a fixed, invisible ±0.1% difference from its marked value, as real parts differ, so perfectly symmetrical circuits (a two-transistor blinker) start up as real ones do instead of balancing forever. Ratings (burnouts, "running hot", the meter's fuse) use readings averaged over 50 ms, since parts fail from heat building up, not from a millisecond spike such as a capacitor's first gulp of current.
  - The LED's reverse breakdown (around 5 V on real LEDs) isn't modeled yet; a reversed LED simply blocks.
  - The transistor's gain (β) is a fixed, typical 200; real transistors vary from part to part.
- **Burnouts (added in milestone 1, step 4):** each part's ratings are listed in `src/sim/ratings.ts`. Above its datasheet rating a part is flagged as running hot; at about twice it (1.5× for the capacitor's voltage) it burns out and becomes an open circuit. Only the most overloaded part burns at a time, as in real life, where the weakest part fails first and often breaks the circuit. A burnout caused by an edit is undone together with that edit. A shorted battery is flagged as a short circuit but never "burns".
- **Multimeter (added in milestone 1, step 4):** behaves like a real digital meter. In volts mode it loads the circuit with 10 MΩ. In amps mode it is a 0.5 Ω shunt that must go in series, and its 400 mA fuse blows if it carries more (for example, when placed across a battery). Ohms mode measures with its own 1 V test source and refuses while a battery is connected.
- **Lessons (added in milestone 1, step 6):** each lesson has the idea, a guided build, "Try changing this" experiments and sometimes a design challenge. Steps tick off by themselves when the circuit (or the multimeter) shows they're done, in order, and stay done. The sandbox and every lesson keep separate circuits. Every lesson is tested by an automated walk-through that does exactly what its steps say. Lesson progress is saved in the browser (step 7).
- **Saving (added in milestone 1, step 7):** the sandbox circuit, each lesson's circuit, lesson progress and where you were (Learn or Sandbox, the open lesson, the canvas view) are saved in the browser as you work, a moment after each change and again when the page closes, and restored on the next visit. Undo history is not kept between visits. "My circuits" (top bar) saves named copies, and opens, renames and deletes them (deleting asks first). Opening a saved or imported circuit replaces the sandbox, and Ctrl+Z brings the old one back. Export writes a `.circuit.json` file; import checks the whole file first and refuses a damaged or foreign one with a plain reason, changing nothing. Everything read back from storage is checked the same way, so damaged entries are skipped instead of crashing. If the browser won't store anything (private window, blocked or full storage), the status bar says "Not saving" and My circuits recommends exporting.
- **Offline (added in the milestone 1 review):** the built site installs a small service worker on the first visit that keeps a copy of the page, scripts, styles and fonts, so it opens without an internet connection afterwards. Pages are fetched fresh when online, so updates arrive on the next visit. The development server doesn't use it.
- **Operating parts (added in the milestone 1 review):** a click on a switch flips it, and pressing and holding a push button presses it, right on the canvas (dragging either one moves it instead). The inspector controls still work too.
- **Values and explanations (added in milestone 1, step 5):** resistor sliders step through the E12 standard values from 10 Ω to 1 MΩ and capacitor sliders through E6 values from 1 nF to 1000 µF; typed values are allowed but flagged when they aren't standard, with the nearest standard values named. In the sandbox, "Why this value?" recognizes a part's role from how it's wired (LED current limiter, transistor base resistor, voltage divider, capacitor with its charging resistor…) and works the numbers from the learner's own circuit. Lessons (step 6) add hand-written notes on top. "Why isn't it working?" lists faults most important first, and offers a one-click fix only for simple ones (close a switch, turn a part around, replace a burned part, use the suggested resistor).
- **Part ratings:** each part has realistic limits (current, voltage, power). Exceeding them causes a burnout with an explanation.
- **Impossible circuits** (such as a battery shorted by a wire) are caught gracefully, shown as a short circuit with an explanation, and never crash or freeze the app.
- **Standard values:** "Why this value?" teaches that real parts come in standard sizes (for example 330 Ω, 390 Ω, 4.7 µF), and design challenges accept any sensible standard choice.
- **Damaged import file:** shows a clear error and leaves existing work untouched.
- **Audio:** always limited to a safe level; muted until the user turns it on.

## Screens and look
- **Style:** modern and fresh, in the spirit of tools like Figma or Linear. No retro or nostalgic styling.
- **Theme:** dark by default (glowing LEDs and current flow stand out), with a light theme option that's remembered.
- **Main screens:**
  - **Home:** continue where you left off, the tracks with progress, sandbox, and saved circuits. (Step 7: rather than a separate page, the app reopens where you left off, the Learn panel shows a "Continue where you left off" card above the tracks, and saved circuits live in the "My circuits" menu.)
  - **Lesson:** the canvas plus a lesson panel (steps, explanations, "Why this value?", experiments, hints)
  - **Sandbox:** the canvas plus the full parts tray and instruments
  - **Instruments:** multimeter and oscilloscope as panels you can dock or float
- **Color coding:** one consistent color per signal type: power, ground, analog, digital.
- **Devices:** desktop and tablet (mouse or touch). Phones can read lessons; building on a phone isn't a goal.

## Environment and deployment
- Runs entirely in a modern browser (Chrome, Edge, Firefox, Safari).
- Hosted as a **free public website** (for example GitHub Pages) and works offline after the first visit.
- No server, no hosting costs.
- **Technology (assumed, Claude's default):** TypeScript with a modern build tool; the simulator runs in a background thread so the page stays smooth (it runs on the page for now: the time-based simulator computes 3 s of a two-transistor blinker in about 0.7 s and limits itself to half of each animation frame; it moves to a background thread with real sound in milestone 2, step 3, which needs tens of thousands of steps a second); Web Audio for sound; avr8js (open source) to emulate the Arduino chip; a WebAssembly build of the compiler for Arduino code (proven at milestone 3).

## Decisions
| Topic | Decision | Decided by |
|---|---|---|
| Look | Modern and fresh, no nostalgia | You |
| Audience | You plus anyone interested; starts from absolute zero | You |
| Math | Layered: plain English first, "Show the math" on request | You |
| Devices | Desktop and tablet | You |
| Hosting | Free public website, works offline | You |
| Version 1 tracks | All four (Foundations, Components, Sound & Timing, Digital & Arduino), in 3 milestones | You |
| Instruments in v1 | Multimeter and oscilloscope | You |
| Logic analyzer | Later; serial monitor covers Arduino in v1 | Assumed (Claude's default) |
| Sandbox | Yes, in version 1 | You |
| Unlocking | Everything available from the start | You |
| Arduino | Real Arduino code first; blocks + "Show me the code" later | You |
| Arduino compiling | In the browser, offline, nothing sent anywhere | You |
| Overload | Part burns out with an explanation; one-click replace | You |
| Help style | Graduated hints (where, what, fix) | You |
| "Build it for real" parts list | Later version | You |
| Undo | Full undo/redo | You |
| Saving | Autosave, named saves, export/import | You |
| Home screen | Built into the existing screens (reopen where you left off, Continue card, My circuits menu) instead of a separate page | Assumed (Claude's default) |
| First launch | Short welcome, then "Light your first LED" | You |
| Priority when something gives | Polish first (accurate simulation always required) | You |
| Lesson count | About 40 (10 per track), growing later | You |
| Theme | Dark default, light option | You |
| Audio safety | Muted at first, volume cap, limiter | You |
| Name | "Electronics Tutorial" (working name, 2026-11-10; replaced "Circuit Lab", which is already circuitlab.com) | You |
| Tech stack | TypeScript, background-thread simulator, Web Audio, avr8js | Assumed (Claude's default) |

## Open questions
- **Final name:** "Electronics Tutorial" is a working name. "Circuit Lab" was dropped because circuitlab.com is an established circuit simulator; "SparkBench" was considered (only clash: an IBM Apache Spark benchmark, unrelated). Pick and check the final name before publishing. Internal identifiers (storage keys, the file format tag "circuit-lab") stay as they are so saved work and exported files keep working. (You)
- **In-browser compiler:** confirm it's practical (download size, speed) at the start of milestone 3. If not, revisit with you. (Claude)
- **Hosting account:** publishing to GitHub Pages needs a GitHub repository. Decide when milestone 1 is ready to share. (You)

## How we'll know it works
1. A complete beginner opens the site, finishes "Light your first LED," and can explain why the resistor is there and how its value was chosen.
2. Deliberately wire an LED backwards: the helper's hints lead you to the problem without just giving the answer first.
3. Drag a capacitor slider in a blinker circuit and see (and, in milestone 2, hear) the timing change, with the oscilloscope matching the "Show the math" prediction.
4. Solve a design challenge by calculating a resistor value yourself and having the simulator confirm it.
5. Write a small Arduino program in the app, run it, and see the same program behave identically on a real Arduino Uno.
6. Close the browser, reopen it, and find your work and progress still there. Export a circuit, import it again, and it's identical.
