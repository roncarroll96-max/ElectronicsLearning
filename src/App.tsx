import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TopBar, type Mode, type View } from './components/TopBar';
import { PartsTray } from './components/PartsTray';
import { PartIcon } from './components/PartIcon';
import { SidePanel } from './components/SidePanel';
import { StatusBar, type SimStatus } from './components/StatusBar';
import { CircuitCanvas, type CanvasApi } from './canvas/CircuitCanvas';
import { BurnNotice } from './components/BurnNotice';
import { MeterPanel } from './meter/MeterPanel';
import { circuitWithMeter, fuseOverload, INITIAL_METER, readMeter, type MeterState } from './meter/meter';
import { deleteItems, rotateParts, updatePart } from './model/circuit';
import type { PartKind } from './model/parts';
import { worstBurnout } from './sim/ratings';
import { simulate } from './sim/simulate';
import { useCircuit } from './state/useCircuit';
import { useTheme } from './state/theme';

const DRAG_THRESHOLD = 6;

export function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>('learn');
  const [view, setView] = useState<View>('realistic');
  // On narrow screens (tablets in portrait) the side panels slide over the canvas.
  const [panelsOpen, setPanelsOpen] = useState(false);

  const { circuit, edit, undo, redo, canUndo, canRedo } = useCircuit();
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
  const sim = useMemo(() => simulate(simCircuit), [simCircuit]);
  const simStatus: SimStatus = sim.idle ? 'idle' : sim.ok ? 'running' : 'failed';
  const meterReading = useMemo(() => (meter.open ? readMeter(liveCircuit, meter, sim) : null), [liveCircuit, meter, sim]);
  const supply = circuit.parts.find((p) => p.kind === 'battery')?.value ?? 9;

  /* ---------- Burnouts ---------- */
  const [burnNotice, setBurnNotice] = useState<string | null>(null);
  const lastCircuit = useRef(circuit);
  useEffect(() => {
    // A burnout caused by an edit joins that edit's undo step, so one undo takes back both.
    // One caused by something outside the history (a held button, the meter) gets its own step.
    const fromEdit = lastCircuit.current !== circuit;
    lastCircuit.current = circuit;
    const worst = worstBurnout(simCircuit, sim);
    if (worst) {
      edit((c) => updatePart(c, worst.id, { burn: worst.burn }), !fromEdit);
      setBurnNotice(worst.id);
    }
    const blown = fuseOverload(meter, sim);
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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
      />
      <div className="workspace">
        <PartsTray onTileDown={onTileDown} onTileActivate={onTileActivate} />
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
          meter={meter}
          onMeter={setMeter}
        >
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
          circuit={circuit}
          selection={selection}
          sim={sim}
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
      <StatusBar parts={circuit.parts.length} wires={circuit.wires.length} status={simStatus} />
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <PartIcon kind={ghost.kind} />
        </div>
      )}
    </div>
  );
}
