<div align="center">
  <img src="public/app-icon.png" width="100" alt="ClawBridge Logo" />
  <h1>ClawBridge Dashboard</h1>
  <p><strong>Mobile-First Mission Control for OpenClaw Agents.</strong></p>

  <a href="https://clawbridge.app">
    <img src="https://img.shields.io/badge/Website-clawbridge.app-blue?style=for-the-badge" alt="Website" />
  </a>
  <a href="https://github.com/openclaw/openclaw">
    <img src="https://img.shields.io/badge/OpenClaw-Compatible-success?style=for-the-badge" alt="OpenClaw" />
  </a>
  
  <br/><br/>
  [ <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a> ]
</div>

---

**ClawBridge** turns your OpenClaw agent into a pocket-sized companion. Monitor real-time thoughts, track token costs, and manage missions from anywhere—securely and instantly.

## ✨ Key Features

*   **🧠 Live Activity Feed**: Watch your agent "think" and execute tools in real-time. Features intelligent parallel logging (no missed background tasks) and deduplication.
*   **💰 Token Economy**: Track daily/monthly LLM costs and usage trends. Know exactly where your money goes.
*   **📜 Memory Timeline**: Browse your agent's daily logs and long-term memory evolution.
*   **🚀 Mission Control**: View status of Cron jobs and manually trigger scripts from your phone.
*   **⚡ Zero-Friction Install**: 
    *   **Auto-Port**: Automatically finds an available port if 3000 is busy.
    *   **Smart Networking**: Auto-detects **Tailscale/WireGuard** for direct secure access.
    *   **Quick Tunnel**: If no VPN is found, auto-generates a temporary public URL via Cloudflare (Zero Config).

## 🚀 Installation

Run this one-liner on your OpenClaw server (Ubuntu/Debian):

```bash
curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge-openclaw-mobile-dashboard/master/setup.sh | bash
```

That's it. The script will:
1.  Detect your environment (VPN or Public).
2.  Generate a secure Access Key.
3.  Give you a ready-to-use URL.

## 📱 Usage

### 1. Zero-Config Access (Default)
If you just want to try it out, the installer provides a **Quick Tunnel** URL:
`https://<random-name>.trycloudflare.com/?key=<YOUR_KEY>`

*   **Pros**: Instant access from anywhere.
*   **Cons**: URL changes if you restart the service.

### 2. VPN Direct Access (Privacy First)
If **Tailscale** or **WireGuard** is detected, the installer skips the public tunnel and gives you a private link:
`http://<VPN_IP>:3000/?key=<YOUR_KEY>`

*   **Pros**: Fastest speed, maximum privacy.
*   **Cons**: Your phone must be connected to the VPN.

### 3. Permanent Public Domain (Advanced)
Want a fixed URL like `dash.yoursite.com`?
1.  Obtain a **Cloudflare Tunnel Token** from the Zero Trust Dashboard.
2.  Run the installer with the token:
    ```bash
    cd skills/clawbridge-dashboard
    ./install.sh --token=<YOUR_TOKEN>
    ```
    *   Or force a new Quick Tunnel: `./install.sh --force-cf`

## 🛠️ Tech Stack
*   **Backend**: Node.js (Express, WebSocket) - Lightweight sidecar process.
*   **Frontend**: Vanilla JS - Zero build step, instant load.
*   **Security**: Token-based auth, optional Cloudflare Tunnel.

---
*MIT License. Built for the OpenClaw Community.*
