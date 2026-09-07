// Per-model price table and cost estimation.
//
// DeepSeek does not expose a billing-history API, so "today's spend" is an
// ESTIMATE computed from the tokens the harness actually logged per request,
// multiplied by a per-model price table (CNY per 1,000,000 tokens). The table
// is user-editable in the settings panel; the values below are the official
// list prices at plugin release time and are clearly marked as editable.
//
// Pure module: no DSH imports.

/** Default CNY-per-1M-token rates. cacheHitInput = prompt cache hit, cacheMissInput = prompt cache miss, output = output (reasoning is billed at the output rate by DeepSeek). */
export const DEFAULT_PRICES = {
  default: { cacheHitInput: 0.5, cacheMissInput: 2, output: 8 },
  'deepseek-chat': { cacheHitInput: 0.5, cacheMissInput: 2, output: 8 },
  'deepseek-reasoner': { cacheHitInput: 0.5, cacheMissInput: 2, output: 16 },
};

/** The config "prices" field may hold any subset; missing models fall back to default. */
export function modelPrice(prices, model) {
  const table = (typeof prices === 'object' && prices !== null) ? prices : {};
  const modelRow = typeof model === 'string' && table[model] ? table[model] : undefined;
  const row = modelRow || table.default || DEFAULT_PRICES.default;
  const g = (r, k, fb) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? r[k] : fb);
  return {
    cacheHitInput: g(row, 'cacheHitInput', DEFAULT_PRICES.default.cacheHitInput),
    cacheMissInput: g(row, 'cacheMissInput', DEFAULT_PRICES.default.cacheMissInput),
    output: g(row, 'output', DEFAULT_PRICES.default.output),
  };
}

/**
 * CNY cost of one request row. Output price covers output + reasoning tokens
 * (DeepSeek bills reasoning at the output rate).
 */
export function costOfRow(priceRow, row) {
  const p = priceRow ?? DEFAULT_PRICES.default;
  const tokens =
    row.cacheHitInput * p.cacheHitInput +
    row.cacheMissInput * p.cacheMissInput +
    (row.output + row.reasoning) * p.output;
  return tokens / 1_000_000;
}

/** Sum a set of rows into one per-day aggregate. */
export function aggregateRows(rows, prices) {
  const out = {
    requests: 0,
    failed: 0,
    cacheHitInput: 0,
    cacheMissInput: 0,
    output: 0,
    reasoning: 0,
    costCNY: 0,
  };
  for (const row of rows) {
    out.requests += 1;
    if (row.failed === true) out.failed += 1;
    out.cacheHitInput += row.cacheHitInput ?? 0;
    out.cacheMissInput += row.cacheMissInput ?? 0;
    out.output += row.output ?? 0;
    out.reasoning += row.reasoning ?? 0;
    out.costCNY += costOfRow(modelPrice(prices, row.model), row);
  }
  return out;
}
