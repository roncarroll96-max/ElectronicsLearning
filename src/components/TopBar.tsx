import type { Theme } from '../state/theme';
import type { Sound } from '../audio/sound';

export type Mode = 'learn' | 'sandbox';
export type View = 'realistic' | 'schematic';

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  view: View;
  onView: (v: View) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onTogglePanels: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  aboutOpen: boolean;
  onToggleAbout: () => void;
  playOpen: boolean;
  onTogglePlay: () => void;
  sound: Sound;
}

export function TopBar({ mode, onMode, view, onView, theme, onToggleTheme, onTogglePanels, menuOpen, onToggleMenu, aboutOpen, onToggleAbout, playOpen, onTogglePlay, sound }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <button className="icon-btn panels-btn" onClick={onTogglePanels} aria-label="Show or hide panels">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <path d="M7.5 3.5v13M12.5 3.5v13" />
          </svg>
        </button>
        <span className="logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect width="32" height="32" rx="8" fill="var(--accent-soft)" />
            <path
              d="M6 16h5l2-5 3 10 3-10 2 5h5"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="brand-name">Electronics Tutorial</span>
      </div>

      <nav className="segmented" aria-label="Mode">
        <button className={mode === 'learn' ? 'on' : ''} onClick={() => onMode('learn')}>
          Learn
        </button>
        <button className={mode === 'sandbox' ? 'on' : ''} onClick={() => onMode('sandbox')}>
          Sandbox
        </button>
      </nav>

      <div className="topbar-right">
        <button className={`btn circuits-btn play-btn${playOpen ? ' on' : ''}`} onClick={onTogglePlay} aria-expanded={playOpen} aria-haspopup="dialog" title="Playground: finished circuits to play with">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" />
            <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" />
            <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" />
            <path d="M14.5 11.5v6M11.5 14.5h6" strokeLinecap="round" />
          </svg>
          <span className="circuits-label">Playground</span>
        </button>
        <button className={`btn circuits-btn${menuOpen ? ' on' : ''}`} onClick={onToggleMenu} aria-expanded={menuOpen} aria-haspopup="dialog">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
          </svg>
          <span className="circuits-label">My circuits</span>
        </button>
        <div className={`sound-ctl${sound.on ? ' on' : ''}`}>
          <button
            className="icon-btn"
            onClick={sound.toggle}
            aria-pressed={sound.on}
            aria-label={sound.on ? 'Turn sound off' : 'Turn sound on'}
            title={sound.on ? (sound.waiting ? 'Sound is on: click anywhere to let the browser play it' : 'Sound on') : 'Sound off: click to hear buzzers and speakers'}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8h3l4-3.5v11L6 12H3z" />
              {sound.on ? (
                <>
                  <path d="M13 7.5a3.5 3.5 0 0 1 0 5" />
                  <path d="M15.5 5a7 7 0 0 1 0 10" />
                </>
              ) : (
                <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" />
              )}
            </svg>
          </button>
          {sound.on && (
            <input
              type="range"
              className="sound-volume"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              onChange={(e) => sound.setVolume(Number(e.target.value))}
              aria-label="Volume"
              title="Volume"
            />
          )}
        </div>
        <div className="segmented small" role="group" aria-label="Canvas view">
          <button className={view === 'realistic' ? 'on' : ''} onClick={() => onView('realistic')}>
            Realistic
          </button>
          <button className={view === 'schematic' ? 'on' : ''} onClick={() => onView('schematic')}>
            Schematic
          </button>
        </div>
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="10" cy="10" r="3.5" />
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" />
            </svg>
          )}
        </button>
        <button
          className={`icon-btn about-btn${aboutOpen ? ' on' : ''}`}
          onClick={onToggleAbout}
          aria-expanded={aboutOpen}
          aria-haspopup="dialog"
          aria-label="About, Arduino compiler and licences"
          title="About"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 9v5" />
            <circle cx="10" cy="6.2" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </header>
  );
}
