<div align="center">
  <img src="public/app-icon.png" width="120" alt="ClawBridge Logo" />
  <h1>ClawBridge Dashboard</h1>
  <p><strong>OpenClaw 的移动端控制台 (Mobile Dashboard) 与任务中心 (Mission Control)。</strong></p>

  <a href="https://clawbridge.app">
    <img src="https://img.shields.io/badge/官网-clawbridge.app-3b82f6?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Website" />
  </a>
  <a href="https://github.com/openclaw/openclaw">
    <img src="https://img.shields.io/badge/OpenClaw-原生兼容-22c55e?style=for-the-badge&logo=robot-framework&logoColor=white" alt="OpenClaw" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/协议-MIT-fab005?style=for-the-badge" alt="License" />
  </a>
  
  <br/><br/>
  [ <a href="README.md">English</a> | <strong>简体中文</strong> ]
</div>

---

**ClawBridge** 是专为 OpenClaw Agent 打造的 **Mobile Dashboard**（移动端仪表盘）。它不仅是您的随身 **Mission Control**（任务控制台），还能让您通过手机实时监控 Agent 的思考过程、追踪 Token 成本、管理后台 Cron 任务。

## ✨ 核心功能

*   **📱 移动端优先**: 专为手机屏幕优化的 UI，随时随地查看日志和状态，无需缩放。
*   **🧠 实时动态 (Live Activity)**: 像看朋友圈一样查看 Agent 的“思考”和“工具调用”。支持并行日志捕获（不会漏掉后台脚本）和智能去重。
*   **💰 Token 经济学**: 精确追踪每日/每月的 LLM 成本和 Token 用量趋势。拒绝账单刺客。
*   **🔍 [成本控制中心](docs/cost-control-center_CN.md)**: 10 项自动化诊断，扫描使用数据、计算节省空间，一键应用优化。可降低 API 成本 30–90%。
*   **📜 记忆时间轴**: 浏览 Agent 的每日日志和长期记忆演变。
*   **🚀 任务控制台**: 查看 Cron 定时任务状态，并支持从手机端手动触发脚本、重启服务或终止进程。
*   **⚡ 零门槛远程**: 
    *   **自动端口**: 3000 被占用？自动切换到 3001。
    *   **智能网络**: 自动检测 **Tailscale/WireGuard**，优先使用内网穿透，安全第一。
    *   **快速通道**: 如果没有 VPN，自动通过 Cloudflare 生成临时公网链接，开箱即用。

## 🚀 安装

在您的 OpenClaw 服务器（Ubuntu/Debian）上运行这行命令：

```bash
curl -sL https://clawbridge.app/install.sh | bash
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
1.  前往 [Cloudflare Dash \> Networking \> Tunnels](https://dash.cloudflare.com/?to=/:account/tunnels) 创建一个 Tunnel 并获取 Token。
2.  使用 Token 运行安装脚本：
    ```bash
    cd skills/clawbridge
    ./install.sh --token=<YOUR_TOKEN>
    ```
    *   或者强制开启临时公网隧道：`./install.sh --force-cf`
3.  安装成功后，回到 Cloudflare 隧道的 **Public Hostname**（或 **Routes**）页面，点击 **Add a public hostname** 将您自己的域名绑定到 `localhost:3000` 即可实现永久的域名访问。

### 4. Docker 部署 (容器化)
您也可以通过 Docker 运行 ClawBridge。镜像每次正式发布时会自动被推送至 [GitHub Container Registry](https://github.com/dreamwing/clawbridge/pkgs/container/clawbridge)。
```bash
docker pull ghcr.io/dreamwing/clawbridge:latest
docker run -d --name clawbridge \
  -p 3000:3000 \
  -e ACCESS_KEY=您的安全密钥 \
  -e OPENCLAW_STATE_DIR=/openclaw \
  -e OPENCLAW_WORKSPACE=/openclaw/workspace \
  -v ~/.openclaw:/openclaw:ro \
  -v ./data:/app/data \
  ghcr.io/dreamwing/clawbridge:latest
```

## 📱 移动端 App (PWA)
1.  在 Safari (iOS) 或 Chrome (Android) 中打开 Dashboard。
2.  点击 "分享" -> "添加到主屏幕"。
3.  它将像原生 App 一样启动（全屏显示，无浏览器地址栏）。

## 🛠️ 技术栈
*   **后端**: Node.js (Express, WebSocket) - 轻量级 Sidecar 进程。
*   **前端**: Vanilla JS - 无需编译，秒开。
*   **穿透**: Cloudflared

## 鸣谢 (Credits)

特别感谢社区成员对 ClawBridge 的改进建议：
- [@yaochao](https://github.com/yaochao) 协助发现了关键的安全性漏洞与环境移植问题，并提出架构重构建议 (#1, #2, #3, #4, #5, #6, #7)。
- [@斯图超哥](https://x.com/StewartLi666) 提供关于 Linux 兼容性、IP 检测稳定性以及快速隧道刷新逻辑的反馈 (#12)。
- [@zjy4fun](https://github.com/zjy4fun) 感谢其在 修复工作区检测问题 (PR #22) 中的贡献与建议。
- [@chrisuhg](https://github.com/chrisuhg) 感谢其在 解决安装与授权重定向死循环 (Issue #19) 中的贡献与建议。
- [@ForceConstant](https://github.com/ForceConstant) 感谢其在 功能请求：版本化的 docker 镜像 (#24) 中的贡献与建议 (Issue #24)。

---
*MIT License. Built for the OpenClaw Community.*
