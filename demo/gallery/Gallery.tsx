import { BASICS } from './basics';
import { Card, type CardGroup, DemoThemeProvider } from './cardKit';
import { FILTERS } from './filters';
import { REMOTE } from './remote';
import { ROW_FEATURES } from './rowFeatures';
import { SCALE } from './scale';
import { STATE } from './state';

const GROUPS: CardGroup[] = [BASICS, FILTERS, ROW_FEATURES, STATE, REMOTE, SCALE];

function Contents() {
  return (
    <nav className="demo-toc" aria-label="Gallery contents">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {group.cards.map((card) => (
              <li key={card.id}>
                <a href={`#${card.id}`}>{card.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Every variant of the table as its own card: a live table and the exact code it runs. The
 * header's theme choice reaches the cards through `DemoThemeProvider`.
 */
export function Gallery({ themeClass }: { themeClass?: string }) {
  return (
    <DemoThemeProvider value={themeClass}>
      <Contents />
      {GROUPS.map((group) => (
        <div key={group.title} className="demo-group">
          <h2 className="demo-group-title">{group.title}</h2>
          {group.cards.map((card) => (
            <Card key={card.id} spec={card} source={group.source} />
          ))}
        </div>
      ))}
    </DemoThemeProvider>
  );
}
