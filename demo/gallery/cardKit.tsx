import { type ComponentType, createContext, useContext, useRef, useState } from 'react';

/** One gallery card: its anchor id, title, when to use it, and the live example. */
export type CardSpec = { id: string; title: string; when: string; Demo: ComponentType };

/** A file of cards; `source` is that file's own text (`?raw`), where each card's snippet lives. */
export type CardGroup = { title: string; source: string; cards: CardSpec[] };

/** Lines carrying this marker exist only for the demo's theme switch and are left out of snippets. */
const DEMO_ONLY = '// demo theme';

/**
 * The snippet of card `id`: the lines between `// #region id` and the next `// #endregion` of
 * its file's source, without the demo-only lines. The live card runs exactly this code.
 */
export function snippetOf(source: string, id: string): string {
  const marker = `// #region ${id}\n`;
  const start = source.indexOf(marker);
  const end = source.indexOf('// #endregion', start);
  if (start < 0 || end < 0) return `// No snippet region "${id}" in this file.`;
  const lines = source.slice(start + marker.length, end).split('\n');
  return lines.filter((line) => !line.includes(DEMO_ONLY)).join('\n').trim();
}

const DemoTheme = createContext<string | undefined>(undefined);

/** Provides the header's theme choice (`btt-theme-light` / `btt-theme-dark`, or none) to every card. */
export const DemoThemeProvider = DemoTheme.Provider;

/** The theme class the demo header picked, for a card's `className`; demo-only, left out of snippets. */
export function useDemoTheme(): string | undefined {
  return useContext(DemoTheme);
}

/** Copies through a hidden textarea, for browsers or insecure origins without `navigator.clipboard`. */
function legacyCopy(text: string): void {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Copy was refused');
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    legacyCopy(text);
  }
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = () => {
    copyText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  };
  const label = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' }[state];
  return (
    <button type="button" className="demo-copy" onClick={copy} aria-live="polite">
      {label}
    </button>
  );
}

/** One card: title (an anchor), when to use it, the live table and its copyable code. */
export function Card({ spec, source }: { spec: CardSpec; source: string }) {
  const code = snippetOf(source, spec.id);
  const { Demo } = spec;
  return (
    <section id={spec.id} className="demo-card" aria-labelledby={`${spec.id}-title`}>
      <h3 id={`${spec.id}-title`}>
        <a href={`#${spec.id}`}>{spec.title}</a>
      </h3>
      <p className="demo-when">{spec.when}</p>
      <div className="demo-live">
        <Demo />
      </div>
      <div className="demo-code">
        <CopyButton text={code} />
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </section>
  );
}
