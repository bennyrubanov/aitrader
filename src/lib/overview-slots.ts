/** Positive slot index for platform overview tiles (1 = primary; no fixed maximum). */
export const OVERVIEW_SLOT_MIN = 1;

/** Practical upper bound for API validation (Postgres int4 is ~2.1e9). */
export const OVERVIEW_SLOT_MAX = 1_000_000;

export function isValidOverviewSlot(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= OVERVIEW_SLOT_MIN &&
    n <= OVERVIEW_SLOT_MAX
  );
}

export function normalizeOverviewSlot(n: unknown): number | null {
  return isValidOverviewSlot(n) ? n : null;
}

const OVERVIEW_GRID_COLUMNS = 3;
const OVERVIEW_MIN_SLOTS = 6;

/**
 * How many cells to render (3 columns): all assigned slots plus one full row of empty adds,
 * at least {@link OVERVIEW_MIN_SLOTS}.
 */
export function visibleOverviewSlotCount(maxAssignedSlot: number): number {
  const m = Math.max(0, Math.floor(maxAssignedSlot));
  const rowsForAssigned = m === 0 ? 1 : Math.ceil(m / OVERVIEW_GRID_COLUMNS);
  return Math.max(OVERVIEW_MIN_SLOTS, (rowsForAssigned + 1) * OVERVIEW_GRID_COLUMNS);
}

export const OVERVIEW_GRID_COLS = OVERVIEW_GRID_COLUMNS;
