import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SavedCircuit } from '../state/storage';
import { FILE_EXTENSION } from '../model/circuitFile';

/** What the menu can do; App supplies it. Calls that can fail return an error message, or null. */
export interface CircuitsMenuApi {
  saved: SavedCircuit[];
  storageOk: boolean;
  /** The sandbox is on screen (not a lesson). */
  inSandbox: boolean;
  lessonTitle?: string;
  currentName: string;
  /** The named save the sandbox circuit came from. */
  currentSaveId?: string;
  empty: boolean;
  saveAs: (name: string) => string | null;
  saveOver: (id: string) => string | null;
  open: (id: string) => void;
  rename: (id: string, name: string) => string | null;
  remove: (id: string) => string | null;
  exportFile: () => void;
  importText: (text: string) => { error: string } | { name: string };
}

/** "My circuits": save, open, rename, delete, export and import. */
export function CircuitsMenu({ api, onClose }: { api: CircuitsMenuApi; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(api.currentSaveId ? '' : api.lessonTitle ? `${api.lessonTitle} (my version)` : '');
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Close on Escape or a click outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current && !box.current.contains(t) && !t.closest('.circuits-btn')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const report = (err: string | null, ok: string) => setMessage(err ? { text: err, tone: 'warn' } : { text: ok, tone: 'ok' });

  const onSaveAs = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    report(api.saveAs(n.slice(0, 80)), `Saved as “${n}”.`);
    setName('');
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage({ text: 'That file is far too big to be an Electronics Tutorial circuit.', tone: 'warn' });
      return;
    }
    const r = api.importText(await file.text());
    if ('error' in r) setMessage({ text: `${r.error} Nothing was changed.`, tone: 'warn' });
  };

  const current = api.currentSaveId ? api.saved.find((s) => s.id === api.currentSaveId) : undefined;

  return (
    <div className="circuits-menu" ref={box} role="dialog" aria-label="My circuits">
      <div className="cm-head">
        <span className="panel-title">My circuits</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {!api.storageOk && (
        <p className="cm-warn">
          This browser isn’t letting Electronics Tutorial save anything (a private window, or blocked or full storage). Your work will be lost
          when you close the page, so export it to a file.
        </p>
      )}

      <section className="cm-section">
        <span className="cm-label">{api.inSandbox ? 'On the canvas' : `This lesson: ${api.lessonTitle}`}</span>
        {current && (
          <div className="cm-current">
            <span className="cm-name">{current.name}</span>
            <button className="btn primary" onClick={() => report(api.saveOver(current.id), `Saved “${current.name}”.`)}>
              Save
            </button>
          </div>
        )}
        <form className="cm-saveas" onSubmit={onSaveAs}>
          <input
            type="text"
            value={name}
            maxLength={80}
            placeholder={current ? 'Save a copy as…' : 'Name this circuit'}
            aria-label="Circuit name"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!name.trim() || api.empty}>
            {current || !api.inSandbox ? 'Save copy' : 'Save'}
          </button>
        </form>
        {api.empty && <p className="cm-hint">The canvas is empty: add some parts first.</p>}
        {message && (
          <p className={`cm-msg ${message.tone}`} role="status">
            {message.text}
          </p>
        )}
      </section>

      <section className="cm-section">
        <span className="cm-label">Saved in this browser</span>
        {api.saved.length === 0 ? (
          <p className="cm-hint">Nothing saved yet. Name a circuit above to keep it.</p>
        ) : (
          <ul className="cm-list">
            {api.saved.map((s) => (
              <li key={s.id} className={s.id === api.currentSaveId ? 'current' : ''}>
                {renaming === s.id ? (
                  <form
                    className="cm-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = renameText.trim();
                      if (n) report(api.rename(s.id, n.slice(0, 80)), `Renamed to “${n}”.`);
                      setRenaming(null);
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={renameText}
                      maxLength={80}
                      aria-label="New name"
                      onChange={(e) => setRenameText(e.target.value)}
                    />
                    <button className="btn" type="submit">
                      OK
                    </button>
                  </form>
                ) : confirmDelete === s.id ? (
                  <div className="cm-confirm">
                    <span>Delete “{s.name}”? This can’t be undone.</span>
                    <button
                      className="btn danger"
                      onClick={() => {
                        report(api.remove(s.id), `Deleted “${s.name}”.`);
                        setConfirmDelete(null);
                      }}
                    >
                      Delete
                    </button>
                    <button className="btn" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="cm-open" onClick={() => api.open(s.id)} title="Open in the sandbox">
                      <span className="cm-name">{s.name}</span>
                      <span className="cm-meta">
                        {s.circuit.parts.length} parts · {when(s.savedAt)}
                      </span>
                    </button>
                    <button
                      className="cm-small"
                      onClick={() => {
                        setRenaming(s.id);
                        setRenameText(s.name);
                      }}
                    >
                      Rename
                    </button>
                    <button className="cm-small danger" onClick={() => setConfirmDelete(s.id)}>
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cm-section">
        <span className="cm-label">Files</span>
        <div className="cm-files">
          <button className="btn" onClick={api.exportFile} disabled={api.empty}>
            Export to a file
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Import a file
          </button>
          <input ref={fileInput} type="file" accept={`${FILE_EXTENSION},.json,application/json`} hidden onChange={onImport} />
        </div>
        <p className="cm-hint">
          Circuits are saved in this browser only. Clearing your browsing data erases them, so export anything you want to keep or
          share. Opening a circuit replaces the sandbox; press Ctrl+Z to get the old one back.
        </p>
      </section>
    </div>
  );
}

/** "just now", "5 min ago", "yesterday", or a date. */
function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
