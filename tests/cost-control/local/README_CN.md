# Cost Control 本地验收

[[English](README.md) | 简体中文]

这个目录存放 Cost Control Center 的本地验收资源。

它与业务脚本隔离，面向任意开源用户的本地环境，而不是只针对某一台机器的 `~/.openclaw` 状态。

整套流程分为两层：

1. `assess`
   作用：检查用户真实本地 `~/.openclaw` 和当前 token stats，判断哪些 Cost Control 场景已经可以直接测试。
2. `sandbox`
   作用：把真实 `~/.openclaw` 复制到 `tests/cost-control/local/.sandbox/openclaw`，然后只对这个 sandbox 副本应用 fixture。

这样可以避免在本地验收时修改真实 OpenClaw 的运行状态。

## 工具会改动哪些内容

- 一定会改动：
  - `data/token_stats/latest.json`
- 只会改动 sandbox：
  - `tests/cost-control/local/.sandbox/openclaw/*`
- 在 `sandbox-init` 之后，不会修改真实 `~/.openclaw`

## 支持的场景

- `case-a`
  目的：触发 `A01` 和 `A05`
  额外配置：将 `agents.defaults.thinkingDefault` 设置为 `high`

- `case-b`
  目的：触发 `A06` 和 `A09`
  额外配置：清除 `agents.defaults.thinkingDefault`

- `case-c`
  目的：触发 `A03` 和 `A04`
  额外配置：安装三个 managed-skill fixture，并调整 mtime

## 用法

在仓库根目录执行：

```bash
tests/cost-control/local/run-local-check.sh assess
tests/cost-control/local/run-local-check.sh backup-token
tests/cost-control/local/run-local-check.sh sandbox-init
tests/cost-control/local/run-local-check.sh env
tests/cost-control/local/run-local-check.sh apply case-a
tests/cost-control/local/run-local-check.sh status
tests/cost-control/local/run-local-check.sh restore-token
```

## 让 ClawBridge 指向 sandbox

在同一个 shell 里导出 sandbox 环境变量，再启动 ClawBridge：

```bash
export OPENCLAW_STATE_DIR=".../tests/cost-control/local/.sandbox/openclaw"
export OPENCLAW_WORKSPACE=".../tests/cost-control/local/.sandbox/openclaw/workspace"
export ACCESS_KEY="cost-control-local-key"
export PORT="3399"
npm start
```

ClawBridge 会从这些环境变量解析 config 和 workspace，因此这样启动后，Dashboard 只会读写 sandbox 副本，不会碰真实 `~/.openclaw`。

## 一键顺序执行所有 case

也可以直接运行总控脚本：

```bash
node tests/cost-control/local/run-all-cases.mjs
```

这个脚本会自动：

1. 备份 `data/token_stats/latest.json`
2. 创建或刷新 sandbox OpenClaw 副本
3. 依次应用 `case-a`、`case-b`、`case-c`
4. 每个 case 单独启动一次指向 sandbox 的 ClawBridge
5. 调用本地 Cost Control API
6. 尝试执行预期 action
7. 在 history 记录可撤销时尝试执行一次 Undo
8. 在 `tests/cost-control/local/.reports/` 下输出 markdown 和 json 报告

补充说明：

- 总控脚本会为每个 case 自己启动一个 ClawBridge 进程。
- 启动前会自动注入 sandbox 环境变量。
- 会从 `3399` 开始探测空闲端口，并把实际使用的 base URL 写进报告。

## 推荐流程

1. 先运行 `assess`，查看你当前真实本地状态已经覆盖了哪些 action。
2. 用 `backup-token` 备份仓库里的 token stats。
3. 用 `sandbox-init` 创建 sandbox。
4. 导出 sandbox 环境变量，并在该 shell 中启动 ClawBridge。
5. 每次只应用一个 fixture case。
6. 检查 UI、Apply、History、Undo 是否符合预期。
7. 测试结束后，用 `restore-token` 恢复 token stats。

## 每个场景的手工核对清单

1. 启动 ClawBridge。
2. 打开 Cost Control Center UI。
3. 确认当前 case 预期出现的卡片确实出现。
4. 针对 sandbox 环境逐条执行 Apply。
5. 确认 sandbox OpenClaw 目录中的文件或配置确实发生变化。
6. 使用 Undo 并确认恢复正确。
7. 如果需要直接检查文件，请检查 sandbox 路径，而不是真实 `~/.openclaw`。
