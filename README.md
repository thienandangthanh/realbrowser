# Realbrowser

Realbrowser exists so Codex can use the browser a developer is actually using, faster than Codex Computer Use and without forcing a slow separate Playwright browser.

The default Codex browser automation path is useful, but it is not enough for web development when the state that matters lives in a signed-in Chrome profile: cookies, local storage, feature flags, extensions, active tabs, console logs, and network traffic. Realbrowser combines the fast local workflow patterns from gstack with the native real-browser direction from OpenClaw, giving Codex one fast local CLI while still keeping a dedicated fallback profile for cases where attaching to the real browser is unavailable or unsafe.

## What It Provides

- A Codex skill named `realbrowser`.
- A local CLI at `scripts/realbrowser`.
- A persistent loopback daemon for fast follow-up commands.
- Chrome DevTools MCP integration for real Chrome attach.
- Direct CDP fast paths for cheap endpoint/profile operations such as tab list,
  open, select, navigation, JavaScript evaluation, and simple page reads, using
  DevTools HTTP where possible and one persistent CDP socket per daemon when a
  WebSocket is needed.
- A dedicated profile fallback at `~/.realbrowser/profile`.
- Short tab targets for daemon sessions, tab listing/selection, navigation, compact observations, OpenClaw-style role/DOM snapshots, efficient snapshots, clicks, typing, forms, JavaScript evaluation, capped console and network inspection, OpenClaw-style normalized screenshots, annotated labels, pre-armed dialog handling, user-agent emulation, and download interception.

## Why Not Just Playwright?

Playwright is excellent for isolated automation, but this project is for the opposite case: debugging a real browser session with the same login and state the developer already has. Realbrowser uses direct CDP for cheap operations when a concrete endpoint is known, and Chrome DevTools MCP for high-level operations such as snapshots, screenshots, refs, console/network buffers, and emulation.

## Skill Architecture

Realbrowser is a Codex skill first and a small CLI second. Keep the project thin,
portable, and copyable:

- `SKILL.md` contains the agent workflow and should stay concise.
- `scripts/realbrowser.mjs` is the main zero-dependency implementation.
- `scripts/realbrowser`, `scripts/realbrowser.cmd`, and
  `scripts/realbrowser.ps1` are portability wrappers only.

Prefer improving section boundaries inside `scripts/realbrowser.mjs` over
splitting it into an app-style module tree. A larger tree makes the skill harder
to copy, inspect, and run from a fresh Codex environment. Split code only when a
boundary has become stable enough to justify the extra files, such as shared
logic used by multiple scripts, a state/session store that needs isolated tests,
or a protocol adapter that can be validated independently.

Within the single file, prefer metadata-driven structure over scattered special
cases. Commands should be described in the command registry, help and minimum
argument validation should come from that metadata, parser edge cases should be
validated before the daemon starts, and each CLI/state regression should add a
self-test. This keeps the portable script maintainable without turning the skill
into a full package.

The intended internal order is:

1. Constants, platform data, and profile definitions.
2. Command registry, help text, parser, and validation.
3. State, sessions, handles, and locking.
4. Browser/profile discovery and launch.
5. Daemon lifecycle and MCP RPC adapter.
6. Command handlers.
7. Output formatting and self-tests.

## Quick Start

Requirements:

- Node.js 22 or newer.
- `npm`/`npx`, used to run `chrome-devtools-mcp`.
- Chrome or a Chromium-family browser supported by Chrome DevTools MCP.

macOS/Linux:

```bash
./scripts/realbrowser doctor
./scripts/realbrowser tabs
./scripts/realbrowser open http://localhost:3000
./scripts/realbrowser observe
./scripts/realbrowser snapshot --efficient
```

Windows PowerShell:

```powershell
.\scripts\realbrowser.ps1 doctor
.\scripts\realbrowser.ps1 tabs
.\scripts\realbrowser.ps1 open http://localhost:3000
.\scripts\realbrowser.ps1 observe
.\scripts\realbrowser.ps1 snapshot --efficient
```

Windows `cmd.exe`:

```bat
scripts\realbrowser.cmd doctor
scripts\realbrowser.cmd tabs
scripts\realbrowser.cmd open http://localhost:3000
scripts\realbrowser.cmd observe
scripts\realbrowser.cmd snapshot --efficient
```

Portable Node entrypoint on any OS:

```bash
node scripts/realbrowser.mjs doctor
```

Use `--backend dev` for the dedicated fallback profile:

```bash
./scripts/realbrowser --backend dev doctor --deep
```

Use `--browser-url` or `REALBROWSER_BROWSER_URL` when you have an explicit Chrome DevTools endpoint:

```bash
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 ./scripts/realbrowser tabs
```

## Chrome Remote Debugging Approval

When using the default real-browser mode, realbrowser starts Chrome DevTools MCP with `--autoConnect`. Current Chrome DevTools MCP documents that auto-connect works with Chrome 144+ and requires remote debugging to be enabled from `chrome://inspect/#remote-debugging`.

Chrome may show an "Allow remote debugging?" dialog because this grants an external app full control of the real signed-in profile. Treat `Allow` as permission for the current debugging connection, not as a permanent trust grant for every future daemon/MCP process. Normal follow-up commands should reuse the persistent realbrowser daemon and should not ask again. It can reappear after:

- `realbrowser stop` or `realbrowser restart`.
- Code changes while developing realbrowser.
- Switching backend/mode/state files.
- Chrome or Chrome DevTools MCP closing and reconnecting.

To reduce prompts, keep the daemon warm and avoid restarting it during normal browser work. If you need a pre-opened debug endpoint, launch Chrome with a localhost-only DevTools port and use `REALBROWSER_BROWSER_URL=http://127.0.0.1:9222`, but do that only on a trusted machine because a DevTools port can control the browser.

Chrome may expose a profile's browser WebSocket while returning 404 for
`/json/list`; realbrowser handles that through the approved persistent daemon
by falling back to `Target.getTargets` over the daemon's CDP socket. It should
not create transient WebSocket probes in polling loops because those can show
the approval dialog repeatedly. Keep the approved daemon alive instead of
repeatedly reattaching.

## Chrome Controlled Banner

Chrome may also show "Chrome is being controlled by automated test software" while realbrowser or Chrome DevTools MCP is attached, or while Chrome remote debugging remains enabled. This is expected for a real signed-in profile. Realbrowser should not try to hide or suppress this banner because it is Chrome's safety signal that another local process can inspect or control the browser.

Use `realbrowser status` for a side-effect-light control check. It does not start the browser backend by default. Use `realbrowser status --deep`, `realbrowser tabs`, or any page command only when you intentionally want to attach.

Per Chrome's remote debugging flow, the banner can remain visible when Chrome still has remote debugging enabled or another debugging client is attached. Realbrowser can close its own daemon/MCP connection, but it should not use OS-specific process/port probing or hidden browser mutations to clear Chrome's UI. The portable cleanup path is the Chrome UI: use the banner's button or `chrome://inspect/#remote-debugging`.

Relevant official references:

- Chrome DevTools MCP active-session flow: <https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session>
- Chrome DevTools Protocol HTTP/WebSocket endpoints: <https://chromedevtools.github.io/devtools-protocol/>
- Chrome DevTools MCP troubleshooting: <https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md>

To detach realbrowser:

```bash
./scripts/realbrowser stop
# same behavior:
./scripts/realbrowser detach
```

Stopping or detaching realbrowser closes its daemon/MCP connection. If Chrome still shows the banner afterward, Chrome remote debugging is still enabled or another tool is attached. Use the banner's "Turn off in settings" button, or open `chrome://inspect/#remote-debugging` and turn off remote debugging.

## Fast Agent Defaults

Realbrowser is designed to keep Codex token use low:

- Use `observe` for the first page read.
- Use `snapshot --compact --max-chars <n>` for compact OpenClaw-style role
  snapshot reads.
- Use `snapshot-aria --out <path>` for OpenClaw-style AX node records.
- Use `snapshot-dom --out <path>` when element records are needed for local
  inspection without dumping full HTML into the model context.
- Use `query-selector <selector> --out <path>` for OpenClaw-style selector
  match records.
- For large dynamic pages such as Facebook-style feeds, chats, dashboards, or
  virtualized lists, start with compact snapshots, then write
  `snapshot-dom`/`snapshot-aria`/`query-selector` results to files and inspect
  those files with OS-available tools. `rg`/`jq` are optional; PowerShell
  `Select-String`/`ConvertFrom-Json` or Node work on Windows. Do not use
  full-page HTML stdout as the default parser.
- Managed anonymous/dedicated sessions run headless by default. Use `--headed`
  or `--front` only for an explicit visual handoff.
- Managed anonymous/dedicated sessions idle-shutdown after
  `REALBROWSER_IDLE_TIMEOUT_MS` milliseconds, defaulting to 30 minutes; real
  signed-in profile sessions stay alive to avoid repeated approval prompts.
- Use `wait <text>` or readiness waits instead of shell sleeps.
- Use profile/endpoint sessions when possible; cheap operations use one
  persistent direct-CDP socket before MCP. Reuse the endpoint-scoped session for
  a real signed-in browser; pass `--force` only when intentionally creating a
  duplicate controller.
- Use `snapshot --efficient` when clickable `uid` refs are needed.
- Use `snapshot --labels` or `screenshot --labels` for annotated screenshots.
- `open` and `newtab` open background tabs by default; pass `--front` only for an explicit visual handoff.
- For real signed-in profile opens, do not add `--select` by default while the
  user is working in another app. Open in the background, then use
  `find-tab`/`select-tab` or a handle if follow-up automation needs a target.
- Use compact targets from `tabs`/`find-tab` such as `t1` instead of raw target ids.
- Use `links --filter/--text-filter/--href-filter --visible` when you need a
  small link set instead of full-page link dumps.
- For console copy requests, `select-tab`, verify URL/title, then use the
  selected-tab `console` command. Do not assume direct-CDP `tabs` Page numbers
  are the same as Chrome DevTools MCP page ids; current realbrowser maps the
  selected CDP target to MCP before reading console logs.
- Use `console --errors --limit 20` and `network --failed --limit 30`.
- Use project-specific `--handle-out tmp/realbrowser-handles/<task>.json`
  paths for parallel Codex tabs. Existing handle files are not overwritten
  unless `--force` is passed.
- Use `errors` and `requests` if you want OpenClaw-style aliases.
- Use `chain --return final` for navigate/wait/read flows and
  `chain --return summary --trace ~/.realbrowser/trace.json` when intermediate
  step evidence matters. `chain` records per-step and total durations for speed
  review.
- If a running daemon predates the edited skill and a command needs a new
  capability, reload it explicitly with `--restart-daemon`; for a real Chrome
  profile this can show one fresh approval prompt. For console mismatches or
  unexpected empty logs, check `status` for `reload needed for new skill code`
  before trusting the result.
- Use `--raw`, `--verbose`, `--max-chars`, or `--out <path>` only when the compact result is not enough.

The implementation intentionally copies the proven shape of OpenClaw's efficient browser snapshots and gstack's compact localhost command loop while keeping the backend attached to the user's real Chrome session when possible.

## Screenshots

Real Chrome often captures at physical pixels. On a Retina/HiDPI display, a normal viewport screenshot can be 1.5x or 2x larger than the CSS viewport. Realbrowser follows OpenClaw's screenshot-size target, but keeps the skill portable by using Chrome/MCP capture settings instead of a native image-processing dependency.

Default screenshot normalization:

- Max side: `2000` px.
- Max file size target: `5mb`.
- When no output path or format is provided, normalized screenshots default to JPEG at quality `85`.
- If the physical capture would be too large, realbrowser temporarily captures with a smaller emulated screenshot viewport and then resets emulation.
- Exact raw browser pixels are still available with `--raw-size` or `--no-normalize`.

Examples:

```bash
./scripts/realbrowser screenshot
./scripts/realbrowser screenshot /tmp/page.jpeg --max-side 1600 --max-bytes 2mb
./scripts/realbrowser screenshot /tmp/page.png --raw-size
REALBROWSER_SCREENSHOT_MAX_SIDE=1280 ./scripts/realbrowser screenshot
REALBROWSER_SCREENSHOT_NORMALIZE=0 ./scripts/realbrowser screenshot
```

## Verbose And Full Output

Default output is intentionally compact for agent token efficiency. Use these when you need more detail:

```bash
./scripts/realbrowser snapshot --verbose
./scripts/realbrowser snapshot --raw
./scripts/realbrowser text --max-chars 50000
./scripts/realbrowser html --out /tmp/page.html
./scripts/realbrowser network get 12 --request-file /tmp/request.txt --response-file /tmp/response.json --raw
REALBROWSER_OUTPUT=verbose ./scripts/realbrowser observe
REALBROWSER_OUTPUT=raw ./scripts/realbrowser snapshot
```

Windows PowerShell equivalents:

```powershell
.\scripts\realbrowser.ps1 snapshot --verbose
.\scripts\realbrowser.ps1 snapshot --raw
$env:REALBROWSER_OUTPUT = "raw"; .\scripts\realbrowser.ps1 snapshot
Remove-Item Env:\REALBROWSER_OUTPUT
```

Output modes:

- Compact default: capped, model-friendly output.
- `--verbose` or `REALBROWSER_OUTPUT=verbose`: raises caps and requests more detail where the backend supports it.
- `--raw` or `REALBROWSER_OUTPUT=raw`: bypasses realbrowser compaction and prints the underlying adapter response.
- `--out <path>` and `--request-file`/`--response-file`: write large data to disk instead of putting it in the agent transcript.
- `--` stops option parsing. Use it before literal text or JavaScript that starts with a known flag, for example `realbrowser type -- --raw`.

## Platform Support

Realbrowser is implemented in Node.js and is intended to run on macOS, Linux, and Windows.

- macOS and Linux can run `scripts/realbrowser` directly.
- Windows PowerShell should prefer `scripts\realbrowser.ps1`, which passes arguments as an array. `scripts\realbrowser.cmd` is available for `cmd.exe`; `node scripts\realbrowser.mjs` also works.
- Screenshot normalization is dependency-free and uses Chrome DevTools MCP capture/emulation calls, so no native image library is required.
- Real-browser attach depends on Chrome DevTools MCP and the local browser's remote debugging support. If attach is unavailable, use `--backend dev` for the dedicated profile.
- Profile discovery and `open --profile` run where the browser runs. In WSL,
  Parallels, Docker, SSH, or other split-host setups, use the host-side wrapper
  or connect to the host browser's forwarded CDP endpoint with `--browser-url`.
- CDP download interception requires Node's built-in `WebSocket` support, available in current Node 22+ builds.
- Screenshots, snapshots, console, network, JavaScript evaluation, clicks, typing, dialogs, and downloads are protocol-driven and do not require the browser window to be focused.

## Verification

```bash
node --check scripts/realbrowser.mjs
node scripts/realbrowser.mjs self-test
```

These commands run a syntax check and a small self-test for compact snapshots, truncation, and capped log output. Live browser smoke checks should additionally verify:

```bash
./scripts/realbrowser doctor --deep
./scripts/realbrowser open http://localhost:3000
./scripts/realbrowser observe --screenshot
./scripts/realbrowser snapshot --efficient --labels
./scripts/realbrowser console --errors --limit 20
./scripts/realbrowser network --failed --limit 30
```

## Safety Model

The daemon binds only to `127.0.0.1` and requires a bearer token stored in its state file. Realbrowser can inspect and change browser state, so agents should avoid sensitive tabs unless the user explicitly asks for that. Agents must ask before submitting sensitive data, making purchases, deleting data, changing account/security settings, granting permissions, or taking actions that are hard to undo.

## License

MIT. See `LICENSE`.
