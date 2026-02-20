#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== ClawBridge Dashboard Installer ===${NC}"

# 1. Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js v18+ first."
    exit 1
fi

APP_DIR=$(pwd)
echo -e "${GREEN}📂 Installing in: $APP_DIR${NC}"

# 2. Install Dependencies
echo "📦 Installing dependencies..."
npm install --production

# 3. Setup Config/Env
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "⚙️ Generating .env file..."
    # Generate random key
    RAND_KEY=$(openssl rand -hex 16)
    echo "ACCESS_KEY=$RAND_KEY" > "$ENV_FILE"
    echo "PORT=3000" >> "$ENV_FILE"
    echo -e "${YELLOW}🔑 Generated Access Key: $RAND_KEY${NC}"
else
    echo "✅ Existing .env found."
    source "$ENV_FILE"
    RAND_KEY=$ACCESS_KEY
fi

# 4. Setup Systemd (Root required for system-wide, but let's try user first)
SERVICE_FILE="$HOME/.config/systemd/user/clawbridge.service"
USE_USER_SYSTEMD=true

if [ ! -d "$HOME/.config/systemd/user" ]; then
    mkdir -p "$HOME/.config/systemd/user"
fi

# Check if user dbus is active (common issue in bare VPS)
if ! systemctl --user list-units >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  User-level systemd not available. Generating standard systemd file...${NC}"
    USE_USER_SYSTEMD=false
    SERVICE_FILE="/tmp/clawbridge.service"
fi

NODE_PATH=$(which node)

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=ClawBridge Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_PATH index.js
Restart=always
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=default.target
EOF

echo "📝 Service file created at: $SERVICE_FILE"

if [ "$USE_USER_SYSTEMD" = true ]; then
    echo "🚀 Enabling User Service..."
    systemctl --user daemon-reload
    systemctl --user enable clawbridge
    systemctl --user restart clawbridge
    echo -e "${GREEN}✅ Service started!${NC}"
else
    echo -e "${YELLOW}👉 Please run the following command with sudo to install the service:${NC}"
    echo "sudo mv $SERVICE_FILE /etc/systemd/system/clawbridge.service"
    echo "sudo systemctl daemon-reload"
    echo "sudo systemctl enable clawbridge"
    echo "sudo systemctl start clawbridge"
fi

# 5. Remote Access (Cloudflare Tunnel)
echo -e "\n${BLUE}🌐 Remote Access Configuration${NC}"
read -p "Do you want to expose this dashboard to the public internet via Cloudflare Tunnel? (y/N) " ENABLE_TUNNEL

if [[ "$ENABLE_TUNNEL" =~ ^[Yy]$ ]]; then
    if ! command -v cloudflared &> /dev/null; then
        echo "⬇️ Downloading cloudflared..."
        # Detect arch
        ARCH=$(uname -m)
        if [[ "$ARCH" == "x86_64" ]]; then
            wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
        elif [[ "$ARCH" == "aarch64" ]]; then
            wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -O cloudflared
        else
            echo "❌ Architecture $ARCH not supported for auto-download."
            exit 1
        fi
        chmod +x cloudflared
    fi

    echo -e "${YELLOW}👉 Run this command to login to Cloudflare (in a separate terminal):${NC}"
    echo "   ./cloudflared tunnel login"
    echo -e "   Then create a tunnel: ./cloudflared tunnel create clawbridge"
    echo -e "   Then add token to .env: TUNNEL_TOKEN=..."
    
    # We can't fully automate this without user interaction or token paste.
    # Let's offer the "Quick Tunnel" (TryCloudflare) option for instant testing?
    # Actually, Quick Tunnels don't require login but URL changes every time.
    # Let's ask for token paste if they have one.
    
    read -p "Paste your Cloudflare Tunnel Token (or press Enter to skip): " CF_TOKEN
    if [ ! -z "$CF_TOKEN" ]; then
        echo "TUNNEL_TOKEN=$CF_TOKEN" >> "$ENV_FILE"
        echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
        
        echo -e "\n${BLUE}🔗 Public Domain Configuration${NC}"
        echo "If you have mapped a domain (e.g. dash.mysite.com) to this tunnel in Cloudflare Zero Trust,"
        read -p "Enter it here to display in the dashboard (optional): " CF_DOMAIN
        
        if [ ! -z "$CF_DOMAIN" ]; then
             echo "APP_DOMAIN=$CF_DOMAIN" >> "$ENV_FILE"
        fi
        
        echo "✅ Remote access configured."
        
        # Restart service to pick up new env
        if [ "$USE_USER_SYSTEMD" = true ]; then
            systemctl --user restart clawbridge
        fi
    fi
fi

# 6. Summary
IP=$(hostname -I | awk '{print $1}')
PORT=${PORT:-3000}
echo -e "\n${GREEN}🎉 Installation Complete!${NC}"
echo -e "📱 Dashboard URL: ${BLUE}http://$IP:$PORT/?key=$RAND_KEY${NC}"
echo -e "⚠️  Save this URL! It contains your secret access key."
