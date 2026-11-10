import { useState } from 'react';
import { TopBar, type Mode, type View } from './components/TopBar';
import { PartsTray } from './components/PartsTray';
import { Canvas } from './components/Canvas';
import { SidePanel } from './components/SidePanel';
import { StatusBar } from './components/StatusBar';
import { useTheme } from './state/theme';

export function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>('learn');
  const [view, setView] = useState<View>('realistic');
  // On narrow screens (tablets in portrait) the side panels slide over the canvas.
  const [panelsOpen, setPanelsOpen] = useState(false);

  return (
    <div className={`app${panelsOpen ? ' panels-open' : ''}`}>
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
        <PartsTray />
        <Canvas mode={mode} view={view} />
        <SidePanel mode={mode} />
        <button className="scrim" aria-label="Close panels" onClick={() => setPanelsOpen(false)} />
      </div>
      <StatusBar />
    </div>
  );
}
