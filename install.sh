#!/bin/bash

# ClawBridge Installer (Git + Tarball Fallback)
# Usage: curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge/master/install.sh | bash

set -e

echo "🌊 ClawBridge Installer"
echo "-----------------------"

# OS Detection
OS_TYPE=$(uname -s)
if [ "$OS_TYPE" = "Darwin" ]; then
    sed_inplace() { sed -i '' "$@"; }
else
    sed_inplace() { sed -i "$@"; }
fi

# Detect if running from inside the installation directory
if [ "$(basename "$PWD")" == "clawbridge" ] && [ "$(basename "$(dirname "$PWD")")" == "skills" ]; then
    TARGET_DIR="."
    echo "📂 Detected execution from inside installation directory."
else
    TARGET_DIR="skills/clawbridge"
fi

NEEDS_BUILD=true
BACKUP_MSG=""

# --- STRATEGY SELECTION ---
if command -v git &> /dev/null; then
    INSTALL_MODE="git"
    echo "✅ Git detected. Using Git for incremental updates."
else
    INSTALL_MODE="tarball"
    echo "⚠️  Git not found. Using Tarball download mode."
fi

# ==============================
# STRATEGY A: GIT (Preferred)
# ==============================
if [ "$INSTALL_MODE" == "git" ]; then

    if [ -d "$TARGET_DIR" ]; then
        echo "ℹ️  Updating existing installation..."
        cd "$TARGET_DIR"
        
        # Stash local changes
        git stash >/dev/null 2>&1 || true
        
        echo "⬇️  Fetching updates..."
        git fetch --all --tags --force --prune
        
        # Find latest tag
        LATEST_TAG=$(git tag -l "v*" | sort -V | tail -n1)
        
        if [ ! -z "$LATEST_TAG" ]; then
            CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "none")
            
            if [ "$CURRENT_TAG" == "$LATEST_TAG" ]; then
                echo "✅ Already on latest version ($LATEST_TAG). Skipping update."
                NEEDS_BUILD=false
            else
                echo "🔖 Found new version: $LATEST_TAG (Current: $CURRENT_TAG)"
                echo "🔄 Switching to release $LATEST_TAG..."
                git checkout "tags/$LATEST_TAG"
            fi
        else
            echo "⚠️  No release tags found. Using master branch..."
            git checkout master
            git pull origin master
        fi
        
        cd - > /dev/null
    else
        echo "⬇️  Cloning repository..."
        mkdir -p skills
        git clone https://github.com/dreamwing/clawbridge.git "$TARGET_DIR"
        cd "$TARGET_DIR"
        
        # Post-clone: Checkout tag
        LATEST_TAG=$(git tag -l "v*" | sort -V | tail -n1)
        if [ ! -z "$LATEST_TAG" ]; then
            echo "🔖 Checkout release $LATEST_TAG..."
            git checkout "tags/$LATEST_TAG"
        fi
        cd - > /dev/null
    fi

# ==============================
# STRATEGY B: TARBALL (Fallback)
# ==============================
else
    # 1. Determine Latest Version (via Redirect)
    echo "🔍 Checking latest version..."
    # Hack to get latest tag from GitHub redirect without API rate limits
    LATEST_URL=$(curl -sL -o /dev/null -w %{url_effective} https://github.com/dreamwing/clawbridge/releases/latest)
    LATEST_TAG=$(basename "$LATEST_URL")
    
    if [[ "$LATEST_TAG" == "releases" ]]; then
        echo "⚠️  Could not determine latest tag. Defaulting to master."
        DOWNLOAD_URL="https://github.com/dreamwing/clawbridge/archive/refs/heads/master.tar.gz"
        VER_STRING="master"
    else
        DOWNLOAD_URL="https://github.com/dreamwing/clawbridge/archive/refs/tags/${LATEST_TAG}.tar.gz"
        VER_STRING="$LATEST_TAG"
    fi

    # 2. Check & Backup Existing
    TS=$(date +%Y%m%d_%H%M%S)
    
    if [ -d "$TARGET_DIR" ]; then
        # Check current version from package.json
        if [ -f "$TARGET_DIR/package.json" ]; then
            CURRENT_VER=$(grep '"version":' "$TARGET_DIR/package.json" | cut -d'"' -f4)
        else
            CURRENT_VER="unknown"
        fi
        
        BACKUP_DIR="skills/_backups"
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/clawbridge_v${CURRENT_VER}_${TS}.tar.gz"
        
        echo "📦 Backing up current version to $BACKUP_FILE..."
        # Ignore node_modules AND the backup folder itself
        PARENT=$(dirname "$TARGET_DIR")
        NAME=$(basename "$TARGET_DIR")
        tar --exclude='node_modules' --exclude='_backups' -czf "$BACKUP_FILE" -C "$PARENT" "$NAME"
        
        BACKUP_MSG="♻️  Previous version backed up to: $BACKUP_FILE"
    fi

    # 3. Download & Prepare Temp
    # Unique temp dir to prevent collisions
    TMP_DIR_NAME="clawbridge_${VER_STRING}_${TS}"
    TMP_DIR=$(mktemp -d -t "${TMP_DIR_NAME}.XXXXXX")
    
    echo "⬇️  Downloading $VER_STRING..."
    curl -sL "$DOWNLOAD_URL" | tar -xz -C "$TMP_DIR"
    
    # GitHub tarballs extract to 'clawbridge-1.0.0' or 'clawbridge-master'
    EXTRACTED_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name "clawbridge-*" | head -n 1)

    # 4. Data Migration (Hot-Swap)
    if [ "$TARGET_DIR" == "." ]; then
        echo "♻️  Migrating configuration and data (In-Place)..."
        # When running inside target, we must copy config TO temp dir first
        # Because in step 5 we will overwrite current dir with temp dir content
        # Wait, the previous logic copied FROM target TO temp. That is correct.
        [ -f ".env" ] && cp ".env" "$EXTRACTED_DIR/"
        [ -d "data" ] && cp -r "data" "$EXTRACTED_DIR/"
        [ -f ".quick_tunnel_url" ] && cp ".quick_tunnel_url" "$EXTRACTED_DIR/"
    else
        if [ -d "$TARGET_DIR" ]; then
            echo "♻️  Migrating configuration and data..."
            [ -f "$TARGET_DIR/.env" ] && cp "$TARGET_DIR/.env" "$EXTRACTED_DIR/"
            [ -d "$TARGET_DIR/data" ] && cp -r "$TARGET_DIR/data" "$EXTRACTED_DIR/"
            [ -f "$TARGET_DIR/.quick_tunnel_url" ] && cp "$TARGET_DIR/.quick_tunnel_url" "$EXTRACTED_DIR/"
            
            rm -rf "$TARGET_DIR"
        else
            mkdir -p skills
        fi
    fi

    # 5. Final Move
    echo "🔄 Applying update..."
    if [ "$TARGET_DIR" == "." ]; then
        # Overwrite current dir with new content
        cp -rf "$EXTRACTED_DIR"/* .
        cp -rf "$EXTRACTED_DIR"/.[!.]* . 2>/dev/null || true
    else
        mv "$EXTRACTED_DIR" "$TARGET_DIR"
    fi
    
    rm -rf "$TMP_DIR"
    echo "✅ Code updated to $VER_STRING"
    NEEDS_BUILD=true
fi

# ==============================
# COMMON: BUILD & LAUNCH
# ==============================

if [ "$NEEDS_BUILD" = true ]; then
    echo "📦 Installing dependencies..."
    cd "$TARGET_DIR"
    if [ -f "package-lock.json" ]; then
        npm ci --production --silent
    else
        npm install --production --silent
    fi
else
    cd "$TARGET_DIR"
    echo "⏭️  Skipping dependency install (Version match)."
fi

# Run Setup
echo "🚀 Configuring..."
chmod +x setup.sh

# Check if we have a permanent token in .env
HAS_TOKEN=false
if [ -f "$TARGET_DIR/.env" ]; then
    if grep -q "TUNNEL_TOKEN=" "$TARGET_DIR/.env"; then
        HAS_TOKEN=true
    fi
fi

if [ "$HAS_TOKEN" = true ]; then
    echo "ℹ️  Preserving existing permanent tunnel configuration..."
    # Don't use --quick which forces quick tunnel. 
    # Use --no-tunnel to skip interactive prompt, but setup.sh logic needs to be robust.
    # Actually, setup.sh reads .env. If we don't pass --quick, it might prompt.
    # We need a flag for "non-interactive but keep current config".
    # Let's modify setup.sh to support --update mode or similar.
    # OR: Extract token and pass it back?
    TOKEN=$(grep "TUNNEL_TOKEN=" "$TARGET_DIR/.env" | cut -d'=' -f2)
    ./setup.sh --token="$TOKEN" --enable-service
else
    # Force quick mode for zero-friction
    ./setup.sh --quick --enable-service
fi

# Final Notification
if [ ! -z "$BACKUP_MSG" ]; then
    echo ""
    echo "$BACKUP_MSG"
fi

echo ""
echo "✅ [Agent Notice] Update successfully completed. The dashboard service has been restarted."
echo "👉 Please verify the version on the dashboard and inform the user."
