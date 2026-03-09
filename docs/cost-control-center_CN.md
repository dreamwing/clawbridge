# 成本控制中心 (Cost Control Center)

**成本控制中心**是一个内置的诊断引擎，它可以分析您的 OpenClaw Agent 的 Token 使用情况，并提供可操作的建议以降低 API 成本。

## 核心功能

### Token 经济学仪表盘
- **今日成本** — 实时运行总额
- **累计总额** — 自安装以来的累计成本
- **30 天预测** — 基于近期消耗模式预测的月度支出
- **热门模型** — 按模型进行成本细分
- **7 日历史柱状图** — 每日成本图表及详情点击查看

### 自动化诊断 (10 项规则)

| ID | 诊断项 | 说明 |
|----|-----------|-------------|
| A01 | 模型降级 (Model Downgrade) | 检测是否可以将简单的任务分配给更便宜的模型，并一键切换 |
| A02 | 心跳优化 (Heartbeat Optimization) | 计算无用“心跳”产生的费用，提供分级心跳间隔建议 |
| A03 | 丢弃上下文浪费 (Session Reset Waste) | 识别由于过于频繁重置 Session 导致的系统提示词重复加载浪费 |
| A04 | 冗余技能清理 (Idle Skill Detection) | 找到那些不常用但一直在消耗 Input Token 的技能指令 |
| A05 | 思考 Token 过载 (Thinking Overhead) | 评估扩展思考模式的成本，建议在简单任务中使用精简模式 |
| A06 | 提示词缓存 (Prompt Caching) | 检测是否未开启缓存，开启后可节省高达 90% 的 Input 成本 |
| A07 | 上下文紧缩防护 (Compaction Safeguard) | 防止由于对话过长导致的上下文费用超出预期 |
| A08 | 本地模型路由 (Local Ollama Routing) | 将简单的请求/心跳路由到本地免费模型 *(开发中)* |
| A09 | 回复精简 (Output Verbosity) | 检测由于回复过长导致的费用浪费，通过指令减少废话 |
| A10 | 多模型路由 (Multi-Model Routing) | 根据任务复杂度自动分发到不同价格的模型 *(开发中)* |

### 一键优化引擎
- 每项诊断建议旁都有 **【Apply】** 按钮。
- 修改前自动备份当前配置到 `data/backups/`。
- 支持一键 **【Undo/Rollback】**，秒级恢复之前的设置。
- 完整的优化日志记录在 `data/logs/optimizations.jsonl` 中。

## API 接口

```
GET  /api/diagnostics   — 运行所有诊断检查，返回建议的操作及预计节省的金额
POST /api/optimize/:id  — 应用特定的优化操作 (A01–A10)
```

## 工作原理

1. **诊断引擎 (DiagnosticsEngine)** 读取您的 JSONL 使用日志和当前配置。
2. 每个诊断规则会根据您的**实际数据**计算潜在的节省金额。
3. 结果显示在前端仪表盘，包含具体的金额和配置差异 (diff)。
4. 点击“应用”触发 **优化服务 (OptimizerService)**：
   - 备份当前配置。
   - 写入优化后的设置。
   - 记录操作记录。

## 鸣谢

这 10 项诊断规则的灵感来源于 [@li9292](https://x.com/li9292/status/2025081922410443243) 对 OpenClaw 常见成本痛点的总结。

## 深入了解

查看官网上的详细系列文章：[clawbridge.app/solutions](https://clawbridge.app/solutions) —— 深入讲解每项诊断的原理与实测数据。
