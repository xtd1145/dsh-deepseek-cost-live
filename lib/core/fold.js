// Pure session-event fold that turns a session event log into one settled
// record per model step ("one request"), with exact provider usage when the
// adapter reported it. The same fold drives both the live projection path and
// the restart catch-up scan, so the two can never disagree.
//
// Settlement contract:
//  - A step settles when FINAL usage arrives: an 'assistant/chunk' usage
//    chunk, or an 'assistant/message' carrying `usage`. Streaming deltas
//    never settle anything; estimates are never written to the exact stats.
//  - A step whose turn ends aborted/error/blocked/interrupted without usage
//    is recorded as a failed request (failed: true, all tokens 0).
//  - At most one record per (turn, step): a second usage-bearing event for an
//    already-settled step is dropped by the fold itself.
//
// Pure module: takes plain event objects and returns plain rows. No DSH
// imports — unit-testable in plain node.

const FAILURE_KINDS = new Set(['aborted', 'error', 'blocked', 'interrupted', 'max-tokens']);

/** @returns {{cacheHitInput:number,cacheMissInput:number,output:number,reasoning:number}}|undefined */
export function bucketsFromTokenUsage(usage) {
  if (typeof usage !== 'object' || usage === null) return undefined;
  const input = num(usage.inputTokens);
  const output = num(usage.outputTokens);
  if (input === undefined && output === undefined && usage.inputTokens === undefined && usage.outputTokens === undefined) return undefined;
  const cacheRead = num(usage.cacheReadTokens) ?? 0;
  const reasoning = num(usage.reasoningTokens) ?? 0;
  const totalInput = input ?? 0;
  const cacheHitInput = Math.max(0, Math.min(cacheRead, totalInput));
  const cacheMissInput = Math.max(0, totalInput - cacheHitInput);
  return { cacheHitInput, cacheMissInput, output: output ?? 0, reasoning };
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Initial fold state. */
export function initState() {
  return { header: undefined, last: null, rows: [] };
}

/**
 * Fold one event into the state (pure). Mirrors the session event kinds of
 * the durable log; unknown kinds pass through unchanged.
 */
export function applyEvent(state, event) {
  if (typeof event !== 'object' || event === null) return state;
  const type = event.type;
  const seq = num(event.seq) ?? 0;
  const time = typeof event.time === 'number' ? event.time : Date.now();
  const data = (typeof event.data === 'object' && event.data !== null) ? event.data : {};
  switch (type) {
    case 'request/header': {
      const config = (data.header && typeof data.header === 'object') ? data.header.config : undefined;
      if (typeof config === 'object' && config !== null) {
        const provider = typeof config.provider === 'string' ? config.provider : undefined;
        const model = typeof config.model === 'string' ? config.model : undefined;
        if (provider !== undefined || model !== undefined) return { ...state, header: { provider, model } };
      }
      return state;
    }
    case 'step/start': {
      return {
        ...state,
        last: {
          turn: data.turn, step: data.step, seq, time,
          requestTime: time, settled: false, failed: false,
        },
      };
    }
    case 'assistant/chunk': {
      const chunk = (typeof data.chunk === 'object' && data.chunk !== null) ? data.chunk : {};
      if (chunk.type !== 'usage') return state;
      return settle(state, data.turn, data.step, seq, time, chunk.usage);
    }
    case 'assistant/message': {
      if (data.usage === undefined) return state;
      return settle(state, data.turn, data.step, seq, time, data.usage);
    }
    case 'turn/end': {
      const reason = (typeof data.reason === 'object' && data.reason !== null) ? data.reason : {};
      const failed = FAILURE_KINDS.has(reason.kind);
      let next = state;
      const last = state.last;
      if (failed && last !== null && last.turn === data.turn && !last.settled) {
        next = { ...state, rows: [...state.rows, makeRow(state.header, last, seq, time, true)] };
      }
      return { ...next, last: null };
    }
    default:
      return state;
  }
}

function settle(state, turn, step, seq, time, usage) {
  const last = state.last;
  if (last === null || last.turn !== turn || last.step !== step || last.settled) return state;
  const buckets = bucketsFromTokenUsage(usage);
  if (buckets === undefined) return state;
  const row = makeRow(state.header, last, seq, time, false, buckets);
  return { ...state, rows: [...state.rows, row], last: { ...last, settled: true } };
}

function makeRow(header, last, seq, time, failed, buckets) {
  const b = buckets ?? { cacheHitInput: 0, cacheMissInput: 0, output: 0, reasoning: 0 };
  return {
    turn: last.turn,
    step: last.step,
    seq,
    time,
    requestTime: last.requestTime,
    provider: (header && header.provider) || '',
    model: (header && header.model) || '',
    cacheHitInput: b.cacheHitInput,
    cacheMissInput: b.cacheMissInput,
    output: b.output,
    reasoning: b.reasoning,
    failed: failed === true,
  };
}

/** Fold a full event list into settled rows. */
export function foldEvents(events) {
  let state = initState();
  for (const event of events) state = applyEvent(state, event);
  return state.rows;
}
