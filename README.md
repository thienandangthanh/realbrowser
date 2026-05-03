# Realbrowser

Realbrowser exists so Codex can use the browser a developer is actually using, faster than Codex Computer Use and without forcing a slow separate Playwright browser.

The default Codex browser automation path is useful, but it is not enough for web development when the state that matters lives in a signed-in Chrome profile: cookies, local storage, feature flags, extensions, active tabs, console logs, and network traffic. Realbrowser combines the fast local workflow patterns from gstack with the native real-browser direction from OpenClaw, giving Codex one fast local CLI while still keeping a dedicated fallback profile for cases where attaching to the real browser is unavailable or unsafe.

## What It Provides

- A Codex skill named `realbrowser`.
- A local CLI at `scripts/realbrowser`.
- A persistent loopback daemon for fast follow-up commands.
- Chrome DevTools MCP integration for real Chrome attach.
- A dedicated profile fallback at `~/.realbrowser/profile`.
- Tab listing/selection, navigation, snapshots, clicks, typing, forms, JavaScript evaluation, console and network inspection, screenshots, annotated labels, dialog handling, user-agent emulation, and downloads.

## Why Not Just Playwright?

Playwright is excellent for isolated automation, but this project is for the opposite case: debugging a real browser session with the same login and state the developer already has. Realbrowser uses Chrome DevTools MCP first, then adds small local wrappers for the operations Codex needs to move quickly.

## Quick Start

```bash
./scripts/realbrowser doctor
./scripts/realbrowser tabs
./scripts/realbrowser open http://localhost:3000
./scripts/realbrowser snapshot
```

Use `--backend dev` for the dedicated fallback profile:

```bash
./scripts/realbrowser --backend dev doctor --deep
```

Use `--browser-url` or `REALBROWSER_BROWSER_URL` when you have an explicit Chrome DevTools endpoint:

```bash
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 ./scripts/realbrowser tabs
```

## Safety Model

The daemon binds only to `127.0.0.1` and requires a bearer token stored in its state file. Realbrowser can inspect and change browser state, so agents should avoid sensitive tabs unless the user explicitly asks for that. Agents must ask before submitting sensitive data, making purchases, deleting data, changing account/security settings, granting permissions, or taking actions that are hard to undo.
