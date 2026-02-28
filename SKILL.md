<skill>
  <id>clawbridge</id>
  <name>ClawBridge Dashboard</name>
  <version>1.0.0</version>
  <description>Mobile-first mission control for OpenClaw agents. Runs as a local Node.js sidecar process, providing a web dashboard to monitor real-time agent activity, track token costs across 340+ models, and trigger cron tasks remotely. Optionally creates an outbound-only Cloudflare tunnel for remote access.</description>
  <author>DreamWing</author>
  <homepage>https://clawbridge.app</homepage>
  <license>MIT</license>
  <tags>dashboard,monitoring,mobile,ui,control-panel,cost-tracking,cloudflare,tunnel</tags>

  <!-- What this skill installs and runs -->
  <runtime>
    <type>node</type>
    <entrypoint>index.js</entrypoint>
    <persistence>Optional. Run setup.sh --enable-service to register a user-level systemd service for auto-start. Not enabled by default.</persistence>
  </runtime>

  <!-- System requirements -->
  <requires>
    <dependency name="node" version=">=18" required="true" />
    <dependency name="npm" version=">=9" required="true" />
    <dependency name="git" version="any" required="false" description="Used for incremental updates; falls back to tarball download if absent." />
    <dependency name="cloudflared" version="latest" required="false" description="Downloaded automatically from github.com/cloudflare/cloudflared if Cloudflare tunnel is enabled. Only required if using remote access without a VPN (Tailscale/WireGuard)." />
  </requires>

  <!-- Credentials / environment variables written to .env -->
  <credentials>
    <env name="ACCESS_KEY" description="Randomly generated 32-character hex key used to authenticate dashboard logins. Auto-generated on first install." required="true" generated="true" />
    <env name="PORT" description="Local TCP port the dashboard listens on. Defaults to 3000, auto-incremented if busy." required="false" default="3000" />
    <env name="TUNNEL_TOKEN" description="Cloudflare Tunnel token for a permanent named tunnel. Optional — omit to use a temporary Quick Tunnel instead." required="false" />
    <env name="ENABLE_EMBEDDED_TUNNEL" description="Set to 'true' when a Cloudflare tunnel (permanent or quick) is active." required="false" />
    <env name="OPENCLAW_PATH" description="Absolute path to the openclaw binary. Auto-detected from PATH; only written to .env if found." required="false" />
  </credentials>

  <!-- Network activity -->
  <network>
    <connection purpose="Dependency install" destination="registry.npmjs.org" direction="outbound" trigger="install/update" />
    <connection purpose="Source code download" destination="github.com/dreamwing/clawbridge" direction="outbound" trigger="install/update" />
    <connection purpose="cloudflared binary download" destination="github.com/cloudflare/cloudflared" direction="outbound" trigger="install (only if tunnel enabled and cloudflared not found)" />
    <connection purpose="Cloudflare Tunnel relay" destination="*.cloudflareaccess.com, *.trycloudflare.com" direction="outbound" trigger="runtime (only if tunnel enabled)" />
    <connection purpose="Dashboard UI" destination="localhost" direction="inbound" trigger="runtime" />
  </network>

  <!-- File system paths written or modified -->
  <filesystem>
    <path type="write" location="skills/clawbridge/.env" description="Stores ACCESS_KEY, PORT, and optional tunnel config." />
    <path type="write" location="skills/clawbridge/data/" description="Stores local agent log and token usage analytics." />
    <path type="write" location="~/.config/systemd/user/clawbridge.service" description="User-level systemd service unit for auto-start." />
    <path type="write" location="skills/clawbridge/cloudflared" description="cloudflared binary, only if downloaded during tunnel setup." />
  </filesystem>

  <!-- Installation -->
  <install>
    git clone https://github.com/dreamwing/clawbridge.git skills/clawbridge && cd skills/clawbridge && npm install --production && node index.js
  </install>

  <instructions>
    ClawBridge runs as a foreground Node.js process by default.

    After installation, the dashboard is accessible at the local IP shown in the terminal output.
    An ACCESS_KEY is generated and displayed — keep it safe, it is required to log in.

    To enable remote access (optional), supply a Cloudflare Tunnel token when prompted,
    or leave it blank to use a temporary Quick Tunnel URL.

    To enable auto-start as a background service (optional):
      ./setup.sh --enable-service

    To install with one command (includes service registration):
      curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge/master/install.sh | bash

    To update to the latest version via git:
      git pull && npm install

    To stop the service (if enabled):
      systemctl --user stop clawbridge

    Full documentation: https://github.com/dreamwing/clawbridge/blob/master/README.md
  </instructions>
</skill>

# ClawBridge Dashboard

**Your Agent. In Your Pocket.**

ClawBridge is a lightweight, mobile-first web dashboard for OpenClaw. It runs as a local sidecar process and provides:

*   🧠 **Live Activity Feed**: Watch agent execution and thinking in real-time via WebSocket.
*   💰 **Token Economy**: Track costs across 340+ models with daily/monthly breakdowns.
*   🚀 **Mission Control**: Trigger cron jobs manually from your phone.
*   🔒 **Secure by Default**: API key auth, session cookies, and optional Cloudflare Tunnel for remote access.

## What This Skill Does

1. **Installs** the ClawBridge Node.js app from GitHub into `skills/clawbridge/`
2. **Generates** a random `ACCESS_KEY` and writes it to `.env`
3. **Registers** a user-level systemd service for auto-start
4. **Optionally downloads** `cloudflared` and configures a tunnel for remote access

## Installation

```bash
curl -sL https://raw.githubusercontent.com/dreamwing/clawbridge/master/install.sh | bash
```

See [README.md](https://github.com/dreamwing/clawbridge/blob/master/README.md) for full documentation.
