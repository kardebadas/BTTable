/** Chrome only: a CPU profile (CDP `Profiler`) around a step, reduced to the top self-time functions. */
import type { CDPSession } from 'playwright-core';

type ProfileNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number } };
type Profile = { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] };

/** Self time in ms per `function file:line`, highest first. */
export function topSelfTime(profile: Profile, limit = 12): { fn: string; selfMs: number }[] {
  const byNode = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map<string, number>();
  const samples = profile.samples ?? [];
  samples.forEach((nodeId, i) => {
    const frame = byNode.get(nodeId)?.callFrame;
    if (!frame) return;
    const file = frame.url.split('/').pop()?.split('?')[0] ?? '';
    const key = `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1_000);
  });
  return [...totals]
    .map(([fn, selfMs]) => ({ fn, selfMs: Math.round(selfMs) }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, limit);
}

/** Runs `work` under the sampling profiler and returns its result plus the top functions. */
export async function profiled<T>(cdp: CDPSession, work: () => Promise<T>) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const result = await work();
  const { profile } = await cdp.send('Profiler.stop');
  return { result, top: topSelfTime(profile as Profile) };
}
