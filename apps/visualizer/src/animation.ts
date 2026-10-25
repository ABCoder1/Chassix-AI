// Browser timers may move backwards or jump after a tab is suspended.
export function frameDelta(now: number, previous: number): number {
  const elapsed = (now - previous) / 1000;
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 0.05)) : 0;
}

export function loopPhase(value: number): number {
  return Number.isFinite(value) ? ((value % 1) + 1) % 1 : 0;
}
