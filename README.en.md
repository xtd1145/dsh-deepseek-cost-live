# dsh-deepseek-cost-live

> A DeepSeek Harness (DSH) Web plugin showing **real-time DeepSeek API account balance (official endpoint)** and **today's spend (local estimate)**. Community open-source plugin built on the official `@deepseek-ai/*` runtime APIs; it never modifies DSH sources.

## Features

- **Real-time balance (official)**: calls `GET https://api.deepseek.com/user/balance` on a configurable interval; on failure it keeps the last good snapshot and marks the UI stale. The API key is resolved only inside the host process — never logged, never sent to the browser, never accepted from request parameters.
- **Today's spend (estimate)**: listens to this DSH instance's session log, folds each model request's exact usage (cache-hit input / cache-miss input / output / reasoning tokens) through a per-model price table (CNY per 1M tokens). DeepSeek has no billing-history API, so daily spend is a **local estimate**, not a bill.
- **Three surfaces** (all enabled):
  - composer **dock strip** under the input: balance + today spend + manual refresh;
  - bottom-right **always-on floating badge** (collapsible, remembered in localStorage);
  - a full **settings dashboard**: balance detail, today / last-7-days tokens and cost, cost by model, price table / timezone / polling config, history rescan.
- Bilingual zh/en. Only the official DeepSeek route is counted by default (provider `deepseek-official`; extend in config and hit "Rescan history" to backfill).

## Install

```powershell
dsh plugin --profile web add <this repo path or dsh-deepseek-cost-live.tgz>
```

or manually: copy `lib/ cordis.patch.yml package.json` into `$DSH_HOME/profiles/web/node_modules/dsh-deepseek-cost-live`, add `"dsh-deepseek-cost-live"` to `dsh.profile.bundles` in the profile's `package.json`, then restart the web service and check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File $env:USERPROFILE.dshestart-dsh-web.ps1
Invoke-WebRequest -Uri 'http://127.0.0.1:3080/dsh-deepseek-cost-live/stats' -UseBasicParsing
```

Open the Web UI (hard-refresh once) — floating badge and dock strip appear; Settings → "Usage & Balance" opens the dashboard.

## API key resolution (priority)

1. `apiKey` in the plugin config file `$DSH_HOME/dsh-deepseek-cost-live/config.json` (admin-written, never sent to the browser);
2. environment variable (default `DEEPSEEK_API_KEY`, override with `apiKeyEnv`);
3. DSH credentials file `$DSH_HOME/.credentials.yaml` → `refs.<apiKeyEnv>`;
4. the official `ctx.credentials` service (dynamic import).

## Spend semantics & price table

- cost per request = cacheHit×hit + cacheMiss×miss + (output+reasoning)×output (CNY per 1M tokens).
- Defaults mirror DeepSeek's published list prices (`lib/core/pricing.js`); verify per model on the pricing page — models without a row use `default`.
- On first install, past sessions are background-scanned a few seconds after boot; live requests are folded in near-real-time (~15 s persist cadence; a crash loses at most a small delta, rebuilt by the next scan).

## Files under `$DSH_HOME`

| Path | Purpose |
| --- | --- |
| `dsh-deepseek-cost-live/ledger.json` | folded usage rows (dedup by sessionId:seq, keep `keepDays`) |
| `dsh-deepseek-cost-live/config.json` | timezone/providers/polling/price table |
| `dsh-deepseek-cost-live/balance.json` | last successful balance snapshot (survives restarts) |

## HTTP routes (loopback-trusted only)

`GET /dsh-deepseek-cost-live/stats`, `POST /dsh-deepseek-cost-live/refresh`, `GET|POST /dsh-deepseek-cost-live/config`, `POST /dsh-deepseek-cost-live/scan`. The API key is never accepted or returned over any route.

## Development

```powershell
node testsday.test.mjs ; node testsold-stats.test.mjs
```

## License

MIT
