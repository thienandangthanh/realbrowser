# Realbrowser

Realbrowser exists so Codex can use the browser a developer is actually using, faster than Codex Computer Use and without forcing a slow separate Playwright browser.

The default Codex browser automation path is useful, but it is not enough for web development when the state that matters lives in a signed-in Chrome profile: cookies, local storage, feature flags, extensions, active tabs, console logs, and network traffic. Realbrowser combines the fast local workflow patterns from gstack with the native real-browser direction from OpenClaw, giving Codex one fast local CLI while still keeping a dedicated fallback profile for cases where attaching to the real browser is unavailable or unsafe.

## What It Provides

- A Codex skill named `realbrowser`.
- A local CLI at `scripts/realbrowser`.
- A persistent loopback daemon for fast follow-up commands.
- Chrome DevTools MCP integration for real Chrome attach.
- A dedicated profile fallback at `~/.realbrowser/profile`.
- Tab listing/selection, navigation, compact observations, efficient snapshots, clicks, typing, forms, JavaScript evaluation, capped console and network inspection, OpenClaw-style normalized screenshots, annotated labels, pre-armed dialog handling, user-agent emulation, and download interception.

## Why Not Just Playwright?

Playwright is excellent for isolated automation, but this project is for the opposite case: debugging a real browser session with the same login and state the developer already has. Realbrowser uses Chrome DevTools MCP first, then adds small local wrappers for the operations Codex needs to move quickly.

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

## Fast Agent Defaults

Realbrowser is designed to keep Codex token use low:

- Use `observe` for the first page read.
- Use `snapshot --efficient` when clickable `uid` refs are needed.
- Use `snapshot --labels` or `screenshot --labels` for annotated screenshots.
- Use `console --errors --limit 20` and `network --failed --limit 30`.
- Use `errors` and `requests` if you want OpenClaw-style aliases.
- Use `chain --return summary --trace ~/.realbrowser/trace.json` for multi-step flows.
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
./scripts/realbrowser network get 12 --response-file /tmp/response.json
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
- `--raw` or `REALBROWSER_OUTPUT=raw`: bypasses realbrowser compaction and prints the underlying MCP response.
- `--out <path>` and `--request-file`/`--response-file`: write large data to disk instead of putting it in the agent transcript.
- `--` stops option parsing. Use it before literal text or JavaScript that starts with a known flag, for example `realbrowser type -- --raw`.

## Platform Support

Realbrowser is implemented in Node.js and is intended to run on macOS, Linux, and Windows.

- macOS and Linux can run `scripts/realbrowser` directly.
- Windows PowerShell should prefer `scripts\realbrowser.ps1`, which passes arguments as an array. `scripts\realbrowser.cmd` is available for `cmd.exe`; `node scripts\realbrowser.mjs` and the npm `realbrowser` bin also work.
- Screenshot normalization is dependency-free and uses Chrome DevTools MCP capture/emulation calls, so no native image library is required.
- Real-browser attach depends on Chrome DevTools MCP and the local browser's remote debugging support. If attach is unavailable, use `--backend dev` for the dedicated profile.
- CDP download interception requires Node's built-in `WebSocket` support, available in current Node 22+ builds.
- Screenshots, snapshots, console, network, JavaScript evaluation, clicks, typing, dialogs, and downloads are protocol-driven and do not require the browser window to be focused.

## Verification

```bash
npm test
```

The test script runs a syntax check and a small self-test for compact snapshots, truncation, and capped log output. Live browser smoke checks should additionally verify:

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
