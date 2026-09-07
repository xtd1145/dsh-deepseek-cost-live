// End-to-end pure test: synthetic session log -> fold -> per-day stats + CNY.
import { writeFileSync } from 'node:fs';
import { foldEvents } from '../lib/core/fold.js';
import { daySeries, groupRowsByDay } from '../lib/core/stats.js';
import { dayRangeMs, trailingDayKeys } from '../lib/core/day.js';
import { DEFAULT_PRICES, costOfRow, modelPrice } from '../lib/core/pricing.js';

const lines = [];
function ev(type, data, seq, time) { return { type, data, seq, time }; }
const TZ = 'Asia/Shanghai';
const H = 3600_000;
// A local day in Shanghai: 2026-08-27 runs 2026-08-26T16:00Z .. 2026-08-27T16:00Z
const d0 = Date.parse('2026-08-27T02:00:00Z'); // 10:00 local 08-27

const events = [
  ev('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-chat' } } }, 1, d0),
  ev('step/start', { turn: 1, step: 0 }, 2, d0),
  ev('assistant/chunk', { turn: 1, step: 0, chunk: { type: 'text', text: 'hi' } }, 3, d0),
  ev('assistant/chunk', { turn: 1, step: 0, chunk: { type: 'usage', usage: { inputTokens: 1000, cacheReadTokens: 200, outputTokens: 150, reasoningTokens: 50 } } }, 4, d0),
  ev('step/end', { turn: 1, step: 0 }, 5, d0 + 1000),
  ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 6, d0 + 1000),

  // second request next hour, fails before usage -> failed row
  ev('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-chat' } } }, 7, d0 + H),
  ev('step/start', { turn: 2, step: 0 }, 8, d0 + H),
  ev('turn/end', { turn: 2, reason: { kind: 'error', error: { code: 'X' } } }, 9, d0 + H),

  // assistant/message usage settles another step (duplicate of the chunk one is dropped)
  ev('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-reasoner' } } }, 10, d0 + 2 * H),
  ev('step/start', { turn: 3, step: 0 }, 11, d0 + 2 * H),
  ev('assistant/message', { turn: 3, step: 0, message: { role: 'assistant', content: [] }, usage: { inputTokens: 500, outputTokens: 60, reasoningTokens: 40 } }, 12, d0 + 2 * H),
  ev('step/end', { turn: 3, step: 0 }, 13, d0 + 2 * H),
  ev('turn/end', { turn: 3, reason: { kind: 'completed' } }, 14, d0 + 2 * H),

  // non-deepseek provider (skip via provider filter later; fold records it)
  ev('request/header', { header: { config: { provider: 'pi-ai', model: 'deepseek/deepseek-v4-flash' } } }, 15, d0 + 3 * H),
  ev('step/start', { turn: 4, step: 0 }, 16, d0 + 3 * H),
  ev('assistant/message', { turn: 4, step: 0, message: {}, usage: { inputTokens: 100, outputTokens: 10 } }, 17, d0 + 3 * H),
  ev('turn/end', { turn: 4, reason: { kind: 'completed' } }, 18, d0 + 3 * H),
];

const rows = foldEvents(events);
lines.push('rows: ' + rows.length);
const official = rows.filter((r) => r.provider === 'deepseek-official');
lines.push('official rows: ' + official.length);
lines.push('r0: ' + JSON.stringify(official[0]));
lines.push('r1 failed: ' + official[1].failed + ' reqTime ok: ' + (official[1].requestTime === d0 + H));
lines.push('r2 model: ' + official[2].model + ' reasoning ' + official[2].reasoning);
const keys = trailingDayKeys(d0 + 3 * H, TZ, 2);
const series = daySeries(official, keys, TZ, DEFAULT_PRICES);
lines.push('series days: ' + keys.join(','));
const today = series[series.length - 1];
lines.push('today: ' + JSON.stringify(today));
// expected: cost = (200*0.5 + 800*2 + 150*8 + 50*8 + 500*0.5 + (60+40)*16)/1e6 CNY
const expected = (200 * 0.5 + 800 * 2 + (150 + 50) * 8 + 500 * 0.5 + (60 + 40) * 16) / 1e6;
lines.push('expected cost ~: ' + expected.toFixed(6) + ' got: ' + today.costCNY.toFixed(6));
lines.push('requests: ' + today.requests + ' failed: ' + today.failed);
const mp = modelPrice(DEFAULT_PRICES, 'deepseek-reasoner');
lines.push('reasoner out price: ' + mp.output);
const grouped = groupRowsByDay(official, TZ, DEFAULT_PRICES);
lines.push('groups: ' + grouped.size);
writeFileSync(new URL('./fold-stats.out.txt', import.meta.url), lines.join('\n') + '\n');
console.log('done ' + lines.length);
