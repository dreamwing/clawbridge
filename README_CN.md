<div align="center">
  <img src="public/app-icon.png" width="100" alt="ClawBridge Logo" />
  <h1>ClawBridge Dashboard</h1>
  <p><strong>OpenClaw Agent 的移动端控制台。</strong></p>

  <a href="https://clawbridge.app">
    <img src="https://img.shields.io/badge/官网-clawbridge.app-blue?style=for-the-badge" alt="Website" />
  </a>
  <a href="https://github.com/openclaw/openclaw">
    <img src="https://img.shields.io/badge/OpenClaw-原生兼容-success?style=for-the-badge" alt="OpenClaw" />
  </a>
  
  <br/><br/>
  [ <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a> ]
</div>

---

**ClawBridge** 将您的 OpenClaw Agent 变成一个随身携带的伙伴。无论身在何处，您都可以通过手机实时查看 Agent 的思考过程、追踪 Token 消耗、管理后台任务。

## ✨ 核心功能

*   **🧠 实时动态 (Live Activity)**: 像看朋友圈一样查看 Agent 的“思考”和“工具调用”。支持并行日志捕获（不会漏掉后台脚本）和智能去重。
*   **💰 Token 经济学**: 精确追踪每日/每月的 LLM 成本和 Token 用量趋势。拒绝账单刺客。
*   **📜 记忆时间轴**: 浏览 Agent 的每日日志和长期记忆演变。
*   **🚀 任务控制台**: 查看 Cron 定时任务状态，并支持从手机端手动触发脚本。
*   **⚡ 零门槛安装**: 
    *   **自动端口**: 3000 被占用？自动切换到 3001。
    *   **智能网络**: 自动检测 **Tailscale/WireGuard**，优先使用内网穿透，安全第一。
    *   **快速通道**: 如果没有 VPN，自动通过 Cloudflare 生成临时公网链接，开箱即用。

## 🚀 安装

在您的 OpenClaw 服务器（Ubuntu/Debian）上运行这行命令：

```bash
curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge-openclaw-mobile-dashboard/master/setup.sh | bash
```

脚本会自动检测环境、生成安全密钥、并直接给出一个可访问的 URL。

## 📱 使用指南

### 1. 极速体验 (默认)
如果您没有任何网络配置，安装程序会提供一个 **Quick Tunnel** 链接：
`https://<随机字符>.trycloudflare.com/?key=<密钥>`

*   **优点**: 全球可访问，无需配置。
*   **缺点**: 重启服务后链接会变化（临时会话）。

### 2. VPN 直连 (隐私优先)
如果检测到 **Tailscale** 或 **WireGuard**，安装程序会跳过公网隧道，直接提供内网链接：
`http://<VPN_IP>:3000/?key=<密钥>`

*   **优点**: 速度最快，数据完全不经过第三方。
*   **缺点**: 您的手机必须连接到同一个 VPN 网络。

### 3. 配置固定域名 (进阶)
想要一个固定的 `dash.yoursite.com`？
1.  在 Cloudflare Zero Trust 后台创建一个 Tunnel 并获取 Token。
2.  使用 Token 运行安装脚本：
    ```bash
    cd skills/clawbridge-dashboard
    ./install.sh --token=<YOUR_TOKEN>
    ```
    *   或者强制开启临时公网隧道：`./install.sh --force-cf`

## 🛠️ 技术栈
*   **后端**: Node.js (Express, WebSocket) - 轻量级 Sidecar 进程。
*   **前端**: Vanilla JS - 无需编译，秒开。
*   **穿透**: Cloudflared

---
*MIT License. Built for the OpenClaw Community.*
