window.__ModuleLoader__.load({
	id: "dsh-deepseek-cost-live",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const reactDom = require("react-dom");
		const { createElement: h, useState, useEffect, useRef, useCallback } = react;

		const name = "dsh-deepseek-cost-live/client";
		const inject = ["slots", "locale"];
		const NS = "dsh-deepseek-cost-live";
		const API = "/dsh-deepseek-cost-live";
		const FLOAT_KEY = "dsh-deepseek-cost-live.floating";

		// ---- i18n -------------------------------------------------------
		const DICT = {
			zh: {
				nav: "用量与余额",
				balance: "DeepSeek 余额",
				todaySpend: "今日花费",
				todayTokens: "今日 Token",
				requests: "请求",
				failed: "失败",
				cacheHit: "缓存命中",
				cacheMiss: "缓存未命中",
				output: "输出",
				reasoning: "推理",
				refresh: "刷新",
				refreshing: "刷新中…",
				ok: "正常",
				stale: "刷新失败(显示上次数据)",
				unconfigured: "未配置 API Key",
				noKeyHint: "请在 DSH 凭据(如 DEEPSEEK_API_KEY)或本机环境变量中配置官方 Key",
				error: "错误",
				loading: "加载中…",
				updated: "更新于",
				estimate: "估算",
				estimateNote: "余额来自 DeepSeek 官方接口；今日花费 = 本机 DSH 会话日志中的每次请求 Token × 分模型价格表(估算，非账单)。",
				days7: "近 7 日",
				day: "日期",
				cost: "花费",
				tokens: "Token",
				models: "分模型花费",
				model: "模型",
				config: "配置",
				configTitle: "余额与用量设置",
				timezone: "时区",
				providerIds: "计入的 Provider 路由",
				providerHint: "只统计来自这些 provider(默认 deepseek-official)的请求；改后点“重扫历史”补齐。",
				apiKeyEnv: "Key 的环境变量/凭据名",
				pollSeconds: "前端轮询间隔(秒)",
				balanceMinutes: "余额自动刷新(分钟)",
				priceTable: "价格表(元 / 百万 token)",
				priceHint: "按模型覆盖；未列出的模型用 default 行。请在 deepseek 官网价目页核对后填写。",
				save: "保存",
				saved: "已保存",
				saveFailed: "保存失败",
				scan: "重扫历史",
				scanning: "扫描中…",
				empty: "今天还没有计入的请求",
				minuteAgo: "刚刚",
				symbol: "¥",
			},
			en: {
				nav: "Usage & Balance",
				balance: "DeepSeek Balance",
				todaySpend: "Today spent",
				todayTokens: "Today tokens",
				requests: "requests",
				failed: "failed",
				cacheHit: "cache hit",
				cacheMiss: "cache miss",
				output: "output",
				reasoning: "reasoning",
				refresh: "Refresh",
				refreshing: "Refreshing…",
				ok: "ok",
				stale: "refresh failed (last data shown)",
				unconfigured: "API key not configured",
				noKeyHint: "Configure the official key in DSH credentials (e.g. DEEPSEEK_API_KEY) or an environment variable.",
				error: "error",
				loading: "Loading…",
				updated: "updated",
				estimate: "estimate",
				estimateNote: "Balance comes from the official DeepSeek endpoint; today's spend = tokens logged by this DSH instance x per-model price table (an estimate, not a bill).",
				days7: "Last 7 days",
				day: "day",
				cost: "cost",
				tokens: "tokens",
				models: "Cost by model",
				model: "model",
				config: "config",
				configTitle: "Balance & usage settings",
				timezone: "timezone",
				providerIds: "Provider routes counted",
				providerHint: "Only requests from these providers (default deepseek-official) are counted; change, then “Rescan history” to backfill.",
				apiKeyEnv: "Key env var / credential name",
				pollSeconds: "Poll interval (seconds)",
				balanceMinutes: "Balance auto refresh (minutes)",
				priceTable: "Price table (CNY per 1M tokens)",
				priceHint: "Override per model; models without a row use “default”. Verify against DeepSeek's pricing page.",
				save: "Save",
				saved: "Saved",
				saveFailed: "Save failed",
				scan: "Rescan history",
				scanning: "Scanning…",
				empty: "No counted requests today yet",
				minuteAgo: "just now",
				symbol: "¥",
			},
		};
		let activeLocale = "zh";
		const localeListeners = new Set();
		function t(key) {
			const dict = DICT[activeLocale] || DICT.zh;
			return dict[key] !== undefined ? dict[key] : DICT.zh[key] !== undefined ? DICT.zh[key] : key;
		}
		function useLocale() {
			const [, force] = useState(0);
			useEffect(() => {
				const listener = () => force((v) => v + 1);
				localeListeners.add(listener);
				return () => localeListeners.delete(listener);
			}, []);
			return activeLocale;
		}

		// ---- store: poll stats + refresh balance -------------------------
		const storeState = {
			status: "loading", // loading | ok | error
			payload: null,
			error: null,
			busy: false,
			lastLoadedAt: 0,
		};
		const storeListeners = new Set();
		function setStore(partial) {
			Object.assign(storeState, partial);
			storeListeners.forEach((fn) => fn());
		}
		function useStore() {
			const [, force] = useState(0);
			useEffect(() => {
				const listener = () => force((v) => v + 1);
				storeListeners.add(listener);
				return () => storeListeners.delete(listener);
			}, []);
			return storeState;
		}
		async function loadStats() {
			try {
				const res = await fetch(API + "/stats", {
					headers: { accept: "application/json" },
					cache: "no-store",
				});
				if (!res.ok) throw new Error("http " + res.status);
				const data = await res.json();
				setStore({ status: "ok", payload: data, error: null, lastLoadedAt: Date.now() });
			} catch (error) {
				setStore({ status: "error", error: error instanceof Error ? error.message : String(error) });
			}
		}
		async function refreshBalance() {
			setStore({ busy: true });
			try {
				const res = await fetch(API + "/refresh", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				});
				await loadStats();
			} catch {
				await loadStats();
			} finally {
				setStore({ busy: false });
			}
		}
		function pollSecondsOf(payload) {
			const n = payload && payload.config && Number.isFinite(payload.config.pollSeconds) ? payload.config.pollSeconds : 60;
			return Math.max(10, n);
		}
		function startPolling() {
			let timer = null;
			const tick = () => {
				loadStats();
				timer = setTimeout(tick, pollSecondsOf(storeState.payload) * 1000);
			};
			loadStats();
			timer = setTimeout(tick, pollSecondsOf(storeState.payload) * 1000);
			return () => {
				if (timer !== null) clearTimeout(timer);
			};
		}

		// ---- formatting helpers ----------------------------------------
		function fmtMoney(cost) {
			const value = Number.isFinite(cost) ? cost : 0;
			if (value === 0) return "0.00";
			if (value >= 100) return value.toFixed(0);
			if (value >= 1) return value.toFixed(1);
			if (value >= 0.01) return value.toFixed(2);
			if (value >= 0.0001) return value.toFixed(4);
			return value.toExponential(1);
		}
		function fmtTokens(n) {
			const value = Number.isFinite(n) ? n : 0;
			if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
			if (value >= 1_000) return (value / 1_000).toFixed(1) + "k";
			return String(Math.round(value));
		}
		function currencySymbol(currency) {
			if (currency === "USD") return "$";
			if (currency === "CNY") return t("symbol");
			return currency ? currency + " " : "";
		}
		function fmtTime(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "";
			const diff = Date.now() - ms;
			if (diff < 60_000) return t("minuteAgo");
			const d = new Date(ms);
			const pad = (n) => String(n).padStart(2, "0");
			return d.getHours() + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
		}

		// ---- styles ------------------------------------------------------
		const STYLE = [
			"[data-dcl-root] { position: fixed; right: 14px; bottom: 14px; z-index: 9990; font-family: inherit; }",
			"[data-dcl-badge] { display: flex; align-items: center; gap: 10px; background: var(--dsw-alias-bg-surface, rgba(24,26,32,.92)); border: 1px solid var(--dsw-alias-line-border, rgba(127,127,127,.22)); color: var(--dsw-alias-label-primary, #e5e7eb); border-radius: 12px; padding: 6px 12px; font-size: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.28); cursor: pointer; user-select: none; }",
			"[data-dcl-badge]:hover { border-color: var(--dsw-alias-state-info-border, #4d6bfe); }",
			"[data-dcl-item] { display: flex; flex-direction: column; line-height: 1.15; }",
			"[data-dcl-item-label] { font-size: 10px; opacity: .65; }",
			"[data-dcl-item-value] { font-size: 12.5px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }",
			"[data-dcl-dot] { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; display: inline-block; margin-right: 5px; }",
			"[data-dcl-dot][data-state='stale'] { background: #f59e0b; }",
			"[data-dcl-dot][data-state='unconfigured'], [data-dcl-dot][data-state='error'] { background: #ef4444; }",
			"[data-dcl-panel] { position: absolute; right: 0; bottom: calc(100% + 8px); width: 340px; max-height: 70vh; overflow: auto; background: var(--dsw-alias-bg-surface, #1c1f26); border: 1px solid var(--dsw-alias-line-border, rgba(127,127,127,.22)); border-radius: 14px; color: var(--dsw-alias-label-primary, #e5e7eb); box-shadow: 0 16px 48px rgba(0,0,0,.4); padding: 12px 14px; font-size: 12.5px; }",
			"[data-dcl-panel] h4 { margin: 10px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .6; }",
			"[data-dcl-row] { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 3px 0; }",
			"[data-dcl-muted] { opacity: .6; }",
			"[data-dcl-note] { opacity: .55; font-size: 11px; line-height: 1.5; margin-top: 8px; border-top: 1px solid var(--dsw-alias-line-border, rgba(127,127,127,.14)); padding-top: 6px; }",
			"[data-dcl-btn] { background: var(--dsw-alias-interactive-bg, rgba(77,107,254,.16)); color: var(--dsw-alias-state-info-border, #8ab4ff); border: 1px solid var(--dsw-alias-state-info-border, rgba(138,180,255,.4)); border-radius: 8px; font: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; }",
			"[data-dcl-btn]:disabled { opacity: .5; cursor: default; }",
			"[data-dcl-btn]:hover:not(:disabled) { background: var(--dsw-alias-state-info-border, rgba(138,180,255,.25)); }",
			"[data-dcl-dock] { display: flex; align-items: center; gap: 14px; padding: 4px 2px; font-size: 12px; color: var(--dsw-alias-label-secondary, #9ca3af); }",
			"[data-dcl-table] { width: 100%; border-collapse: collapse; font-size: 11.5px; }",
			"[data-dcl-table] th, [data-dcl-table] td { text-align: right; padding: 3px 4px; }",
			"[data-dcl-table] th:first-child, [data-dcl-table] td:first-child { text-align: left; }",
			"[data-dcl-field] { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }",
			"[data-dcl-field] label { font-size: 11.5px; opacity: .75; }",
			"[data-dcl-field] input, [data-dcl-field] select { background: var(--dsw-alias-bg-input, rgba(127,127,127,.1)); color: var(--dsw-alias-label-primary, #e5e7eb); border: 1px solid var(--dsw-alias-line-border, rgba(127,127,127,.25)); border-radius: 7px; padding: 5px 8px; font: inherit; width: 100%; box-sizing: border-box; }",
			"[data-dcl-settings] { padding: 4px 2px; color: var(--dsw-alias-label-primary, #111827); }",
			"[data-dcl-price-row] { display: grid; grid-template-columns: minmax(120px, 1.6fr) 1fr 1fr 1fr 28px; gap: 6px; align-items: center; margin: 4px 0; }",
			"[data-dcl-price-row] input { width: 100%; }",
			"[data-dcl-close] { position: absolute; right: 8px; top: 6px; border: 0; background: transparent; color: inherit; opacity: .6; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px; }",
			"[data-dcl-close]:hover { opacity: 1; background: rgba(127,127,127,.12); }",
			"[data-dcl-badge-x] { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: rgba(127,127,127,.15); font-size: 10px; }",
			"@media (max-width: 720px) { [data-dcl-panel] { width: min(340px, calc(100vw - 32px)); } }",
		].join("\n");
		const STYLE_ID = "dsh-deepseek-cost-live-style";
		function injectStyle() {
			if (document.getElementById(STYLE_ID)) return () => {};
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = STYLE;
			document.head.appendChild(el);
			return () => el.remove();
		}

		// ---- shared bits ------------------------------------------------
		function balanceLine(state) {
			if (!state || state.state !== "ok" || !state.snapshot || !state.snapshot.infos || state.snapshot.infos.length === 0) return null;
			// Prefer the currency with the largest balance so a USD 0 line never hides real CNY.
			let best = state.snapshot.infos[0];
			for (const info of state.snapshot.infos) {
				const a = Number(best.totalBalance) || 0;
				const b = Number(info.totalBalance) || 0;
				if (b > a) best = info;
			}
			return best;
		}
		function BalanceBadge() {
			const store = useStore();
			const line = balanceLine(store.payload && store.payload.balance);
			const bstate = store.payload ? store.payload.balance.state : "loading";
			if (store.status !== "ok" || !store.payload || !line) {
				return h("span", { "data-dcl-muted": "" }, t("balance") + ": —");
			}
			return h("span", {},
				h("span", { "data-dcl-dot": "", "data-state": bstate }),
				currencySymbol(line.currency) + fmtMoney(Number(line.totalBalance))
			);
		}
		function SpendBadge() {
			const store = useStore();
			if (store.status !== "ok" || !store.payload || !store.payload.today) return h("span", { "data-dcl-muted": "" }, t("todaySpend") + ": —");
			return h("span", {}, t("todaySpend") + " " + currencySymbol("CNY") + fmtMoney(store.payload.today.costCNY));
		}

		function DockStrip() {
			useLocale();
			const store = useStore();
			if (store.status === "loading") return h("div", { "data-dcl-dock": "" }, t("loading"));
			if (store.status === "error" || !store.payload) return h("div", { "data-dcl-dock": "" }, t("error"));
			return h("div", { "data-dcl-dock": "" },
				BalanceBadge(),
				SpendBadge(),
				h("button", { type: "button", "data-dcl-btn": "", disabled: store.busy, onClick: () => refreshBalance(), title: t("refresh") },
					store.busy ? t("refreshing") : t("refresh"))
			);
		}

		function FloatingWidget() {
			useLocale();
			const store = useStore();
			const [open, setOpen] = useState(false);
			useEffect(() => {
				try {
					if (window.localStorage.getItem(FLOAT_KEY) === "1") setOpen(false);
				} catch { /* ignore */ }
			}, []);
			const toggle = () => setOpen((v) => !v);
			const closePermanent = () => {
				try { window.localStorage.setItem(FLOAT_KEY, "1"); } catch { /* ignore */ }
				setOpen(false);
			};
			const line = balanceLine(store.payload && store.payload.balance);
			const bstate = store.payload ? store.payload.balance.state : "loading";
			return h("div", { "data-dcl-root": "" },
				open ? h("div", { "data-dcl-panel": "" },
					h("button", { type: "button", "data-dcl-close": "", onClick: closePermanent, title: t("close") }, "×"),
					h("div", { style: { display: "flex", alignItems: "baseline", gap: 16, marginTop: 4 } },
						h("div", { "data-dcl-item": "" },
							h("span", { "data-dcl-item-label": "" }, t("balance")),
							h("span", { "data-dcl-item-value": "" },
								h("span", { "data-dcl-dot": "", "data-state": bstate }),
								line ? currencySymbol(line.currency) + fmtMoney(Number(line.totalBalance)) : "—")),
						h("div", { "data-dcl-item": "" },
							h("span", { "data-dcl-item-label": "" }, t("todaySpend") + " (" + t("estimate") + ")"),
							h("span", { "data-dcl-item-value": "" }, currencySymbol("CNY") + fmtMoney(store.payload && store.payload.today ? store.payload.today.costCNY : 0)))),
					renderMiniDetails(store.payload),
					h("div", { style: { display: "flex", gap: 8, marginTop: 8, alignItems: "center" } },
						h("button", { type: "button", "data-dcl-btn": "", disabled: store.busy, onClick: () => refreshBalance() }, store.busy ? t("refreshing") : t("refresh")),
						h("span", { "data-dcl-muted": "", style: { fontSize: 11 } }, t("updated") + " " + fmtTime(store.lastLoadedAt)))
				) :
				h("div", { "data-dcl-badge": "", onClick: toggle, title: t("nav") },
					BalanceBadge(),
					h("span", { style: { opacity: .5 } }, "·"),
					SpendBadge(),
					h("span", { "data-dcl-badge-x": "", style: { marginLeft: 2 } }, "↗"))
			);
		}

		function renderMiniDetails(payload) {
			if (!payload) return null;
			const today = payload.today;
			const rows = [];
			if (today) {
				rows.push(h("div", { key: "r", "data-dcl-row": "" }, h("span", {}, t("requests") + " " + today.requests + (today.failed > 0 ? " (" + today.failed + " " + t("failed") + ")" : "")), h("span", {}, t("todayTokens") + " " + fmtTokens(today.cacheHitInput + today.cacheMissInput + today.output + today.reasoning))));
			}
			if (payload.byModel && payload.byModel.length > 0) {
				rows.push(h("h4", { key: "mh" }, t("models")), payload.byModel.slice(0, 4).map((m) => h("div", { key: m.model, "data-dcl-row": "" }, h("span", {}, m.model), h("span", {}, currencySymbol("CNY") + fmtMoney(m.costCNY)))));
			}
			rows.push(h("div", { key: "note", "data-dcl-note": "" }, t("estimateNote")));
			return rows;
		}

		// ---- settings page component ------------------------------------
		function PriceRow({ model, value, onChange, onRemove }) {
			const num = (v) => (v === "" ? "" : Number(v));
			const field = (bucket) => h("input", {
				type: "number", min: "0", step: "0.01", value: value[bucket] === undefined ? "" : value[bucket],
				placeholder: "0",
				onChange: (e) => {
					const nv = { ...value };
					const parsed = Number(e.target.value);
					nv[bucket] = e.target.value === "" ? undefined : (Number.isFinite(parsed) ? parsed : 0);
					onChange(model, nv);
				},
			});
			return h("div", { "data-dcl-price-row": "" },
				h("input", { value: model, readOnly: true, style: { background: "transparent", border: "0", fontWeight: 600 } }),
				field("cacheHitInput"), field("cacheMissInput"), field("output"),
				h("button", { type: "button", "data-dcl-close": "", onClick: () => onRemove(model), title: "×" }, "×"));
		}
		function PriceEditor({ prices, onChange }) {
			const keys = Object.keys(prices || {}).filter((k) => k !== "");
			const models = keys.length > 0 ? keys : ["default"];
			const addRow = () => {
				const next = { ...(prices || {}) };
				const base = next.default || { cacheHitInput: 0.5, cacheMissInput: 2, output: 8 };
				const name = "model-" + Date.now().toString(36);
				next[name] = { ...base };
				onChange(next);
			};
			return h("div", {},
				h("div", { "data-dcl-price-row": "", style: { opacity: .6, fontSize: 11 } },
					h("span", {}, t("model")), h("span", {}, t("cacheHit")), h("span", {}, t("cacheMiss")), h("span", {}, t("output")), h("span", {})),
				models.map((m) => h(PriceRow, { key: m, model: m, value: prices[m] || {}, onChange, onRemove: (rm) => {
					const next = { ...(prices || {}) };
					delete next[rm];
					onChange(next);
				} })),
				h("button", { type: "button", "data-dcl-btn": "", onClick: addRow }, "+ " + t("model"))
			);
		}
		function UsageSettingsPanel({ config, onConfigChange }) {
			useLocale();
			const store = useStore();
			const [draft, setDraft] = useState(null);
			const [saving, setSaving] = useState(false);
			const [saveMsg, setSaveMsg] = useState("");
			const [scanMsg, setScanMsg] = useState("");
			useEffect(() => {
				if (draft === null && config) {
					setDraft({
						timezone: config.timezone,
						providerIds: Array.isArray(config.providerIds) ? config.providerIds.join(",") : "deepseek-official",
						apiKeyEnv: config.apiKeyEnv || "DEEPSEEK_API_KEY",
						balanceRefreshMinutes: config.balanceRefreshMinutes,
						pollSeconds: config.pollSeconds,
						prices: config.prices && typeof config.prices === "object" ? config.prices : {},
					});
				}
			}, [config, draft]);
			if (!draft) return h("div", { "data-dcl-settings": "" }, t("loading"));
			const d = draft;
			const set = (patch) => setDraft({ ...d, ...patch });
			const submit = async () => {
				setSaving(true);
				setSaveMsg("");
				try {
					const body = {
						timezone: d.timezone,
						providerIds: d.providerIds.split(",").map((x) => x.trim()).filter((x) => x !== ""),
						apiKeyEnv: d.apiKeyEnv,
						balanceRefreshMinutes: Number(d.balanceRefreshMinutes),
						pollSeconds: Number(d.pollSeconds),
						prices: d.prices,
					};
					const res = await fetch(API + "/config", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					});
					if (!res.ok) throw new Error("http " + res.status);
					setSaveMsg(t("saved"));
					await loadStats();
				} catch {
					setSaveMsg(t("saveFailed"));
				} finally {
					setSaving(false);
				}
			};
			const scan = async () => {
				setScanMsg(t("scanning"));
				try {
					const res = await fetch(API + "/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
					if (res.ok) await loadStats();
				} catch { /* ignore */ }
				setScanMsg("");
			};
			const today = store.payload && store.payload.today;
			const line = balanceLine(store.payload && store.payload.balance);
			const balance = store.payload ? store.payload.balance : null;
			return h("div", { "data-dcl-settings": "" },
				h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
					h("h3", { style: { margin: 0, fontSize: 15 } }, t("nav")),
					h("span", { "data-dcl-dot": "", "data-state": balance ? balance.state : "loading" }),
					h("span", { "data-dcl-muted": "", style: { fontSize: 11 } },
						balance && balance.state === "ok" ? t("ok") : balance && balance.state === "stale" ? t("stale") : balance ? t(balance.state) : t("loading"))),
				renderMainStats(payloadView(store.payload, t)),
				h("h4", {}, t("configTitle")),
				h("div", { "data-dcl-field": "" }, h("label", {}, t("timezone")), h("select", { value: d.timezone, onChange: (e) => set({ timezone: e.target.value }) }, ["Asia/Shanghai", "UTC", "Asia/Tokyo", "America/Los_Angeles", "Europe/Berlin"].map((z) => h("option", { key: z, value: z }, z)))),
				h("div", { "data-dcl-field": "" }, h("label", {}, t("providerIds") + " (" + t("providerHint") + ")"), h("input", { value: d.providerIds, onChange: (e) => set({ providerIds: e.target.value }) })),
				h("div", { "data-dcl-field": "" }, h("label", {}, t("apiKeyEnv")), h("input", { value: d.apiKeyEnv, onChange: (e) => set({ apiKeyEnv: e.target.value }) })),
				h("div", { "data-dcl-field": "" }, h("label", {}, t("pollSeconds")), h("input", { type: "number", min: 10, value: d.pollSeconds, onChange: (e) => set({ pollSeconds: e.target.value }) })),
				h("div", { "data-dcl-field": "" }, h("label", {}, t("balanceMinutes")), h("input", { type: "number", min: 1, value: d.balanceRefreshMinutes, onChange: (e) => set({ balanceRefreshMinutes: e.target.value }) })),
				h("h4", {}, t("priceTable") + " — " + t("priceHint")),
				h(PriceEditor, { prices: d.prices, onChange: (prices) => set({ prices }) }),
				h("div", { style: { display: "flex", gap: 10, marginTop: 12, alignItems: "center" } },
					h("button", { type: "button", "data-dcl-btn": "", disabled: saving, onClick: submit }, saving ? "…" : t("save")),
					h("button", { type: "button", "data-dcl-btn": "", disabled: scanMsg !== "", onClick: scan }, scanMsg !== "" ? t("scanning") : t("scan")),
					h("span", { "data-dcl-muted": "" }, saveMsg)),
				h("div", { "data-dcl-note": "" }, t("estimateNote")),
				undefined);
		}
		function payloadView(payload, translate) {
			return payload;
		}
		function renderMainStats(payload) {
			if (!payload || !payload.today) return null;
			const today = payload.today;
			const els = [];
			if (payload.balance && payload.balance.state === "ok" && payload.balance.snapshot) {
				const infos = payload.balance.snapshot.infos || [];
				els.push(h("div", { key: "bal", style: { display: "flex", gap: 18, flexWrap: "wrap", margin: "8px 0" } },
					infos.map((info) => h("div", { key: info.currency, "data-dcl-item": "" },
						h("span", { "data-dcl-item-label": "" }, t("balance") + " (" + info.currency + ")"),
						h("span", { "data-dcl-item-value": "" }, currencySymbol(info.currency) + fmtMoney(Number(info.totalBalance))),
						h("span", { "data-dcl-muted": "", style: { fontSize: 10.5 } }, "granted " + fmtMoney(Number(info.grantedBalance)) + " · topped-up " + fmtMoney(Number(info.toppedUpBalance)))))));
			} else if (payload.balance && payload.balance.state !== "ok") {
				els.push(h("div", { key: "bale", "data-dcl-muted": "", style: { margin: "6px 0" } }, payload.balance.state === "unconfigured" ? t("unconfigured") + " — " + t("noKeyHint") : t("stale")));
			}
			els.push(h("div", { key: "today", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, margin: "8px 0" } },
				statCard(t("todaySpend"), currencySymbol("CNY") + fmtMoney(today.costCNY)),
				statCard(t("requests"), String(today.requests) + (today.failed > 0 ? " (" + today.failed + " " + t("failed") + ")" : "")),
				statCard(t("todayTokens"), fmtTokens(today.cacheHitInput + today.cacheMissInput + today.output + today.reasoning)),
				statCard(t("cacheHit"), fmtTokens(today.cacheHitInput)),
				statCard(t("cacheMiss"), fmtTokens(today.cacheMissInput)),
				statCard(t("output"), fmtTokens(today.output)),
				statCard(t("reasoning"), fmtTokens(today.reasoning))));
			els.push(h("h4", { key: "wk" }, t("days7")));
			els.push(h("table", { key: "tbl", "data-dcl-table": "" },
				h("thead", {}, h("tr", {}, h("th", {}, t("day")), h("th", {}, t("cost")), h("th", {}, t("requests")), h("th", {}, t("tokens")))),
				h("tbody", {}, (payload.days || []).map((d) => h("tr", { key: d.day },
					h("td", {}, d.day),
					h("td", {}, currencySymbol("CNY") + fmtMoney(d.costCNY)),
					h("td", {}, String(d.requests) + (d.failed > 0 ? " (" + d.failed + ")" : "")),
					h("td", {}, fmtTokens(d.cacheHitInput + d.cacheMissInput + d.output + d.reasoning)))))));
			if (payload.byModel && payload.byModel.length > 0) {
				els.push(h("h4", { key: "bm" }, t("models")));
				els.push(h("table", { key: "bmt", "data-dcl-table": "" },
					h("tbody", {}, payload.byModel.map((m) => h("tr", { key: m.model }, h("td", {}, m.model), h("td", {}, String(m.requests)), h("td", {}, currencySymbol("CNY") + fmtMoney(m.costCNY)))))));
			}
			els.push(h("div", { key: "ts", "data-dcl-muted": "", style: { marginTop: 8, fontSize: 11 } }, t("updated") + " " + fmtTime(payload.generatedAt)));
			return els;
		}
		function statCard(label, value) {
			return h("div", { style: { background: "var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.06))", borderRadius: 10, padding: "8px 10px" } },
				h("div", { style: { fontSize: 10.5, opacity: .6 } }, label),
				h("div", { style: { fontSize: 14, fontWeight: 650, fontVariantNumeric: "tabular-nums", marginTop: 2 } }, value));
		}

		// ---- apply ------------------------------------------------------
		function apply(ctx) {
			const removeStyle = injectStyle();
			const locale = ctx.locale;
			const syncLocale = () => {
				let active = "zh";
				try { active = locale.getLocale().active; } catch { /* ignore */ }
				activeLocale = active === "en" ? "en" : "zh";
				localeListeners.forEach((fn) => fn());
			};
			syncLocale();
			const stopPolling = startPolling();

			let floatingRoot = null;
			let floatingHost = null;
			let domReadyHandler = null;
			const mountFloating = () => {
				if (floatingRoot || typeof document === "undefined" || !document.body) return;
				floatingHost = document.createElement("div");
				document.body.appendChild(floatingHost);
				floatingRoot = reactDom.createRoot(floatingHost);
				floatingRoot.render(h(FloatingWidget));
			};
			if (typeof document !== "undefined") {
				if (document.readyState === "loading") {
					domReadyHandler = mountFloating;
					document.addEventListener("DOMContentLoaded", domReadyHandler, { once: true });
				} else {
					mountFloating();
				}
			}

			const disposers = [];
			if (locale && typeof locale.register === "function") disposers.push(locale.register(NS, DICT));
			if (locale && typeof locale.subscribe === "function") disposers.push(locale.subscribe(syncLocale));

			if (ctx.slots) {
				ctx.slots.inject("settings.section", () =>
					ctx.slots.register({
						name: "settings.section",
						id: "dsh-deepseek-cost-live-settings",
						order: 85,
						label: () => t("nav"),
						locale: NS,
						inject: () => ({})
					}, SettingsPanel)
				);
				ctx.slots.inject("conversation.composer.dock", () =>
					ctx.slots.register({
						name: "conversation.composer.dock",
						id: "dsh-deepseek-cost-live-dock",
						order: 200,
						locale: NS,
						inject: () => ({})
					}, DockStrip)
				);
			}

			return () => {
				if (domReadyHandler) {
					document.removeEventListener("DOMContentLoaded", domReadyHandler);
					domReadyHandler = null;
				}
				removeStyle();
				stopPolling();
				if (floatingRoot) {
					try { floatingRoot.unmount(); } catch { /* ignore */ }
					floatingRoot = null;
				}
				if (floatingHost && floatingHost.parentNode) {
					try { floatingHost.parentNode.removeChild(floatingHost); } catch { /* ignore */ }
				}
				floatingHost = null;
				disposers.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
			};
		}

		function SettingsPanel() {
			useLocale();
			const store = useStore();
			const [config, setConfig] = useState(null);
			useEffect(() => {
				let alive = true;
				fetch(API + "/config", { cache: "no-store" })
					.then((res) => (res.ok ? res.json() : null))
					.then((data) => { if (alive && data && data.config) setConfig(data.config); })
					.catch(() => {});
				return () => { alive = false; };
			}, []);
			if (store.status === "loading" || !config) return h("div", { "data-dcl-settings": "" }, t("loading"));
			return h("div", { "data-dcl-settings": "" }, h(UsageSettingsPanel, { config, onConfigChange: (c) => setConfig(c) }));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});