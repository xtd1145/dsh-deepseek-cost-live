# 发布 / 收录操作手册(dsh-deepseek-cost-live)

> GitHub 上传与各家收录需要你自己的 GitHub 账号操作;本文件把每一步命令和文案都准备好。

## 0. 命名

- GitHub 仓库:**xtd1145/dsh-deepseek-cost-live**(可自行改名,改了记得同步目录 yml 里的 url/name)。
- 包名 / cordis id:`dsh-deepseek-cost-live`。

## 1. 推送 GitHub(需要你已安装 git 并配置 token)

```powershell
cd C:\Users\BI\Documents\ds\dsh-deepseek-cost-live
git init
git add -A
git commit -m "feat: real-time DeepSeek balance + daily spend for DSH web"
# 在 github.com 新建同名空仓库后:
git remote add origin https://github.com/xtd1145/dsh-deepseek-cost-live.git
git branch -M main
git push -u origin main
```

首次安装到本地后先重启 DSH web 自测(见 README.md),确认:
- `Invoke-WebRequest http://127.0.0.1:3080/dsh-deepseek-cost-live/stats` 返回 JSON;
- Web 界面出现右下角悬浮徽标、输入框下方小条、设置页“用量与余额”。

## 2. 收录一:awesome-dsh-plugin(目录 yml 已备好)

已生成:`awesome-dsh-plugin/data/plugins/xtd1145__dsh-deepseek-cost-live.yml`。

在 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin 提交 PR(或先 fork 再推送分支),新增上述文件,标题建议:

> Add plugin: xtd1145/dsh-deepseek-cost-live (DeepSeek balance + daily spend, real-time, zh/en)

## 3. 收录二:DSH Market

- 仓库页面:https://dsh.market/(marketplace 收录见其 README;本项目插件缓存里也出现 `dsh-market` 站点)
- 若走 issue 收录(参考你之前 full-access-switch 的做法:https://github.com/2BingLing/dsh-market/issues),标题与正文:

```text
## Plugin submission: dsh-deepseek-cost-live

- 名称: dsh-deepseek-cost-live
- 仓库: https://github.com/xtd1145/dsh-deepseek-cost-live
- 类型: cordis-plugin(client+host)
- 安装: dsh plugin --profile web add https://github.com/xtd1145/dsh-deepseek-cost-live
- 类别: usage / cost / balance
- 语言: zh + en
- 简介: 实时显示 DeepSeek API 官方余额 + 本机用量估算的今日花费(composer dock / 悬浮徽标 / 设置面板),API Key 不出宿主进程。
- License: MIT
```

## 4. 收录三:dshbase

- 站点:https://dshbase.com/zh/ → 提交收录(issue 或表单),正文同上即可。

## 5. 版本 / 升级

- 改 `package.json` version → 提交 tag `v0.1.0` 等。bundle 安装方(`dsh plugin add`)会拉取 tag/HEAD。
- 若 DSH 大版本升级导致 API 变化:优先复测 `restart-dsh-web.ps1` 式 preflight 与 stats 路由,按需跟随官方 `@deepseek-ai/*` 调整。
## 6. 本地安装注意(重要)

`dsh plugin --profile web add <file:....tgz>` 在本机 pnpm 下会把包**软链回源码目录**,导致运行时解析 `@deepseek-ai/*` 失败(模块解析以真实路径为准,源码目录下没有 `@deepseek-ai`)。可靠做法:把 `npm pack` 出的 tgz **解压成实体副本**放进 `$DSH_HOME/profiles/web/node_modules/<包名>`,并把包名加入 profile `package.json` 的 `dsh.profile.bundles`,再重启 web。每次改代码后重复“重新解压副本 → 重启”。
