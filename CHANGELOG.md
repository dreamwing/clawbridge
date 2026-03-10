# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.3] - 2026-03-10

### Added
- Docker image support: added `Dockerfile`, `.dockerignore`, and CI workflow for automatic image publishing to GitHub Container Registry (#24) (Thanks @ForceConstant for contribution and suggestions in Issue #24)
- Docker usage instructions in README

### Fixed
- propagate --token and other CLI args from install.sh to setup.sh (PR #26)


## [1.1.2] - 2026-03-01

### Fixed
- Resolve installation wget errors, auth redirect loop, and gateway PID detection (PR #21) (Thanks @chrisuhg for contribution and suggestions in Issue #19)
- Resolve looping token verify issue on local and VPN HTTP access (PR #21)
- Prefer real workspace over state dir when auto-detecting (PR #22) (Thanks @zjy4fun for contribution and suggestions in PR #22)

### Added
- Auto-credit PR authors and issue openers, and auto-generate changelog in release script.

## [1.1.1] - 2026-02-26

### Added
- **Full macOS Support**: ClawBridge is now officially compatible with macOS (Intel/Apple Silicon).
- **Service Management (Launchd)**: Support for macOS `launchd` via `.plist` agents for background execution and auto-restart.
- **Cross-Platform CI**: Automated tests and lint now verify stability on both Linux and macOS.

### Fixed
- **Network Compatibility**: Resolved issues with `hostname -I` by implementing a multi-fallback logic (`ip route` -> `hostname` -> `ifconfig`), ensuring reliability on Alpine Linux, WSL, and macOS. (Special thanks to [@StewartLi666](https://x.com/StewartLi666) for the feedback)
- **Sed Compatibility**: Fixed script errors caused by `sed -i` differences between GNU/Linux and BSD/macOS.
- **VPN & Networking**: Fixed VPN interface detection and service restart logic for macOS.
- **Quick Tunnel Reliability**: Improved reliability when fetching and displaying Cloudflare Quick Tunnel URLs after updates.
- **Systemd Log Hint**: Corrected `journalctl` command hints to accurately reflect user-level vs system-level services.

### Changed
- add PR #16 mention to 1.1.1 changelog

## [1.1.0] - 2026-02-25

### Added
- parse git history for omitted commits in changelog generation
- New Full-screen Login Page with modern UI and breathing background.
- Notice overlay for legacy magic link attempts.
- Brute-force protection: max 10 login attempts per IP per 60s.
- Mandatory confirmation for high-risk endpoints (`/api/kill`).
- Rate limiting for destructive endpoints.
- Jest + Supertest test suite with unit and API integration tests. (Thanks [@yaochao](https://github.com/yaochao) for suggesting #7)
- ESLint + Prettier code style enforcement. (Thanks [@yaochao](https://github.com/yaochao) for suggesting #7)
- GitHub Actions CI workflow running tests and lint on every push. (Thanks [@yaochao](https://github.com/yaochao) for suggesting #7)
- Split `public/index.html` into separate `public/css/dashboard.css` and `public/js/dashboard.js` for maintainability. (Thanks [@yaochao](https://github.com/yaochao) for suggesting #3)
- Display dashboard URL as terminal QR code after installation for instant mobile scanning. Uses `qrencode` CLI if available, falls back to `qrcode-terminal` npm package, silently skips if neither is present. (Thanks @斯图超哥 for suggesting #12)

### Fixed
- Security: Replaced URL query auth with HttpOnly cookie-based sessions. (Thanks [@yaochao](https://github.com/yaochao) for reporting #1)
- Security: Added safeguards for remote endpoints. (Thanks [@yaochao](https://github.com/yaochao) for reporting #2)
- Bug: Improved error handling and removed silent catch blocks. (Thanks [@yaochao](https://github.com/yaochao) for reporting #4)
- Bug: Removed hardcoded paths for better environment portability. (Thanks [@yaochao](https://github.com/yaochao) for reporting #5)
- Bug: Improved stability in context reading when session files are missing.

### Changed
- Refactored installer (`setup.sh`) to remove magic link output in favor of secure login.
- Refactored: split monolithic index.js (~600 lines) into modular src/ directory. (Thanks [@yaochao](https://github.com/yaochao) for suggesting #3)
- Replaced `wget` with Node.js native `https` module for binary downloads. (Thanks [@yaochao](https://github.com/yaochao) for reporting #6)

