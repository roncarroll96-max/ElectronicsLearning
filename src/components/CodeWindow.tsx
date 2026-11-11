import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { setDiagnostics, type Diagnostic as LintDiagnostic } from '@codemirror/lint';
import { updatePart, type Part } from '../model/circuit';
import type { Diagnostic } from '../arduino/diagnostics';
import { compileOnce, type Arduinos } from '../state/useArduinos';
import type { EditFn } from '../state/useCircuit';

/** Unuploaded edits, by board: they survive closing the window (not reloading the page). */
const drafts = new Map<string, string>();

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', color: 'var(--text)', backgroundColor: 'var(--surface-2)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-faint)', border: 'none', borderRight: '1px solid var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
});

const ENDINGS = { none: '', nl: '\n', both: '\r\n' } as const;
type Ending = keyof typeof ENDINGS;

/**
 * The code editor and serial monitor for one Arduino: edit its sketch, check
 * that it compiles, upload it (which starts it afresh, like a real upload),
 * and read and send Serial text while it runs.
 */
export function CodeWindow({ part, edit, arduinos, onClose }: { part: Part; edit: EditFn; arduinos?: Arduinos; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const uploaded = part.sketch ?? '';
  const [draft, setDraft] = useState(() => drafts.get(part.id) ?? uploaded);
  const [checked, setChecked] = useState<{ source: string; diagnostics: Diagnostic[] | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const board = arduinos?.views.get(part.id);
  const status = board?.status;
  const dirty = draft !== uploaded;

  // The latest values, for the editor's key bindings (created once).
  const latest = useRef({ draft, upload: () => {} });

  const upload = () => {
    const src = latest.current.draft;
    if (src === (part.sketch ?? '')) arduinos?.reset(part.id); // the same program again: it starts over
    else edit((c) => updatePart(c, part.id, { sketch: src }));
    drafts.delete(part.id);
  };
  latest.current = { draft, upload };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: draft,
        extensions: [
          basicSetup,
          cpp(),
          theme,
          EditorState.tabSize.of(2),
          Prec.highest(
            keymap.of([
              { key: 'Mod-s', run: () => (latest.current.upload(), true) },
              { key: 'Mod-Enter', run: () => (latest.current.upload(), true) },
            ]),
          ),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const text = u.state.doc.toString();
            drafts.set(part.id, text);
            setDraft(text);
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id]);

  // The sketch changed from outside (an example picked, undo): show it, unless there are edits to keep.
  const lastUploaded = useRef(uploaded);
  useEffect(() => {
    if (uploaded === lastUploaded.current) return;
    lastUploaded.current = uploaded;
    const v = view.current;
    if (!v || drafts.has(part.id) || v.state.doc.toString() === uploaded) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: uploaded } });
    drafts.delete(part.id);
  }, [uploaded, part.id]);
  useEffect(() => {
    if (!dirty) drafts.delete(part.id);
  }, [dirty, part.id]);

  // What to point out: a check of this exact text, or else the uploaded sketch's compile errors (while unedited).
  const diagnostics: Diagnostic[] =
    checked?.source === draft ? (checked.diagnostics ?? []) : !dirty && status?.phase === 'error' ? status.result.diagnostics : [];

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const marks: LintDiagnostic[] = diagnostics
      .filter((d) => d.line !== undefined && d.line >= 1 && d.line <= doc.lines && d.severity !== 'note')
      .map((d) => {
        const line = doc.line(d.line!);
        const from = Math.min(line.from + Math.max(0, (d.col ?? 1) - 1), line.to);
        return { from, to: from === line.to ? line.to : Math.min(line.to, from + 1), severity: d.severity === 'warning' ? 'warning' : 'error', message: d.hint ? `${d.message}\n${d.hint}` : d.message };
      });
    v.dispatch(setDiagnostics(v.state, marks));
  }, [diagnostics]);

  const jump = (d: Diagnostic) => {
    const v = view.current;
    if (!v || d.line === undefined || d.line > v.state.doc.lines) return;
    const line = v.state.doc.line(d.line);
    const at = Math.min(line.from + Math.max(0, (d.col ?? 1) - 1), line.to);
    v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    v.focus();
  };

  const check = async () => {
    const source = draft;
    setChecking(true);
    const r = await compileOnce(source);
    setChecking(false);
    setChecked({ source, diagnostics: r.ok ? null : r.diagnostics });
  };

  // Serial monitor.
  const out = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);
  const [line, setLine] = useState('');
  const [ending, setEnding] = useState<Ending>('nl');
  useEffect(() => {
    const el = out.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [board?.serial, follow]);
  const sendLine = () => {
    arduinos?.sendSerial(part.id, line + ENDINGS[ending]);
    setLine('');
  };

  const running = status?.phase === 'running' && board?.running !== false && !part.burn;
  const okCheck = checked?.source === draft && checked.diagnostics === null;

  return (
    <section className="code-win" aria-label={`Code for ${part.ref}`}>
      <header className="code-head">
        <strong>{part.ref} · sketch</strong>
        <span className={`code-state ${dirty ? 'warn' : ''}`}>{dirty ? 'Edited, not uploaded' : 'Uploaded'}</span>
        <span className="code-spacer" />
        <button className="btn" onClick={check} disabled={checking} title="Compile without uploading, to find mistakes">
          {checking ? 'Checking…' : 'Check'}
        </button>
        <button className="btn primary" onClick={upload} title="Compile and upload to the board; the program starts from the beginning (Ctrl+S)">
          Upload
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close the code editor" title="Close">
          ✕
        </button>
      </header>

      <div className="code-editor" ref={host} />

      {(diagnostics.length > 0 || okCheck || (status?.phase === 'compiling' && !dirty)) && (
        <div className="code-msgs">
          {status?.phase === 'compiling' && !dirty && diagnostics.length === 0 && <p className="cm-hint">Compiling…</p>}
          {okCheck && diagnostics.length === 0 && <p className="cm-msg ok">It compiles. Upload it to run it.</p>}
          {diagnostics.length > 0 && (
            <ul className="uno-errors">
              {diagnostics.map((d, k) => (
                <li key={k}>
                  {d.line !== undefined ? (
                    <button className="link-btn mono" onClick={() => jump(d)}>
                      Line {d.line}
                    </button>
                  ) : null}{' '}
                  <span className="mono">{d.message}</span>
                  {d.hint && <div className="cm-hint">{d.hint}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="code-serial-head">
        <span>Serial monitor</span>
        <span className="code-spacer" />
        <label className="code-check">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Autoscroll
        </label>
        <button className="link-btn" onClick={() => arduinos?.clearSerial(part.id)}>
          Clear
        </button>
      </div>
      <pre className="uno-serial code-serial mono" ref={out}>
        {board?.serial || (
          <span className="uno-serial-empty">
            {running ? 'Nothing printed yet. Serial.begin(9600) in setup(), then Serial.println("hello"), shows up here.' : 'The board isn’t running a program.'}
          </span>
        )}
      </pre>
      <form
        className="code-send"
        onSubmit={(e) => {
          e.preventDefault();
          sendLine();
        }}
      >
        <input
          className="mono"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="Send text to the board (Serial.read)"
          disabled={!running}
          aria-label="Text to send"
        />
        <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)} aria-label="Line ending" title="What to add after the text">
          <option value="none">No line ending</option>
          <option value="nl">Newline</option>
          <option value="both">Both NL &amp; CR</option>
        </select>
        <button className="btn" type="submit" disabled={!running}>
          Send
        </button>
      </form>
    </section>
  );
}
