# ClawBridge Dashboard 🌉

**🇺🇸 English** | [🇨🇳 中文](./README_CN.md)

**ClawBridge** is a lightweight, real-time mission control center designed for **Clawdbot** and **OpenClaw** agents.

It provides a mobile-friendly interface to monitor your AI agent's "brain" (thinking process), "hands" (tool execution), "wallet" (token usage), and "schedule" (cron jobs) form anywhere via a secure Cloudflare Tunnel.

## ✨ Features

*   **👁️ The All-Seeing Eye**: Real-time feed of AI thoughts (`🧠`), tools (`🔧`), and file changes (`📄`).
*   **💰 Token Economy**: Track daily costs and model usage breakdown.
*   **🎮 Mission Control**: Monitor and trigger Cron jobs.
*   **🛡️ Enterprise Stability**: Systemd auto-healing and secure Magic Link access.

---

## 🛠️ Installation

### 1. Clone & Install
```bash
cd /root/clawd/skills
git clone https://github.com/dreamwing/clawbridge-openclaw-mobile-dashboard.git clawbridge-dashboard
cd clawbridge-dashboard
npm install
```

### 2. Configuration
Copy the example config and edit it:

```bash
cp .env.example .env
nano .env
```

**How to get `TUNNEL_TOKEN`:**
1.  Go to **[Cloudflare Zero Trust](https://one.dash.cloudflare.com/)** -> **Networks** -> **Tunnels**.
2.  Click **Create a tunnel**.
3.  Choose **Cloudflared** as the connector.
4.  Name it (e.g., `clawbridge`) -> Save.
5.  In the "Install and run a connector" section, look at the command.
6.  Copy the long string after `--token`. It starts with `eyJh...`.
    *   *Example*: `cloudflared service install eyJhIjoi...` -> Copy `eyJhIjoi...`

### 3. Deploy via Systemd (Recommended)

We provide template files (`.service`) in the repository.

1.  **Edit the service files** to match your actual paths (`User`, `WorkingDirectory`, `ExecStart`).
2.  **Paste your Token** into `clawbridge-tunnel.service` (replace `<YOUR_TOKEN_HERE>`).

```bash
# Copy to systemd directory
cp clawbridge-dashboard.service /etc/systemd/system/
cp clawbridge-tunnel.service /etc/systemd/system/

# Reload and Start
systemctl daemon-reload
systemctl enable --now clawbridge-dashboard
systemctl enable --now clawbridge-tunnel
```

---

## 🌐 Domain Setup

1.  Go back to **Cloudflare Tunnel** configuration page.
2.  Click **Public Hostname** tab -> **Add a public hostname**.
3.  **Subdomain**: e.g., `captain-deck` (Use dashes for free SSL compatibility).
4.  **Domain**: Select your domain (e.g., `clawbridge.app`).
5.  **Service**: `HTTP` -> `localhost:3000`.
6.  Save.

### Accessing the Dashboard
Visit your URL with the key you set in `.env`:

**URL**: `https://<your-subdomain>.<your-domain>/?key=<ACCESS_KEY>`

*Example*: `https://captain-deck.clawbridge.app/?key=my-secret-password`

---

## 📄 License
MIT License. Created by [DreamWing](https://github.com/dreamwing).
