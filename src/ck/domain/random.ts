export interface RandomResult {
  state: number;
  value: number;
}

export function nextRandom(state: number): RandomResult {
  let next = state || 0x6d2b79f5;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  const normalized = (next >>> 0) / 4_294_967_296;
  return { state: next >>> 0, value: normalized };
}

export function randomInt(state: number, min: number, max: number): RandomResult {
  const next = nextRandom(state);
  return { state: next.state, value: Math.floor(next.value * (max - min + 1)) + min };
}

