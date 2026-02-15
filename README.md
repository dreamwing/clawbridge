# ClawBridge Dashboard 🌉

**ClawBridge** (formerly ClawLink) is a lightweight, real-time mission control center designed for **Clawdbot** and **OpenClaw** agents.

It provides a mobile-friendly interface to monitor your AI agent's "brain" (thinking process), "hands" (tool execution), "wallet" (token usage), and "schedule" (cron jobs) form anywhere via a secure Cloudflare Tunnel.

![Dashboard Preview](https://via.placeholder.com/800x400?text=ClawBridge+Dashboard+Preview)

## ✨ Features

### 👁️ The All-Seeing Eye (Real-time Feed)
- **Mind Reading**: See exactly what your agent is thinking (`🧠 Thinking...`).
- **Tool Inspection**: Watch live tool executions (`🔧 grep`, `🔧 web_search`).
- **File Watcher**: Get notified when files are created (`📄`) or modified (`📝`).
- **Process Monitor**: Detects background scripts (`📜`) and high CPU usage (`⚡`).
- **Persistent History**: Auto-saves activity logs so you can review past actions.

### 💰 Token Economy
- **Cost Tracking**: Real-time calculation of Input/Output tokens and USD costs.
- **Trend Chart**: 7-day visual history of your AI spending.
- **Model Breakdown**: See which models (Gemini, Claude, DeepSeek) are costing the most.
- **Drill-down**: Click on any day to see detailed stats.

### 🎮 Mission Control (Cron)
- **Live Status**: View all scheduled Clawdbot tasks.
- **Next Run Predictor**: Countdown to the next execution (e.g., `🔜 14:05 (in 45m)`).
- **Manual Trigger**: Force run any task immediately with a single tap.
- **Health Check**: Visual Red/Green indicators for task success/failure.

### 🛡️ Enterprise-Grade Stability
- **Secure Access**: Magic Link authentication (no passwords, key-based).
- **Auto-Healing**: Systemd services ensure the dashboard and tunnel auto-restart on failure.
- **Zero-Config Tunnel**: Built-in Cloudflare Tunnel management.

---

## 🛠️ Installation

### 1. Clone & Install
Clone this repository into your Clawdbot skills directory:

```bash
cd /root/clawd/skills
git clone https://github.com/dreamwing/clawbridge-openclaw-mobile-dashboard.git clawbridge-dashboard
cd clawbridge-dashboard
npm install
```

### 2. Configuration
Create a `.env` file in the project root:

```ini
# Access Key for Magic Link (e.g., ?key=mysecret)
ACCESS_KEY=your_secret_key_here

# Cloudflare Tunnel Token (Get this from Zero Trust Dashboard)
TUNNEL_TOKEN=eyJhIjoi...

# Set to true if you want Node to manage the tunnel (Not recommended if using Systemd)
ENABLE_EMBEDDED_TUNNEL=false
```

### 3. Deploy via Systemd (Recommended)
Use Systemd to keep both the Dashboard and the Tunnel alive forever.

**A. Dashboard Service (`/etc/systemd/system/clawbridge-dashboard.service`)**
```ini
[Unit]
Description=ClawBridge Dashboard Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/clawd/skills/clawbridge-dashboard
ExecStart=/root/.nvm/versions/node/v22.22.0/bin/node index.js
EnvironmentFile=/root/clawd/skills/clawbridge-dashboard/.env
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**B. Tunnel Service (`/etc/systemd/system/clawbridge-tunnel.service`)**
```ini
[Unit]
Description=ClawBridge Tunnel (Cloudflared)
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/clawd/skills/clawbridge-dashboard/cloudflared tunnel run --token <YOUR_TOKEN_HERE>
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**C. Start Services**
```bash
systemctl daemon-reload
systemctl enable --now clawbridge-dashboard
systemctl enable --now clawbridge-tunnel
```

---

## 📱 Usage

Access your dashboard via your custom Cloudflare Tunnel domain with the magic key:

**URL**: `https://<user-id>.deck.clawbridge.app/?key=<ACCESS_KEY>`

Example: `https://captain.deck.clawbridge.app/?key=claw2026`

- **First Visit**: The key is saved to LocalStorage.
- **Subsequent Visits**: You can just visit `https://captain.deck.clawbridge.app`.

---

## 🏗️ Architecture

- **Backend**: Node.js + Express.
    - Monitors `ps` processes.
    - Parses Clawdbot `sessions.json` and `.jsonl` logs.
    - Manages persistence in `public/*.json`.
- **Frontend**: Vanilla HTML/JS/CSS (Single File).
    - Responsive design for Mobile/Desktop.
    - WebSocket/Polling for real-time updates.
- **Tunnel**: `cloudflared` (Linux amd64).

## 📄 License

MIT License. Created by [DreamWing](https://github.com/dreamwing).
