#!/bin/bash

# ClawBridge Installer (Git + Tarball Fallback)
# Usage: curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge/master/install.sh | bash

set -e

echo "🌊 ClawBridge Installer"
echo "-----------------------"

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
        # Ignore node_modules in backup to save space/time
        tar --exclude='node_modules' -czf "$BACKUP_FILE" -C "skills" "clawbridge"
        
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
    if [ -d "$TARGET_DIR" ]; then
        echo "♻️  Migrating configuration and data..."
        [ -f "$TARGET_DIR/.env" ] && cp "$TARGET_DIR/.env" "$EXTRACTED_DIR/"
        [ -d "$TARGET_DIR/data" ] && cp -r "$TARGET_DIR/data" "$EXTRACTED_DIR/"
        [ -f "$TARGET_DIR/.quick_tunnel_url" ] && cp "$TARGET_DIR/.quick_tunnel_url" "$EXTRACTED_DIR/"
        
        rm -rf "$TARGET_DIR"
    else
        mkdir -p skills
    fi

    # 5. Final Move
    mv "$EXTRACTED_DIR" "$TARGET_DIR"
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
# Force quick mode for zero-friction
./setup.sh --quick

# Final Notification
if [ ! -z "$BACKUP_MSG" ]; then
    echo ""
    echo "$BACKUP_MSG"
fi
