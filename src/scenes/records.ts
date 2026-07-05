const KEY = 'onebreath_pb';

export function getBest(): number {
  return parseInt(localStorage.getItem(KEY) || '0', 10) || 0;
}

export function saveBest(depth: number): boolean {
  if (depth > getBest()) {
    localStorage.setItem(KEY, String(depth));
    return true;
  }
  return false;
}
