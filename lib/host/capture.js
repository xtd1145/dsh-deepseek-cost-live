// Usage capture (host side).
//
// Two cooperating paths keep the ledger close to real time without paying a
// full-log scan on every poll:
//
//  1. LIVE path — subscribes to the same 'session/event' broadcast the
//     projection registry uses (ctx.on('session/event', (session, event))).
//     Events for each session are buffered briefly, then folded incrementally
//     into settled rows (dedupe by sessionId:seq is idempotent).
//
//  2. CATCH-UP path — at plugin start (and on demand) every persisted
//     session log is refolded through ctx.sessionQuery and any missing rows
//     are inserted. Because every write is idempotent by (sessionId, seq),
//     re-scans can never double-count.
//
// Only requests whose provider route is in the configured providerIds are
// counted in the UI; rows are stored unfiltered so changing the list and
// re-scanning is enough to correct history.

import { foldEvents } from '../core/fold.js';

const EVENT_BUFFER_CAP = 20_000;
const FLUSH_INTERVAL_MS = 15_000;
const SCAN_START_DELAY_MS = 3_000;

export function attachLiveCapture(ctx, store, logger) {
  const buffers = new Map();
  let dirty = false;
  let disposed = false;
  let lastPersistAt = 0;

  const onEvent = (session, event) => {
    if (disposed) return;
    if (!session || !event || typeof event.seq !== 'number') return;
    const sessionId = session.id;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    let buf = buffers.get(sessionId);
    if (!buf) {
      buf = [];
      buffers.set(sessionId, buf);
    }
    buf.push(event);
    dirty = true;
    if (buf.length > EVENT_BUFFER_CAP) {
      // Extremely hot session: fold what we have and start over.
      void flushSession(sessionId).catch(() => {});
    }
  };

  const flushSession = async (sessionId) => {
    const buf = buffers.get(sessionId);
    if (!buf || buf.length === 0) return;
    buffers.set(sessionId, []);
    try {
      const rows = foldEvents(buf);
      const stamped = rows.map((r) => ({ sessionId, ...r }));
      const added = store.upsertRows(stamped);
      // Persist on a cadence (a crash loses at most the pending delta; the
      // next boot scan rebuilds it from the session logs anyway).
      const now = Date.now();
      if (added > 0 && now - lastPersistAt > 20_000) {
        lastPersistAt = now;
        await store.saveLedger();
      }
    } catch (error) {
      if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] live fold failed:', error);
    }
  };

  const flushAll = async () => {
    if (!dirty) return;
    dirty = false;
    const ids = [...buffers.keys()];
    for (const id of ids) await flushSession(id);
  };

  const listener = ctx.on('session/event', onEvent);
  const timer = setInterval(() => {
    void flushAll().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  if (timer.unref) timer.unref();

  return {
    flush: flushAll,
    dispose() {
      disposed = true;
      listener();
      clearInterval(timer);
    },
  };
}

/** Refold every persisted session's log through ctx.sessionQuery. */
export async function scanAllSessions(ctx, store, logger) {
  let sessionQuery;
  try {
    sessionQuery = ctx.get('sessionQuery');
  } catch {
    sessionQuery = undefined;
  }
  if (!sessionQuery || typeof sessionQuery.listSessions !== 'function') return { inserted: 0, skipped: true };
  let list;
  try {
    list = await sessionQuery.listSessions();
  } catch (error) {
    if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] session list failed:', error);
    return { inserted: 0, skipped: true };
  }
  let inserted = 0;
  let sessions = 0;
  for (const record of Array.isArray(list) ? list : []) {
    const header = record && record.header ? record.header : record;
    const sessionId = header && header.id;
    if (typeof sessionId !== 'string' || sessionId === '') continue;
    sessions += 1;
    try {
      const snapshot = await sessionQuery.readSession(sessionId);
      const events = snapshot && Array.isArray(snapshot.events) ? snapshot.events : [];
      const rows = foldEvents(events).map((r) => ({ sessionId, ...r }));
      inserted += store.upsertRows(rows);
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[dsh-deepseek-cost-live] scan of ${sessionId} failed:`, error instanceof Error ? error.message : String(error));
      }
    }
  }
  await store.saveLedger();
  if (logger && typeof logger.info === 'function') {
    logger.info(`[dsh-deepseek-cost-live] scanned ${sessions} sessions, inserted ${inserted} rows`);
  }
  return { inserted, sessions };
}

/** Start the one-shot catch-up scan shortly after boot (never blocks boot). */
export function scheduleStartupScan(ctx, store, logger) {
  const timer = setTimeout(() => {
    void scanAllSessions(ctx, store, logger).catch(() => {});
  }, SCAN_START_DELAY_MS);
  if (timer.unref) timer.unref();
  return () => clearTimeout(timer);
}