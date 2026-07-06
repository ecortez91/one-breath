export type Mode = 'freedive' | 'cave';
export type Record_ = { depth: number; name: string };

const KEY = 'onebreath_records';
const LEGACY_KEY = 'onebreath_pb';
const TREASURE_KEY = 'onebreath_treasure';

export function getTreasure(): number {
  return parseInt(localStorage.getItem(TREASURE_KEY) || '0', 10) || 0;
}

/** Bank a haul (only call when the diver actually made it back up). */
export function addTreasure(n: number): number {
  const total = getTreasure() + n;
  localStorage.setItem(TREASURE_KEY, String(total));
  return total;
}

function load(): { freedive: Record_; cave: Record_ } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  // Migrate the old single PB into cave mode (the original game)
  const legacy = parseInt(localStorage.getItem(LEGACY_KEY) || '0', 10) || 0;
  return {
    freedive: { depth: 0, name: '' },
    cave: { depth: legacy, name: legacy > 0 ? 'DIVER' : '' },
  };
}

export function getRecord(mode: Mode): Record_ {
  return load()[mode];
}

/**
 * If depth beats the record, asks for a nickname (arcade style) and saves.
 * Returns true when a new record was set.
 */
export function submitRecord(mode: Mode, depth: number): boolean {
  const all = load();
  if (depth <= all[mode].depth) return false;
  let name = 'DIVER';
  try {
    name = (window.prompt(`🏆 NEW ${mode.toUpperCase()} RECORD: −${depth} m!\nEnter your name:`, all[mode].name || '') || 'DIVER')
      .trim().slice(0, 12).toUpperCase() || 'DIVER';
  } catch { /* prompt unavailable (embedded); keep default */ }
  all[mode] = { depth, name };
  localStorage.setItem(KEY, JSON.stringify(all));
  return true;
}
