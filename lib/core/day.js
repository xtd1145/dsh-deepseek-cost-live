// Day-key helpers. All keys are local calendar days in the configured
// timezone (default Asia/Shanghai — DeepSeek bills in Beijing time).
// Pure module: no DSH imports, unit-testable in plain node.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86400_000;

function formatterFor(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

const fmtCache = new Map();
function getFormatter(timeZone) {
  let fmt = fmtCache.get(timeZone);
  if (!fmt) {
    fmt = formatterFor(timeZone);
    fmtCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Local calendar day key ("YYYY-MM-DD") for an epoch-ms instant in tz. */
export function dayKey(epochMs, timeZone) {
  const tz = typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : 'Asia/Shanghai';
  const parts = getFormatter(tz).formatToParts(epochMs);
  let year = '0000';
  let month = '00';
  let day = '00';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    else if (p.type === 'month') month = p.value;
    else if (p.type === 'day') day = p.value;
  }
  return `${year}-${month}-${day}`;
}

export function isValidDayKey(key) {
  return typeof key === 'string' && DAY_RE.test(key);
}

/**
 * First epoch-ms >= lo whose local day is >= key (binary search over a
 * window in which the mapping is monotonic nondecreasing).
 */
function firstAtLeast(lo, hi, key, tz) {
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = Math.floor((a + b) / 2);
    if (dayKey(mid, tz) >= key) b = mid;
    else a = mid + 1;
  }
  return a;
}

/**
 * Day bounds in a timezone: [startMs, endMsExclusive) for one "YYYY-MM-DD"
 * local day. Uses binary searches (~40 Intl probes total), never a
 * millisecond walk.
 */
export function dayRangeMs(day, timeZone) {
  const tz = typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : 'Asia/Shanghai';
  if (!isValidDayKey(day)) throw new Error(`invalid day key: ${day}`);
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12, 0, 0); // UTC noon guess inside the day
  const lo = guess - 2 * MS_DAY;
  const hi = guess + 2 * MS_DAY;
  const start = firstAtLeast(lo, hi, day, tz);
  // Guard against pathological ranges (no instant mapped to this day).
  if (dayKey(start, tz) !== day) throw new Error(`no instant found for day ${day} in ${tz}`);
  const end = firstAtLeast(start + 1, hi + MS_DAY, addOne(day), tz);
  return [start, end];
}

function addOne(day) {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const p = (n) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())}`;
}

/** Today's local day key (client/host share the semantics). */
export function todayKey(nowMs, timeZone) {
  return dayKey(typeof nowMs === 'number' ? nowMs : Date.now(), timeZone);
}

/** The last N day keys ending at today, oldest first. */
export function trailingDayKeys(nowMs, timeZone, count) {
  const n = Number.isInteger(count) && count > 0 ? count : 7;
  const out = [];
  const tz = typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : 'Asia/Shanghai';
  let cursor = todayKey(nowMs, tz);
  for (let i = 0; i < n; i++) {
    out.unshift(cursor);
    const [start] = dayRangeMs(cursor, tz);
    cursor = dayKey(start - 1, tz);
  }
  return out;
}

/** Offset a day key by signed whole days. */
export function addDays(day, offset, timeZone) {
  const tz = typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : 'Asia/Shanghai';
  const [start] = dayRangeMs(day, tz);
  return dayKey(start + offset * MS_DAY, tz);
}
