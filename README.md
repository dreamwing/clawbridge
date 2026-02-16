# ClawBridge 🌉

> **The Missing Mobile Link for OpenClaw/Clawdbot Agents.**

ClawBridge is a lightweight, mobile-first dashboard designed to run alongside your **Clawdbot** instance. It provides real-time monitoring, cost tracking, and task management from any device.

![ClawBridge Preview](https://github.com/dreamwing/clawbridge-openclaw-mobile-dashboard/raw/master/public/icon.svg)

## ✨ Features

*   **📱 Mobile-First App Shell**: Native-like experience with PWA support (Add to Home Screen).
*   **🩺 System Vitals**: Real-time CPU & Memory usage monitoring.
*   **📜 Live Activity Feed**: Watch your agent "think" and execute tools in real-time.
*   **💰 Token Economy**: Track spending (Input/Output cost) with daily trends and monthly forecasts. Supports 340+ models via OpenRouter pricing.
*   **🚀 Mission Control**: View and manually trigger Cron jobs safely.
*   **🛡️ Secure**: Token-based Magic Link authentication. No external dependencies.

## 🚀 Quick Start (Install Script)

The easiest way to install or update ClawBridge.

1.  **Run the installer**:
    ```bash
    curl -fsSL https://raw.githubusercontent.com/dreamwing/clawbridge-openclaw-mobile-dashboard/master/install.sh | bash
    ```

2.  **Access**: The script will output a magic URL (e.g., `http://YOUR_IP:3000/?key=...`). Open this on your phone.

## ⚙️ Manual Installation

If you prefer to set it up yourself:

1.  **Clone the repo**:
    ```bash
    git clone https://github.com/dreamwing/clawbridge-openclaw-mobile-dashboard.git
    cd clawbridge-openclaw-mobile-dashboard
    ```

2.  **Install dependencies**:
    ```bash
    npm install --production
    ```

3.  **Configure**:
    Create a `.env` file:
    ```bash
    ACCESS_KEY=your_secret_password_here
    PORT=3000
    ```

4.  **Run**:
    ```bash
    node index.js
    ```

## 🧩 Configuration

### Custom Model Pricing
ClawBridge comes with a comprehensive pricing list (`data/config/pricing.sample.json`). To customize rates:

1.  Copy the sample to the active config:
    ```bash
    cp data/config/pricing.sample.json data/config/pricing.json
    ```
2.  Edit `data/config/pricing.json`. Keys match the model names in your logs (e.g., `openai/gpt-4o`).

### PWA (Add to Home Screen)
1.  Open ClawBridge in Safari (iOS) or Chrome (Android).
2.  Tap **Share** -> **Add to Home Screen**.
3.  Launch it like a native app (full screen, no address bar).

## 🔒 Security Note
*   ClawBridge runs locally on your server.
*   Data is stored in `data/` and is **NOT** uploaded to any cloud.
*   Ensure your firewall allows traffic on Port 3000 (or use a Tunnel).

## License
MIT
