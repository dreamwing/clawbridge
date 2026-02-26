# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-02-26

### Fixed
- Robust IP detection: Replaced fragile `hostname -I` with a resilient multi-fallback logic (`ip route`, `hostname`, `ifconfig`) to prevent empty IP issues on some Linux distributions (e.g., Alpine) and WSL. (Thanks @斯图超哥 for the feedback)
- Quick Tunnel Refresh: Improved reliability by clearing stale Quick Tunnel URLs before service restarts, ensuring the latest public URL is correctly fetched and displayed.
- Systemd Log Hint: Correctly differentiate between `--user` and system-level `journalctl` commands based on the installation type.
- Merge pull request #16 from dreamwing/feature/macos-support

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

