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
"$REALBROWSER_CLI" observe
"$REALBROWSER_CLI" snapshot --efficient
"$REALBROWSER_CLI" detach
```

On Windows PowerShell, prefer `scripts\realbrowser.ps1 ...`. On `cmd.exe`, use `scripts\realbrowser.cmd ...`. `node scripts\realbrowser.mjs ...` and the installed `realbrowser` npm bin are also portable. The POSIX `scripts/realbrowser` wrapper is for macOS/Linux shells.

The CLI starts a persistent loopback daemon on demand. The daemon stores its port and bearer token in `~/.realbrowser/state.json` and talks to `chrome-devtools-mcp` over stdio.

`status` is side-effect-light by default and should be used to check whether realbrowser is already controlling Chrome. It may inspect default-local-Chrome remote-debugging metadata when that file is available, without attaching to the browser backend; treat that metadata as a hint, not proof for every backend. Use `status --deep`, `tabs`, or any page command only when you intentionally want to attach to the browser backend.

## Browser Choice

Default behavior:

1. Prefer Chrome DevTools MCP `--autoConnect` so Codex can control the user's real running Chrome profile after Chrome DevTools Protocol remote debugging is enabled in `chrome://inspect/#remote-debugging`.
2. If auto-connect cannot attach, fall back to a dedicated profile at `~/.realbrowser/profile`.

Chrome's "Allow remote debugging?" dialog is expected when a new Chrome DevTools MCP auto-connect session attaches to the real signed-in profile. `Allow` should be treated as permission for the current debugging connection, not a permanent approval for every future daemon process. Reuse the persistent daemon and avoid `stop`/`restart` unless needed.

For tasks that require the user's logged-in Chrome profile, fallback is not acceptable. First verify the intended Chrome profile is active, open `chrome://inspect/#remote-debugging` in that profile, turn on "Allow remote debugging for this browser instance", then run realbrowser with `--no-fallback` or `REALBROWSER_NO_FALLBACK=1`. `status` should then report `Dedicated fallback disabled: yes`. If attach still fails, stop and report the Chrome remote-debugging/CDP blocker instead of continuing in the dedicated profile.

Chrome's "Chrome is being controlled by automated test software" banner is expected while Chrome DevTools MCP has an active debugging session. Report it as a safety indicator, run `realbrowser status` to identify whether the realbrowser daemon is connected, and use `realbrowser stop` or `realbrowser detach` to detach realbrowser. Plain detach should not turn off Chrome remote debugging and should not touch browser UI; it only closes realbrowser's session. If the user explicitly asks to hide the banner, use `realbrowser detach --dismiss-banner` for a best-effort click on the visible banner `X` on supported desktop platforms. This only hides browser UI and does not disable remote debugging/CDP. On platforms where browser-UI clicking is not automated, detach must still succeed and print a manual banner-X instruction. If the task should also turn off the user's Chrome remote-debugging setting, use `realbrowser detach --cleanup-remote-debugging` while the daemon is still running. If the daemon is already stopped, `realbrowser cleanup-remote-debugging` will not create a fresh debugging session unless `--allow-attach` is passed.

Keep this portable. The official portable boundary is Chrome DevTools MCP/CDP plus Chrome's own remote-debugging UI. OS browser-UI automation is best-effort only and must not be required for the core attach/detach flow.

Useful overrides:

```bash
REALBROWSER_MODE=dedicated "$REALBROWSER_CLI" doctor --deep
"$REALBROWSER_CLI" --backend dev doctor --deep
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" tabs
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" download <uid> report.pdf
REALBROWSER_CDP_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" wait-download report.pdf
REALBROWSER_STATE_FILE=/tmp/realbrowser.json "$REALBROWSER_CLI" doctor
REALBROWSER_BROWSER_USER_DATA_DIR=/path/to/browser/profile-root "$REALBROWSER_CLI" status
REALBROWSER_BROWSER_PROCESS_NAME="Google Chrome" "$REALBROWSER_CLI" detach --dismiss-banner
```

## Commands

- `doctor [--deep]`: check Node, npm/npx, daemon, MCP tools, and optionally live tabs.
- `status [--deep]`: show local daemon/control state without attaching by default. It may include default-local-browser remote-debugging metadata when that file is available; treat that as a diagnostic hint, not proof for dedicated profiles, `--browser-url`, or remote CDP. Pass `--deep` to attach and include tab count plus selected tab.
- `stop` / `detach`: stop the local daemon and close realbrowser's MCP connection. Plain detach leaves Chrome remote debugging enabled and does not touch browser UI. Add `--dismiss-banner` only when the user explicitly wants a best-effort click on the visible automation banner `X`. Add `--cleanup-remote-debugging` only when the user explicitly wants Chrome's remote-debugging setting turned off too.
- `cleanup-remote-debugging`: turn off Chrome's `chrome://inspect/#remote-debugging` setting through an existing realbrowser daemon, then stop the daemon. Add `--allow-attach` to start a fresh permission-gated attach when no daemon is running. Dedicated-profile mode skips user Chrome settings cleanup and just stops the managed session. `--browser-url` cleanup targets the configured backend through browser UI when possible; local Chrome metadata may not describe that backend.
- `restart`: restart the persistent daemon's MCP/browser connection without changing the daemon token or port.
- `tabs`: list open pages.
- `open <url>` / `newtab <url>`: open a URL in a new background page without bringing Chrome to the front. Pass `--front` only when the user explicitly wants Chrome focused.
- `navigate <url>` / `goto <url>`: navigate the selected page to a URL.
- `back`, `forward`, `reload`: navigate browser history or reload the page.
- `select <pageId> [--front]` / `tab <pageId>`: select a page for later commands. It does not bring Chrome to the front unless `--front` is passed.
- `select <uid|selector> <value> [--page <id>]`: select a dropdown option by value, label, or visible text.
- `focus <pageId>`: select a page and bring Chrome to the front.
- `close <pageId>` / `closetab <pageId>`: close a tab.
- `observe [--screenshot] [--limit <n>] [--max-chars <n>]`: compact page overview with title, URL, headings, visible controls, fields, console errors, and failed/recent network lines. Use this first for "what is on the page?"
- `snapshot` / `accessibility [--efficient] [--interactive] [--compact] [--depth <n>] [--max-chars <n>] [--max-nodes <n>] [--labels|--annotate] [--out <path>] [--raw|--verbose]`: get a capped role-style snapshot with actionable Chrome MCP `uid` refs. `--efficient` is the OpenClaw-style preset: interactive, compact, depth-limited, and capped. `--labels` saves a labeled screenshot and prints `MEDIA:<path>`.
- `click <uid> [--page <id>]`: click a ref from the latest snapshot.
- `hover <uid> [--page <id>]`: hover a snapshot ref.
- `drag <fromUid> <toUid> [--page <id>]`: drag one snapshot ref to another.
- `type <text> [--page <id>]`: type into the focused element.
- `fill <uid> <value> [--page <id>]`: fill an input/select ref.
- `fill-form '[{"uid":"...","value":"..."}]' [--page <id>]`: fill multiple refs in one command.
- `press <key> [--page <id>]`: press a key or key chord, such as `Enter` or `Meta+L`.
- `click-coords <x> <y> [--page <id>]`: click the element at viewport coordinates when refs are not enough.
- `highlight <uid|selector> [--page <id>]`: temporarily highlight what a ref or selector resolves to.
- `upload <uid> <file> [--page <id>]`: upload a local file through a file input ref.
- `wait <text> [more text...] [--timeout <ms>] [--page <id>]`: wait until one text value appears. Use `wait --load`, `wait --domcontentloaded`, or `wait --networkidle` for page readiness checks.
- `scroll [selector|uid] [--page <id>]`: scroll a selector/ref into view, or scroll to bottom.
- `viewport <WxH|reset> [--page <id>]`: emulate viewport size without resizing the real Chrome window, or clear emulation.
- `emulate`: set or reset Chrome MCP emulation options such as network, CPU, user agent, color scheme, and geolocation.
- `useragent <ua|reset>`: gstack-compatible shortcut for `emulate --user-agent`.
- `cookie <name=value>`: set a cookie on the current page path.
- `dialog arm accept|dismiss [text]`, `dialog --accept|--dismiss [text]`, `dialog-accept [text]`, `dialog-dismiss`: pre-arm the next alert/confirm/prompt in the current page. Use `dialog list` to read captured dialog records, or `dialog current accept|dismiss` to handle a dialog that is already open.
- `eval <js>` / `js <js> [--page <id>]`: run JavaScript in the page. Expressions are wrapped automatically. Output is capped unless `--raw` is passed.
- `text`, `html`, `links`, `forms`, `cookies`, `storage`, `perf`, `url`: fast read helpers backed by page JavaScript. Use `--limit`, `--max-chars`, and `--out <path>` for large pages. `cookies` and `storage` redact values unless `--values` is passed.
- `css <selector|uid> <property>`, `attrs <selector|uid>`, `is <state> <selector|uid>`: inspect elements by CSS selector or snapshot uid.
- `console [get <msgid>] [--errors] [--filter <text>] [--limit <n>] [--clear] [--preserve]`: list capped console messages, or fetch one message by id. `--clear` hides already-seen lines for the current daemon.
- `network [get <reqid>] [--failed] [--filter <text>] [--limit <n>] [--clear] [--preserve] [--request-file path] [--response-file path]`: list capped network requests, or fetch one request by id. Use files for large request/response bodies.
- `errors` / `requests`: OpenClaw-style aliases for `console --errors` and `network`.
- `screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp] [--max-side <px>] [--max-bytes <bytes|5mb>] [--raw-size|--no-normalize]`: save a screenshot. `--labels` overlays snapshot uid labels before capture and removes them afterward. Screenshots use OpenClaw-style size targets by default: max side 2000px and max target size 5mb. To stay portable, realbrowser reduces capture size through Chrome/MCP screenshot viewport emulation and JPEG quality instead of native image post-processing. Use `--raw-size` for exact physical browser pixels. If `path` is omitted, a timestamped image is written under `~/.realbrowser/screenshots`.
- `responsive <path-prefix>`: save mobile, tablet, and desktop screenshots in one daemon call.
- `diff <url1> <url2>`: navigate and produce a simple text diff.
- `download <uid> [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]`: click a snapshot uid and save the resulting download. With `--browser-url`, `--cdp-url`, or `REALBROWSER_CDP_URL`, this uses Chrome's native CDP download events. Without CDP, it falls back to watching Chrome's download directory, defaulting to `~/Downloads`, and copying the completed file into `~/.realbrowser/downloads` or the requested path.
- `wait-download [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]`: wait for the next download event/file and save it to the requested path or the default Codex download directory.
- `handoff [pageId]`: bring a page to the front and print a fresh snapshot for manual handoff.
- `resume [pageId] [--page <id>]`: print a fresh snapshot without bringing Chrome to the front.
- `trace start|stop`, `trace analyze <insightSetId> <insightName>`: run Chrome performance tracing.
- `tools`: list available Chrome DevTools MCP tools.
- `tool <mcpToolName> [jsonArgs]`: call a raw MCP tool for features not wrapped yet.
- `chain '[["observe"],["snapshot","--efficient"],["console","--errors"]]' [--return summary|final|all] [--trace <path>]`: run multiple commands in one daemon RPC for speed. Default output is a compact summary; full traces should go to disk.

Passing `--page <id>` targets a tab directly without focusing Chrome, so background screenshots and snapshots do not cover the terminal. Opening pages should also stay background by default; use `--front` or `focus` only for explicit handoff.

Global flags:

- `--json`: print raw JSON responses.
- `--quiet`: print only the shortest useful value when available.
- `--verbose`: raise output caps and request more detail. Use when the compact result is missing useful context.
- `--raw`: bypass realbrowser compaction and print the underlying MCP response. Use when the user asks for full output.
- `--mode compact|normal|verbose|raw`: output mode shortcut. `REALBROWSER_OUTPUT=verbose|raw|quiet` can set the default for a command or session.
- `--`: stop option parsing. Use before literal text or JavaScript that begins with a known flag, such as `type -- --raw`.
- `--state-file <path>`: use a custom daemon state file.
- `--backend real|dev`: choose real-browser auto-connect or the dedicated dev profile.
- `--browser-url <url>`: connect to an existing CDP endpoint instead of autoConnect.
- `--cdp-url <url>`: use a CDP endpoint for download interception while keeping the browser backend unchanged.
- `--dedicated`: force the dedicated fallback profile.
- `--no-fallback`: require real Chrome/Chrome MCP attach to work; do not switch to the dedicated profile. Use this whenever existing cookies/login state are required.
- `--dismiss-banner`: explicitly request the best-effort browser-UI click that hides Chrome's automation banner during detach. This does not change remote-debugging/CDP settings. On unsupported platforms, the CLI prints the manual banner-X instruction instead of failing.

## Operating Loop

1. Start with `doctor` when setup is uncertain. For login-state tasks, verify the intended Chrome profile, enable Chrome remote debugging/CDP in `chrome://inspect/#remote-debugging`, and run with `--no-fallback`.
2. Use `tabs` before opening new pages if prior attempts may have left tabs around.
3. Use `observe` first for page state; use `snapshot --efficient` only when you need clickable `uid` refs.
4. Act only on current snapshot `uid` refs.
5. After navigation, modal changes, or form submission, run `observe` or `snapshot --efficient` again before the next action.
6. If a `uid` is stale, snapshot once and retry with the new ref.
7. For workflows with several actions, prefer `chain --return summary --trace ~/.realbrowser/trace.json`.
8. Do not restart the daemon during normal browser work; restarting can trigger Chrome's remote-debugging approval dialog again.
9. Ask for explicit user approval before submitting sensitive data, making purchases, deleting data, changing account/security settings, granting permissions, or taking any action that is hard to undo.
10. Stop and report manual blockers such as login, 2FA, captcha, camera/microphone permission, or Chrome remote debugging approval.

## Token And Speed Rules

- Prefer `observe`, `snapshot --efficient`, `console --errors --limit 20`, and `network --failed --limit 30`.
- Do not call raw/full snapshot by default. If the user asks for verbose or full output, use `--verbose`, `--raw`, `REALBROWSER_OUTPUT=verbose`, `REALBROWSER_OUTPUT=raw`, or `--out <path>`.
- On Windows PowerShell, set full-output mode with `$env:REALBROWSER_OUTPUT = "raw"` before running `scripts\realbrowser.ps1`, then remove it with `Remove-Item Env:\REALBROWSER_OUTPUT`.
- For large HTML/text/network bodies, use `--out <path>` or `network get --response-file <path>`.
- Use `--page <id>` after `tabs` or `select` to avoid extra target discovery.
- Screenshot commands return file paths; inspect the image only when visual evidence is needed.
- Default screenshots are normalized for agent use. Use `--raw-size` only when exact browser pixels matter.

## Platform Notes

- Supported runtimes: macOS, Linux, and Windows with Node.js 22+ and `npm`/`npx`.
- Use `scripts/realbrowser` on macOS/Linux; use `scripts\realbrowser.ps1` on Windows PowerShell; use `scripts\realbrowser.cmd` on `cmd.exe`; `node scripts\realbrowser.mjs` and the npm bin are portable fallbacks.
- Real-browser attach is delegated to Chrome DevTools MCP. If auto-connect cannot attach to a real profile on any OS, retry with `--backend dev` only when existing cookies/login state are not required.
- Remote-debugging metadata checks understand common Chrome, Chromium, Chrome Beta/Testing, Brave, Edge, Vivaldi, Linux Flatpak, and Windows user-data locations. Set `REALBROWSER_BROWSER_USER_DATA_DIR` or `REALBROWSER_CHROME_USER_DATA_DIR` when the profile root is custom.
- Banner-X dismissal is an opt-in best-effort desktop UI action via `detach --dismiss-banner`. The core detach flow remains portable because it does not require that UI automation to succeed, and it never disables CDP unless `--cleanup-remote-debugging` is explicitly passed.
- Screenshot normalization is dependency-free and uses Chrome DevTools MCP capture/emulation calls on macOS, Linux, and Windows.
- Protocol actions, screenshots, snapshots, console, network, and downloads should not require focusing the browser window.

## Security Notes

Chrome DevTools MCP can inspect and modify browser state. Avoid using it on sensitive tabs unless the user explicitly wants that. Never silently submit sensitive forms or irreversible actions. The local daemon binds only to `127.0.0.1` and requires the bearer token from the state file for command calls.
