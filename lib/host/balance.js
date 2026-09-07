// DeepSeek account balance (host only). Calls the official endpoint
// GET https://api.deepseek.com/user/balance with the resolved credential.
// The key exists only on the host: never logged, never sent to the browser,
// never accepted from request parameters.

export const BALANCE_URL = 'https://api.deepseek.com/user/balance';
export const BALANCE_TIMEOUT_MS = 10_000;

/** Sanitize the raw balance body — nothing but documented fields survive. */
export function sanitizeBalanceBody(body) {
  if (typeof body !== 'object' || body === null) return undefined;
  if (typeof body.is_available !== 'boolean') return undefined;
  if (!Array.isArray(body.balance_infos)) return undefined;
  const infos = [];
  for (const raw of body.balance_infos) {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const currency = typeof raw.currency === 'string' && raw.currency.trim() !== '' ? raw.currency.trim() : undefined;
    const num = (v) => {
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      return undefined;
    };
    const totalBalance = num(raw.total_balance);
    const grantedBalance = num(raw.granted_balance);
    const toppedUpBalance = num(raw.topped_up_balance);
    if (currency === undefined || totalBalance === undefined || grantedBalance === undefined || toppedUpBalance === undefined) {
      return undefined;
    }
    infos.push({ currency, totalBalance, grantedBalance, toppedUpBalance });
  }
  return { isAvailable: body.is_available, infos };
}

/** One fetch attempt -> {ok, snapshot} or {ok:false, code}. */
export async function fetchBalance(apiKey) {
  let response;
  try {
    response = await fetch(BALANCE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return { ok: false, code: 'TIMEOUT' };
    return { ok: false, code: 'NETWORK' };
  }
  if (response.status === 401) return { ok: false, code: 'UNAUTHORIZED' };
  if (response.status === 402) return { ok: false, code: 'PAYMENT_REQUIRED' };
  if (response.status === 429) return { ok: false, code: 'RATE_LIMITED' };
  if (response.status >= 500) return { ok: false, code: 'SERVER_ERROR' };
  if (response.status !== 200) return { ok: false, code: 'BAD_RESPONSE' };
  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: 'BAD_RESPONSE' };
  }
  const snapshot = sanitizeBalanceBody(parsed);
  return snapshot === undefined ? { ok: false, code: 'BAD_RESPONSE' } : { ok: true, snapshot };
}

/**
 * Periodic balance watch. Keeps the LAST GOOD snapshot durably (survives
 * restarts), marks the UI `stale` after a failed refresh, and reports
 * `unconfigured` when no key resolves.
 */
export class BalanceWatch {
  constructor(deps) {
    this.deps = deps; // { resolveKey: () => Promise<string|undefined>, refreshMinutes: () => number, store, logger }
    const stored = deps.store.balance;
    this.status = stored && stored.snapshot
      ? { state: 'ok', snapshot: stored.snapshot, lastSuccessAt: stored.lastSuccessAt ?? null, lastErrorCode: stored.lastErrorCode ?? null }
      : { state: 'unconfigured', snapshot: null, lastSuccessAt: null, lastErrorCode: null };
    this.timer = undefined;
    this.refreshing = undefined;
    this.stopped = false;
  }

  getStatus() {
    return this.status;
  }

  start() {
    this.refreshNow().catch(() => {});
    this.schedule();
  }

  schedule() {
    if (this.stopped || this.timer !== undefined) return;
    const minutes = Math.max(1, Math.round(this.deps.refreshMinutes()));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refreshNow().catch(() => {}).finally(() => this.schedule());
    }, minutes * 60_000);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async refreshNow() {
    if (this.refreshing === undefined) {
      this.refreshing = this.perform().finally(() => {
        this.refreshing = undefined;
      });
    }
    await this.refreshing;
    return this.status;
  }

  async perform() {
    if (this.stopped) return;
    const { store, logger } = this.deps;
    try {
      const apiKey = await this.deps.resolveKey();
      if (apiKey === undefined || apiKey === '') {
        this.status = { state: 'unconfigured', snapshot: this.status.snapshot, lastSuccessAt: this.status.lastSuccessAt, lastErrorCode: 'NO_KEY' };
        await store.saveBalance(this.status.snapshot, this.status.lastSuccessAt, 'unconfigured', 'NO_KEY').catch(() => {});
        return;
      }
      const result = await fetchBalance(apiKey);
      if (result.ok) {
        const fetchedAt = Date.now();
        this.status = { state: 'ok', snapshot: result.snapshot, lastSuccessAt: fetchedAt, lastErrorCode: null };
        await store.saveBalance(result.snapshot, fetchedAt, 'ok', null).catch(() => {});
      } else {
        this.status = {
          state: this.status.snapshot === null ? 'unconfigured' : 'stale',
          snapshot: this.status.snapshot,
          lastSuccessAt: this.status.lastSuccessAt,
          lastErrorCode: result.code,
        };
      }
    } catch (error) {
      if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] balance refresh failed:', error);
      this.status = {
        state: this.status.snapshot === null ? 'unconfigured' : 'stale',
        snapshot: this.status.snapshot,
        lastSuccessAt: this.status.lastSuccessAt,
        lastErrorCode: 'NETWORK',
      };
    }
    if (this.deps.onSettled) {
      try { this.deps.onSettled(); } catch { /* ignore */ }
    }
  }
}
