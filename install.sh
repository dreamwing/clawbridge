#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== ClawBridge Dashboard Installer ===${NC}"

# Parse Args
TOKEN=""
NO_TUNNEL=false
QUICK_TUNNEL=false

for arg in "$@"
do
    case $arg in
        --token=*)
        TOKEN="${arg#*=}"
        shift
        ;;
        --no-tunnel)
        NO_TUNNEL=true
        shift
        ;;
        --quick)
        QUICK_TUNNEL=true
        shift
        ;;
    esac
done

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

# Logic:
# If --token is provided, use it directly (Non-Interactive).
# If --no-tunnel is provided, skip (Non-Interactive).
# Else, ask user (Interactive).

ENABLE_TUNNEL="n"

if [ ! -z "$TOKEN" ]; then
    echo "✅ Token provided via argument. Configuring tunnel..."
    CF_TOKEN="$TOKEN"
    ENABLE_TUNNEL="y"
elif [ "$NO_TUNNEL" = true ]; then
    echo "ℹ️ --no-tunnel flag detected. Skipping tunnel setup."
    ENABLE_TUNNEL="n"
elif [ "$QUICK_TUNNEL" = true ]; then
    echo "🌊 --quick flag detected. Enabling Quick Tunnel (Temporary URL)."
    ENABLE_TUNNEL="y"
    CF_TOKEN="" # Ensure empty for Quick mode
else
    # Interactive fallback
    read -p "Do you want to expose this dashboard to the public internet via Cloudflare Tunnel? (y/N) " ENABLE_TUNNEL
fi

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

    # Interactive: If no token and NOT quick mode, ask for it
    if [ -z "$CF_TOKEN" ] && [ "$QUICK_TUNNEL" = false ]; then
        echo -e "${YELLOW}👉 Run this command to login to Cloudflare (in a separate terminal):${NC}"
        echo "   ./cloudflared tunnel login"
        echo -e "   Then create a tunnel: ./cloudflared tunnel create clawbridge"
        echo -e "   Then add token to .env: TUNNEL_TOKEN=..."
        
        read -p "Paste your Cloudflare Tunnel Token (or press Enter to skip for Quick Tunnel): " CF_TOKEN
    fi

    # Write Config
    # Clean old
    sed -i '/TUNNEL_TOKEN=/d' "$ENV_FILE"
    sed -i '/ENABLE_EMBEDDED_TUNNEL=/d' "$ENV_FILE"
    
    if [ ! -z "$CF_TOKEN" ]; then
        echo "TUNNEL_TOKEN=$CF_TOKEN" >> "$ENV_FILE"
        echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
        echo "✅ Permanent Tunnel configured."
    else
        # Quick Tunnel Mode (No Token)
        echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
        echo "🌊 Quick Tunnel configured."
    fi
        
    # Restart service to pick up new env
    if [ "$USE_USER_SYSTEMD" = true ]; then
        systemctl --user restart clawbridge
    fi
fi

# 6. Summary
IP=$(hostname -I | awk '{print $1}')
PORT=${PORT:-3000}
echo -e "\n${GREEN}🎉 Installation Complete!${NC}"
echo -e "📱 Local Access: ${BLUE}http://$IP:$PORT/?key=$RAND_KEY${NC}"

# If Quick Tunnel, try to fetch the URL from the file generated by node
if [ "$QUICK_TUNNEL" = true ] || [ -z "$CF_TOKEN" ]; then
    echo "⏳ Waiting for Quick Tunnel URL (max 10s)..."
    sleep 5 # Wait for node process to start and generate URL
    QUICK_URL_FILE="$APP_DIR/.quick_tunnel_url"
    if [ -f "$QUICK_URL_FILE" ]; then
        QURL=$(cat "$QUICK_URL_FILE")
        echo -e "🌐 ${YELLOW}Temporary Magic Link: ${QURL}/?key=$RAND_KEY${NC}"
        echo -e "⚠️  Note: This link expires if the dashboard restarts."
    fi
fi

echo -e "🔑 Secret Key: $RAND_KEY"

