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
FORCE_CF=false

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
        --force-cf)
        FORCE_CF=true
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

# Allow custom service name via env var (for testing/parallel installs)
SERVICE_NAME=${CLAW_SERVICE_NAME:-clawbridge}

# Stop existing service if it exists (Safe stop)
systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true

# 2. Install Dependencies
echo "📦 Installing dependencies..."
npm install --production

# 3. Setup Config/Env
ENV_FILE="$APP_DIR/.env"
CURRENT_PORT=3000

# Load existing port preference
if [ -f "$ENV_FILE" ]; then
    # Read PORT manually to avoid sourcing entire file yet
    EXISTING_PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2)
    if [ ! -z "$EXISTING_PORT" ]; then CURRENT_PORT=$EXISTING_PORT; fi
fi

# Find available port
DETECTED_PORT=$(node -e "
const net = require('net');
let port = parseInt('$CURRENT_PORT') || 3000;
function check() {
  const s = net.createServer();
  s.once('error', () => { port++; check(); });
  s.once('listening', () => { s.close(); console.log(port); });
  s.listen(port);
}
check();
")

if [ "$DETECTED_PORT" != "$CURRENT_PORT" ]; then
    echo -e "${YELLOW}⚠️  Port $CURRENT_PORT is busy. Switching to available port: $DETECTED_PORT.${NC}"
fi

PORT=$DETECTED_PORT

if [ ! -f "$ENV_FILE" ]; then
    echo "⚙️ Generating .env file..."
    RAND_KEY=$(openssl rand -hex 16)
    echo "ACCESS_KEY=$RAND_KEY" > "$ENV_FILE"
    echo "PORT=$PORT" >> "$ENV_FILE"
    echo -e "${YELLOW}🔑 Generated Access Key: $RAND_KEY${NC}"
else
    echo "✅ Updating .env configuration..."
    # Update or Append PORT
    if grep -q "^PORT=" "$ENV_FILE"; then
        sed -i "s/^PORT=.*/PORT=$PORT/" "$ENV_FILE"
    else
        echo "PORT=$PORT" >> "$ENV_FILE"
    fi
    
    source "$ENV_FILE"
    if [ -z "$ACCESS_KEY" ]; then
        RAND_KEY=$(openssl rand -hex 16)
        echo "ACCESS_KEY=$RAND_KEY" >> "$ENV_FILE"
    else
        RAND_KEY=$ACCESS_KEY
    fi
fi

# 4. Setup Systemd (Root required for system-wide, but let's try user first)
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
USE_USER_SYSTEMD=true

if [ ! -d "$HOME/.config/systemd/user" ]; then
    mkdir -p "$HOME/.config/systemd/user"
fi

# Check if user dbus is active (common issue in bare VPS)
if ! systemctl --user list-units >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  User-level systemd not available. Generating standard systemd file...${NC}"
    USE_USER_SYSTEMD=false
    SERVICE_FILE="/tmp/${SERVICE_NAME}.service"
fi

NODE_PATH=$(which node)

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=ClawBridge Dashboard (${SERVICE_NAME})
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
    echo "🚀 Enabling User Service ($SERVICE_NAME)..."
    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME"
    systemctl --user restart "$SERVICE_NAME"
    echo -e "${GREEN}✅ Service started!${NC}"
else
    echo -e "${YELLOW}👉 Please run the following command with sudo to install the service:${NC}"
    echo "sudo mv $SERVICE_FILE /etc/systemd/system/${SERVICE_NAME}.service"
    echo "sudo systemctl daemon-reload"
    echo "sudo systemctl enable ${SERVICE_NAME}"
    echo "sudo systemctl start ${SERVICE_NAME}"
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

# Detect VPN interfaces
USE_VPN=false
VPN_IP=""
VPN_TYPE=""

if ip addr show tailscale0 >/dev/null 2>&1; then
    VPN_IP=$(ip -4 addr show tailscale0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
    if [ ! -z "$VPN_IP" ]; then
        USE_VPN=true
        VPN_TYPE="Tailscale"
    fi
elif ip addr show wg0 >/dev/null 2>&1; then
    VPN_IP=$(ip -4 addr show wg0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
    if [ ! -z "$VPN_IP" ]; then
        USE_VPN=true
        VPN_TYPE="WireGuard"
    fi
fi

if [[ "$ENABLE_TUNNEL" =~ ^[Yy]$ ]] || [ "$USE_VPN" = true ]; then
    # Logic:
    # 1. If VPN found AND NOT forced -> Skip cloudflared download/setup. Just use VPN IP.
    # 2. If NO VPN OR Forced -> Do Cloudflare logic.
    
    if [ "$USE_VPN" = true ] && [ -z "$TOKEN" ] && [ "$FORCE_CF" = false ]; then
        echo -e "🔒 ${VPN_TYPE} detected ($VPN_IP). Skipping Cloudflare Tunnel."
        echo -e "💡 To force Cloudflare anyway, run: ./install.sh --force-cf"
        ENABLE_TUNNEL="n"
        # Clear any existing tunnel config
        sed -i '/TUNNEL_TOKEN=/d' "$ENV_FILE"
        sed -i '/ENABLE_EMBEDDED_TUNNEL=/d' "$ENV_FILE"
    else
        # Normal Cloudflare Logic
        if [ "$FORCE_CF" = true ]; then
            echo "🌊 --force-cf flag detected. Enabling Cloudflare Tunnel (ignoring VPN)."
            ENABLE_TUNNEL="y"
        fi

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

        # If no token and NOT quick mode, ask for it
    if [ -z "$CF_TOKEN" ] && [ "$QUICK_TUNNEL" = false ] && [ "$FORCE_CF" = false ]; then
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
        # ONLY enable if we decided to enable tunnel (i.e. not VPN mode)
        if [ "$ENABLE_TUNNEL" == "y" ]; then
            echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
            echo "🌊 Quick Tunnel configured."
        fi
    fi
        
    # Restart service to pick up new env
    if [ "$USE_USER_SYSTEMD" = true ]; then
        # Ensure we don't have a zombie process holding the port
        pkill -f "node index.js" || true
        systemctl --user restart "$SERVICE_NAME"
    fi
fi

# 6. Summary
IP=$(hostname -I | awk '{print $1}')
PORT=${PORT:-3000}
echo -e "\n${GREEN}🎉 Installation Complete!${NC}"
echo -e "📱 Local Access: ${BLUE}http://$IP:$PORT/?key=$RAND_KEY${NC}"

if [ "$USE_VPN" = true ]; then
    echo -e "🔒 ${VPN_TYPE} Access: ${BLUE}http://$VPN_IP:$PORT/?key=$RAND_KEY${NC}"
    echo -e "   (Accessible via your ${VPN_TYPE} network)"
fi

# If Quick Tunnel, try to fetch the URL from the file generated by node
if [ "$QUICK_TUNNEL" = true ] || [ -z "$CF_TOKEN" ]; then
    # ONLY if VPN is NOT used OR Force CF is enabled
    if [ "$USE_VPN" = false ] || [ "$FORCE_CF" = true ]; then
        echo "⏳ Waiting for Quick Tunnel URL (max 20s)..."
        
        # Loop wait for 20s
        for i in {1..20}; do
            if [ -f "$APP_DIR/.quick_tunnel_url" ]; then
                QURL=$(cat "$APP_DIR/.quick_tunnel_url")
                echo -e "\n${GREEN}🚀 ClawBridge Dashboard Live:${NC}"
                echo -e "👉 ${BLUE}${QURL}/?key=$RAND_KEY${NC}"
                echo -e "⚠️  Note: This link expires if the dashboard restarts."
                break
            fi
            sleep 1
            echo -n "."
        done
        
        if [ ! -f "$APP_DIR/.quick_tunnel_url" ]; then
            echo -e "\n${YELLOW}⚠️  URL not ready yet. Check logs later: journalctl --user -u ${SERVICE_NAME} -f${NC}"
        fi
    fi
fi

# 7. Initialize Analytics (Cold Start Fix)
echo -e "\n📊 Initializing data analytics..."
"$NODE_PATH" "$APP_DIR/scripts/analyze.js" >/dev/null 2>&1 || true

echo -e "🔑 Secret Key: $RAND_KEY"
