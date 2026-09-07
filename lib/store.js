// Durable JSON store for the plugin (host side). Lives under the DSH home:
//   <home>/dsh-deepseek-cost-live/{ledger.json, config.json, balance.json}
// Atomic writes (tmp + rename); corrupt files are preserved as *.corrupt and
// reset to defaults instead of crashing the host.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';

export const DEFAULT_CONFIG = Object.freeze({
  timezone: 'Asia/Shanghai',
  providerIds: ['deepseek-official'],
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  balanceRefreshMinutes: 10,
  pollSeconds: 60,
  keepDays: 90,
  prices: {},
});

export class PluginStore {
  constructor() {
    this.root = dshHomePath('dsh-deepseek-cost-live');
    this.ledgerPath = join(this.root, 'ledger.json');
    this.configPath = join(this.root, 'config.json');
    this.balancePath = join(this.root, 'balance.json');
    this.rows = [];
    this.byKey = new Set();
    this.config = { ...DEFAULT_CONFIG, prices: {} };
    this.balance = null;
    this.ready = false;
  }

  async init() {
    await mkdir(this.root, { recursive: true });
    this.config = { ...DEFAULT_CONFIG, prices: { ...DEFAULT_CONFIG.prices }, ...(await readJsonSafe(this.configPath, DEFAULT_CONFIG)) };
    this.balance = await readJsonSafe(this.balancePath, null);
    const ledger = await readJsonSafe(this.ledgerPath, { version: 1, rows: [] });
    const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
    this.rows = rows.filter((r) => typeof r === 'object' && r !== null && typeof r.sessionId === 'string' && typeof r.seq === 'number');
    this.byKey = new Set(this.rows.map((r) => rowKey(r.sessionId, r.seq)));
    this.ready = true;
  }

  /** Insert rows that are not already present (idempotent by sessionId:seq). */
  upsertRows(rows) {
    let added = 0;
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const key = rowKey(row.sessionId, row.seq);
      if (this.byKey.has(key)) continue;
      this.byKey.add(key);
      this.rows.push(row);
      added += 1;
    }
    if (added > 0) this.pruneIfNeeded();
    return added;
  }

  pruneIfNeeded() {
    const keepDays = Number.isFinite(this.config.keepDays) && this.config.keepDays > 0 ? this.config.keepDays : DEFAULT_CONFIG.keepDays;
    const cutoff = Date.now() - keepDays * 86400_000;
    const kept = [];
    const keys = new Set();
    for (const row of this.rows) {
      if (typeof row.time === 'number' && row.time < cutoff) continue;
      const key = rowKey(row.sessionId, row.seq);
      if (keys.has(key)) continue;
      keys.add(key);
      kept.push(row);
    }
    if (kept.length !== this.rows.length) {
      this.rows = kept;
      this.byKey = keys;
    }
  }

  async saveLedger() {
    await writeJsonAtomic(this.ledgerPath, { version: 1, rows: this.rows });
  }

  async saveConfig() {
    await writeJsonAtomic(this.configPath, this.config);
  }

  async saveBalance(snapshot, fetchedAtMs, state, lastErrorCode) {
    this.balance = {
      snapshot: snapshot ?? null,
      state,
      lastSuccessAt: fetchedAtMs ?? null,
      lastErrorCode: lastErrorCode ?? null,
    };
    await writeJsonAtomic(this.balancePath, this.balance);
  }
}

export function rowKey(sessionId, seq) {
  return `${sessionId}:${seq}`;
}

async function readJsonSafe(path, fallback) {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text);
    return parsed === undefined ? fallback : parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    try {
      await rename(path, `${path}.corrupt-${Date.now()}`);
    } catch {
      // best effort
    }
    return fallback;
  }
}

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value), 'utf8');
  await rename(tmp, path);
}
