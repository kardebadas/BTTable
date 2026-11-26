import { type RefObject, useEffect, useRef, useState } from 'react';

/** Max allowed drift of a header cell, in px, for the wobble check. */
const TOLERANCE = 0.5;

function headerWidths(root: HTMLElement | null): number[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('.btt-th'), (th) => th.getBoundingClientRect().width);
}

/** The largest width change between two measurements; Infinity when the column count changed. */
function largestDrift(before: readonly number[], after: readonly number[]): number {
  if (before.length !== after.length) return Infinity;
  return after.reduce((worst, width, index) => Math.max(worst, Math.abs(width - before[index])), 0);
}

function scrollBox(root: HTMLElement | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>('.btt-scroll') ?? null;
}

/**
 * Wobble readout: header widths are measured at mount, then again two frames after every
 * scroll inside `target`; it shows the worst drift seen. "Re-measure" takes a new
 * baseline (needed after the window is resized, which legitimately changes widths).
 */
export function HeaderWidths({ target }: { target: RefObject<HTMLElement | null> }) {
  const baseline = useRef<number[]>([]);
  const [check, setCheck] = useState({ checks: 0, worst: 0 });
  useEffect(() => {
    const root = target.current;
    baseline.current = headerWidths(root);
    const record = () => {
      const drift = largestDrift(baseline.current, headerWidths(target.current));
      setCheck((last) => ({ checks: last.checks + 1, worst: Math.max(last.worst, drift) }));
    };
    // Two frames: the table renders its new rows in the first frame after a scroll.
    const verify = () => requestAnimationFrame(() => requestAnimationFrame(record));
    root?.addEventListener('scroll', verify, { capture: true, passive: true });
    return () => root?.removeEventListener('scroll', verify, { capture: true });
  }, [target]);
  const remeasure = () => {
    baseline.current = headerWidths(target.current);
    setCheck({ checks: 0, worst: 0 });
  };
  const jump = (fraction: number) => {
    const box = scrollBox(target.current);
    if (box) box.scrollTop = (box.scrollHeight - box.clientHeight) * fraction;
  };
  const stable = check.worst <= TOLERANCE;
  return (
    <div className="demo-widths" data-testid="header-widths" data-stable={stable} data-checks={check.checks} data-max-drift={check.worst}>
      <span className={stable ? 'demo-ok' : 'demo-bad'}>
        Header widths: {stable ? 'unchanged' : 'CHANGED'} (max drift {check.worst.toFixed(2)} px over {check.checks} checks)
      </span>
      <button type="button" onClick={() => jump(0)}>Top</button>
      <button type="button" onClick={() => jump(0.5)}>Middle</button>
      <button type="button" onClick={() => jump(1)}>Bottom</button>
      <button type="button" onClick={remeasure}>Re-measure</button>
    </div>
  );
}
