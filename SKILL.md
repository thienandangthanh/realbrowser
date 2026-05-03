---
name: realbrowser
description: Use when you need fast local real-browser automation from Codex, including listing/selecting Chrome profiles, named browser sessions, anonymous clean-state sessions, network/performance capture, opening tabs, taking snapshots or screenshots, clicking, typing, filling forms, reading console/network data, or debugging localhost/browser UI with Chrome DevTools MCP.
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
```

For simple one-off captures, do not spend a command on `doctor` unless setup is
unknown or a browser command fails. Start with `open`/`select-tab`, then verify
the result directly; `doctor` is for environment diagnosis, not a required
preflight for every screenshot.

On Windows PowerShell, prefer `scripts\realbrowser.ps1 ...`. On `cmd.exe`, use `scripts\realbrowser.cmd ...`. `node scripts\realbrowser.mjs ...` and the installed `realbrowser` npm bin are also portable. The POSIX `scripts/realbrowser` wrapper is for macOS/Linux shells.

The CLI starts a persistent loopback daemon on demand. The daemon stores its port and bearer token in `~/.realbrowser/state.json` and talks to `chrome-devtools-mcp` over stdio.

`status` is side-effect-light by default and should be used to check whether realbrowser is already controlling Chrome. It may inspect default-local-Chrome remote-debugging metadata when that file is available, without attaching to the browser backend; treat that metadata as a hint, not proof for every backend. Use `status --deep`, `tabs`, or any page command only when you intentionally want to attach to the browser backend.

Use `--session <name>` whenever multiple browser contexts may exist. A named session has its own state file under `~/.realbrowser/sessions/`, so `tom-anon`, `default-anon`, and the default session do not overwrite each other.

Realbrowser also has one active session pointer at `~/.realbrowser/active-session.json`. `select-tab` sets it after a unique match, explicit `--session <name>` commands set it after successful page commands, and `use-session <name>` sets it manually. Plain follow-up commands such as `observe`, `console`, `capture-network`, `viewport`, and `screenshot` use the active running session automatically. Use `sessions` to see the active `*`, `active-session` to inspect it, `clear-session` to forget it, and `--no-active-session` when you intentionally want the default state file instead.

For concurrent Codex tabs or other multi-agent work, use tab handles instead of
selected-tab state. A handle is a small JSON file containing `session + pageId`.
Commands that accept page context can use `--handle <path-or-name>` or
`REALBROWSER_HANDLE`, which pins follow-up commands to that tab even when another
Codex tab selects a different page in the same browser profile:

```bash
"$REALBROWSER_CLI" claim https://ninzap.dev --session work-profile --handle-name ninzap --json
export REALBROWSER_HANDLE=ninzap
"$REALBROWSER_CLI" screenshot tmp/ninzap.png
"$REALBROWSER_CLI" viewport 390x844
"$REALBROWSER_CLI" handles
"$REALBROWSER_CLI" release-handle ninzap
```

Prefer `claim` + `--handle`/`REALBROWSER_HANDLE` for daily automation. Use
`select` only for manual handoff or single-agent interactive browsing.

Viewport and screenshot operations are page-scoped in Chrome DevTools. When a
task depends on an exact viewport, especially mobile screenshots, capture the
page id printed by `open --select`, `select-tab`, or `tabs`, and pass
`--page <id>` to `viewport`, readiness waits, viewport sanity checks, and
`screenshot`. Do not trust the text `Emulating viewport: ...` by itself; verify
`window.innerWidth`/`window.innerHeight` and the output PNG dimensions before
finishing.

## Browser Choice

Default behavior:

1. Prefer Chrome DevTools MCP `--autoConnect` so Codex can control the user's real running Chrome profile after Chrome DevTools Protocol remote debugging is enabled in `chrome://inspect/#remote-debugging`.
2. If auto-connect cannot attach, fall back to a dedicated profile at `~/.realbrowser/profile`.

Chrome's "Allow remote debugging?" dialog is expected when a new Chrome DevTools MCP auto-connect session attaches to the real signed-in profile. `Allow` should be treated as permission for the current debugging connection, not a permanent approval for every future daemon process. Realbrowser should reuse an already-running real-profile attach session for plain auto-mode commands, including new `claim` calls from another Codex tab. For concurrent work in the same signed-in profile, use tab handles on that one shared attach point. Avoid creating multiple named auto-mode sessions for the same real profile; use `--dedicated` or `--anonymous` when you truly need a separate browser instance.

For tasks that require the user's logged-in Chrome profile, fallback is not acceptable. First verify the intended Chrome profile is active, open `chrome://inspect/#remote-debugging` in that profile, turn on "Allow remote debugging for this browser instance", then run realbrowser with `--no-fallback` or `REALBROWSER_NO_FALLBACK=1`. `status` should then report `Dedicated fallback disabled: yes`. If attach still fails, stop and report the Chrome remote-debugging/CDP blocker instead of continuing in the dedicated profile.

Chrome's "Chrome is being controlled by automated test software" banner is expected while Chrome DevTools MCP has an active debugging session. Report it as a safety indicator and run `realbrowser status` to identify whether realbrowser is connected. Do not detach real signed-in profile sessions as routine cleanup; keeping the session alive avoids repeated remote-debugging approval prompts and preserves the selected browser context for the next command. Plain detach should not turn off Chrome remote debugging and should not touch browser UI; it only closes realbrowser's session. If the user explicitly asks to hide the banner, use `realbrowser detach --dismiss-banner` for a best-effort click on the visible banner `X` on supported desktop platforms. This only hides browser UI and does not disable remote-debugging/CDP. On platforms where browser-UI clicking is not automated, detach must still succeed and print a manual banner-X instruction. If the task should also turn off the user's Chrome remote-debugging setting, use `realbrowser detach --cleanup-remote-debugging` while the daemon is still running. If the daemon is already stopped, `realbrowser cleanup-remote-debugging` will not create a fresh debugging session unless `--allow-attach` is passed.

Keep this portable. The official portable boundary is Chrome DevTools MCP/CDP plus Chrome's own remote-debugging UI. OS browser-UI automation is best-effort only and must not be required for the core attach/detach flow.

## Browser Profiles

When a task depends on a specific logged-in Chrome profile, list and select profiles explicitly instead of relying on whichever profile Chrome DevTools MCP auto-connect chooses:

```bash
"$REALBROWSER_CLI" profiles
"$REALBROWSER_CLI" open --profile "chrome:Profile 4" https://example.com
"$REALBROWSER_CLI" --profile "chrome:Profile 4" tabs --no-fallback
```

`profiles` discovers Chromium-family profiles on macOS, Linux, and Windows from common Chrome, Chrome Beta, Chrome for Testing, Chromium, Brave, Edge, and Vivaldi user-data roots. It prints stable ids such as `chrome:Default` or `chrome:Profile 4`, plus display/account names when Chrome stores them.

Use `--browser <key>` to disambiguate matching profiles. Use `--json` when you need exact `userDataDir`, `profilePath`, `devtoolsScope`, or detected DevTools endpoint fields.

`open --profile <id> <url>` uses the OS browser launcher with Chrome's `--profile-directory=<dir>` flag. This is the right layer for opening a tab in a specific UI profile. After that, page automation still needs a debuggable backend: enable remote debugging in that profile and use `--profile <id> --no-fallback`, or pass `--browser-url <cdp-url>` when you already know the endpoint. Chrome may expose one browser-level DevTools endpoint for several profiles under the same user-data root; in that case, attach to the endpoint, then verify/select the intended tab by URL/title before taking action. If `profiles` shows no debug endpoint for the selected profile, do not continue in the dedicated fallback when login state matters.

For requests like "go to staging.ninzap.com on Tom's browser profile, check inbox, take screenshot", use a profile-targeted open and select in one step:

```bash
"$REALBROWSER_CLI" profiles "tuyenhx.tanker" --browser chrome
"$REALBROWSER_CLI" open --profile "chrome:Profile 4" https://staging.ninzap.com/ --select --no-fallback --timeout 15000
"$REALBROWSER_CLI" active-session
"$REALBROWSER_CLI" observe
"$REALBROWSER_CLI" snapshot --efficient
"$REALBROWSER_CLI" screenshot staging-ninzap-inbox.png --full
```

Use the stable profile id when a human name is ambiguous. For example, `Tom` may match more than one account; `chrome:Profile 4`, `tuyenhx.tanker`, or the account email is safer. `--select` opens the tab with Chrome's profile selector, waits for a matching debuggable tab, attaches to the endpoint, and selects the page. If `--select` reports no endpoint, stop and ask the user to enable Chrome remote debugging for that profile instead of falling back to the dedicated profile.

When the user asks to check a URL that may already be open, search existing debuggable tabs before opening a new one:

```bash
"$REALBROWSER_CLI" find-tab "developers.facebook.com/apps/1788280045116508"
"$REALBROWSER_CLI" select-tab "developers.facebook.com/apps/1788280045116508" --no-fallback
"$REALBROWSER_CLI" observe
```

`find-tab`/`tabs-all` enumerate tabs from every discovered DevTools endpoint and show matching URL/title plus possible profiles. `select-tab` attaches to the matching endpoint and selects the matching page when there is exactly one candidate. A unique selection becomes the active session; use plain follow-up commands unless you intentionally pass another `--session`. If several tabs match, do not guess; show the candidates and ask the user which one to use. If no tab is debuggable, open the URL with `open --profile <id> <url>`.

## Anonymous Sessions And Network Capture

`--anonymous` means Chrome DevTools MCP isolated browser state in a Chrome Incognito window, not privacy/anonymity on the network. It starts Chrome DevTools MCP with isolated mode and an incognito Chrome argument, then navigates the initial incognito `about:blank` page instead of using MCP `new_page`, because `new_page` can open a separate normal isolated window. Use it when the user asks for anonymous mode, clean login testing, first-run UI checks, or cookie-free behavior:

```bash
"$REALBROWSER_CLI" open https://ninzap.dev --anonymous --select
"$REALBROWSER_CLI" observe
"$REALBROWSER_CLI" screenshot ninzap-dev-anonymous.png --full
"$REALBROWSER_CLI" detach
```

An anonymous daemon keeps its isolated browser state for follow-up commands until `detach`/`stop`; plain follow-up commands reuse the running daemon. Use `--keep-anonymous` only when you need a debuggable temporary `userDataDir` preserved after detach.

For multiple anonymous/profile contexts, name every context and search all sessions before opening a duplicate:

```bash
"$REALBROWSER_CLI" open https://ninzap.dev --anonymous --session tom-anon --select
"$REALBROWSER_CLI" open about:blank --anonymous --session default-anon --select
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab ninzap.dev --all-sessions
"$REALBROWSER_CLI" select-tab ninzap.dev --all-sessions
"$REALBROWSER_CLI" observe
```

For a profile-bound Incognito window, combine `--profile`, `--anonymous`, `--session`, and `--select`. This opens Chrome with `--profile-directory=<profile>` plus `--incognito`, then attaches to the profile's detected DevTools endpoint. It requires that profile to expose a DevTools endpoint for automation:

```bash
"$REALBROWSER_CLI" open https://ninzap.dev --profile "chrome:Profile 4" --anonymous --session tom-anon --select --no-fallback
```

When the user says "check the current UI on ninzap.dev" and there may be several profiles or anonymous sessions, first run `sessions` and `find-tab ninzap.dev --all-sessions`. If exactly one tab matches, run `select-tab ninzap.dev --all-sessions`; this activates that session, so continue with plain commands like `observe`, `responsive`, `console`, or `screenshot`. If several match, show the candidates and ask; do not guess.

For a mobile viewport screenshot, prefer the atomic command. It opens or
navigates the pinned tab, sets the requested viewport, waits for network idle,
captures a raw-size PNG, and verifies the PNG dimensions:

```bash
"$REALBROWSER_CLI" mobile-screenshot https://example.com tmp/site-mobile.png --session site-mobile --anonymous --viewport 390x844
"$REALBROWSER_CLI" mobile-screenshot https://example.com tmp/site-mobile.png --handle-name site-mobile-handle --viewport 390x844
```

For manual mobile flows, use `claim` or an explicit `--page`. This avoids a
common failure where `viewport` appears to succeed but the screenshot still
captures the desktop-sized browser page. Keep the verification portable: use
`tabs --json` plus `scripts/realbrowser-helper.mjs` to find the selected page id,
and read PNG dimensions from the PNG header instead of OS-specific tools such as
`awk`, `file`, or macOS `sips`.

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
REALBROWSER_HELPER="$HOME/.codex/skills/realbrowser/scripts/realbrowser-helper.mjs"
SESSION="site-mobile"
OUT="tmp/site-mobile.png"

"$REALBROWSER_CLI" open https://example.com --anonymous --session "$SESSION" --select --timeout 20000
PAGE=$("$REALBROWSER_CLI" --session "$SESSION" tabs --json | node "$REALBROWSER_HELPER" selected-page-id)
"$REALBROWSER_CLI" --session "$SESSION" viewport 390x844 --page "$PAGE"
"$REALBROWSER_CLI" --session "$SESSION" wait --networkidle --timeout 20000 --page "$PAGE"
"$REALBROWSER_CLI" --session "$SESSION" js "({innerWidth,innerHeight,devicePixelRatio})" --page "$PAGE"
"$REALBROWSER_CLI" --session "$SESSION" screenshot "$OUT" --raw-size --page "$PAGE"
node "$REALBROWSER_HELPER" png-size "$OUT"
```

PowerShell equivalent:

```powershell
$RealbrowserCli = Join-Path $HOME ".codex/skills/realbrowser/scripts/realbrowser.ps1"
$RealbrowserHelper = Join-Path $HOME ".codex/skills/realbrowser/scripts/realbrowser-helper.mjs"
$Session = "site-mobile"
$Out = "tmp/site-mobile.png"

& $RealbrowserCli open https://example.com --anonymous --session $Session --select --timeout 20000
$Page = & $RealbrowserCli --session $Session tabs --json | node $RealbrowserHelper selected-page-id
& $RealbrowserCli --session $Session viewport 390x844 --page $Page
& $RealbrowserCli --session $Session wait --networkidle --timeout 20000 --page $Page
& $RealbrowserCli --session $Session js "({innerWidth,innerHeight,devicePixelRatio})" --page $Page
& $RealbrowserCli --session $Session screenshot $Out --raw-size --page $Page
node $RealbrowserHelper png-size $Out
```

Show or inspect the saved PNG before final response. In Codex, use `view_image`
when available. If the PNG dimensions are not the requested viewport, reapply
`viewport ... --page <id>` and recapture with `screenshot ... --page <id>`.

For performance/network requests, start capture before navigation or reload:

```bash
"$REALBROWSER_CLI" capture-network https://ninzap.dev --anonymous --duration 15000 --har ninzap-dev.har
"$REALBROWSER_CLI" select-tab ninzap.dev
"$REALBROWSER_CLI" capture-network --reload --duration 15000 --har ninzap-dev-auth.har
```

`capture-network` records browser performance entries plus DevTools network rows, summarizes slow requests, large transfers, failed/error lines, render-blocking resources, top hosts, and navigation timing. It does not capture response bodies or auth headers. URLs in summaries redact query strings unless `--values` or `--raw` is passed; HAR files preserve full URLs because they are local artifacts.

For render bugs or requests like "check ninzap.dev console log to see what is the problem", capture console logs into an artifact the agent can analyze. Chrome DevTools Console can also show network failures when "Network messages" is enabled, so `capture-console` includes failed DevTools network rows by default; use `--no-network` only when the user needs JavaScript console messages alone.

```bash
"$REALBROWSER_CLI" capture-console https://ninzap.dev --anonymous --duration 5000 --out ninzap-dev-console.json
"$REALBROWSER_CLI" select-tab ninzap.dev
"$REALBROWSER_CLI" capture-console --reload --duration 5000 --out ninzap-dev-auth-console.json
"$REALBROWSER_CLI" console --errors
"$REALBROWSER_CLI" console get <msgid> --raw
```

`capture-console` lists `console.log`/`info`/`warn`/`error` messages, fetches per-message details, includes failed network rows that Chrome DevTools would show in the Console, and writes JSON with message ids, argument values, stack/source data, and `networkFailures` when Chrome DevTools MCP exposes them. In anonymous mode it reuses the initial incognito page for fresh URL captures. Use `--reload` when you need resource-load failures from the current render, `--errors` to focus on errors and warnings, `--filter <text>` to narrow noisy apps, and `console get <msgid>` when you only need one detailed message. Console logs and network rows can contain user data, tokens, request payloads, or account details; keep artifacts local unless the user explicitly wants them shared.

Useful overrides:

```bash
REALBROWSER_MODE=dedicated "$REALBROWSER_CLI" doctor --deep
"$REALBROWSER_CLI" --backend dev doctor --deep
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" tabs
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" download <uid> report.pdf
REALBROWSER_CDP_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" wait-download report.pdf
REALBROWSER_STATE_FILE=/tmp/realbrowser.json "$REALBROWSER_CLI" doctor
REALBROWSER_SESSION=tom-anon "$REALBROWSER_CLI" observe
REALBROWSER_NO_ACTIVE_SESSION=1 "$REALBROWSER_CLI" status
REALBROWSER_BROWSER_USER_DATA_DIR=/path/to/browser/profile-root "$REALBROWSER_CLI" status
REALBROWSER_BROWSER_PROCESS_NAME="Google Chrome" "$REALBROWSER_CLI" detach --dismiss-banner
```

## Commands

- `doctor [--deep]`: check Node, npm/npx, daemon, MCP tools, and optionally live tabs.
- `status [--deep]`: show local daemon/control state without attaching by default. It may include default-local-browser remote-debugging metadata when that file is available; treat that as a diagnostic hint, not proof for dedicated profiles, `--browser-url`, or remote CDP. Pass `--deep` to attach and include tab count plus selected tab.
- `profiles [query] [--browser <key>]`: list local Chromium-family browser profiles. Use the stable id from this output for profile-specific work.
- `sessions`: list running realbrowser sessions and their modes/state files. The `*` row is the active session used by commands without `--session`.
- `active-session` / `current-session`: show the remembered active session and whether it is running.
- `use-session <name> [--force]`: make a running named session the active session. `--force` only remembers the name before the daemon starts; normal use should not need it.
- `clear-session`: forget the active session pointer without stopping any browser daemon.
- `claim [url] [--handle-out <path>|--handle-name <name>]`: claim the selected page or open a URL and write a reusable tab handle containing `session + pageId`.
- `handles` / `list-handles`: list saved tab handles.
- `release-handle <path-or-name>`: delete a saved tab handle without closing the browser tab.
- `find-tab [query] [--browser <key>] [--session <name>|--all-sessions]` / `tabs-all [query]`: search existing debuggable tabs across discovered browser/profile endpoints and, with `--all-sessions`, running realbrowser sessions. Without `--all-sessions`, it also searches the active running session.
- `select-tab <query> [--browser <key>] [--session <name>|--all-sessions] [--front] [--no-activate-session]`: attach to the endpoint for a unique matching existing tab and select it for later commands. A unique match activates its session unless `--no-activate-session` is passed. If the match is ambiguous, it prints candidates instead of selecting.
- `open-profile <profile-query> <url> [--select]`: open a URL in a selected browser UI profile. Equivalent to `open <url> --profile <profile-query>`.
- `capture-network [url] [--anonymous|--profile <profile-query>|--browser-url <url>] [--reload] [--duration <ms>] [--har <path>]`: capture network/performance data from a fresh navigation, reload, or current selected page. Use `--anonymous` for clean-state checks, `--profile` or `select-tab` for authenticated checks, and `--har` for a local HAR-style artifact.
- `capture-console [url] [--anonymous|--profile <profile-query>] [--reload] [--duration <ms>] [--out <path>] [--errors] [--filter <text>] [--no-network]`: capture console logs from a fresh navigation, reload, or current selected page. It also includes failed network rows because Chrome DevTools shows those in the Console when "Network messages" is enabled. Use it for render failures and JavaScript errors; `--out` writes the detailed JSON artifact for later analysis.
- `stop` / `detach`: stop the selected daemon and close realbrowser's MCP connection. With an active session, plain `detach` stops that active session; use `--session <name>` to stop a specific named session or `--all-sessions` to stop every running session. Do not detach real signed-in profile sessions as routine cleanup. Plain detach leaves Chrome remote debugging enabled and does not touch browser UI. Add `--dismiss-banner` only when the user explicitly wants a best-effort click on the visible automation banner `X`. Add `--cleanup-remote-debugging` only when the user explicitly wants Chrome's remote-debugging setting turned off too.
- `cleanup-remote-debugging`: turn off Chrome's `chrome://inspect/#remote-debugging` setting through an existing realbrowser daemon, then stop the daemon. Add `--allow-attach` to start a fresh permission-gated attach when no daemon is running. Dedicated-profile mode skips user Chrome settings cleanup and just stops the managed session. `--browser-url` cleanup targets the configured backend through browser UI when possible; local Chrome metadata may not describe that backend.
- `restart`: restart the persistent daemon's MCP/browser connection without changing the daemon token or port.
- `tabs`: list open pages.
- `open <url>` / `newtab <url>`: open a URL in a new background page without bringing Chrome to the front. Pass `--front` only when the user explicitly wants Chrome focused.
- `open <url> --profile <profile-query> [--select]` / `newtab <url> --profile <profile-query> [--select]`: open the URL through the OS browser launcher in the selected Chrome/Chromium UI profile. This selects the profile for the visible browser tab; `--select` then attaches to the detected endpoint and selects the matching page for later commands.
- `open <url> --profile <profile-query> --anonymous --session <name> --select`: open a profile-bound Chrome Incognito window, attach to its detected DevTools endpoint, and keep later commands on the named session.
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
- `mobile-screenshot [url] [path] [--viewport <WxH>] [--handle <path-or-name>]`: page-scoped mobile screenshot flow with viewport, network-idle wait, raw-size capture, and PNG dimension verification.
- `emulate`: set or reset Chrome MCP emulation options such as network, CPU, user agent, color scheme, and geolocation.
- `useragent <ua|reset>`: gstack-compatible shortcut for `emulate --user-agent`.
- `cookie <name=value>`: set a cookie on the current page path.
- `dialog arm accept|dismiss [text]`, `dialog --accept|--dismiss [text]`, `dialog-accept [text]`, `dialog-dismiss`: pre-arm the next alert/confirm/prompt in the current page. Use `dialog list` to read captured dialog records, or `dialog current accept|dismiss` to handle a dialog that is already open.
- `eval <js>` / `js <js> [--page <id>]`: run JavaScript in the page. Expressions are wrapped automatically. Output is capped unless `--raw` is passed.
- `text`, `html`, `links`, `forms`, `cookies`, `storage`, `perf`, `url`: fast read helpers backed by page JavaScript. Use `--limit`, `--max-chars`, and `--out <path>` for large pages. `cookies` and `storage` redact values unless `--values` is passed.
- `css <selector|uid> <property>`, `attrs <selector|uid>`, `is <state> <selector|uid>`: inspect elements by CSS selector or snapshot uid.
- `console [get <msgid>] [--errors] [--filter <text>] [--limit <n>] [--clear] [--preserve]`: list capped console messages, or fetch one message by id. `--clear` hides already-seen lines for the current daemon. Use `capture-console --out` when the user needs logs copied into a durable artifact for debugging.
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
- `--session <name>`: use or create a named realbrowser session. Use this for workflows with multiple profiles, multiple anonymous windows, or long-lived app contexts.
- `--no-active-session`: ignore the remembered active session for this command and target the default state file or explicit flags instead.
- `--no-activate-session`: on `select-tab`, select a unique tab without changing the active session pointer.
- `--all-sessions`: search or stop all known running sessions. Use with `find-tab`, `select-tab`, `tabs-all`, or `detach`.
- `--state-file <path>`: use a custom daemon state file.
- `--backend real|dev`: choose real-browser auto-connect or the dedicated dev profile.
- `--browser-url <url>`: connect to an existing CDP endpoint instead of autoConnect.
- `--cdp-url <url>`: use a CDP endpoint for download interception while keeping the browser backend unchanged.
- `--profile <profile-query>`: select a discovered local browser profile by stable id, profile directory, display name, account email, or path. On `open`/`newtab`, this launches the selected UI profile. On attach commands, it uses that profile's detected DevTools endpoint and fails if none is available. If the endpoint is browser-level, verify/select the intended tab after attach.
- `--browser <key>`: narrow profile discovery/selection to a browser such as `chrome`, `brave`, `edge`, `chromium`, or `vivaldi`.
- `--select`: after profile-targeted `open`/`newtab`, wait for the matching debuggable tab, attach to its endpoint, and select it for follow-up commands.
- `--anonymous`: use Chrome DevTools MCP isolated browser state. This is clean browser state, not network anonymity.
- `--keep-anonymous`: keep the temporary anonymous profile directory after detach for debugging.
- `--force`: only for commands that explicitly document it, such as `use-session --force`.
- `--reload`: reload the selected page for commands such as `capture-network`.
- `--duration <ms>`: capture or wait duration for commands such as `capture-network`.
- `--har <path>`: write a local HAR-style network artifact for `capture-network`.
- `--out <path>`: write command output artifacts such as console capture JSON or large read results.
- `--no-network`: on `capture-console`, skip DevTools network failure rows and capture JavaScript console messages only.
- `--dedicated`: force the dedicated fallback profile.
- `--no-fallback`: require real Chrome/Chrome MCP attach to work; do not switch to the dedicated profile. Use this whenever existing cookies/login state are required.
- `--dismiss-banner`: explicitly request the best-effort browser-UI click that hides Chrome's automation banner during detach. This does not change remote-debugging/CDP settings. On unsupported platforms, the CLI prints the manual banner-X instruction instead of failing.

## Operating Loop

1. Start with `doctor` when setup is uncertain. For login-state tasks, verify the intended Chrome profile, enable Chrome remote debugging/CDP in `chrome://inspect/#remote-debugging`, and run with `--no-fallback`.
2. If several profiles or anonymous sessions may be open, run `sessions` and `find-tab <url-or-title> --all-sessions` first. Use `select-tab <query> --all-sessions` only when there is a unique match; it activates that context, so follow-up commands can be plain `observe`, `snapshot`, `console`, `capture-network`, or `screenshot`.
3. If the user asks for anonymous/clean mode, run `open <url> --anonymous --session <task-name> --select`, do the UI checks, and `detach --session <task-name>` when finished so the isolated session is closed. If the anonymous session should remain available for more checks, leave it running and mention that it is the active session.
4. If the user asks for network/performance issues, prefer `capture-network <url> --anonymous` for clean-state checks or `select-tab`/`--profile` plus `capture-network --reload` for authenticated checks.
5. If the user asks for console logs, JavaScript errors, or "what is the render problem", use `capture-console <url> --anonymous --out <file>` for clean-state checks or `select-tab`/`--profile` plus `capture-console --reload --out <file>` for authenticated checks. Feed the JSON artifact back into analysis.
6. If a specific signed-in profile matters and no suitable tab is open, run `profiles`, choose a stable id, and open the target URL with `open --profile <id> <url>` before attaching.
7. Use `tabs` before opening new pages if prior attempts may have left tabs around.
8. Use `observe` first for page state; use `snapshot --efficient` only when you need clickable `uid` refs.
9. Act only on current snapshot `uid` refs.
10. After navigation, modal changes, or form submission, run `observe` or `snapshot --efficient` again before the next action.
11. If a `uid` is stale, snapshot once and retry with the new ref.
12. For workflows with several actions, prefer `chain --return summary --trace ~/.realbrowser/trace.json`.
13. Do not restart or detach real signed-in profile sessions during normal browser work; starting a fresh CDP session can trigger Chrome's remote-debugging approval dialog again. Use `active-session`/`sessions` to reuse the existing approved connection.
14. Ask for explicit user approval before submitting sensitive data, making purchases, deleting data, changing account/security settings, granting permissions, or taking any action that is hard to undo.
15. Stop and report manual blockers such as login, 2FA, captcha, camera/microphone permission, or Chrome remote debugging approval.

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
- Profile discovery and profile launching are cross-platform for common Chromium-family browsers. Profile launch uses Chrome's `--profile-directory` flag; attach commands use Chrome DevTools MCP/CDP and cannot switch profiles unless the selected profile exposes a DevTools endpoint. Browser-level endpoints may include tabs from multiple profiles, so tab selection remains mandatory.
- Anonymous mode uses Chrome DevTools MCP isolated state by default. `--keep-anonymous` uses a temporary `userDataDir` for inspection after detach. Neither mode masks IP address, device/browser fingerprint, or network identity.
- Network capture uses in-browser PerformanceResourceTiming plus DevTools request rows; it is designed for UI/performance triage, not full proxy-grade packet capture.
- Banner-X dismissal is an opt-in best-effort desktop UI action via `detach --dismiss-banner`. The core detach flow remains portable because it does not require that UI automation to succeed, and it never disables CDP unless `--cleanup-remote-debugging` is explicitly passed.
- Screenshot normalization is dependency-free and uses Chrome DevTools MCP capture/emulation calls on macOS, Linux, and Windows.
- Protocol actions, screenshots, snapshots, console, network, and downloads should not require focusing the browser window.

## Security Notes

Chrome DevTools MCP can inspect and modify browser state. Avoid using it on sensitive tabs unless the user explicitly wants that. Never silently submit sensitive forms or irreversible actions. The local daemon binds only to `127.0.0.1` and requires the bearer token from the state file for command calls.
