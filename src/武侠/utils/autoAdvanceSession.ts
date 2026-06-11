let autoAdvanceSessionDepth = 0;

export function beginAutoAdvanceSession(): void {
  autoAdvanceSessionDepth += 1;
}

export function endAutoAdvanceSession(): void {
  autoAdvanceSessionDepth = Math.max(0, autoAdvanceSessionDepth - 1);
}

export function isAutoAdvanceSessionActive(): boolean {
  return autoAdvanceSessionDepth > 0;
}
