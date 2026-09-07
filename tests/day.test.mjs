import { dayKey, todayKey, trailingDayKeys, dayRangeMs, isValidDayKey, addDays } from '../lib/core/day.js';
const now = Date.now();
console.log('today zh:', todayKey(now, 'Asia/Shanghai'));
const r = dayRangeMs('2026-08-27', 'Asia/Shanghai');
console.log('range:', new Date(r[0]).toISOString(), '->', new Date(r[1]).toISOString(),
  '| start key', dayKey(r[0], 'Asia/Shanghai'), '| end-1 key', dayKey(r[1] - 1, 'Asia/Shanghai'));
console.log('trail 3:', trailingDayKeys(now, 'Asia/Shanghai', 3).join(','));
console.log('addDays 2026-08-27 +1:', addDays('2026-08-27', 1, 'Asia/Shanghai'));
console.log('valid:', isValidDayKey('2026-08-27'), isValidDayKey('x'));
