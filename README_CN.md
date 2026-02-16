# ClawBridge 🌉 (中文文档)

> **为 OpenClaw/Clawdbot 量身打造的移动端控制台。**

ClawBridge 是一个轻量级、移动端优先的仪表盘，专为监控和管理 **Clawdbot** 智能体而生。无论你身在何处，都能实时掌握 Agent 的思考过程、成本消耗和任务状态。

## ✨ 核心功能

*   **📱 原生级体验**: 支持 PWA (添加到主屏幕)，全屏运行，如同原生 App。
*   **🩺 系统监控**: 实时查看服务器 CPU 和内存负载。
*   **📜 实时日志流**: 看着你的 Agent "思考"、调用工具、读写文件。
*   **💰 成本账单**: 每日 Token 消耗统计、趋势图、月度预测。内置 340+ 模型（含 DeepSeek, Claude, GPT-4o）的最新价格表。
*   **🚀 任务中心**: 查看 Cron 定时任务状态，支持手动触发执行。
*   **🛡️ 安全隐私**: 基于 Magic Link 鉴权。数据纯本地存储，绝不上传云端。

## 🚀 快速开始 (一键安装)

这是安装或更新 ClawBridge 最简单的方法。

1.  **运行安装脚本**:
    ```bash
    curl -fsSL https://raw.githubusercontent.com/dreamwing/clawbridge-openclaw-mobile-dashboard/master/install.sh | bash
    ```

2.  **访问**: 脚本运行结束后会输出一个专属链接 (例如 `http://YOUR_IP:3000/?key=...`)。请复制并在手机浏览器打开。

## ⚙️ 手动安装

如果你更喜欢自己动手：

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/dreamwing/clawbridge-openclaw-mobile-dashboard.git
    cd clawbridge-openclaw-mobile-dashboard
    ```

2.  **安装依赖**:
    ```bash
    npm install --production
    ```

3.  **配置**:
    创建一个 `.env` 文件:
    ```bash
    ACCESS_KEY=这里填你的密码
    PORT=3000
    ```

4.  **运行**:
    ```bash
    node index.js
    ```

## 🧩 高级配置

### 自定义模型价格
ClawBridge 内置了一份详尽的价格表 (`data/config/pricing.sample.json`)。如果你使用的是特殊渠道 API 或私有模型，可以自定义价格：

1.  复制样本文件：
    ```bash
    cp data/config/pricing.sample.json data/config/pricing.json
    ```
2.  编辑 `data/config/pricing.json`。Key 需要与日志中的模型名称匹配 (例如 `deepseek/deepseek-chat`)。

### PWA (安装到手机)
1.  在 Safari (iOS) 或 Chrome (Android) 中打开 ClawBridge 链接。
2.  点击 **分享** 按钮 -> 选择 **添加到主屏幕**。
3.  现在的它就是一个全屏运行的独立 App 了！

## 🔒 安全说明
*   ClawBridge 运行在你的私有服务器上。
*   所有统计数据存储在 `data/` 目录下，**绝不会** 上传到任何外部服务器。
*   请确保你的防火墙允许 3000 端口流量 (或配合 Cloudflare Tunnel 使用)。

## 许可证
MIT
