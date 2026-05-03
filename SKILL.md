---
name: realbrowser
description: Use when you need fast local real-browser automation from Codex, including opening tabs, taking snapshots or screenshots, clicking, typing, filling forms, reading console/network data, or debugging localhost/browser UI with Chrome DevTools MCP.
---

# Realbrowser

Use this skill for real-browser checks when the built-in browser tools are unavailable or when a fast local CLI is more direct.

## Quick Start

Run the bundled CLI:

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
"$REALBROWSER_CLI" doctor
"$REALBROWSER_CLI" open http://localhost:3000
"$REALBROWSER_CLI" snapshot
```

The CLI starts a persistent loopback daemon on demand. The daemon stores its port and bearer token in `~/.realbrowser/state.json` and talks to `chrome-devtools-mcp` over stdio.

## Browser Choice

Default behavior:

1. Prefer Chrome DevTools MCP `--autoConnect` so Codex can control the user's real running Chrome profile after Chrome remote debugging permission is enabled in `chrome://inspect/#remote-debugging`.
2. If auto-connect cannot attach, fall back to a dedicated profile at `~/.realbrowser/profile`.

Useful overrides:

```bash
REALBROWSER_MODE=dedicated "$REALBROWSER_CLI" doctor --deep
"$REALBROWSER_CLI" --backend dev doctor --deep
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" tabs
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" download <uid> report.pdf
REALBROWSER_CDP_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" wait-download report.pdf
REALBROWSER_STATE_FILE=/tmp/realbrowser.json "$REALBROWSER_CLI" doctor
```

## Commands

- `doctor [--deep]`: check Node, npm/npx, daemon, MCP tools, and optionally live tabs.
- `status`: show daemon mode, tab count, and selected tab.
- `restart`: restart the persistent daemon's MCP/browser connection without changing the daemon token or port.
- `tabs`: list open pages.
- `open <url>` / `newtab <url>`: open a URL in a new page.
- `navigate <url>` / `goto <url>`: navigate the selected page to a URL.
- `back`, `forward`, `reload`: navigate browser history or reload the page.
- `select <pageId> [--front]` / `tab <pageId>`: select a page for later commands. It does not bring Chrome to the front unless `--front` is passed.
- `select <uid|selector> <value> [--page <id>]`: select a dropdown option by value, label, or visible text.
- `focus <pageId>`: select a page and bring Chrome to the front.
- `close <pageId>` / `closetab <pageId>`: close a tab.
- `snapshot` / `accessibility [--page <id>] [--verbose] [--annotate|-a] [--output <path>]`: get the accessibility snapshot with element `uid` refs. `--annotate` also saves a screenshot with temporary uid labels.
- `click <uid> [--page <id>]`: click a ref from the latest snapshot.
- `hover <uid> [--page <id>]`: hover a snapshot ref.
- `drag <fromUid> <toUid> [--page <id>]`: drag one snapshot ref to another.
- `type <text> [--page <id>]`: type into the focused element.
- `fill <uid> <value> [--page <id>]`: fill an input/select ref.
- `fill-form '[{"uid":"...","value":"..."}]' [--page <id>]`: fill multiple refs in one command.
- `press <key> [--page <id>]`: press a key or key chord, such as `Enter` or `Meta+L`.
- `upload <uid> <file> [--page <id>]`: upload a local file through a file input ref.
- `wait <text> [more text...] [--timeout <ms>] [--page <id>]`: wait until one text value appears. Use `wait --load`, `wait --domcontentloaded`, or `wait --networkidle` for page readiness checks.
- `scroll [selector|uid] [--page <id>]`: scroll a selector/ref into view, or scroll to bottom.
- `viewport <WxH|reset> [--page <id>]`: emulate viewport size without resizing the real Chrome window, or clear emulation.
- `emulate`: set or reset Chrome MCP emulation options such as network, CPU, user agent, color scheme, and geolocation.
- `useragent <ua|reset>`: gstack-compatible shortcut for `emulate --user-agent`.
- `cookie <name=value>`: set a cookie on the current page path.
- `dialog arm accept|dismiss [text]`, `dialog-accept [text]`, `dialog-dismiss`: pre-arm the next alert/confirm/prompt in the current page. Use `dialog list` to read captured dialog records, or `dialog current accept|dismiss` to handle a dialog that is already open.
- `eval <js>` / `js <js> [--page <id>]`: run JavaScript in the page. Expressions are wrapped automatically.
- `text`, `html`, `links`, `forms`, `cookies`, `storage`, `perf`, `url`: fast read helpers backed by page JavaScript. `cookies` and `storage` redact values unless `--values` is passed.
- `css <selector|uid> <property>`, `attrs <selector|uid>`, `is <state> <selector|uid>`: inspect elements by CSS selector or snapshot uid.
- `console [get <msgid>] [--errors] [--preserve]`: list console messages, or fetch one message by id.
- `network [get <reqid>] [--preserve] [--request-file path] [--response-file path]`: list network requests, or fetch one request by id.
- `screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp]`: save a screenshot. `--labels` overlays snapshot uid labels before capture and removes them afterward. If `path` is omitted, a timestamped PNG is written under `~/.realbrowser/screenshots`.
- `responsive <path-prefix>`: save mobile, tablet, and desktop screenshots in one daemon call.
- `diff <url1> <url2>`: navigate and produce a simple text diff.
- `download <uid> [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]`: click a snapshot uid and save the resulting download. With `--browser-url`, `--cdp-url`, or `REALBROWSER_CDP_URL`, this uses Chrome's native CDP download events. Without CDP, it falls back to watching Chrome's download directory, defaulting to `~/Downloads`, and copying the completed file into `~/.realbrowser/downloads` or the requested path.
- `wait-download [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]`: wait for the next download event/file and save it to the requested path or the default Codex download directory.
- `handoff [pageId]`: bring a page to the front and print a fresh snapshot for manual handoff.
- `resume [pageId] [--page <id>]`: print a fresh snapshot without bringing Chrome to the front.
- `trace start|stop`, `trace analyze <insightSetId> <insightName>`: run Chrome performance tracing.
- `tools`: list available Chrome DevTools MCP tools.
- `tool <mcpToolName> [jsonArgs]`: call a raw MCP tool for features not wrapped yet.
- `chain '[["snapshot","--page","1"],["console","--errors","--page","1"]]'`: run multiple commands in one daemon RPC for speed.

Passing `--page <id>` targets a tab directly without focusing Chrome, so background screenshots and snapshots do not cover the terminal.

Global flags:

- `--json`: print raw JSON responses.
- `--state-file <path>`: use a custom daemon state file.
- `--backend real|dev`: choose real-browser auto-connect or the dedicated dev profile.
- `--browser-url <url>`: connect to an existing CDP endpoint instead of autoConnect.
- `--cdp-url <url>`: use a CDP endpoint for download interception while keeping the browser backend unchanged.
- `--dedicated`: force the dedicated fallback profile.

## Operating Loop

1. Start with `doctor` when setup is uncertain.
2. Use `tabs` before opening new pages if prior attempts may have left tabs around.
3. Use `open` then `snapshot`; act only on current snapshot `uid` refs.
4. After navigation, modal changes, or form submission, run `snapshot` again before the next action.
5. If a `uid` is stale, snapshot once and retry with the new ref.
6. Ask for explicit user approval before submitting sensitive data, making purchases, deleting data, changing account/security settings, granting permissions, or taking any action that is hard to undo.
7. Stop and report manual blockers such as login, 2FA, captcha, camera/microphone permission, or Chrome remote debugging approval.

## Security Notes

Chrome DevTools MCP can inspect and modify browser state. Avoid using it on sensitive tabs unless the user explicitly wants that. Never silently submit sensitive forms or irreversible actions. The local daemon binds only to `127.0.0.1` and requires the bearer token from the state file for command calls.
