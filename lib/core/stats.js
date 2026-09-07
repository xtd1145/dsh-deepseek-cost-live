// Pure per-day aggregation over folded rows. Day key = the local calendar
// day of the row's settlement time (`time`), priced with the current table.
// Pure module: no DSH imports.

import { dayKey } from './day.js';
import { aggregateRows } from './pricing.js';

/**
 * Group rows by local day and aggregate each. Returns a Map<"YYYY-MM-DD",
 * aggregate> plus helpers.
 */
export function groupRowsByDay(rows, timeZone, prices) {
  const byDay = new Map();
  for (const row of rows) {
    const day = dayKey(typeof row.time === 'number' ? row.time : Date.now(), timeZone);
    const agg = byDay.get(day);
    if (agg) {
      agg.rows.push(row);
    } else {
      byDay.set(day, { day, rows: [row] });
    }
  }
  for (const entry of byDay.values()) entry.agg = aggregateRows(entry.rows, prices);
  return byDay;
}

/** Build a compact stats payload for a list of target days (oldest first). */
export function daySeries(rows, dayKeys, timeZone, prices) {
  const grouped = groupRowsByDay(rows, timeZone, prices);
  return dayKeys.map((day) => {
    const entry = grouped.get(day);
    return entry
      ? { day, ...entry.agg }
      : {
          day,
          requests: 0,
          failed: 0,
          cacheHitInput: 0,
          cacheMissInput: 0,
          output: 0,
          reasoning: 0,
          costCNY: 0,
        };
  });
}
