// dsh-deepseek-cost-live — host plugin.
//
// Mounted as a cordis loader entry via cordis.patch.yml. Registers the
// /dsh-deepseek-cost-live route family, starts the official balance watch,
// attaches the live usage capture, and schedules the one-shot history scan.

import { PluginStore, DEFAULT_CONFIG } from './store.js';
import { BalanceWatch } from './host/balance.js';
import { attachLiveCapture, scheduleStartupScan, scanAllSessions } from './host/capture.js';
import { registerRoutes } from './host/routes.js';
import { resolveDeepseekApiKey } from './core/credentials.js';

export const name = 'dsh-deepseek-cost-live';
export const inject = ['webServer'];

export function apply(ctx) {
  return (async () => {
    const store = new PluginStore();
    await store.init();
    const logger = ctx.logger;

    const live = attachLiveCapture(ctx, store, logger);

    const balanceWatch = new BalanceWatch({
      store,
      logger,
      refreshMinutes: () => store.config.balanceRefreshMinutes ?? DEFAULT_CONFIG.balanceRefreshMinutes,
      resolveKey: async () =>
        resolveDeepseekApiKey({
          refName: store.config.apiKeyEnv ?? DEFAULT_CONFIG.apiKeyEnv,
          config: store.config,
          ctx,
        }),
    });
    balanceWatch.start();

    const cancelStartupScan = scheduleStartupScan(ctx, store, logger);
    registerRoutes(ctx, {
      store,
      balanceWatch,
      live,
      logger,
      scan: () => scanAllSessions(ctx, store, logger),
    });

    let disposed = false;
    return async () => {
      if (disposed) return;
      disposed = true;
      try { await live.flush(); } catch { /* best effort */ }
      live.dispose();
      balanceWatch.stop();
      cancelStartupScan();
      await store.saveLedger();
      if (logger && typeof logger.info === 'function') logger.info('[dsh-deepseek-cost-live] unloaded');
    };
  })();
}
