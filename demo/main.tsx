import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/theme.css';
import '../src/styles/table.css';
import '../src/styles/controls.css';
import { ClientDemo } from './ClientDemo';
import { Gallery } from './gallery/Gallery';
import { ManualDemo } from './ManualDemo';
import './demo.css';
import { ServerDemo } from './ServerDemo';

type Tab = 'gallery' | 'client' | 'server' | 'manual';
type Theme = 'auto' | 'light' | 'dark';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gallery', label: 'Gallery' },
  { id: 'client', label: 'Client mode' },
  { id: 'server', label: 'Server mode' },
  { id: 'manual', label: 'Manual mode' },
];

/** The table class that forces a scheme; none follows the system. */
function themeClass(theme: Theme): string | undefined {
  return theme === 'auto' ? undefined : `btt-theme-${theme}`;
}

function App() {
  const [tab, setTab] = useState<Tab>('gallery');
  const [theme, setTheme] = useState<Theme>('auto');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <main className="demo">
      <header className="demo-header">
        <h1>@kardebadas/bttable</h1>
        <div role="tablist" aria-label="Demo mode" className="demo-tabs">
          {TABS.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <label>
          Theme{' '}
          <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
            <option value="auto">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <div role="tabpanel">
        {tab === 'gallery' && <Gallery themeClass={themeClass(theme)} />}
        {tab === 'client' && <ClientDemo themeClass={themeClass(theme)} />}
        {tab === 'server' && <ServerDemo themeClass={themeClass(theme)} />}
        {tab === 'manual' && <ManualDemo themeClass={themeClass(theme)} />}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
