import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TopBar, type Mode, type View } from './components/TopBar';
import { PartsTray } from './components/PartsTray';
import { PartIcon } from './components/PartIcon';
import { SidePanel } from './components/SidePanel';
import { StatusBar, type SimStatus } from './components/StatusBar';
import { CircuitCanvas, type CanvasApi } from './canvas/CircuitCanvas';
import { BurnNotice } from './components/BurnNotice';
import { HelpPanel, INITIAL_HELP, type HelpState } from './components/HelpPanel';
import { diagnose, type Issue } from './learn/diagnose';
import { lessonById, nextLesson } from './learn/lessons';
import { advance, currentStep, isComplete } from './learn/lessons/progress';
import { topology } from './learn/topology';
import { hasBeenWelcomed, markWelcomed, Welcome, type WelcomeChoice } from './components/Welcome';
import { MeterPanel } from './meter/MeterPanel';
import { circuitWithMeter, fuseOverload, INITIAL_METER, readMeter, type MeterState } from './meter/meter';
import { deleteItems, EMPTY_CIRCUIT, newId, rotateParts, updatePart, type Circuit } from './model/circuit';
import type { PartKind } from './model/parts';
import { worstBurnout } from './sim/ratings';
import { useLiveSim } from './state/useLiveSim';
import { TimeControls } from './components/TimeControls';
import { INITIAL_SCOPE, scopePins, type ScopeState } from './scope/scope';
import { ScopePanel } from './scope/ScopePanel';
import { PART_DEFS } from './model/parts';
import { useCircuit } from './state/useCircuit';
import { useTheme } from './state/theme';
import {
  loadProgress,
  loadSaved,
  loadSession,
  loadWorkspaces,
  saveProgress,
  saveSaved,
  saveSession,
  saveWorkspaces,
  storageAvailable,
  type SavedCircuit,
} from './state/storage';
import { circuitToFile, fileNameFor, parseCircuitFile } from './model/circuitFile';
import { CircuitsMenu, type CircuitsMenuApi } from './components/CircuitsMenu';

/** Everything remembered from the last visit, read once at start-up. */
function restore() {
  const session = loadSession();
  const lessonId = session.lessonId && lessonById(session.lessonId) ? session.lessonId : null;
  const workspaces = loadWorkspaces();
  const workspace = session.mode === 'learn' && lessonId ? `lesson:${lessonId}` : 'sandbox';
  const circuit =
    workspaces.get(workspace) ?? (lessonId && workspace !== 'sandbox' ? lessonById(lessonId)?.starter?.() : undefined) ?? EMPTY_CIRCUIT;
  return {
    session: { ...session, lessonId },
    workspaces,
    workspace,
    circuit,
    progress: loadProgress(),
    saved: loadSaved(),
    storageOk: storageAvailable(),
  };
}

const DRAG_THRESHOLD = 6;

export function App() {
  const { theme, toggle } = useTheme();
  const [boot] = useState(restore);
  const [mode, setMode] = useState<Mode>(boot.session.mode);
  const [view, setView] = useState<View>(boot.session.view);
  // On narrow screens (tablets in portrait) the side panels slide over the canvas.
  const [panelsOpen, setPanelsOpen] = useState(false);

  const { circuit, edit, undo, redo, load, canUndo, canRedo } = useCircuit(boot.circuit);
  const [rawSelection, setSelection] = useState<string[]>([]);
  const canvasApi = useRef<CanvasApi | null>(null);
  const [ghost, setGhost] = useState<{ kind: PartKind; x: number; y: number } | null>(null);

  // Push buttons are only pressed while held, so their state lives here, outside the undo history.
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());
  const onPress = useCallback((id: string, down: boolean) => {
    setPressed((prev) => {
      if (prev.has(id) === down) return prev;
      const next = new Set(prev);
      if (down) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const [meter, setMeter] = useState<MeterState>(INITIAL_METER);

  // The circuit as it is right now (held buttons pressed), and as the simulator sees it
  // (plus the multimeter, which in volts and amps modes is part of the circuit).
  const liveCircuit = useMemo(
    () =>
      pressed.size ? { ...circuit, parts: circuit.parts.map((p) => (pressed.has(p.id) ? { ...p, on: true } : p)) } : circuit,
    [circuit, pressed],
  );
  const simCircuit = useMemo(() => circuitWithMeter(liveCircuit, meter), [liveCircuit, meter]);
  // Re-solve whenever anything changes. A DC solve of a circuit this size takes well under a millisecond.
  // Solved once for a circuit without capacitors; run live in time for one with them.
  const [scope, setScope] = useState<ScopeState>(INITIAL_SCOPE);
  const scopeAt = useMemo(() => scopePins(liveCircuit, scope), [liveCircuit, scope]);
  const live = useLiveSim(simCircuit, scopeAt);
  const sim = live.sim;
  const restartTime = live.restart;
  const simStatus: SimStatus = sim.idle ? 'idle' : sim.ok ? 'running' : 'failed';
  const meterReading = useMemo(() => (meter.open ? readMeter(liveCircuit, meter, sim) : null), [liveCircuit, meter, sim]);
  const supply = circuit.parts.find((p) => p.kind === 'battery')?.value ?? 9;

  /* ---------- Lessons ---------- */
  const [welcome, setWelcome] = useState(() => !hasBeenWelcomed());
  const [lessonId, setLessonId] = useState<string | null>(boot.session.lessonId);
  const [lastLessonId, setLastLessonId] = useState<string | null>(boot.session.lastLessonId);
  const [progress, setProgress] = useState<Record<string, string[]>>(boot.progress.steps);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set(boot.progress.completed));
  const lesson = lessonId ? lessonById(lessonId) : undefined;

  // The sandbox and each lesson have their own circuit. Switching puts the current one aside.
  const workspace = mode === 'learn' && lessonId ? `lesson:${lessonId}` : 'sandbox';
  const [activeWorkspace, setActiveWorkspace] = useState(boot.workspace);
  const stash = useRef(boot.workspaces);
  // A saved or imported circuit waiting to open once the sandbox is showing.
  const pendingOpen = useRef<Circuit | null>(null);
  const switchTo = useCallback(
    (key: string, fresh = false) => {
      const lessonFor = key.startsWith('lesson:') ? lessonById(key.slice(7)) : undefined;
      const saved = fresh ? undefined : stash.current.get(key);
      const opening = key === 'sandbox' ? pendingOpen.current : null;
      pendingOpen.current = null;
      if (opening) load(opening, saved);
      else load(saved ?? lessonFor?.starter?.() ?? EMPTY_CIRCUIT);
      setActiveWorkspace(key);
      // A different circuit: power it up from scratch (clock at zero, capacitors empty).
      restartTime();
      setSelection([]);
      setPressed(new Set());
      setBurnNotice(null);
      setHelp((h) => ({ ...h, open: false }));
      window.setTimeout(() => canvasApi.current?.fit(), 30);
    },
    [load, restartTime],
  );
  useEffect(() => {
    if (workspace === activeWorkspace) return;
    stash.current.set(activeWorkspace, circuit);
    switchTo(workspace);
    // Only when the workspace changes.
  }, [workspace]);

  const lessonActive = !!lesson && activeWorkspace === `lesson:${lesson.id}`;
  const done = lesson ? (progress[lesson.id] ?? []) : [];
  useEffect(() => {
    if (!lessonActive || !lesson) return;
    const before = progress[lesson.id] ?? [];
    const after = advance(lesson, before, { c: liveCircuit, sim, t: topology(liveCircuit), meter, reading: meterReading });
    if (after.length === before.length) return;
    setProgress((p) => ({ ...p, [lesson.id]: after }));
    if (isComplete(lesson, after)) setCompleted((s) => new Set(s).add(lesson.id));
  }, [sim, meterReading, lessonActive]);

  const openLesson = useCallback((id: string) => {
    setMode('learn');
    setLessonId(id);
    setLastLessonId(id);
  }, []);
  const restartLesson = useCallback(() => {
    if (!lesson) return;
    setProgress((p) => ({ ...p, [lesson.id]: [] }));
    stash.current.delete(`lesson:${lesson.id}`);
    switchTo(`lesson:${lesson.id}`, true);
  }, [lesson, switchTo]);
  const next = lesson ? nextLesson(lesson.id) : undefined;
  const trayHint = lessonActive && lesson ? currentStep(lesson, done)?.tray : undefined;

  const onWelcome = useCallback(
    (choice: WelcomeChoice) => {
      markWelcomed();
      setWelcome(false);
      if (choice === 'first-led') openLesson('first-led');
      else if (choice === 'lessons') setMode('learn');
      else setMode('sandbox');
    },
    [openLesson],
  );

  /* ---------- Remembering everything (this browser only) ---------- */
  const [storageOk, setStorageOk] = useState(boot.storageOk);
  const [sandboxSaveId, setSandboxSaveId] = useState<string | null>(boot.session.sandboxSaveId);

  // Autosave the circuit on screen a moment after each change, and everything on leaving the page.
  useEffect(() => {
    stash.current.set(activeWorkspace, circuit);
    const t = window.setTimeout(() => setStorageOk(saveWorkspaces(stash.current)), 400);
    return () => window.clearTimeout(t);
  }, [circuit, activeWorkspace]);
  useEffect(() => {
    const flush = () => saveWorkspaces(stash.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  useEffect(() => {
    setStorageOk(saveProgress({ steps: progress, completed: [...completed] }));
  }, [progress, completed]);
  useEffect(() => {
    setStorageOk(saveSession({ mode, view, lessonId, lastLessonId, sandboxSaveId }));
  }, [mode, view, lessonId, lastLessonId, sandboxSaveId]);

  /* ---------- Named saves, export and import ---------- */
  const [saved, setSaved] = useState<SavedCircuit[]>(boot.saved);
  const [menuOpen, setMenuOpen] = useState(false);
  const inSandbox = activeWorkspace === 'sandbox';
  const sandboxSave = inSandbox && sandboxSaveId ? saved.find((s) => s.id === sandboxSaveId) : undefined;
  const circuitName = lessonActive && lesson ? lesson.title : (sandboxSave?.name ?? 'My circuit');

  /** Writes the list; on failure keeps the old one and says why. */
  const storeSaved = useCallback(
    (list: SavedCircuit[]): string | null => {
      if (!saveSaved(list)) {
        setStorageOk(storageAvailable());
        return 'Couldn’t save: this browser isn’t letting Electronics Tutorial store anything (it may be full, or blocked in a private window). Export to a file instead.';
      }
      setSaved(list);
      return null;
    },
    [],
  );

  /** Opens a circuit in the sandbox. Whatever was there is one Ctrl+Z away. */
  const openInSandbox = useCallback(
    (c: Circuit, saveId: string | null) => {
      setSandboxSaveId(saveId);
      setMode('sandbox');
      restartTime();
      if (activeWorkspace === 'sandbox') {
        load(c, circuit);
        setSelection([]);
        setBurnNotice(null);
        window.setTimeout(() => canvasApi.current?.fit(), 30);
      } else {
        pendingOpen.current = c;
      }
    },
    [activeWorkspace, circuit, load, restartTime],
  );

  const menu: CircuitsMenuApi = {
    saved,
    storageOk,
    inSandbox,
    lessonTitle: lessonActive && lesson ? lesson.title : undefined,
    currentName: circuitName,
    currentSaveId: sandboxSave?.id,
    empty: circuit.parts.length === 0,
    saveAs: (name) => {
      const entry: SavedCircuit = { id: newId('s'), name, savedAt: new Date().toISOString(), circuit };
      const err = storeSaved([entry, ...saved]);
      if (!err && inSandbox) setSandboxSaveId(entry.id);
      return err;
    },
    saveOver: (id) =>
      storeSaved(saved.map((s) => (s.id === id ? { ...s, circuit, savedAt: new Date().toISOString() } : s))),
    open: (id) => {
      const s = saved.find((x) => x.id === id);
      if (s) openInSandbox(s.circuit, s.id);
      setMenuOpen(false);
    },
    rename: (id, name) => storeSaved(saved.map((s) => (s.id === id ? { ...s, name } : s))),
    remove: (id) => {
      const err = storeSaved(saved.filter((s) => s.id !== id));
      if (!err && sandboxSaveId === id) setSandboxSaveId(null);
      return err;
    },
    exportFile: () => {
      const blob = new Blob([circuitToFile(circuit, circuitName)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameFor(circuitName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    importText: (text) => {
      const r = parseCircuitFile(text);
      if (!r.ok) return { error: r.error };
      openInSandbox(r.value.circuit, null);
      setMenuOpen(false);
      return { name: r.value.name };
    },
  };

  /* ---------- Burnouts ---------- */
  const [burnNotice, setBurnNotice] = useState<string | null>(null);
  const lastCircuit = useRef(circuit);
  useEffect(() => {
    // A burnout caused by an edit joins that edit's undo step, so one undo takes back both.
    // One caused by something outside the history (a held button, the meter) gets its own step.
    const fromEdit = lastCircuit.current !== circuit;
    lastCircuit.current = circuit;
    // Ratings use heat-averaged readings: a millisecond spike doesn't destroy a part.
    const worst = worstBurnout(simCircuit, live.stress);
    if (worst) {
      edit((c) => updatePart(c, worst.id, { burn: worst.burn }), !fromEdit);
      setBurnNotice(worst.id);
    }
    const blown = fuseOverload(meter, live.stress);
    if (blown !== null) setMeter((m) => ({ ...m, fuseBlownAt: blown }));
    // Runs once per new simulation result.
  }, [sim]);

  const replacePart = useCallback(
    (id: string) => {
      edit((c) => updatePart(c, id, { burn: undefined }));
      setBurnNotice((n) => (n === id ? null : n));
    },
    [edit],
  );
  const noticePart = burnNotice ? circuit.parts.find((p) => p.id === burnNotice && p.burn) : undefined;

  /* ---------- "Why isn't it working?" ---------- */
  const [help, setHelp] = useState<HelpState>(INITIAL_HELP);
  const issues = useMemo(() => diagnose(liveCircuit, sim), [liveCircuit, sim]);
  const helpIssue = help.open ? issues[Math.min(help.index, issues.length - 1)] : undefined;
  const applyFix = useCallback(
    (issue: Issue) => {
      if (issue.action) edit(issue.action.apply);
    },
    [edit],
  );

  // Drop ids that no longer exist (after delete or undo).
  const selection = useMemo(() => {
    const ids = new Set([...circuit.parts.map((p) => p.id), ...circuit.wires.map((w) => w.id)]);
    return rawSelection.filter((id) => ids.has(id));
  }, [rawSelection, circuit]);

  const rotateSelected = useCallback(() => {
    if (selection.length === 0) return;
    const ids = new Set(selection);
    edit((c) => rotateParts(c, ids));
  }, [selection, edit]);

  const deleteSelected = useCallback(() => {
    if (selection.length === 0) return;
    const ids = new Set(selection);
    edit((c) => deleteItems(c, ids));
    setSelection([]);
  }, [selection, edit]);

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Typing in a text box keeps its own keys (sliders don't need them).
      const typing =
        t && ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selection.length) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (!mod && key === 'r') {
        rotateSelected();
      } else if (e.key === 'Escape') {
        setSelection([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selection, deleteSelected, rotateSelected]);

  /* ---------- Dragging parts from the tray ---------- */
  const onTileDown = useCallback((kind: PartKind, e: RPointerEvent) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;

    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setGhost(null);
    };
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD) {
        dragging = true;
        setPanelsOpen(false);
      }
      if (dragging) setGhost({ kind, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (dragging) {
        canvasApi.current?.dropPart(kind, ev.clientX, ev.clientY);
      } else {
        canvasApi.current?.addPartAtCenter(kind);
        setPanelsOpen(false);
      }
    };
    const cancel = () => cleanup();

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }, []);

  const onTileActivate = useCallback((kind: PartKind) => {
    canvasApi.current?.addPartAtCenter(kind);
  }, []);

  return (
    <div className={`app${panelsOpen ? ' panels-open' : ''}${ghost ? ' dragging-part' : ''}`}>
      <TopBar
        mode={mode}
        onMode={setMode}
        view={view}
        onView={setView}
        theme={theme}
        onToggleTheme={toggle}
        onTogglePanels={() => setPanelsOpen((o) => !o)}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
      />
      {menuOpen && <CircuitsMenu api={menu} onClose={() => setMenuOpen(false)} />}
      <div className="workspace">
        <PartsTray onTileDown={onTileDown} onTileActivate={onTileActivate} highlight={trayHint} />
        <CircuitCanvas
          mode={mode}
          view={view}
          circuit={circuit}
          edit={edit}
          selection={selection}
          onSelect={setSelection}
          apiRef={canvasApi}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onRotate={rotateSelected}
          onDelete={deleteSelected}
          sim={sim}
          stress={live.stress}
          meter={meter}
          onMeter={setMeter}
          scope={scope}
          onScope={setScope}
          onPress={onPress}
          focus={helpIssue ? { parts: helpIssue.parts, pins: helpIssue.pins } : undefined}
        >
          {live.dynamic && <TimeControls live={live} />}
          {scope.open && (
            <ScopePanel
              scope={scope}
              onChange={setScope}
              trace={live.trace}
              now={live.time}
              dynamic={live.dynamic}
              steady={scopeAt.map((p) => (p && sim.ok && !sim.idle ? (sim.parts.get(p.part)?.v[p.pin] ?? null) : p ? 0 : null)) as [number | null, number | null]}
              names={scopeAt.map((p) => {
                const part = p && liveCircuit.parts.find((x) => x.id === p.part);
                return part && p ? `${part.ref} · ${PART_DEFS[part.kind].pins[p.pin].name}` : null;
              }) as [string | null, string | null]}
              frame={live.time}
              onClose={() => setScope((s) => ({ ...s, open: false }))}
            />
          )}
          <HelpPanel help={help} issues={issues} empty={circuit.parts.length === 0} onChange={setHelp} onApply={applyFix} />
          {noticePart && (
            <BurnNotice
              key={noticePart.id}
              part={noticePart}
              supply={supply}
              onReplace={() => replacePart(noticePart.id)}
              onDismiss={() => setBurnNotice(null)}
            />
          )}
          {meter.open && meterReading && (
            <MeterPanel
              meter={meter}
              reading={meterReading}
              onMode={(mode) => setMeter((m) => ({ ...m, mode }))}
              onClose={() => setMeter((m) => ({ ...m, open: false }))}
              onReplaceFuse={() => setMeter((m) => ({ ...m, fuseBlownAt: null }))}
            />
          )}
        </CircuitCanvas>
        <SidePanel
          mode={mode}
          learn={{
            lesson,
            done,
            completed,
            next,
            continueLesson: !lesson && lastLessonId ? lessonById(lastLessonId) : undefined,
            progress,
            onOpen: openLesson,
            onBack: () => setLessonId(null),
            onRestart: restartLesson,
            onNext: () => next && openLesson(next.id),
          }}
          circuit={circuit}
          selection={selection}
          sim={sim}
          stress={live.stress}
          edit={edit}
          pressed={pressed}
          onPress={onPress}
          supply={supply}
          onReplace={replacePart}
          onRotate={rotateSelected}
          onDelete={deleteSelected}
        />
        <button className="scrim" aria-label="Close panels" onClick={() => setPanelsOpen(false)} />
      </div>
      <StatusBar parts={circuit.parts.length} wires={circuit.wires.length} status={simStatus} storageOk={storageOk} />
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <PartIcon kind={ghost.kind} />
        </div>
      )}
      {welcome && <Welcome onChoose={onWelcome} />}
    </div>
  );
}
