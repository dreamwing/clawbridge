#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== ClawBridge Dashboard Installer ===${NC}"

# OS Detection
OS_TYPE=$(uname -s)
if [ "$OS_TYPE" = "Darwin" ]; then
    sed_inplace() { sed -i '' "$@"; }
else
    sed_inplace() { sed -i "$@"; }
fi

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

# ---- Canonical label（單一事實來源；避免 com.dreamwing.* 字面值散落各處）----
SERVICE_LABEL="com.dreamwing.${SERVICE_NAME}"
VENDOR_PLIST="$HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
SERVICE_LOG="/tmp/${SERVICE_LABEL}.log"
SERVICE_ERR="/tmp/${SERVICE_LABEL}.err"

# ---- launchd 重複載入防護（避免與 OpenClaw 管理的 label 搶同一 port）----
# 本 App 可能已被另一個 launchd label 接管（OpenClaw 預設使用 ai.openclaw.<service>）。
# 若該 label 已在 launchctl 中，setup.sh 不得再建立/載入自己的 User LaunchAgent，
# 否則該 plist 下次登入會被自動載入，與前者搶同一 port（EADDRINUSE）。
# 需要略過此防護時，設定 CLAW_SUPERVISED_LAUNCHD_LABEL="" 即可。
SUPERVISED_LAUNCHD_LABEL="${CLAW_SUPERVISED_LAUNCHD_LABEL-ai.openclaw.${SERVICE_NAME}}"

# 判斷某 launchd label 目前是否已被載入
launchd_label_active() {
    launchctl list 2>/dev/null | awk '{print $3}' | grep -qx "$1"
}

# 本服務是否已被外部 launchd supervisor 接管
clawbridge_supervised() {
    [ "$OS_TYPE" = "Darwin" ] || return 1
    launchd_label_active "$SUPERVISED_LAUNCHD_LABEL"
}

# 本服務是否「實際上」正在運行
# 判定順序：先看自己的 canonical label，再看是否由 supervisor label 接管。
# 兩者都沒載入 => 服務沒在跑（不能只看 plist 檔案存在就當作在跑）。
canonical_service_running() {
    [ "$OS_TYPE" = "Darwin" ] || return 1
    launchd_label_active "$SERVICE_LABEL" && return 0
    if [ -n "$SUPERVISED_LAUNCHD_LABEL" ] && launchd_label_active "$SUPERVISED_LAUNCHD_LABEL"; then
        return 0
    fi
    return 1
}

# 取得佔用指定 port 的 PID 清單
_port_pids() {
    _p="$1"
    [ -n "$_p" ] || return 0
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti "tcp:$_p" 2>/dev/null
    elif command -v fuser >/dev/null 2>&1; then
        fuser -n tcp "$_p" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$'
    else
        ss -lptn "sport = :$_p" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2
    fi
}

# 精準停止佔用指定 port 的行程
# 取代原本的 pkill -f "node index.js"：後者會誤殺所有 node index.js 行程
# （包含其他 App 的同名 process），造成非預期的服務中斷。
stop_port_process() {
    _port="$1"
    [ -n "$_port" ] || return 0
    _pids=$(_port_pids "$_port" | sort -u)
    if [ -z "$_pids" ]; then
        return 0
    fi
    for _pid in $_pids; do
        _cmd=$(ps -o command= -p "$_pid" 2>/dev/null)
        case "$_cmd" in
            *node*)
                if kill "$_pid" 2>/dev/null; then
                    echo "🛑  已停止 port $_port 的行程 PID $_pid"
                fi
                ;;
            *)
                echo "⚠️  port $_port 由非 node 行程 PID $_pid 佔用（$_cmd），略過不殺"
                ;;
        esac
    done
    sleep 1
    # 仍未釋放則強制結束（僅限 node 行程）
    for _pid in $(_port_pids "$_port" | sort -u); do
        _cmd=$(ps -o command= -p "$_pid" 2>/dev/null)
        case "$_cmd" in
            *node*)
                kill -9 "$_pid" 2>/dev/null && echo "💥  已強制停止 port $_port 的行程 PID $_pid"
                ;;
        esac
    done
    return 0
}

# 停用殘留的 vendor plist：單純 unload 不夠，
# 檔案留在 ~/Library/LaunchAgents 下次登入仍會被自動載入（改名 .disabled 即可停止載入）
retire_vendor_plist() {
    _plist="$1"
    [ -f "$_plist" ] || return 0
    if mv "$_plist" "${_plist}.disabled" 2>/dev/null; then
        echo "🗄️  已停用殘留 plist：$_plist → ${_plist}.disabled（下次登入不會再被自動載入）"
    else
        echo "⚠️  無法停用殘留 plist：$_plist（請手動移出 ~/Library/LaunchAgents）"
    fi
}

# Stop existing service if it exists (Safe stop)
if [ "$OS_TYPE" = "Darwin" ]; then
    launchctl unload "$VENDOR_PLIST" >/dev/null 2>&1 || true
    # 若已由其他 launchd label 接管，順手把殘留的 vendor plist 移出 LaunchAgents，避免下次登入復活
    if clawbridge_supervised; then
        retire_vendor_plist "$VENDOR_PLIST"
    fi
else
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    if command -v systemctl &> /dev/null; then
        systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    fi
fi

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
        sed_inplace "s/^PORT=.*/PORT=$PORT/" "$ENV_FILE"
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

# 3b. Auto-detect OPENCLAW_PATH
DETECTED_OPENCLAW=""
if command -v openclaw &> /dev/null; then
    DETECTED_OPENCLAW=$(which openclaw)
else
    # Look in the same bin directory as Node.js
    NODE_BIN_DIR=$(dirname "$(which node)" 2>/dev/null)
    if [ -x "$NODE_BIN_DIR/openclaw" ]; then
        DETECTED_OPENCLAW="$NODE_BIN_DIR/openclaw"
    fi
fi

if [ ! -z "$DETECTED_OPENCLAW" ]; then
    echo "🔍 Detected openclaw at: $DETECTED_OPENCLAW"
    # Update or append OPENCLAW_PATH
    sed_inplace '/OPENCLAW_PATH=/d' "$ENV_FILE"
    echo "OPENCLAW_PATH=$DETECTED_OPENCLAW" >> "$ENV_FILE"
fi

# 4. Setup Service
NODE_PATH=$(which node)

if [ "$OS_TYPE" = "Darwin" ]; then
    # macOS launchd setup
    SERVICE_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$SERVICE_DIR"
    SERVICE_FILE="$SERVICE_DIR/${SERVICE_LABEL}.plist"

    # 若已有其他 launchd label 接管本服務（如 OpenClaw 管理的 ai.openclaw.<service>），
    # 就不再建立/載入自己的 User LaunchAgent，避免兩者搶同一 port。
    if clawbridge_supervised; then
        echo "ℹ️  已偵測到 launchd label「$SUPERVISED_LAUNCHD_LABEL」正在管理本服務。"
        echo "    略過建立 ${SERVICE_LABEL}.plist，改由 ${SUPERVISED_LAUNCHD_LABEL} 負責啟動。"
        retire_vendor_plist "$SERVICE_FILE"
        SERVICE_FILE=""
    fi

    if [ -n "$SERVICE_FILE" ]; then
    
    cat > "$SERVICE_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$APP_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PATH</key>
        <string>$PATH</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$SERVICE_LOG</string>
    <key>StandardErrorPath</key>
    <string>$SERVICE_ERR</string>
</dict>
</plist>
EOF
    
    echo "📝 Service file created at: $SERVICE_FILE"
    echo "🚀 Loading macOS Launch Agent (${SERVICE_LABEL})..."
    launchctl load -w "$SERVICE_FILE" >/dev/null 2>&1 || true
    # If already loaded and we just want to restart:
    launchctl unload "$SERVICE_FILE" >/dev/null 2>&1 || true
    launchctl load -w "$SERVICE_FILE"
    echo -e "${GREEN}✅ Service started!${NC}"
    fi

else
    # Linux systemd setup
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
Environment=PATH=$PATH
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

if [ "$OS_TYPE" != "Darwin" ]; then
    # VPN detection (Linux only — macOS uses different interface names)
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
else
    # macOS VPN detection via ifconfig
    if ifconfig utun0 >/dev/null 2>&1; then
        VPN_IP=$(ifconfig utun0 | grep "inet " | awk '{print $2}')
        if [ ! -z "$VPN_IP" ]; then
            USE_VPN=true
            VPN_TYPE="Tailscale"
        fi
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
        sed_inplace '/TUNNEL_TOKEN=/d' "$ENV_FILE"
        sed_inplace '/ENABLE_EMBEDDED_TUNNEL=/d' "$ENV_FILE"
    else
        # Normal Cloudflare Logic
        if [ "$FORCE_CF" = true ]; then
            echo "🌊 --force-cf flag detected. Enabling Cloudflare Tunnel (ignoring VPN)."
            ENABLE_TUNNEL="y"
        fi

        if ! command -v cloudflared &> /dev/null; then
            echo "⬇️ Downloading cloudflared..."
            
            # Helper function to download securely
            download_file() {
                local TARGET_URL=$1
                local TARGET_FILE=$2
                if command -v curl &> /dev/null; then
                    curl -sL "$TARGET_URL" -o "$TARGET_FILE"
                elif command -v wget &> /dev/null; then
                    wget -q "$TARGET_URL" -O "$TARGET_FILE"
                else
                    echo "❌ Neither curl nor wget found. Please install one sequence."
                    exit 1
                fi
            }

            # Detect arch
            ARCH=$(uname -m)
            if [ "$OS_TYPE" = "Darwin" ]; then
                if [[ "$ARCH" == "x86_64" ]] || [[ "$ARCH" == "amd64" ]]; then
                    download_file "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" "cloudflared.tgz"
                    tar -xzf cloudflared.tgz && rm cloudflared.tgz
                elif [[ "$ARCH" == "arm64" ]] || [[ "$ARCH" == "aarch64" ]]; then
                    download_file "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" "cloudflared.tgz"
                    tar -xzf cloudflared.tgz && rm cloudflared.tgz
                else
                    echo "❌ Architecture $ARCH not supported for macOS auto-download."
                    exit 1
                fi
            else
                if [[ "$ARCH" == "x86_64" ]]; then
                    download_file "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" "cloudflared"
                elif [[ "$ARCH" == "aarch64" ]]; then
                    download_file "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" "cloudflared"
                else
                    echo "❌ Architecture $ARCH not supported for Linux auto-download."
                    exit 1
                fi
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
    sed_inplace '/TUNNEL_TOKEN=/d' "$ENV_FILE"
    sed_inplace '/ENABLE_EMBEDDED_TUNNEL=/d' "$ENV_FILE"
    
    if [ ! -z "$CF_TOKEN" ]; then
        echo "TUNNEL_TOKEN=$CF_TOKEN" >> "$ENV_FILE"
        echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
        echo "✅ Permanent Tunnel configured."
    else
        # Quick Tunnel Mode (No Token)
        # ONLY enable if we decided to enable tunnel (i.e. not VPN mode)
        # AND if we don't already have a token in env (unless quick mode forced override)
        if [ "$ENABLE_TUNNEL" == "y" ]; then
             # If QUICK_TUNNEL flag was passed, we might want to force quick tunnel
             # BUT if user just ran update (which runs setup.sh --quick), we shouldn't kill their perm tunnel
             # Wait, install.sh calls setup.sh --quick. This is dangerous for perm tunnels.
             
             # FIX: If TUNNEL_TOKEN exists in .env and --token wasn't passed, preserve it?
             # But setup.sh sources .env.
             # The issue is install.sh calls it with --quick.
             # And --quick sets CF_TOKEN="".
             
             # We need install.sh to NOT call --quick if it detects a perm tunnel? 
             # Or setup.sh to be smarter.
             
             echo "ENABLE_EMBEDDED_TUNNEL=true" >> "$ENV_FILE"
             echo "🌊 Quick Tunnel configured."
        fi
    fi
        
        # Clean old quick tunnel url before restarting so we wait for a fresh one
        rm -f "$APP_DIR/.quick_tunnel_url"

    # Restart service to pick up new env
    if [ "$OS_TYPE" = "Darwin" ]; then
        if canonical_service_running; then
            echo "ℹ️  偵測到服務正在運行，先精準停止 port ${PORT} 上的行程。"
        else
            echo "ℹ️  服務目前未運行（無已載入的 launchd label）。"
        fi
        stop_port_process "$PORT"
        if clawbridge_supervised; then
            # 由 launchd supervisor 管理：不再操作 vendor plist（避免與 supervisor 互搶）
            retire_vendor_plist "$VENDOR_PLIST"
            echo "ℹ️  本服務由 ${SUPERVISED_LAUNCHD_LABEL} 管理，pkill 後將由 launchd 自動重啟。"
        else
            launchctl unload "$VENDOR_PLIST" >/dev/null 2>&1 || true
            launchctl load -w "$VENDOR_PLIST"
        fi
    elif [ "$USE_USER_SYSTEMD" = true ]; then
        # Ensure we don't have a zombie process holding the port
        stop_port_process "$PORT"
        systemctl --user restart "$SERVICE_NAME"
    else
        stop_port_process "$PORT"
        sudo systemctl restart "$SERVICE_NAME"
    fi
fi
fi

# 6. Summary
if [ "$OS_TYPE" != "Darwin" ]; then
    # Robust IP detection for Linux (handles Alpine/WSL quirks where hostname -I fails silently)
    IP=$( (ip route get 1 | awk '{print $(NF-2);exit}') 2>/dev/null || \
          (hostname -I | awk '{print $1}') 2>/dev/null || \
          (ifconfig | grep "inet " | grep -Fv 127.0.0.1 | awk '{print $2}' | head -n 1) 2>/dev/null )
else
    # Fallback for macOS / BSD
    IP=$(ifconfig | grep "inet " | grep -Fv 127.0.0.1 | awk '{print $2}' | head -n 1) 2>/dev/null
fi
PORT=${PORT:-3000}

# Helper: print QR code for a URL (interactive TTY only)
print_qr() {
    local url="$1"
    # Only show QR in interactive terminal sessions
    if [ ! -t 1 ]; then return; fi
    echo -e "\n📲 Scan to open on your phone:"
    if command -v qrencode &>/dev/null; then
        qrencode -t UTF8 -o - "$url"
    else
        "$NODE_PATH" -e "
            try {
                const qr = require('qrcode-terminal');
                qr.generate('$url', {small: true});
            } catch(e) { /* qrcode-terminal not installed, skip */ }
        " 2>/dev/null || true
    fi
}
echo -e "\n${GREEN}🎉 Installation Complete!${NC}"

# Check if this was an update (based on existing ENV or backups)
IS_UPDATE=false
if [ -f "$ENV_FILE.bak" ] || [ ! -z "$EXISTING_PORT" ]; then
    IS_UPDATE=true
fi

if [ "$IS_UPDATE" = true ]; then
    echo -e "${YELLOW}🔒 Security Notice: Since v1.1.0, direct Magic Links with keys are no longer supported for enhanced security.${NC}"
    echo -e "${YELLOW}👉 Please visit the link below and enter your Access Key manually on the login page.${NC}"
fi

LOCAL_URL="http://$IP:$PORT"
echo -e "📱 Local Access: ${BLUE}${LOCAL_URL}${NC}"

if [ "$USE_VPN" = true ]; then
    VPN_URL="http://$VPN_IP:$PORT"
    echo -e "🔒 ${VPN_TYPE} Access: ${BLUE}${VPN_URL}${NC}"
    echo -e "   (Accessible via your ${VPN_TYPE} network)"
    print_qr "$VPN_URL"
else
    print_qr "$LOCAL_URL"
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
                echo -e "👉 ${BLUE}${QURL}${NC}"
                echo -e "⚠️  Note: This link expires if the dashboard restarts."
                print_qr "$QURL"
                break
            fi
            sleep 1
            echo -n "."
        done
        
        if [ ! -f "$APP_DIR/.quick_tunnel_url" ]; then
            if [ "$OS_TYPE" = "Darwin" ]; then
                echo -e "\n${YELLOW}⚠️  URL not ready yet. Check logs later: tail -f $SERVICE_LOG${NC}"
            elif [ "$USE_USER_SYSTEMD" = true ]; then
                echo -e "\n${YELLOW}⚠️  URL not ready yet. Check logs later: journalctl --user -u ${SERVICE_NAME} -f${NC}"
            else
                echo -e "\n${YELLOW}⚠️  URL not ready yet. Check logs later: sudo journalctl -u ${SERVICE_NAME} -f${NC}"
            fi
        fi
    fi
fi

# 7. Initialize Analytics & Pricing (Cold Start Fix)
echo -e "\n📊 Initializing data analytics & syncing prices..."
"$NODE_PATH" "$APP_DIR/scripts/sync_openrouter_prices.js" >/dev/null 2>&1 || true
"$NODE_PATH" "$APP_DIR/scripts/analyze.js" >/dev/null 2>&1 || true

echo -e "🔑 Access Key: ${YELLOW}$RAND_KEY${NC}"
