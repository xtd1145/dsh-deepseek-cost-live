# dsh-deepseek-cost-live

> DeepSeek Harness(DSH)Web 插件:**实时显示 DeepSeek API 账户余额(官方接口)与今日花费(本机用量估算)**。
> 与 DeepSeek 官方无关,社区开源插件,基于官方 `@deepseek-ai/*` 运行时能力开发,不改动任何 DSH 源码。

## 功能

- **余额实时**(官方):调用 `GET https://api.deepseek.com/user/balance`,按可配置间隔自动刷新,失败保留上次成功数据并标记 stale;API Key 只在宿主进程内解析,绝不进入浏览器/日志/请求参数。
- **今日花费(估算)**:监听 DSH 本机会话日志,把每次模型请求的精确 usage(token:缓存命中输入/未命中输入/输出/推理)按 **分模型价格表(元/百万 token)** 换算为人民币估算值。DeepSeek 官方不提供“今日已消费”查询接口,因此花费是**本地估算口径**,非账单。
- **三处实时展示**(可同时启用):
  - 输入框下方 **composer dock 实时小条**:余额 + 今日花费 + 手动刷新;
  - 右下角 **常驻悬浮徽标**(可收起,localStorage 记忆);
  - 设置页 **完整面板**:余额明细、今日/近7日 Token 与花费、分模型花费、价格表/时区/轮询配置、历史重扫。
- 中英双语;计数只计入官方 DeepSeek 路由(默认 provider `deepseek-official`,可在配置中增改,改后“重扫历史”即可回填)。

## 安装

方式一(推荐,本地目录 / 已发布包):

```powershell
dsh plugin --profile web add <本仓库路径或 dsh-deepseek-cost-live.tgz>
```

方式二(手动):

1. `npm pack`(或直接把 `lib/ cordis.patch.yml package.json` 放入 `$DSH_HOME/profiles/web/node_modules/dsh-deepseek-cost-live`);
2. 在 `$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles` 中加入 `"dsh-deepseek-cost-live"`;
3. 重启 web 服务(见下)。

重启并验证:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File $env:USERPROFILE.dshestart-dsh-web.ps1
# 重启后检查:
Invoke-WebRequest -Uri 'http://127.0.0.1:3080/dsh-deepseek-cost-live/stats' -UseBasicParsing | Select-Object -ExpandProperty Content
```

浏览器(建议无痕/强刷一次)打开 Web 界面即可看到悬浮徽标与输入框下方小条;设置 →「用量与余额」打开完整面板。

## API Key 来源(按优先级)

1. 插件配置文件 `$DSH_HOME/dsh-deepseek-cost-live/config.json` 中的 `apiKey`(管理员手写,不通过浏览器下发);
2. 环境变量(默认 `DEEPSEEK_API_KEY`,可在配置里改 `apiKeyEnv`);
3. DSH 凭据文件 `$DSH_HOME/.credentials.yaml` 的 `refs.<apiKeyEnv>`;
4. 官方 `ctx.credentials` 服务(动态加载)。

## 花费口径与价格表

- 每次请求花费 = cacheHit × 命中价 + cacheMiss × 未命中价 + (输出+推理) × 输出价(单位:元/百万 token)。
- 默认价目表按 DeepSeek 官网发布价填写(见 `lib/core/pricing.js`);请在设置页按你的模型与官网价目核对,未列出的模型使用 `default` 行。
- 首次安装后,历史会话会在启动后数秒内被后台扫描一次;运行中发生的请求通过会话事件近乎实时入库(每 ~15s 落一次持久化,进程崩溃丢失的最多只是少量增量,下次扫描会重建)。

## 数据与目录

| 路径(位于 `$DSH_HOME` 下) | 说明 |
| --- | --- |
| `dsh-deepseek-cost-live/ledger.json` | 已折叠的用量行(sessionId:seq 幂等去重,保留 `keepDays` 天) |
| `dsh-deepseek-cost-live/config.json` | 配置(时区/provider/轮询/价格表) |
| `dsh-deepseek-cost-live/balance.json` | 最近一次成功余额快照(重启不丢) |

## 配置项(设置页/路由可改)

`timezone`(默认 `Asia/Shanghai`)、`providerIds`(默认 `["deepseek-official"]`)、`apiKeyEnv`(默认 `DEEPSEEK_API_KEY`)、`balanceRefreshMinutes`(默认 10)、`pollSeconds`(默认 60)、`keepDays`(默认 90)、`prices`。

## HTTP 路由(仅本机回环可信请求)

- `GET  /dsh-deepseek-cost-live/stats` — 汇总数据(余额/今日/近7日/分模型/价格表元信息)
- `POST /dsh-deepseek-cost-live/refresh` — 立即刷新余额
- `GET  /dsh-deepseek-cost-live/config`、`POST /dsh-deepseek-cost-live/config` — 读写配置(永不接受/返回 API Key)
- `POST /dsh-deepseek-cost-live/scan` — 立即重扫全部会话历史

## 开发

```
lib/
  index.js             # host 插件(cordis loader 入口)
  client.js            # 浏览器端 bundle(window.__ModuleLoader__)
  core/                # 纯逻辑:day/fold/pricing/stats/credentials
  host/                # balance/capture/routes
  store.js             # JSON 持久化
tests/                 # 纯逻辑单测(直接 node 运行)
```

```powershell
node testsday.test.mjs ; node testsold-stats.test.mjs
```

## License

MIT
