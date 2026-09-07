// HTTP route family (host side). Plain same-origin JSON routes the web
// client polls; every response is sanitized (the API key never crosses this
// boundary, and no request parameter ever feeds the balance fetch).

import { daySeries } from '../core/stats.js';
import { trailingDayKeys } from '../core/day.js';
import { modelPrice } from '../core/pricing.js';
import { DEFAULT_CONFIG } from '../store.js';
import { DEFAULT_PRICES } from '../core/pricing.js';

export const ROUTE_PREFIX = '/dsh-deepseek-cost-live';
const MAX_BODY_BYTES = 64 * 1024;

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname || '');
  return m !== null && Number.parseInt(m[1], 10) === 127;
}

/** Browser-trust fence: loopback Host + same-origin rules (DNS-rebinding guard). */
function isTrustedRequest(req) {
  const host = req.headers && req.headers.host;
  if (typeof host !== 'string') return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined || origin === 'null') return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function isLoopbackSocket(req) {
  const addr = req.socket && req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === undefined;
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readCappedBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(undefined));
  });
}

export function registerRoutes(ctx, deps) {
  const { store, balanceWatch, live, scan, logger } = deps;

  const guard = (req, res, method) => {
    if (!isTrustedRequest(req) || !isLoopbackSocket(req)) {
      writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' });
      return false;
    }
    if (req.method !== method) {
      writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
      return false;
    }
    return true;
  };

  const statsPayload = async () => {
    if (live) await live.flush();
    const tz = store.config.timezone || DEFAULT_CONFIG.timezone;
    const now = Date.now();
    const window = Number.isInteger(store.config.trendDays) && store.config.trendDays > 0 ? store.config.trendDays : 7;
    const days = trailingDayKeys(now, tz, window);
    const providerIds = Array.isArray(store.config.providerIds) ? store.config.providerIds : DEFAULT_CONFIG.providerIds;
    const counted = store.rows.filter((r) => providerIds.includes(r.provider));
    const series = daySeries(counted, days, tz, store.config.prices);
    const today = series[series.length - 1] || { day: days[days.length - 1] };
    const balanceStatus = balanceWatch ? balanceWatch.getStatus() : { state: 'unconfigured', snapshot: null, lastSuccessAt: null, lastErrorCode: null };
    const byModel = new Map();
    for (const row of counted) {
      if (!row.model) continue;
      const agg = byModel.get(row.model);
      const price = modelPrice(store.config.prices, row.model);
      const cost = ((row.cacheHitInput ?? 0) * price.cacheHitInput + (row.cacheMissInput ?? 0) * price.cacheMissInput + ((row.output ?? 0) + (row.reasoning ?? 0)) * price.output) / 1_000_000;
      if (agg) {
        agg.requests += 1;
        agg.costCNY += cost;
      } else {
        byModel.set(row.model, { model: row.model, requests: 1, costCNY: cost });
      }
    }
    const models = [...byModel.values()].sort((a, b) => b.costCNY - a.costCNY);
    return {
      ok: true,
      generatedAt: now,
      timezone: tz,
      providerIds,
      days: series,
      today: series[series.length - 1] || { day: trailingDayKeys(now, tz, 1)[0] },
      byModel: models,
      balance: balanceStatus,
      config: {
        pollSeconds: store.config.pollSeconds ?? DEFAULT_CONFIG.pollSeconds,
        balanceRefreshMinutes: store.config.balanceRefreshMinutes ?? DEFAULT_CONFIG.balanceRefreshMinutes,
        apiKeyEnv: store.config.apiKeyEnv ?? DEFAULT_CONFIG.apiKeyEnv,
        prices: store.config.prices && Object.keys(store.config.prices).length > 0 ? store.config.prices : DEFAULT_CONFIG.prices,
      },
      note: 'daily spend is a local estimate from logged usage tokens x price table; balance is official.',
    };
  };

  const routeStats = async (req, res) => {
    if (!guard(req, res, 'GET')) return;
    try {
      writeJson(res, 200, await statsPayload());
    } catch (error) {
      writeJson(res, 500, { ok: false, error: 'stats-failed' });
      if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] stats failed:', error);
    }
  };

  const routeRefresh = async (req, res) => {
    if (!guard(req, res, 'POST')) return;
    const body = await readCappedBody(req);
    if (body === undefined) return writeJson(res, 413, { ok: false, error: 'request too large' });
    if (balanceWatch) {
      try {
        const status = await balanceWatch.refreshNow();
        return writeJson(res, 200, { ok: true, balance: status });
      } catch (error) {
        return writeJson(res, 500, { ok: false, error: 'refresh-failed' });
      }
    }
    return writeJson(res, 200, { ok: true, balance: { state: 'unconfigured', snapshot: null, lastSuccessAt: null, lastErrorCode: 'NO_KEY' } });
  };

  const publicConfig = () => {
    const c = store.config;
    const p = { ...c };
    delete p.apiKey; // never leak a configured literal key
    // Show the effective table (defaults + overrides) so the editor reflects
    // the real numbers; posting saves the whole table back as overrides.
    const defaults = DEFAULT_PRICES || {};
    const merged = {};
    for (const [m, row] of Object.entries(defaults)) merged[m] = { ...row };
    if (c.prices && typeof c.prices === 'object') {
      for (const [m, row] of Object.entries(c.prices)) merged[m] = { ...merged[m], ...row };
    }
    p.prices = merged;
    return p;
  };

  const routeConfig = async (req, res) => {
    if (!isTrustedRequest(req) || !isLoopbackSocket(req)) {
      writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' });
      return;
    }
    if (req.method === 'GET') return writeJson(res, 200, { ok: true, config: publicConfig() });
    if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
    const raw = await readCappedBody(req);
    if (raw === undefined) return writeJson(res, 413, { ok: false, error: 'request too large' });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { ok: false, error: 'invalid-json' });
    }
    if (typeof body !== 'object' || body === null) return writeJson(res, 400, { ok: false, error: 'invalid-body' });
    const next = { ...store.config };
    if (typeof body.timezone === 'string' && body.timezone.trim() !== '') next.timezone = body.timezone.trim();
    if (Array.isArray(body.providerIds)) {
      next.providerIds = body.providerIds.filter((x) => typeof x === 'string' && x.length > 0).slice(0, 20);
    }
    if (typeof body.apiKeyEnv === 'string' && body.apiKeyEnv.trim() !== '') next.apiKeyEnv = body.apiKeyEnv.trim();
    if (Number.isFinite(body.balanceRefreshMinutes)) next.balanceRefreshMinutes = Math.min(1440, Math.max(1, Math.round(body.balanceRefreshMinutes)));
    if (Number.isFinite(body.pollSeconds)) next.pollSeconds = Math.min(3600, Math.max(10, Math.round(body.pollSeconds)));
    if (Number.isFinite(body.keepDays)) next.keepDays = Math.min(3650, Math.max(1, Math.round(body.keepDays)));
    if (Number.isFinite(body.trendDays)) next.trendDays = Math.min(31, Math.max(1, Math.round(body.trendDays)));
    if (typeof body.prices === 'object' && body.prices !== null) {
      const clean = {};
      for (const [model, row] of Object.entries(body.prices)) {
        if (typeof model !== 'string' || model === '' || typeof row !== 'object' || row === null) continue;
        const r = {};
        for (const bucket of ['cacheHitInput', 'cacheMissInput', 'output']) {
          if (typeof row[bucket] === 'number' && Number.isFinite(row[bucket]) && row[bucket] >= 0) r[bucket] = row[bucket];
        }
        if (Object.keys(r).length > 0) clean[model] = r;
      }
      next.prices = clean;
    }
    store.config = next;
    await store.saveConfig();
    writeJson(res, 200, { ok: true, config: publicConfig() });
  };

  const routeScan = async (req, res) => {
    if (!guard(req, res, 'POST')) return;
    const result = await scan().catch((error) => {
      if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] scan failed:', error);
      return { inserted: 0, skipped: true, error: 'scan-failed' };
    });
    writeJson(res, 200, { ok: true, ...result });
  };

  const routes = [
    { kind: 'exact', path: `${ROUTE_PREFIX}/stats`, handler: routeStats },
    { kind: 'exact', path: `${ROUTE_PREFIX}/refresh`, handler: routeRefresh },
    { kind: 'exact', path: `${ROUTE_PREFIX}/config`, handler: routeConfig },
    { kind: 'exact', path: `${ROUTE_PREFIX}/scan`, handler: routeScan },
  ];
  for (const route of routes) {
    try {
      ctx.webServer.register(route);
    } catch (error) {
      if (logger && typeof logger.warn === 'function') logger.warn('[dsh-deepseek-cost-live] route registration failed:', error);
    }
  }
  return statsPayload;
}